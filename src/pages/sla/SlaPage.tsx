import { useEffect, useMemo, useState } from 'react';
import {
  getSlaIndices, getSlaPorMedico, getSlaEstourados, getSlaTrajetoria, getOrders,
} from '../../services/api/orders';
import './SlaPage.css';

/**
 * SLA — quanto tempo cada fase levou, contra o prazo combinado.
 *
 * A DECISÃO DE DESENHO QUE MANDA NESTA TELA:
 *   o backend audita as próprias fontes e, na base atual, responde
 *   `historico_confiavel: false` — pelo menos um campo de data foi gravado
 *   EM LOTE (todos os pedidos carimbados no mesmo dia), não evento a evento.
 *   Com isso, "triagem: 0% cumprido, média de 18,9 dias" não é desempenho da
 *   equipe: é o retrato de uma data preenchida de uma vez só, depois.
 *
 *   Por isso o aviso vem ANTES dos números, e os números ficam em cinza
 *   enquanto o histórico for não-confiável. Mostrar 0% em vermelho gritante
 *   sobre um dado que o próprio sistema declara inválido é como multar
 *   alguém pela velocidade medida num radar que a gente sabe estar quebrado.
 *
 * As três perguntas que a tela responde, nesta ordem:
 *   1. dá para confiar no número?      (auditoria + cobertura)
 *   2. como estamos por fase/período?  (índices)
 *   3. quem está segurando o quê?      (por médico + estourados + trajetória)
 */

type Auditoria = {
  historico_confiavel: boolean;
  veredito: string;
  fases_afetadas: { chave: string; nome: string; campos_contaminados: string[] }[];
  fases_sem_instrumento?: { chave: string; nome: string; motivo: string }[];
};

type FaseJanela = {
  nome: string; dono: string; meta_dias: number | null;
  concluidas: number; cumpridos: number; estourados: number;
  pct_cumprido: number | null; media_dias: number | null;
};

type Janela = {
  inicio: string; fim: string; rotulo: string;
  fases: Record<string, FaseJanela>;
  geral: { concluidas: number; cumpridos: number; estourados: number; pct_cumprido: number | null };
};

type RespIndices = {
  periodo: string;
  auditoria_das_fontes: Auditoria;
  janelas: Janela[];
  fases: { chave: string; nome: string; dono: string; meta_dias: number | null;
           razao: string | null; sem_instrumento?: string | null }[];
  cobertura: { pedidos_na_base: number; com_data_juridico: number;
               com_data_orcamento: number; com_data_protocolo: number; nota: string };
};

type LinhaMedico = {
  medico_id: number; medico: string; especialidade: string | null;
  orcamentos: number; media_dias: number; mediana_dias: number;
  melhor_dias: number; pior_dias: number;
  no_prazo: number; estourados: number; pct_no_prazo: number; confiavel: boolean;
};

type Estourado = {
  order_id: number; paciente: string; procedimento: string;
  status: string; nprocesso: string | null;
  fase: string; dono: string; dias_aberta: number;
  meta_dias: number | null; atraso_dias: number;
};

type Trajetoria = {
  order_id: number; paciente: string; status_atual: string;
  fases: { fase: string; nome: string; dono: string; dias: number | null;
           meta_dias: number | null; situacao: string; motivo?: string;
           atraso_dias?: number }[];
  fase_aberta: { nome: string; dono: string; dias_aberta: number;
                 meta_dias: number | null; estourado: boolean;
                 razao_do_prazo: string | null } | null;
  historico: { quando: string; campo: string; de: string | null;
               para: string | null; quem: string | null; por_onde: string | null }[];
};

const PERIODOS = [
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral', rotulo: 'Semestral' },
  { valor: 'anual', rotulo: 'Anual' },
  { valor: 'custom', rotulo: 'Personalizado' },
];

const ABAS = [
  { chave: 'indices', rotulo: 'Cumprimento por período' },
  { chave: 'medicos', rotulo: 'Tempo por médico' },
  { chave: 'estourados', rotulo: 'Fora do prazo agora' },
  { chave: 'trajetoria', rotulo: 'Trajetória de um pedido' },
];

