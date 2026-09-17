import { useEffect, useMemo, useState } from 'react';
import { getFunil } from '../../services/api/orders';
import { FunilDetalhe } from './FunilDetalhe';
import './FunilPage.css';

/**
 * FUNIL — a tela que responde "perdemos ONDE?".
 *
 * POR QUE ELA EXISTE (e por que não é mais um gráfico de conversão):
 *   Um número só de conversão esconde a fase em que o pedido morre. Medido em
 *   24/08 na base real: 73% de todas as perdas acontecem nas DUAS primeiras
 *   fases — antes de o nosso preço sequer entrar na disputa. Quem olha só o
 *   percentual final conclui "nosso preço não é competitivo" e vai otimizar a
 *   coisa errada.
 *
 * A DECISÃO DE DESENHO QUE MAIS IMPORTA AQUI:
 *   a barra de cada fase mostra as TRÊS saídas juntas — quem passou, quem
 *   morreu e quem ainda está correndo. Sem a terceira, uma coorte recente
 *   parece um desastre (ela tem quase tudo em curso, não perdido).
 */

type Fase = {
  ordem: number; chave: string; nome: string; o_que_e: string; dono: string;
  chegaram: number; saiu_aqui: number; em_curso_aqui: number; ganhou_aqui: number;
  passaram: number; taxa_passagem_pct: number | null; motivo_saida?: string | null;
};

type Conversao = {
  ganhos: number; perdemos_disputando: number; disputados: number;
  aguardando_decisao: number; pct: number | null; pct_provisorio?: number | null;
  maduro: boolean; pode_mudar?: boolean; o_que_significa: string;
};

type Janela = {
  rotulo: string; inicio: string; fim: string;
  total_entraram: number; fases: Fase[]; conversao: Conversao;
  indeterminados: { total: number; nota: string | null };
};

type Resposta = {
  periodo: string;
  fases: { chave: string; nome: string; o_que_e: string; dono: string;
           meta_dias: number | null; motivo_saida: string | null }[];
  janelas: Janela[];
  total_geral: Janela;
  motivos_de_perda: { motivo: string; total: number; fase: string;
                      competiu: boolean | null; pct_das_perdas: number | null;
                      valor_perdido: number }[];
  auditoria_vocabulario: { ok: boolean; veredito: string;
                           motivos_desconhecidos: { motivo: string; pedidos: number }[];
                           status_processo_desconhecidos?: { status: string; pedidos: number }[];
                           fases_sem_saida: { fase: string; esperava: string }[] };
  cobertura: { total: number; sem_data_pedido: number; nota: string | null };
};

const PERIODOS = [
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral', rotulo: 'Semestral' },
  { valor: 'anual', rotulo: 'Anual' },
  { valor: 'custom', rotulo: 'Período que eu escolher' },
];

