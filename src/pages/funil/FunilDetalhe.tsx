import { useEffect, useMemo, useState } from 'react';
import { getFunilDetalhe, baixarFunilCsv } from '../../services/api/orders';

/**
 * DETALHE DO FUNIL — a lista por trás de cada número.
 *
 * POR QUE: o funil diz "94 morreram na triagem". Sozinho isso não deixa
 * ninguém agir. A pergunta seguinte é sempre "QUAIS 94, e por quê?" — e é
 * essa lista que vira reunião, cobrança e decisão.
 *
 * DUAS COISAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. As opções de filtro vêm do BACKEND, com a contagem junto. Nada de lista
 *    fixa no front: especialidade nova entra sozinha, e "Ortopedia (186)" já
 *    diz se vale a pena clicar antes de clicar.
 *
 * 2. Quem não tem justificativa aparece dizendo isso, em vez de linha vazia.
 *    Célula em branco o leitor interpreta como "não houve motivo"; o que
 *    aconteceu foi "ninguém escreveu". São coisas diferentes e só a segunda
 *    é um problema de operação que dá para cobrar.
 */

type Linha = {
  id: number; paciente: string; idade: number | null;
  procedimento: string; area: string; subarea: string;
  medico: string | null; data_pedido: string | null;
  fase_nome: string | null; dono: string | null;
  desfecho: string; desfecho_rotulo: string;
  status_processo: string; status_perda: string | null;
  justificativa: string | null; justificativa_origem: string | null;
  valor_orcamento: number | null; valor_ganho: number | null;
  nprocesso: string | null;
};

type Opcao = { valor: string; rotulo?: string; pedidos: number; grafias?: string[] | null };

type Resposta = {
  total: number;
  linhas: Linha[];
  sem_justificativa: number;
  nota_justificativa: string | null;
  opcoes: {
    areas: Opcao[];
    subareas: Opcao[];
    medicos: { valor: number; rotulo: string; pedidos: number }[];
    fases: { valor: string; rotulo: string; dono: string }[];
    desfechos: { valor: string; rotulo: string }[];
    idade: { minima: number | null; maxima: number | null; sem_data_nascimento: number };
  };
};

const DESFECHO_COR: Record<string, string> = {
  ganhou: '#0F766E',
  saiu: '#DC2626',
  em_curso: '#6B7280',
  indeterminado: '#B45309',
};

const moeda = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

type Props = { inicio?: string; fim?: string };