const DONO_COR: Record<string, string> = {
  'Instituto Mateus': '#0F766E',
  'G4MED': '#7C3AED',
  'G4MED + médico': '#7C3AED',
  'Judiciário': '#B45309',
};

const SITUACAO_ROTULO: Record<string, string> = {
  cumprido: 'dentro do prazo',
  estourado: 'fora do prazo',
  nao_medida: 'não deu para medir',
  sem_instrumento: 'o banco não mede esta fase',
  sem_meta: 'sem prazo definido',
  suspeito: 'data inconsistente',
};

export function SlaPage() {
  const [aba, setAba] = useState('indices');
  const [periodo, setPeriodo] = useState('trimestral');
  const [customInicio, setCustomInicio] = useState('');
  const [customFim, setCustomFim] = useState('');
  const [indices, setIndices] = useState<RespIndices | null>(null);
  const [medicos, setMedicos] = useState<{ medicos: LinhaMedico[]; meta_dias: number; nota: string } | null>(null);
  const [estourados, setEstourados] = useState<{ total: number; itens: Estourado[]; nota: string } | null>(null);
  const [buscaId, setBuscaId] = useState('');
  const [buscaNome, setBuscaNome] = useState('');
  const [candidatos, setCandidatos] = useState<{ id: number; paciente: string; statusProcesso: string }[]>([]);
  const [trajetoria, setTrajetoria] = useState<Trajetoria | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregarIndices = async (p = periodo, inicio = customInicio, fim = customFim) => {
    if (p === 'custom' && (!inicio || !fim)) return; // aguarda as duas datas antes de consultar
    setCarregando(true); setErro('');
    try {
      const r = await getSlaIndices(
        p === 'custom' ? { periodo: p, inicio, fim } : { periodo: p, janelas: 6 }
      );
      setIndices(r.data);
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível carregar os índices de SLA.');
    } finally { setCarregando(false); }
  };

  useEffect(() => { void carregarIndices(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (aba === 'medicos' && !medicos) {
      getSlaPorMedico().then((r) => setMedicos(r.data)).catch(() => setErro('Falha ao carregar tempos por médico.'));
    }
    if (aba === 'estourados' && !estourados) {
      getSlaEstourados().then((r) => setEstourados(r.data)).catch(() => setErro('Falha ao carregar a lista de fora do prazo.'));
    }
  }, [aba, medicos, estourados]);

  const buscarTrajetoria = async (idParam?: number) => {
    const id = idParam ?? Number(buscaId);
    if (!id) { setErro('Informe o número do pedido.'); return; }
    setCarregando(true); setErro(''); setCandidatos([]);
    try {
      const r = await getSlaTrajetoria(id);
      setTrajetoria(r.data);
    } catch {
      setErro(`Pedido ${id} não encontrado.`);
      setTrajetoria(null);
    } finally { setCarregando(false); }
  };

  const buscarPorNome = async () => {
    const termo = buscaNome.trim().toLowerCase();
    if (termo.length < 3) { setErro('Digite ao menos 3 letras do nome.'); return; }
    setCarregando(true); setErro(''); setTrajetoria(null);
    try {
      const r = await getOrders();
      const achados = (r.data ?? [])
        .filter((o: any) => (o.paciente ?? '').toLowerCase().includes(termo))
        .slice(0, 15)
        .map((o: any) => ({ ...o, id: o.id, paciente: o.paciente, statusProcesso: o.statusProcesso }));
      setCandidatos(achados);
      if (achados.length === 0) setErro(`Nenhum paciente encontrado com "${buscaNome}".`);
    } catch {
      setErro('Não foi possível buscar por nome.');
    } finally { setCarregando(false); }
  };

  const auditoria = indices?.auditoria_das_fontes;
  const confiavel = auditoria?.historico_confiavel ?? true;

  // as fases que de fato aparecem nas janelas (as com meta e com dados)
  const chavesFases = useMemo(() => {
    if (!indices) return [];
    const set = new Set<string>();
    indices.janelas.forEach((j) => Object.keys(j.fases).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [indices]);

  return (
    <div className="sla">
      <header className="sla__topo">
        <div>
          <h1>SLA</h1>
          <p className="sla__sub">
            Quanto tempo cada fase levou, contra o prazo combinado — e quem está
            segurando o quê agora.
          </p>
        </div>
      </header>

      {erro && <div className="sla__erro">{erro}</div>}

      {/* ANTES DE QUALQUER NÚMERO: dá para confiar nele? */}
      {auditoria && !confiavel && (
        <div className="sla__alerta">
          <strong>Não leia estes números como desempenho da equipe.</strong>
          <p>{auditoria.veredito}</p>
          {auditoria.fases_afetadas.filter((f) => f.campos_contaminados.length > 0).length > 0 && (
            <p>
              Fases afetadas:{' '}
              {auditoria.fases_afetadas
                .filter((f) => f.campos_contaminados.length > 0)
                .map((f) => `${f.nome} (${f.campos_contaminados.join(', ')})`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {auditoria?.fases_sem_instrumento && auditoria.fases_sem_instrumento.length > 0 && (
        <div className="sla__alerta sla__alerta--leve">
          <strong>Fases que o banco não sabe cronometrar</strong>
          {auditoria.fases_sem_instrumento.map((f) => (
            <p key={f.chave}>· <b>{f.nome}</b> — {f.motivo}</p>
          ))}
          <p className="sla__nota">
            Isto não é dado faltando: é sensor que não existe. Medir estas fases
            exige criar o campo de data no sistema, não esperar preencherem.
          </p>
        </div>
      )}

      <nav className="sla__abas">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            className={`sla__aba ${aba === a.chave ? 'is-ativo' : ''}`}
            onClick={() => setAba(a.chave)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      {/* ───────────── ÍNDICES POR PERÍODO ───────────── */}
      {aba === 'indices' && (
        <section>
          <div className="sla__periodo">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                className={`sla__pill ${periodo === p.valor ? 'is-ativo' : ''}`}
                onClick={() => { setPeriodo(p.valor); void carregarIndices(p.valor); }}
              >
                {p.rotulo}
              </button>
            ))}
            {carregando && <span className="sla__carregando">carregando…</span>}
          </div>

          {periodo === 'custom' && (
            <div className="sla__periodo-custom">
              <label>
                de
                <input
                  type="date"
                  value={customInicio}
                  onChange={(e) => { setCustomInicio(e.target.value); void carregarIndices('custom', e.target.value, customFim); }}
                />
              </label>
              <label>
                até
                <input
                  type="date"
                  value={customFim}
                  onChange={(e) => { setCustomFim(e.target.value); void carregarIndices('custom', customInicio, e.target.value); }}
                />
              </label>
              {(!customInicio || !customFim) && (
                <span className="sla__nota">escolha as duas datas para calcular</span>
              )}
            </div>
          )}

          {indices && (
            <>
              <div className="sla__cobertura">
                <span><b>{indices.cobertura.pedidos_na_base}</b> pedidos na base</span>
                <span>com data do jurídico: <b>{indices.cobertura.com_data_juridico}</b></span>
                <span>com data do orçamento: <b>{indices.cobertura.com_data_orcamento}</b></span>
                <span>com data de protocolo: <b>{indices.cobertura.com_data_protocolo}</b></span>
                <p className="sla__nota">{indices.cobertura.nota}</p>
              </div>

              <div className="sla__tabela-envolve">
                <table className={`sla__tabela ${!confiavel ? 'is-nao-confiavel' : ''}`}>
                  <thead>
                    <tr>
                      <th>Período</th>
                      {chavesFases.map((c) => {
                        const f = indices.fases.find((x) => x.chave === c);
                        return (
                          <th key={c}>
                            {f?.nome ?? c}
                            {f?.meta_dias != null && (
                              <em className="sla__meta">meta {f.meta_dias}d</em>
                            )}
                          </th>
                        );
                      })}
                      <th>Geral</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indices.janelas.map((j) => (
                      <tr key={j.rotulo}>
                        <td className="sla__rotulo-periodo">{j.rotulo}</td>
                        {chavesFases.map((c) => {
                          const f = j.fases[c];
                          if (!f || f.concluidas === 0) {
                            return <td key={c} className="sla__vazio">—</td>;
                          }
                          return (
                            <td key={c}>
                              <b>{f.pct_cumprido ?? '—'}%</b>
                              <em>
                                {f.cumpridos}/{f.concluidas} no prazo
                                {f.media_dias != null && ` · média ${f.media_dias}d`}
                              </em>
                            </td>
                          );
                        })}
                        <td className="sla__geral">
                          {j.geral.concluidas > 0 ? (
                            <>
                              <b>{j.geral.pct_cumprido ?? '—'}%</b>
                              <em>{j.geral.cumpridos}/{j.geral.concluidas}</em>
                            </>
                          ) : <span className="sla__vazio">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sla__legenda">
                {indices.fases.filter((f) => f.razao).map((f) => (
                  <p key={f.chave}>
                    <span className="sla__ponto" style={{ background: DONO_COR[f.dono] ?? '#6B7280' }} />
                    <b>{f.nome}</b> ({f.dono})
                    {f.meta_dias != null ? ` — meta ${f.meta_dias} dia(s): ` : ' — '}
                    {f.razao}
                  </p>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── TEMPO POR MÉDICO ───────────── */}
      {aba === 'medicos' && (
        <section>
          {!medicos ? <p className="sla__carregando">carregando…</p> : (
            <>
              <p className="sla__nota sla__nota--bloco">{medicos.nota}</p>
              <div className="sla__tabela-envolve">
                <table className="sla__tabela sla__tabela--medicos">
                  <thead>
                    <tr>
                      <th>Médico</th><th>Orçamentos</th><th>Mediana</th>
                      <th>Média</th><th>Pior</th><th>No prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicos.medicos.map((m) => (
                      <tr key={m.medico_id} className={m.confiavel ? '' : 'is-poucos'}>
                        <td>
                          {m.medico}
                          {m.especialidade && <em>{m.especialidade}</em>}
                        </td>
                        <td>
                          {m.orcamentos}
                          {!m.confiavel && <em className="sla__ressalva">poucos casos</em>}
                        </td>
                        <td><b>{m.mediana_dias}d</b></td>
                        <td>{m.media_dias}d</td>
                        <td className={m.pior_dias > medicos.meta_dias ? 'e-ruim' : ''}>{m.pior_dias}d</td>
                        <td>
                          <b>{m.pct_no_prazo}%</b>
                          <em>{m.no_prazo}/{m.orcamentos}</em>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── FORA DO PRAZO AGORA ───────────── */}
      {aba === 'estourados' && (
        <section>
          {!estourados ? <p className="sla__carregando">carregando…</p> : (
            <>
              <div className="sla__alerta sla__alerta--leve">
                <strong>{estourados.total} pedido(s) com prazo estourado agora</strong>
                <p>{estourados.nota}</p>
              </div>
              <div className="sla__tabela-envolve">
                <table className="sla__tabela">
                  <thead>
                    <tr>
                      <th>#</th><th>Paciente</th><th>Fase parada</th>
                      <th>Dono</th><th>Aberta há</th><th>Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estourados.itens.map((it) => (
                      <tr key={it.order_id}>
                        <td>
                          <button
                            type="button"
                            className="sla__link"
                            onClick={() => { setBuscaId(String(it.order_id)); setAba('trajetoria'); }}
                          >
                            {it.order_id}
                          </button>
                        </td>
                        <td>{it.paciente}<em>{it.procedimento}</em></td>
                        <td>{it.fase}</td>
                        <td>
                          <span className="sla__dono" style={{ color: DONO_COR[it.dono] ?? '#6B7280' }}>
                            {it.dono}
                          </span>
                        </td>
                        <td>{it.dias_aberta}d{it.meta_dias != null && <em>meta {it.meta_dias}d</em>}</td>
                        <td className="e-ruim"><b>+{it.atraso_dias}d</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── TRAJETÓRIA DE UM PEDIDO ───────────── */}
      {aba === 'trajetoria' && (
        <section>
          <div className="sla__busca">
            <input
              type="number"
              placeholder="número do pedido"
              value={buscaId}
              onChange={(e) => setBuscaId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscarTrajetoria(); }}
            />
            <button type="button" onClick={() => void buscarTrajetoria()}>Ver trajetória</button>
            <span className="sla__busca-ou">ou</span>
            <input
              type="text"
              placeholder="nome do paciente"
              value={buscaNome}
              onChange={(e) => setBuscaNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscarPorNome(); }}
            />
            <button type="button" onClick={() => void buscarPorNome()}>Buscar por nome</button>
          </div>

          {candidatos.length > 0 && (
            <ul className="sla__candidatos">
              {candidatos.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setBuscaId(String(c.id)); void buscarTrajetoria(c.id); }}>
                    <b>#{c.id}</b> {c.paciente} <em>{c.statusProcesso}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {trajetoria && (
            <>
              <div className="sla__ficha">
                <strong>#{trajetoria.order_id} · {trajetoria.paciente}</strong>
                <span>situação atual: {trajetoria.status_atual}</span>
              </div>

              {trajetoria.fase_aberta && (
                <div className={`sla__alerta ${trajetoria.fase_aberta.estourado ? '' : 'sla__alerta--leve'}`}>
                  <strong>
                    Parado em “{trajetoria.fase_aberta.nome}” há {trajetoria.fase_aberta.dias_aberta} dia(s)
                    {trajetoria.fase_aberta.meta_dias != null && ` (meta: ${trajetoria.fase_aberta.meta_dias})`}
                  </strong>
                  <p>Responsável: <b>{trajetoria.fase_aberta.dono}</b></p>
                  {trajetoria.fase_aberta.razao_do_prazo && (
                    <p className="sla__nota">{trajetoria.fase_aberta.razao_do_prazo}</p>
                  )}
                </div>
              )}

              <h2 className="sla__h2">Tempo de cada fase</h2>
              <div className="sla__fases">
                {trajetoria.fases.map((f) => (
                  <div key={f.fase} className={`sla__fase e-${f.situacao}`}>
                    <span className="sla__fase-nome">
                      {f.nome}
                      <em>{f.dono}</em>
                    </span>
                    <span className="sla__fase-dias">
                      {f.dias != null ? <b>{f.dias}d</b> : <b className="sla__vazio">—</b>}
                      {f.meta_dias != null && <em>meta {f.meta_dias}d</em>}
                    </span>
                    <span className="sla__fase-situacao">
                      {SITUACAO_ROTULO[f.situacao] ?? f.situacao}
                      {f.atraso_dias ? ` (+${f.atraso_dias}d)` : ''}
                      {f.motivo && <em>{f.motivo}</em>}
                    </span>
                  </div>
                ))}
              </div>

              <h2 className="sla__h2">O que aconteceu, na ordem</h2>
              {trajetoria.historico.length === 0 ? (
                <p className="sla__nota sla__nota--bloco">
                  Este pedido não tem rastro de mudanças. O rastro passou a ser
                  gravado em 22/08/2026 — pedidos anteriores não têm histórico, e
                  isso não significa que nada aconteceu com eles.
                </p>
              ) : (
                <ol className="sla__linha-tempo">
                  {trajetoria.historico.map((h, i) => (
                    <li key={i}>
                      <span className="sla__quando">
                        {new Date(h.quando).toLocaleString('pt-BR')}
                      </span>
                      <span className="sla__mudanca">
                        <b>{h.campo}</b>: {h.de ?? '(vazio)'} → {h.para ?? '(vazio)'}
                      </span>
                      <span className="sla__quem">
                        {h.quem ?? 'sistema'}{h.por_onde ? ` · ${h.por_onde}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default SlaPage;
