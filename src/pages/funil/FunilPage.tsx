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
 * RÉGUA DE 19/09 (@R): "o funil não deve lidar com as fases até a decisão —
 *   o que precisamos é o percentual corretamente, o APROVEITAMENTO até a fase 5;
 *   a fase 6 é a CONVERSÃO de cada mês". Duas medidas, duas âncoras:
 *   · FUNIL (fases 1-5) — trabalho nosso, coorte pelo mês do PEDIDO. % de cada
 *     fase = passaram ÷ chegaram (quem ainda corre fica declarado ao lado, não
 *     some do denominador — antes 5 de 32 aparecia como "71,4%").
 *   · CONVERSÃO (fase 6) — o juiz, ancorada no mês da DECISÃO: dos processos
 *     decididos no mês, quantos ganhamos.
 *   A tela abre no MÊS ATUAL e tem o modo "mês a mês" para comparar.
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
  // % sobre quem CHEGOU na fase (em curso conta como "ainda não passou") — a
  // régua que o @R pediu em 19/09: "o percentual corretamente"
  pct_passaram?: number | null; pct_saiu?: number | null; pct_em_curso?: number | null;
  no_funil?: boolean;
};

type Aproveitamento = {
  entraram: number; chegaram_ao_estado: number; morreram_antes: number; em_andamento: number;
  pct: number | null; pct_definido: number | null; o_que_significa: string;
};

type Conversao = {
  ganhos: number; perdemos_disputando: number; disputados: number;
  aguardando_decisao: number; pct: number | null; pct_provisorio?: number | null;
  encerrados_sem_disputa?: number;
  maduro: boolean; pode_mudar?: boolean; o_que_significa: string;
  amostra_pequena?: boolean; rotulo?: string; ancora?: string;
};

type Janela = {
  rotulo: string; inicio: string; fim: string;
  total_entraram: number; fases: Fase[]; conversao: Conversao;
  aproveitamento?: Aproveitamento;
  indeterminados: { total: number; nota: string | null };
};

