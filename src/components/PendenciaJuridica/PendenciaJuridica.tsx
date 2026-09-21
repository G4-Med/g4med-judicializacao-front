import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import {
  getPendenciasJuridicas, abrirPendenciaJuridica, responderPendenciaJuridica, marcarPendenciaLida, getMedicosSelect,
} from '../../services/api/orders';
import type { PendenciaJuridica, TipoPendenciaJuridica } from '../../services/api/orders';
import './PendenciaJuridica.css';

/* BILHETE DE IDA E VOLTA fase 3 → jurídico (1.1) → fase 3 — pedido do Fabrício (reunião 20/09):
   quem cota escreve o que precisa do jurídico; o pedido vai para a Valéria e volta sozinho para
   onde estava, com a resposta marcada, até quem pediu dizer "li". Decisões @R 20/09 23:25. */

export const TIPOS_PENDENCIA: { value: TipoPendenciaJuridica; label: string; dica: string }[] = [
  { value: 'INTEIRO_TEOR', label: 'Falta a peça de inteiro teor', dica: 'O médico não consegue cotar sem a decisão/peça completa.' },
  { value: 'ACHAR_MEDICO', label: 'Achar médico para o pedido', dica: 'Não temos quem faça; o jurídico indica um nome.' },
  { value: 'CONTATO_PACIENTE_ADVOGADO', label: 'Contato com paciente / advogado', dica: 'Falta um dado que só o paciente ou o advogado tem.' },
  { value: 'VERIFICACAO', label: 'Verificação', dica: 'Conferir algo no processo antes de cotar.' },
  { value: 'RECADO', label: 'Recado', dica: 'Aviso que precisa de ciência do jurídico.' },
];

const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const erroDe = (e: any, padrao: string) => e?.response?.data?.error || padrao;

/* ── cache de módulo: 1 chamada por tela (mesmo desenho do MarcadorAnotacao) ─────────────── */
let cache: Record<string, PendenciaJuridica> | null = null;
let totais = { ABERTA: 0, RESPONDIDA: 0, LIDA: 0 };
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

async function carregar(): Promise<void> {
  if (cache) return;
  if (!carregando) {
    carregando = getPendenciasJuridicas({ status: 'ABERTA,RESPONDIDA' })
      .then((r) => {
        const novo: Record<string, PendenciaJuridica> = {};
        // a lista vem da mais nova para a mais velha: a 1ª de cada pedido é a que vale
        for (const p of r.data?.itens ?? []) if (!novo[String(p.orderId)]) novo[String(p.orderId)] = p;
        cache = novo; totais = r.data?.total ?? totais;
      })
      .catch(() => { cache = {}; })
      .finally(() => { carregando = null; });
  }
  return carregando;
}
export function invalidarPendencias() { cache = null; carregar().then(() => ouvintes.forEach((f) => f())); }

function usePendenciaDoPedido(orderId: number) {
  const [p, setP] = useState<PendenciaJuridica | null>(cache?.[String(orderId)] ?? null);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setP(cache?.[String(orderId)] ?? null); };
    carregar().then(atualizar); ouvintes.add(atualizar);
    return () => { vivo = false; ouvintes.delete(atualizar); };
  }, [orderId]);
  return p;
}

/** Contador para o menu: quantas pendências estão ABERTAS no jurídico. */
export function usePendenciasAbertas(): number {
  const [n, setN] = useState(totais.ABERTA);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setN(totais.ABERTA); };
    carregar().then(atualizar); ouvintes.add(atualizar);
    return () => { vivo = false; ouvintes.delete(atualizar); };
  }, []);
  return n;
}

/** Selo na frente do nome do paciente, em todas as filas (ponto único: nomeComCopiar).
 *  ⚖ roxo = está no jurídico (1.1) · ↩ verde = retornou do jurídico, clique para ler e marcar "li". */
export function SeloPendencia({ orderId }: { orderId: number }) {
  const p = usePendenciaDoPedido(orderId);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  if (!p) return null;
  const respondida = p.status === 'RESPONDIDA';
  const li = async () => {
    setSalvando(true);
    try { await marcarPendenciaLida(p.orderId, p.id); setAberto(false); invalidarPendencias(); }
    catch (e) { alert(erroDe(e, 'Não foi possível marcar como lida.')); }
    finally { setSalvando(false); }
  };
  return (
    <>
      <button type="button" className={`mc-pend-selo mc-pend-selo--${respondida ? 'respondida' : 'aberta'}`}
        title={respondida ? 'Retornou do jurídico — clique para ler a resposta' : `No jurídico (1.1): ${p.tipoRotulo}`}
        aria-label={respondida ? 'Retornou do jurídico' : 'Pendência aberta no jurídico'}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>{respondida ? '↩' : '⚖'}</button>
      <Dialog header={respondida ? 'Retornou do jurídico' : 'No jurídico (1.1)'} visible={aberto} modal dismissableMask
        style={{ width: '34rem', maxWidth: '94vw' }} onHide={() => setAberto(false)}>
        <ItemPendencia p={p} />
        {respondida && <Button label="Li" icon="pi pi-check" loading={salvando} onClick={li} />}
      </Dialog>
    </>
  );
}