export function FunilDetalhe({ inicio, fim }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(0);
  const PORPAG = 50;

  const params = useMemo(() => {
    const p: Record<string, string> = { ...filtros };
    if (inicio && fim) { p.inicio = inicio; p.fim = fim; }
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ''));
  }, [filtros, inicio, fim]);

  const carregar = async () => {
    setCarregando(true); setErro('');
    try {
      const r = await getFunilDetalhe(params);
      setDados(r.data);
      setPagina(0);
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível carregar a lista.');
    } finally { setCarregando(false); }
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [params]);

  const mudar = (campo: string, valor: string) =>
    setFiltros((f) => ({ ...f, [campo]: valor }));

  const limpar = () => setFiltros({});

  /**
   * O download precisa do cabeçalho de autenticação, então não dá para usar
   * um <a href> simples: busca o arquivo com o token e entrega como blob.
   */
  const baixarExcel = async () => {
    setBaixando(true); setErro('');
    try {
      const r = await baixarFunilCsv(params);
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      const carimbo = new Date().toISOString().slice(0, 10);
      a.download = `funil_${carimbo}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro('Não foi possível gerar o arquivo.');
    } finally { setBaixando(false); }
  };

  const visiveis = dados ? dados.linhas.slice(pagina * PORPAG, (pagina + 1) * PORPAG) : [];
  const paginas = dados ? Math.ceil(dados.total / PORPAG) : 0;
  const temFiltro = Object.values(filtros).some((v) => v !== '');

  return (
    <section className="fdet">
      <header className="fdet__topo">
        <div>
          <h2>Lista detalhada</h2>
          <p className="fdet__sub">
            Cada pedido, a fase em que parou e a justificativa — filtre e leve
            para o Excel.
          </p>
        </div>
        <button
          type="button"
          className="fdet__baixar"
          onClick={() => void baixarExcel()}
          disabled={baixando || !dados?.total}
        >
          {baixando ? 'gerando…' : `Baixar para Excel${dados ? ` (${dados.total})` : ''}`}
        </button>
      </header>

      {erro && <div className="fdet__erro">{erro}</div>}

      {dados && (
        <div className="fdet__filtros">
          <label>
            <span>Fase</span>
            <select value={filtros.fase ?? ''} onChange={(e) => mudar('fase', e.target.value)}>
              <option value="">todas</option>
              {dados.opcoes.fases.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Desfecho</span>
            <select value={filtros.desfecho ?? ''} onChange={(e) => mudar('desfecho', e.target.value)}>
              <option value="">todos</option>
              {dados.opcoes.desfechos.map((d) => (
                <option key={d.valor} value={d.valor}>{d.rotulo}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Especialidade</span>
            <select value={filtros.area ?? ''} onChange={(e) => mudar('area', e.target.value)}>
              <option value="">todas</option>
              {dados.opcoes.areas.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.rotulo ?? a.valor} ({a.pedidos})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Médico</span>
            <select value={filtros.medico_id ?? ''} onChange={(e) => mudar('medico_id', e.target.value)}>
              <option value="">todos</option>
              {dados.opcoes.medicos.map((m) => (
                <option key={m.valor} value={m.valor}>{m.rotulo} ({m.pedidos})</option>
              ))}
            </select>
          </label>

          <label className="fdet__idade">
            <span>
              Idade
              {dados.opcoes.idade.minima != null && (
                <em> ({dados.opcoes.idade.minima}–{dados.opcoes.idade.maxima})</em>
              )}
            </span>
            <div>
              <input
                type="number" placeholder="de" value={filtros.idade_min ?? ''}
                onChange={(e) => mudar('idade_min', e.target.value)}
              />
              <input
                type="number" placeholder="até" value={filtros.idade_max ?? ''}
                onChange={(e) => mudar('idade_max', e.target.value)}
              />
            </div>
          </label>

          <label>
            <span>Justificativa</span>
            <select
              value={filtros.com_justificativa ?? ''}
              onChange={(e) => mudar('com_justificativa', e.target.value)}
            >
              <option value="">tanto faz</option>
              <option value="1">só as que têm</option>
              <option value="0">só as que faltam</option>
            </select>
          </label>

          {temFiltro && (
            <button type="button" className="fdet__limpar" onClick={limpar}>
              limpar filtros
            </button>
          )}
        </div>
      )}

      {dados && (filtros.idade_min || filtros.idade_max) && dados.opcoes.idade.sem_data_nascimento > 0 && (
        <p className="fdet__aviso">
          {dados.opcoes.idade.sem_data_nascimento} pedido(s) não têm data de
          nascimento e ficam <b>fora</b> de qualquer filtro por idade — não é
          que não se encaixem, é que não dá para saber.
        </p>
      )}

      {dados?.nota_justificativa && (
        <p className="fdet__aviso">{dados.nota_justificativa}</p>
      )}

      {carregando ? (
        <p className="fdet__carregando">carregando…</p>
      ) : !dados || dados.total === 0 ? (
        <p className="fdet__vazio">
          Nenhum pedido com esses filtros.
          {temFiltro && ' Tente afrouxar algum deles.'}
        </p>
      ) : (
        <>
          <div className="fdet__envolve">
            <table className="fdet__tabela">
              <thead>
                <tr>
                  <th>#</th><th>Paciente</th><th>Idade</th>
                  <th>Especialidade</th><th>Médico</th>
                  <th>Parou em</th><th>Desfecho</th>
                  <th>Justificativa</th><th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>
                      {l.paciente}
                      <em>{l.procedimento.slice(0, 70)}</em>
                    </td>
                    <td>{l.idade ?? <span className="fdet__na">s/ data</span>}</td>
                    <td>
                      {l.area}
                      {l.subarea && <em>{l.subarea}</em>}
                    </td>
                    <td>{l.medico ?? <span className="fdet__na">—</span>}</td>
                    <td>
                      {l.fase_nome ?? <span className="fdet__na">não classificado</span>}
                      {l.dono && <em>{l.dono}</em>}
                    </td>
                    <td>
                      <span
                        className="fdet__tag"
                        style={{ color: DESFECHO_COR[l.desfecho] ?? '#6B7280' }}
                      >
                        {l.desfecho_rotulo}
                      </span>
                      {l.status_perda && <em>{l.status_perda}</em>}
                    </td>
                    <td className="fdet__just">
                      {l.justificativa ? (
                        <>
                          {l.justificativa}
                          {l.justificativa_origem !== 'justificativaPerda' && (
                            <em>de: {l.justificativa_origem}</em>
                          )}
                        </>
                      ) : (
                        <span className="fdet__na">ninguém registrou o motivo</span>
                      )}
                    </td>
                    <td>{moeda(l.valor_ganho ?? l.valor_orcamento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginas > 1 && (
            <div className="fdet__paginas">
              <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                anterior
              </button>
              <span>
                {pagina * PORPAG + 1}–{Math.min((pagina + 1) * PORPAG, dados.total)} de {dados.total}
              </span>
              <button
                type="button"
                disabled={pagina >= paginas - 1}
                onClick={() => setPagina((p) => p + 1)}
              >
                próxima
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default FunilDetalhe;