type Resposta = {
  periodo: string;
  fases: { chave: string; nome: string; o_que_e: string; dono: string;
           meta_dias: number | null; motivo_saida: string | null }[];
  janelas: Janela[];
  // fase 6 por janela, ancorada no mês em que o juiz DECIDIU (dataResultado);
  // alinhada índice a índice com `janelas`
  conversao_por_periodo?: { janelas: Conversao[]; sem_data_resultado: number;
                            aguardando_decisao: number };
  fases_funil?: string[];
  total_geral: Janela;
  motivos_de_perda: { motivo: string; total: number; fase: string;
                      competiu: boolean | null; pct_das_perdas: number | null;
                      valor_perdido: number }[];
  auditoria_vocabulario: { ok: boolean; veredito: string;
                           motivos_desconhecidos: { motivo: string; pedidos: number; ids?: number[] }[];
                           status_processo_desconhecidos?: { status: string; pedidos: number }[];
                           fases_sem_saida: { fase: string; esperava: string }[] };
  cobertura: { total: number; sem_data_pedido: number; historicos_fora?: number; nota: string | null };
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

const JANELAS = 12;

const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

export function FunilPage() {
  // abre no MÊS ATUAL (@R 19/09: "o botão para já vir selecionado do mês atual")
  const [periodo, setPeriodo] = useState('mensal');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [janelaAtiva, setJanelaAtiva] = useState<number | null>(null);
  const [comparar, setComparar] = useState(false);

  const carregar = async () => {
    if (periodo === 'custom' && (!inicio || !fim)) {
      setErro('Escolha as duas datas para um período personalizado.');
      return;
    }
    setCarregando(true); setErro('');
    try {
      const resp = await getFunil(
        periodo === 'custom' ? { periodo, inicio, fim } : { periodo, janelas: JANELAS }
      );
      const r: Resposta = resp.data;
      setDados(r);
      // a última janela é a atual — é nela que a tela nasce
      setJanelaAtiva(r.janelas.length ? r.janelas.length - 1 : null);
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

  // fase 6 da janela em foco: pelo mês da DECISÃO; "Base inteira" usa a conversão
  // de toda a vida (mesma régua, sem recorte de mês)
  const conversaoFoco = useMemo<Conversao | null>(() => {
    if (!dados) return null;
    if (janelaAtiva === null) return dados.total_geral.conversao;
    return dados.conversao_por_periodo?.janelas[janelaAtiva] ?? null;
  }, [dados, janelaAtiva]);

  const fasesFunil = useMemo(() => (foco ? foco.fases.filter((f) => f.no_funil !== false) : []), [foco]);

  const maiorVazamento = useMemo(() => {
    if (!fasesFunil.length) return null;
    return [...fasesFunil].sort((a, b) => b.saiu_aqui - a.saiu_aqui)[0] ?? null;
  }, [fasesFunil]);

  const ultimaJanela = dados && dados.janelas.length ? dados.janelas.length - 1 : null;
  const noMesAtual = periodo === 'mensal' && janelaAtiva !== null && janelaAtiva === ultimaJanela;

  return (
    <div className="funil">
      <header className="funil__topo">
        <div>
          <h1>Funil</h1>
          <p className="funil__sub">
            Fases 1 a 5: o que a operação controla, pelo mês em que o pedido entrou.
            Fase 6: a decisão do juiz, pelo mês em que ela saiu.
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
                .map((m) => `${m.motivo} (${m.pedidos}${m.ids?.length ? ` — pedidos ${m.ids.join(', ')}` : ''})`).join(' · ')}</p>
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
        <div className="funil__modo">
          <button
            type="button"
            className={`funil__pill ${noMesAtual && !comparar ? 'is-ativo' : ''}`}
            onClick={() => {
              setComparar(false);
              if (periodo !== 'mensal') { setPeriodo('mensal'); return; }
              setJanelaAtiva(ultimaJanela);
            }}
            title="Volta para o mês em que estamos"
          >
            Mês atual
          </button>
          <button
            type="button"
            className={`funil__pill ${comparar ? 'is-ativo' : ''}`}
            onClick={() => setComparar((v) => !v)}
            title="Uma coluna por período: fases 1-5, aproveitamento e conversão lado a lado"
          >
            {comparar ? 'Ver um período' : 'Ver mês a mês (comparativo)'}
          </button>
        </div>
      )}

      {dados && !comparar && (
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

      {/* ── MODO COMPARATIVO: períodos em colunas, fases em linhas ────────── */}
      {dados && comparar && (
        <section className="funil__comparativo">
          <h2>Mês a mês</h2>
          <p className="funil__motivos-sub">
            Cada célula: <b>passaram / chegaram</b> e o % sobre quem chegou. A linha de
            conversão usa o mês da <b>decisão</b>, não o do pedido.
          </p>
          <div className="funil__comparativo-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Fase</th>
                  {dados.janelas.map((j) => <th key={j.rotulo}>{j.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="is-total">
                  <td>Entraram</td>
                  {dados.janelas.map((j) => <td key={j.rotulo}><b>{j.total_entraram}</b></td>)}
                </tr>
                {(dados.fases_funil ?? []).map((chave) => {
                  const nome = dados.fases.find((f) => f.chave === chave)?.nome ?? chave;
                  return (
                    <tr key={chave}>
                      <td>{nome}</td>
                      {dados.janelas.map((j) => {
                        const f = j.fases.find((x) => x.chave === chave);
                        if (!f || f.chegaram === 0) return <td key={j.rotulo} className="is-vazio">—</td>;
                        return (
                          <td key={j.rotulo} title={`${f.saiu_aqui} morreram · ${f.em_curso_aqui} em curso`}>
                            {f.passaram}/{f.chegaram}
                            <small>{fmtPct(f.pct_passaram)}</small>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="is-total">
                  <td>Aproveitamento (chegaram ao Estado)</td>
                  {dados.janelas.map((j) => (
                    <td key={j.rotulo} title={j.aproveitamento
                      ? `${j.aproveitamento.em_andamento} ainda andando · ${j.aproveitamento.morreram_antes} morreram antes`
                      : ''}>
                      <b>{fmtPct(j.aproveitamento?.pct)}</b>
                      <small>{j.aproveitamento?.chegaram_ao_estado ?? 0}/{j.total_entraram}</small>
                    </td>
                  ))}
                </tr>
                <tr className="is-conversao">
                  <td>Conversão — decididos no mês (de coortes anteriores)</td>
                  {dados.janelas.map((j, i) => {
                    const c = dados.conversao_por_periodo?.janelas[i];
                    if (!c || !c.disputados) return <td key={j.rotulo} className="is-vazio">—</td>;
                    return (
                      <td key={j.rotulo} title={c.amostra_pequena ? 'poucas decisões: o % oscila a cada uma' : ''}>
                        <b className={c.amostra_pequena ? 'is-provisorio' : ''}>{fmtPct(c.pct)}</b>
                        <small>{c.ganhos} ganhos · {c.perdemos_disputando} perdidos</small>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {foco && !comparar && (
        <>
          {/* ── APROVEITAMENTO — o funil operacional (fases 1-5) num número ── */}
          {foco.aproveitamento && (
            <section className="funil__conversao">
              <div className="funil__conversao-num">
                <strong className={foco.aproveitamento.pct === null ? 'is-imaturo' : ''}>
                  {fmtPct(foco.aproveitamento.pct)}
                </strong>
                <span>aproveitamento até a fase 5</span>
              </div>
              <div className="funil__conversao-txt">
                <p>{foco.aproveitamento.o_que_significa}</p>
                <div className="funil__conversao-detalhe">
                  <span><b>{foco.aproveitamento.entraram}</b> entraram</span>
                  <span><b>{foco.aproveitamento.chegaram_ao_estado}</b> chegaram ao Estado</span>
                  <span><b>{foco.aproveitamento.morreram_antes}</b> morreram antes</span>
                  <span><b>{foco.aproveitamento.em_andamento}</b> ainda andando</span>
                  {foco.aproveitamento.pct_definido !== null && foco.aproveitamento.em_andamento > 0 && (
                    <span title="só entre os que já tiveram desfecho nas fases 1-5">
                      <b>{foco.aproveitamento.pct_definido}%</b> entre os já definidos
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="funil__fases">
            {fasesFunil.map((f) => {
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
                      {f.chegaram > 0 && <> ({fmtPct(f.pct_passaram ?? Math.round(pctPassou * 10) / 10)} dos que chegaram)</>}</span>
                    {f.saiu_aqui > 0 && (
                      <span className="e-saiu" title={f.motivo_saida ?? ''}>
                        <b>{f.saiu_aqui}</b> morreram aqui</span>
                    )}
                    {f.em_curso_aqui > 0 && (
                      <span className="e-curso"><b>{f.em_curso_aqui}</b> ainda em curso
                        {f.taxa_passagem_pct !== null && f.taxa_passagem_pct !== f.pct_passaram && (
                          <> · {f.taxa_passagem_pct}% entre os já definidos</>
                        )}</span>
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

          {/* ── FASE 6 — a decisão do juiz, pelo mês em que SAIU ──────────── */}
          {conversaoFoco && (
            <section className="funil__conversao funil__conversao--fase6">
              <div className="funil__conversao-num">
                {conversaoFoco.disputados > 0 ? (
                  <><strong className={conversaoFoco.amostra_pequena || conversaoFoco.pode_mudar ? 'is-provisorio' : ''}>
                      {fmtPct(conversaoFoco.pct ?? conversaoFoco.pct_provisorio)}
                    </strong>
                    <span>fase 6 · conversão dos {janelaAtiva !== null ? 'decididos no período' : 'decididos'}</span></>
                ) : (
                  <><strong className="is-imaturo">—</strong>
                    <span>fase 6 · {janelaAtiva !== null ? 'nenhuma decisão saiu neste período' : 'sem disputa decidida'}</span></>
                )}
              </div>
              <div className="funil__conversao-txt">
                <p>
                  {janelaAtiva !== null
                    ? (conversaoFoco.disputados > 0
                        ? `Dos ${conversaoFoco.disputados} processos que o juiz decidiu neste período com o nosso orçamento na mesa, ganhamos ${conversaoFoco.ganhos}.`
                        + (conversaoFoco.amostra_pequena ? ' Poucas decisões: o % oscila a cada uma que sai.' : '')
                        : 'O juiz não decidiu nenhum processo com o nosso orçamento neste período.')
                    : conversaoFoco.o_que_significa}
                </p>
                <div className="funil__conversao-detalhe">
                  <span><b>{conversaoFoco.ganhos}</b> ganhos</span>
                  <span><b>{conversaoFoco.perdemos_disputando}</b> perdidos disputando</span>
                  <span><b>{conversaoFoco.aguardando_decisao}</b> ainda no juiz (total)</span>
                  {(conversaoFoco.encerrados_sem_disputa ?? 0) > 0 && (
                    <span title="extinto/arquivado no juiz: saiu, mas ninguém escolheu outro preço — não entra na conversão">
                      <b>{conversaoFoco.encerrados_sem_disputa}</b> encerrados sem disputa</span>
                  )}
                </div>
                {janelaAtiva !== null && (
                  <p className="funil__populacao">
                    População diferente das fases 1-5: são processos que entraram meses antes
                    (defasagem mediana ~190 dias). Não dividir pelo que entrou no mês.
                  </p>
                )}
              </div>
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
                <tr key={`${m.motivo}|${m.fase}`} className={m.competiu ? 'competiu' : ''}>
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
      {dados && !comparar && <FunilDetalhe inicio={foco?.inicio} fim={foco?.fim} />}

    </div>
  );
}

export default FunilPage;
