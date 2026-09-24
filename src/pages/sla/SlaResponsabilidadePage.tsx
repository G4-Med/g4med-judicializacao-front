import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSlaResponsabilidade } from '../../services/api/orders';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import './SlaPage.css';
import './SlaResponsabilidadePage.css';

/**
 * Prazos estourados da SUA parte (SLA por responsabilidade · @R 23/09).
 *
 * ⟦"a notificação de sla vem para a página de sla, mas ela deveria vir para o relatório por responsabilidade do sla,
 * onde cada parte vê o estouro sobre sua responsabilidade referente ao mês atual e sua fase atual"⟧ — o sino agora
 * traz para cá, e o número do sino é o total desta tela (a MESMA função no servidor).
 *
 * A régua é a da TELA de cada fase: a fila é a mesma que a tela mostra e o relógio é o tempo acumulado na fase
 * (pausa fora dela, não zera quando o pedido volta). Enviado à SES e Protocolados são acompanhamento, não estouro.
 */

type Fase = {
  chave: string; nome: string; dono: string; rota: string; metaDias: number | null; rotuloDivida: string | null;
  naFase: number; estourados: number; doMes: number; carregados: number; aproximados: number;
};
type Item = {
  orderId: number; paciente: string | null; procedimento: string | null; statusJuridico: string | null;
  nprocesso: string | null; fase: string; faseNome: string; dono: string; rota: string;
  dias: number | null; metaDias: number | null; atrasoDias: number | null; estourouEm: string | null; doMes: boolean;
  rotulo: string | null; aproximado: boolean; motivoAproximado: string | null; medicoDesde: string | null;
};
type Acomp = { chave: string; nome: string; rota: string; quantidade: number; maisAntigoDias: number;
  desde120Dias?: number; desde180Dias?: number };
type Relatorio = {
  geradoEm: string; mes: string; minhasFases: string[]; total: number; doMes: number; carregados: number;
  fases: Fase[]; acompanhamento: Acomp[]; itens: Item[]; regua: string; nota: string;
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
  'novembro', 'dezembro'];