function ItemPendencia({ p }: { p: PendenciaJuridica }) {
  return (
    <div>
      <strong>{p.tipoRotulo}</strong>
      <div>{p.texto}</div>
      <small>pedido por {p.abertaPor || '—'} em {quando(p.abertaEm)} · saiu de “{p.faseOrigem}”</small>
      {p.resposta && (
        <div className="mc-pend-resposta">
          <strong>Resposta do jurídico:</strong> {p.resposta}
          {p.medicoIndicadoNome && <div>Médico indicado: <strong>{p.medicoIndicadoNome}</strong></div>}
          <small>{p.respondidaPor || '—'} em {quando(p.respondidaEm)}{p.lidaEm ? ` · lida por ${p.lidaPor || '—'} em ${quando(p.lidaEm)}` : ''}</small>
        </div>
      )}
    </div>
  );
}

/** Diálogo de quem cota: escolhe o tipo, escreve o que precisa, o pedido vai para a Valéria. */
export function DialogAbrirPendencia({ orderId, visible, onHide, onFeito }:
  { orderId: number | null; visible: boolean; onHide: () => void; onFeito?: () => void }) {
  const [tipo, setTipo] = useState<TipoPendenciaJuridica>('INTEIRO_TEOR');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (visible) { setTipo('INTEIRO_TEOR'); setTexto(''); } }, [visible]);
  const enviar = async () => {
    if (!orderId) return;
    setSalvando(true);
    try { await abrirPendenciaJuridica(orderId, tipo, texto.trim()); invalidarPendencias(); onHide(); onFeito?.(); }
    catch (e) { alert(erroDe(e, 'Não foi possível devolver ao jurídico.')); }
    finally { setSalvando(false); }
  };
  const dica = TIPOS_PENDENCIA.find((t) => t.value === tipo)?.dica;
  return (
    <Dialog header="Devolver ao jurídico (1.1)" visible={visible} modal style={{ width: '34rem', maxWidth: '94vw' }} onHide={onHide}>
      <div className="mc-pend-form">
        <p style={{ margin: 0 }}>O pedido <strong>sai da fila de orçamento</strong>, vai para a Análise Jurídica (1.1 Pendências) e
          <strong> volta sozinho para cá</strong> quando o jurídico responder.</p>
        <label htmlFor="mc-pend-tipo">O que você precisa</label>
        <Dropdown inputId="mc-pend-tipo" value={tipo} options={TIPOS_PENDENCIA} onChange={(e) => setTipo(e.value)} style={{ width: '100%' }} />
        {dica && <small>{dica}</small>}
        <label htmlFor="mc-pend-texto">Escreva o que o jurídico precisa fazer (mínimo 10 caracteres)</label>
        <InputTextarea id="mc-pend-texto" value={texto} onChange={(e) => setTexto(e.target.value)} autoResize />
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
          <Button label="Cancelar" text onClick={onHide} />
          <Button label="Enviar ao jurídico" icon="pi pi-send" disabled={texto.trim().length < 10} loading={salvando} onClick={enviar} />
        </div>
      </div>
    </Dialog>
  );
}

/** Bloco da Ficha do Pedido: histórico das pendências + abrir uma nova + marcar lida. */
export function BlocoPendenciaJuridica({ orderId, onMudou }: { orderId: number; onMudou?: () => void }) {
  const [itens, setItens] = useState<PendenciaJuridica[]>([]);
  const [abrir, setAbrir] = useState(false);
  const recarregar = useCallback(() => {
    getPendenciasJuridicas({ status: 'ABERTA,RESPONDIDA,LIDA', orderId }).then((r) => setItens(r.data?.itens ?? [])).catch(() => setItens([]));
  }, [orderId]);
  useEffect(() => { recarregar(); }, [recarregar]);
  const temAberta = itens.some((i) => i.status === 'ABERTA');
  const li = async (p: PendenciaJuridica) => {
    try { await marcarPendenciaLida(p.orderId, p.id); invalidarPendencias(); recarregar(); }
    catch (e) { alert(erroDe(e, 'Não foi possível marcar como lida.')); }
  };
  return (
    <section>
      <h4 style={{ margin: '.2rem 0 .5rem' }}>Pedidos ao jurídico (1.1)</h4>
      {itens.length > 0 && (
        <ul className="mc-pend-lista">
          {itens.map((p) => (
            <li key={p.id} className={p.status.toLowerCase()}>
              <ItemPendencia p={p} />
              {p.status === 'ABERTA' && <small>aguardando o jurídico</small>}
              {p.status === 'RESPONDIDA' && <Button label="Li" icon="pi pi-check" size="small" outlined onClick={() => li(p)} style={{ marginTop: '.35rem' }} />}
            </li>
          ))}
        </ul>
      )}
      <Button label="Devolver ao jurídico (1.1)" icon="pi pi-reply" outlined size="small" disabled={temAberta}
        title={temAberta ? 'Já existe uma pendência aberta para este pedido' : 'Pedir algo ao jurídico: o pedido vai e volta sozinho'}
        onClick={() => setAbrir(true)} />
      <DialogAbrirPendencia orderId={orderId} visible={abrir} onHide={() => setAbrir(false)} onFeito={() => { recarregar(); onMudou?.(); }} />
    </section>
  );
}