const DONO_COR: Record<string, string> = {
  'Instituto Mateus': '#0F766E',
  'G4MED': '#7C3AED',
  'G4MED + médico': '#7C3AED',
  'Judiciário': '#B45309',
  'sistema': '#6B7280',
};

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FunilPage() {
  const [periodo, setPeriodo] = useState('trimestral');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [janelaAtiva, setJanelaAtiva] = useState<number | null>(null);

  const carregar = async () => {
    if (periodo === 'custom' && (!inicio || !fim)) {
      setErro('Escolha as duas datas para um período personalizado.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      const resp = await getFunil(
        periodo === 'custom' ? { periodo, inicio, fim } : { periodo, janelas: 6 }
      );
      setDados(resp.data);
      setJanelaAtiva(null);
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível carregar o funil.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, []);

  // a janela em foco: uma específica se o usuário clicou, senão o total geral
  const foco = useMemo<Janela | null>(() => {
    if (!dados) return null;
    if (janelaAtiva === null) return dados.total_geral;
    return dados.janelas[janelaAtiva] ?? dados.total_geral;
  }, [dados, janelaAtiva]);

  const maiorVazamento = useMemo(() => {
    if (!foco) return null;
    return [...foco.fases].sort((a, b) => b.saiu_aqui - a.saiu_aqui)[0] ?? null;
  }, [foco]);

  return (
    <div className="funil">
      <header className="funil__topo">
        <div>
          <h1>Funil</h1>
          <p className="funil__sub">
            Cada fase medida: quantos entram, quantos passam, e onde o pedido morre.
          </p>
        </div>
        <div className="funil__periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              className={`funil__pill ${periodo === p.valor ? 'is-ativo' : ''}`}
              onClick={() => setPeriodo(p.valor)}
            >
              {p.rotulo}
            </button>
          ))}
          {periodo === 'custom' && (
            <span className="funil__datas">
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <span>até</span>
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </span>
          )}
          <button type="button" className="funil__aplicar" onClick={() => void carregar()}>
            {carregando ? 'Carregando…' : 'Aplicar'}
          </button>
        </div>
      </header>

      {erro && <div className="funil__erro">{erro}</div>}

      {/* Auditorias PRIMEIRO: se o mapa está defasado, os números abaixo mentem —
          e o leitor precisa saber disso ANTES de olhar para eles, não depois. */}
      {dados && !dados.auditoria_vocabulario.ok && (
        <div className="funil__alerta">
          <strong>O mapa do funil está defasado.</strong>
          <p>{dados.auditoria_vocabulario.veredito}</p>
          {dados.auditoria_vocabulario.motivos_desconhecidos.length > 0 && (
            <p>Motivos que o funil não conhece:{' '}
              {dados.auditoria_vocabulario.motivos_desconhecidos
                .map((m) => `${m.motivo} (${m.pedidos})`).join(' · ')}</p>
          )}
          {(dados.auditoria_vocabulario.status_processo_desconhecidos ?? []).length > 0 && (
            <p>Status que o funil não conhece:{' '}
              {dados.auditoria_vocabulario.status_processo_desconhecidos!
                .map((m) => `${m.status} (${m.pedidos})`).join(' · ')}</p>
          )}
          {dados.auditoria_vocabulario.fases_sem_saida.length > 0 && (
            <p>Fases sem nenhuma saída (costuma ser motivo renomeado):{' '}
              {dados.auditoria_vocabulario.fases_sem_saida.map((f) => f.fase).join(' · ')}</p>
          )}
        </div>
      )}
      {dados && dados.cobertura.nota && (
        <div className="funil__alerta funil__alerta--leve">{dados.cobertura.nota}</div>
      )}

      {dados && (
        <div className="funil__janelas">
          <button
            type="button"
            className={`funil__janela ${janelaAtiva === null ? 'is-ativo' : ''}`}
            onClick={() => setJanelaAtiva(null)}
          >
            Base inteira
            <em>{dados.total_geral.total_entraram} pedidos</em>
          </button>
          {dados.janelas.map((j, i) => (
            <button
              key={j.rotulo}
              type="button"
              className={`funil__janela ${janelaAtiva === i ? 'is-ativo' : ''}`}
              onClick={() => setJanelaAtiva(i)}
            >
              {j.rotulo}
              <em>{j.total_entraram} pedidos</em>
            </button>
          ))}
        </div>
      )}

      {foco && (
        <>
          <section className="funil__conversao">
            <div className="funil__conversao-num">
              {foco.conversao.pct !== null ? (
                <><strong className={foco.conversao.pode_mudar ? 'is-provisorio' : ''}>
                    {foco.conversao.pct}%
                  </strong>
                  <span>{foco.conversao.pode_mudar ? 'conversão parcial' : 'de conversão'}</span></>
              ) : (
                <><strong className="is-imaturo">—</strong><span>ainda sem leitura</span></>
              )}
            </div>
            <div className="funil__conversao-txt">
              <p>{foco.conversao.o_que_significa}</p>
              <div className="funil__conversao-detalhe">
                <span><b>{foco.conversao.ganhos}</b> ganhos</span>
                <span><b>{foco.conversao.perdemos_disputando}</b> perdidos disputando</span>
                <span><b>{foco.conversao.aguardando_decisao}</b> ainda no juiz</span>
              </div>
            </div>
          </section>

          <section className="funil__fases">
            {foco.fases.map((f) => {
              const cor = DONO_COR[f.dono] ?? '#6B7280';
              const base = f.chegaram || 1;
              const pctPassou = (f.passaram / base) * 100;
              const pctSaiu = (f.saiu_aqui / base) * 100;
              const pctCurso = (f.em_curso_aqui / base) * 100;
              return (
                <article key={f.chave} className="funil__fase">
                  <div className="funil__fase-cabeca">
                    <span className="funil__fase-num" style={{ background: cor }}>{f.ordem}</span>
                    <div className="funil__fase-id">
                      <strong>{f.nome}</strong>
                      <small>{f.o_que_e}</small>
                    </div>
                    <span className="funil__fase-dono" style={{ color: cor }}>{f.dono}</span>
                  </div>

                  <div className="funil__barra" title={`${f.chegaram} chegaram nesta fase`}>
                    <div className="funil__barra-passou" style={{ width: `${pctPassou}%`, background: cor }} />
                    <div className="funil__barra-saiu" style={{ width: `${pctSaiu}%` }} />
                    <div className="funil__barra-curso" style={{ width: `${pctCurso}%` }} />
                  </div>

                  <div className="funil__fase-nums">
                    <span><b>{f.chegaram}</b> chegaram</span>
                    <span className="e-passou"><b>{f.passaram}</b> passaram
                      {f.taxa_passagem_pct !== null && <> ({f.taxa_passagem_pct}%)</>}</span>
                    {f.saiu_aqui > 0 && (
                      <span className="e-saiu" title={f.motivo_saida ?? ''}>
                        <b>{f.saiu_aqui}</b> morreram aqui</span>
                    )}
                    {f.em_curso_aqui > 0 && (
                      <span className="e-curso"><b>{f.em_curso_aqui}</b> ainda em curso</span>
                    )}
                  </div>
                  {f.saiu_aqui > 0 && f.motivo_saida && (
                    <p className="funil__fase-motivo">{f.motivo_saida}</p>
                  )}
                </article>
              );
            })}
          </section>

          {maiorVazamento && maiorVazamento.saiu_aqui > 0 && (
            <section className="funil__insight">
              <strong>Maior vazamento: {maiorVazamento.nome}</strong>
              <p>
                {maiorVazamento.saiu_aqui} pedidos morrem nesta fase — responsabilidade de{' '}
                {maiorVazamento.dono}. É onde uma melhoria rende mais.
              </p>
            </section>
          )}
        </>
      )}

      {dados && dados.motivos_de_perda.length > 0 && (
        <section className="funil__motivos">
          <h2>Motivos de perda</h2>
          <p className="funil__motivos-sub">
            Nem toda perda é derrota: só as marcadas <b>competiu</b> chegaram ao juiz com o
            nosso orçamento. As outras morreram antes.
          </p>
          <table>
            <thead>
              <tr><th>Motivo</th><th>Fase</th><th>Pedidos</th><th>% das perdas</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {dados.motivos_de_perda.map((m) => (
                <tr key={m.motivo} className={m.competiu ? 'competiu' : ''}>
                  <td>{m.motivo}{m.competiu && <span className="tag-competiu">competiu</span>}</td>
                  <td>{m.fase}</td>
                  <td>{m.total}</td>
                  <td>{m.pct_das_perdas}%</td>
                  <td>{moeda(m.valor_perdido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {/* A lista por trás dos números. Fica DEPOIS do funil de propósito:
          primeiro o leitor vê ONDE se perde, depois QUEM se perdeu. */}
      {dados && <FunilDetalhe inicio={foco?.inicio} fim={foco?.fim} />}

    </div>
  );
}

export default FunilPage;