function nomeDoMes(aaaaMm: string) {
  const [a, m] = aaaaMm.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} de ${a}`;
}

function textoMeta(f: { chave: string; metaDias: number | null }) {
  if (f.chave === 'selecionar_medico') return 'meta 24 h (fim de semana vai para segunda)';
  if (f.chave === 'bater_valores') return 'meta 24 h úteis';
  if (f.metaDias == null) return 'sem prazo definido';
  return `meta ${f.metaDias} dia${f.metaDias === 1 ? '' : 's'}`;
}

function dias(n: number | null) {
  if (n == null) return '—';
  if (n < 1) return `${Math.round(n * 24)} h`;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
}

function data(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function SlaResponsabilidadePage() {
  const navigate = useNavigate();
  const ficha = useFichaPedido();
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [fase, setFase] = useState<string>('todas');
  const [periodo, setPeriodo] = useState<'todos' | 'mes' | 'anteriores'>('todos');

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    getSlaResponsabilidade()
      .then((r: any) => setRel(r.data))
      .catch((e: any) => {
        const d = e?.response?.data;
        setErro(d?.desativado ? 'A leitura de prazos está desligada de propósito agora (manutenção).'
          : d?.error || 'Prazos indisponíveis agora. Tente de novo em instantes.');
      })
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const itens = useMemo(() => (rel?.itens ?? []).filter((i) =>
    (fase === 'todas' || i.fase === fase)
    && (periodo === 'todos' || (periodo === 'mes' ? i.doMes : !i.doMes))), [rel, fase, periodo]);

  return (
    <div className="sla slr">
      <header className="sla__topo slr__topo">
        <div>
          <h1>Prazos estourados da sua parte</h1>
          <p className="sla__sub">
            {rel ? <>Situação de agora em {nomeDoMes(rel.mes)}, nas fases pelas quais você responde.</>
              : 'Os pedidos fora do prazo nas fases pelas quais você responde.'}
          </p>
        </div>
        <button type="button" className="slr__atualizar" onClick={carregar} disabled={carregando}>
          <i className={`pi ${carregando ? 'pi-spin pi-spinner' : 'pi-refresh'}`} /> Atualizar
        </button>
      </header>

      {erro && (
        <div className="sla__erro">
          {erro} <button type="button" className="slr__link" onClick={carregar}>Tentar de novo</button>
        </div>
      )}

      {rel && (
        <>
          <section className={`slr__resumo ${rel.total ? 'is-vermelho' : 'is-verde'}`}>
            <div className="slr__numero">{rel.total}</div>
            <div>
              <strong>{rel.total === 0 ? 'Nenhum pedido fora do prazo na sua parte.'
                : `pedido${rel.total > 1 ? 's' : ''} fora do prazo na sua parte`}</strong>
              {rel.total > 0 && (
                <span>
                  {rel.doMes} {rel.doMes === 1 ? 'estourou' : 'estouraram'} neste mês · {rel.carregados}{' '}
                  {rel.carregados === 1 ? 'vem de mês anterior e segue aberto' : 'vêm de meses anteriores e seguem abertos'}
                </span>
              )}
            </div>
          </section>

          <section className="slr__fases">
            {rel.fases.map((f) => (
              <article key={f.chave} className={`slr__fase ${f.estourados ? 'is-vermelho' : ''}`}>
                <header>
                  <strong>{f.nome}</strong>
                  <span className="slr__dono">{f.dono}</span>
                </header>
                <p className="slr__meta">{textoMeta(f)}</p>
                <p className="slr__conta">
                  <b>{f.estourados}</b> fora do prazo <span>de {f.naFase} na fila</span>
                </p>
                {f.estourados > 0 && (
                  <p className="slr__mes">{f.doMes} neste mês · {f.carregados} de antes</p>
                )}
                {f.rotuloDivida && f.estourados > 0 && <p className="slr__rotulo">dívida: {f.rotuloDivida}</p>}
                <div className="slr__acoes">
                  {f.estourados > 0 && (
                    <button type="button" className="slr__link" onClick={() => setFase(f.chave)}>ver os pedidos</button>
                  )}
                  <button type="button" className="slr__link" onClick={() => navigate(f.rota)}>abrir a fila →</button>
                </div>
              </article>
            ))}
          </section>

          {rel.total > 0 && (
            <section className="slr__lista">
              <div className="slr__filtros">
                <div className="slr__chips">
                  <button type="button" className={fase === 'todas' ? 'is-ativo' : ''} onClick={() => setFase('todas')}>
                    Todas as fases ({rel.total})
                  </button>
                  {rel.fases.filter((f) => f.estourados > 0).map((f) => (
                    <button type="button" key={f.chave} className={fase === f.chave ? 'is-ativo' : ''}
                      onClick={() => setFase(f.chave)}>{f.nome} ({f.estourados})</button>
                  ))}
                </div>
                <div className="slr__chips">
                  {([['todos', 'Todos'], ['mes', 'Estouraram neste mês'], ['anteriores', 'De meses anteriores']] as const)
                    .map(([k, t]) => (
                      <button type="button" key={k} className={periodo === k ? 'is-ativo' : ''}
                        onClick={() => setPeriodo(k)}>{t}</button>
                    ))}
                </div>
              </div>
              <table className="slr__tabela">
                <thead>
                  <tr>
                    <th>Pedido</th><th>Paciente</th><th>Fase</th><th>Na fase há</th><th>Além da meta</th>
                    <th>Estourou em</th><th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.orderId} onClick={() => ficha.abrir(i.orderId)} title="Abrir a ficha do pedido">
                      <td className="slr__id">#{i.orderId}</td>
                      <td>
                        {i.paciente || '—'}
                        {i.statusJuridico === 'Segredo de Justiça' && <span className="slr__segredo">segredo</span>}
                        {i.procedimento && <small>{i.procedimento}</small>}
                      </td>
                      <td>{i.faseNome}</td>
                      <td className="slr__dias">{dias(i.dias)}{i.aproximado && <span className="slr__aprox" title={`relógio aproximado: ${i.motivoAproximado}`}>≈</span>}</td>
                      <td className="slr__atraso">+{dias(i.atrasoDias)}</td>
                      <td>{data(i.estourouEm)}{!i.doMes && <small>mês anterior</small>}</td>
                      <td>
                        {i.rotulo && <span className={`slr__tag ${i.rotulo.includes('nossa') ? 'is-nossa' : ''}`}>{i.rotulo}</span>}
                        {i.medicoDesde && <small>médico solicitado em {data(i.medicoDesde)}</small>}
                      </td>
                    </tr>
                  ))}
                  {itens.length === 0 && (
                    <tr><td colSpan={7} className="sla__vazio">Nenhum pedido neste filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          {rel.acompanhamento.length > 0 && (
            <section className="slr__acomp">
              <h2>Em acompanhamento (sem estouro)</h2>
              {rel.acompanhamento.map((a) => (
                <div key={a.chave} className="slr__acomp-linha">
                  <strong>{a.nome}</strong>
                  <span>
                    {a.quantidade} pedido{a.quantidade === 1 ? '' : 's'}
                    {a.chave === 'verificacao_ses'
                      ? <> · {a.desde120Dias ?? 0} há mais de 120 dias (verificar) · {a.desde180Dias ?? 0} há mais de 180 (cobrar)</>
                      : <> · prazo ainda não definido</>}
                  </span>
                  <button type="button" className="slr__link" onClick={() => navigate(a.rota)}>abrir →</button>
                </div>
              ))}
            </section>
          )}

          <p className="sla__nota slr__regua">
            Como conto: {rel.regua} {rel.nota} O ≈ marca relógio aproximado.
          </p>
        </>
      )}
    </div>
  );
}