/** Aba "1.1 Pendências" da Análise Jurídica — o que pediram ao jurídico e ainda espera resposta. */
export function AbaPendenciasJuridicas({ onAbrirFicha, readOnly }: { onAbrirFicha?: (orderId: number) => void; readOnly?: boolean }) {
  const [itens, setItens] = useState<PendenciaJuridica[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [medicos, setMedicos] = useState<Record<number, number | null>>({});
  const [opcoesMedico, setOpcoesMedico] = useState<{ label: string; value: number }[]>([]);
  const [salvando, setSalvando] = useState<number | null>(null);
  const recarregar = useCallback(() => {
    setCarregandoLista(true);
    getPendenciasJuridicas({ status: 'ABERTA' }).then((r) => setItens(r.data?.itens ?? [])).catch(() => setItens([]))
      .finally(() => setCarregandoLista(false));
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => {
    if (!itens.some((i) => i.tipo === 'ACHAR_MEDICO') || opcoesMedico.length) return;
    getMedicosSelect().then((r: any) => setOpcoesMedico(((r.data ?? []) as any[])
      .filter((m) => m.id !== 1).map((m) => ({ value: m.id, label: m.nomeCompleto || m.nome || `Médico ${m.id}` })))).catch(() => undefined);
  }, [itens, opcoesMedico.length]);
  const responder = async (p: PendenciaJuridica) => {
    setSalvando(p.id);
    try {
      await responderPendenciaJuridica(p.orderId, p.id, (respostas[p.id] || '').trim(), medicos[p.id] ?? null);
      invalidarPendencias(); recarregar();
    } catch (e) { alert(erroDe(e, 'Não foi possível responder.')); }
    finally { setSalvando(null); }
  };
  if (carregandoLista) return <p>Carregando pendências…</p>;
  if (!itens.length) return <p>Nenhuma pendência aberta. Quando quem cota precisar de algo do jurídico, o pedido aparece aqui.</p>;
  return (
    <div>
      {itens.map((p) => (
        <article key={p.id} className="mc-pend-card">
          <header>
            <span><span className="tipo">{p.tipoRotulo}</span> · pedido #{p.orderId} · <span className="col-paciente-upper">{p.paciente}</span></span>
            <small>há {p.dias ?? 0} dia(s) · pedido por {p.abertaPor || '—'} em {quando(p.abertaEm)}</small>
          </header>
          <div><small>{p.procedimento}{p.nprocesso ? ` · ${p.nprocesso}` : ''} · volta para “{p.faseOrigem}”</small></div>
          <p style={{ margin: '.5rem 0' }}>{p.texto}</p>
          {p.tipo === 'INTEIRO_TEOR' && <small>Anexe a peça pela Ficha do pedido (Documentos) e depois responda aqui.</small>}
          {!readOnly && (
            <div className="acoes">
              <div style={{ flex: '1 1 18rem' }}>
                <InputTextarea value={respostas[p.id] || ''} autoResize style={{ width: '100%' }}
                  placeholder="Resposta para quem pediu (mínimo 10 caracteres)"
                  onChange={(e) => setRespostas((s) => ({ ...s, [p.id]: e.target.value }))} />
              </div>
              {p.tipo === 'ACHAR_MEDICO' && (
                <Dropdown value={medicos[p.id] ?? null} options={opcoesMedico} filter showClear placeholder="Médico indicado (opcional)"
                  onChange={(e) => setMedicos((s) => ({ ...s, [p.id]: e.value ?? null }))} style={{ minWidth: '16rem' }} />
              )}
              {onAbrirFicha && <Button label="Ficha" icon="pi pi-folder-open" outlined severity="secondary" onClick={() => onAbrirFicha(p.orderId)} />}
              <Button label="Responder e devolver" icon="pi pi-reply" loading={salvando === p.id}
                disabled={(respostas[p.id] || '').trim().length < 10} onClick={() => responder(p)} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
