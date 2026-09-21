import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import { BotaoCopiar } from '../BotaoCopiar/BotaoCopiar';
import {
  getPendenciasJuridicas, uploadAnexoOrder, abrirPendenciaJuridica, responderPendenciaJuridica, marcarPendenciaLida, cancelarPendenciaJuridica, getMedicosSelect,
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
let carregadoEm = 0;
const VALIDADE_MS = 60_000;   // o selo e o contador se renovam sozinhos: quem pediu vê o ↩ sem recarregar a página
let totais = { ABERTA: 0, RESPONDIDA: 0, LIDA: 0 };
let paraAgir = { meusRetornos: 0, paradas: 0, semLerAntigas: 0 };
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

async function carregar(): Promise<void> {
  if (cache && Date.now() - carregadoEm < VALIDADE_MS) return;
  if (!carregando) {
    carregando = getPendenciasJuridicas({ status: 'ABERTA,RESPONDIDA' })
      .then((r) => {
        const novo: Record<string, PendenciaJuridica> = {};
        // por pedido vale a pendência MAIS NOVA (maior id) — não depende da ordem em que o servidor lista
        for (const p of r.data?.itens ?? []) { const k = String(p.orderId); if (!novo[k] || p.id > novo[k].id) novo[k] = p; }
        cache = novo; carregadoEm = Date.now(); totais = r.data?.total ?? totais; paraAgir = r.data?.paraAgir ?? paraAgir;
      })
      // erro NÃO vira "sem pendências": o cache fica nulo e a próxima tela tenta de novo (antes {} congelava em 0)
      .catch(() => { cache = null; carregadoEm = 0; })
      .finally(() => { carregando = null; });
  }
  return carregando;
}
export function invalidarPendencias() { cache = null; carregadoEm = 0; carregar().then(() => ouvintes.forEach((f) => f())); }

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
    const t = window.setInterval(() => { carregar().then(() => ouvintes.forEach((f) => f())); }, VALIDADE_MS);
    return () => { vivo = false; ouvintes.delete(atualizar); window.clearInterval(t); };
  }, []);
  return n;
}

/** Quem precisa agir VÊ que precisa (furo do juiz virgem: a etapa LER tinha dono e não tinha gatilho).
 *  meusRetornos = respostas esperando o "Li" de quem pediu · paradas = bilhetes abertos há dias ·
 *  semLerAntigas = respostas que ninguém leu (só Admin/Gerente recebem número). */
export function usePendenciasParaAgir() {
  const [v, setV] = useState(paraAgir);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setV({ ...paraAgir }); };
    carregar().then(atualizar); ouvintes.add(atualizar);
    return () => { vivo = false; ouvintes.delete(atualizar); };
  }, []);
  return v;
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
        aria-label={respondida ? `Retornou do jurídico: ${p.tipoRotulo}. Abrir a resposta` : `No jurídico aguardando: ${p.tipoRotulo}`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>{respondida ? '↩' : '⚖'}</button>
      <Dialog header={respondida ? 'Retornou do jurídico' : 'No jurídico (1.1)'} visible={aberto} modal dismissableMask
        style={{ width: '34rem', maxWidth: '94vw' }} onHide={() => setAberto(false)}>
        <ItemPendencia p={p} />
        {respondida && (
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.6rem', flexWrap: 'wrap' }}>
            <Button label="Li" icon="pi pi-check" loading={salvando} onClick={li} title="Quem marca como lida é quem pediu (ou Admin/Gerente)" />
            {/* A resposta costuma ser para o MÉDICO que perguntou; quem pediu aqui só fez a ponte (ata 20/09). */}
            <span>Copiar a resposta para o médico <BotaoCopiar valor={p.resposta} rotulo="resposta do jurídico" /></span>
          </div>
        )}
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
          {p.faseRestaurada === false && <div role="note"><strong>Atenção:</strong> quando o jurídico respondeu o pedido já tinha sido movido por outra pessoa, então ele <strong>não voltou</strong> para “{p.faseOrigem}”. Confira a fase na Ficha.</div>}
        </div>
      )}
      {p.status === 'CANCELADA' && <small>cancelada por {p.canceladaPor || '—'} em {quando(p.canceladaEm)} — {p.motivoCancelamento}</small>}
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
  const [falhou, setFalhou] = useState(false);
  const recarregar = useCallback(() => {
    getPendenciasJuridicas({ status: 'ABERTA,RESPONDIDA,LIDA,CANCELADA', orderId })
      .then((r) => { setItens(r.data?.itens ?? []); setFalhou(false); })
      // falha de rede NÃO é "sem pendências": sem isto o botão Devolver reabilitava com uma aberta escondida
      .catch(() => setFalhou(true));
  }, [orderId]);
  useEffect(() => { recarregar(); }, [recarregar]);
  const temAberta = itens.some((i) => i.status === 'ABERTA');
  const li = async (p: PendenciaJuridica) => {
    try { await marcarPendenciaLida(p.orderId, p.id); invalidarPendencias(); recarregar(); }
    catch (e) { alert(erroDe(e, 'Não foi possível marcar como lida.')); }
  };
  const cancelar = async (p: PendenciaJuridica) => {
    const motivo = window.prompt('Por que está cancelando este pedido ao jurídico? (mínimo 5 caracteres)');
    if (!motivo || motivo.trim().length < 5) return;
    try { await cancelarPendenciaJuridica(p.orderId, p.id, motivo.trim()); invalidarPendencias(); recarregar(); onMudou?.(); }
    catch (e) { alert(erroDe(e, 'Não foi possível cancelar.')); }
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
              {p.status === 'ABERTA' && <Button label="Cancelar pedido ao jurídico" icon="pi pi-undo" size="small" text severity="secondary"
                title="Abriu por engano? Cancela e o pedido volta de onde saiu (só quem abriu, Admin ou Gerente)" onClick={() => cancelar(p)} style={{ marginTop: '.35rem' }} />}
              {p.status === 'RESPONDIDA' && <Button label="Li" icon="pi pi-check" size="small" outlined onClick={() => li(p)} style={{ marginTop: '.35rem' }} />}
            </li>
          ))}
        </ul>
      )}
      {falhou && <p role="alert">Não consegui carregar os pedidos ao jurídico deste pedido. <button type="button" onClick={recarregar}>Tentar de novo</button></p>}
      <Button label="Devolver ao jurídico (1.1)" icon="pi pi-reply" outlined size="small" disabled={temAberta || falhou}
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
  const [semPeca, setSemPeca] = useState<Record<number, boolean>>({});
  const [semMedico, setSemMedico] = useState<Record<number, boolean>>({});
  const [falhou, setFalhou] = useState(false);
  const [anexando, setAnexando] = useState<number | null>(null);
  const [anexadas, setAnexadas] = useState<Record<number, string>>({});
  const recarregar = useCallback(() => {
    setCarregandoLista(true);
    getPendenciasJuridicas({ status: 'ABERTA' }).then((r) => { setItens(r.data?.itens ?? []); setFalhou(false); })
      .catch(() => setFalhou(true))   // nunca mostrar "nenhuma pendência" quando o que houve foi erro
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
      const r = await responderPendenciaJuridica(p.orderId, p.id, (respostas[p.id] || '').trim(), medicos[p.id] ?? null, !!semPeca[p.id], !!semMedico[p.id]);
      if (r.data?.faseRestaurada === false) alert('Resposta registrada. Atenção: o pedido já tinha sido movido por outra pessoa e NÃO voltou para a fase de origem — confira na Ficha.');
      else if (r.data?.medicoMudouNoMeio) alert('Resposta registrada e pedido devolvido. Atenção: o médico do pedido mudou enquanto ele estava aqui (troca ou recusa) — vale o médico atual, não o de quando o pedido chegou.');
      else if ((r.data?.pecasNaFilaDeLeitura ?? 0) > 0) alert(`Resposta registrada e pedido devolvido. ${r.data.pecasNaFilaDeLeitura} peça(s) entraram na fila de leitura: o médico vai receber o pedido com laudo, exames e orçamentos extraídos.`);
      invalidarPendencias(); recarregar();
    } catch (e) { alert(erroDe(e, 'Não foi possível responder.')); }
    finally { setSalvando(null); }
  };
  // B1 do desenho grau 1: a Valéria era mandada anexar "pela Ficha", que não faz este upload, e o pedido em 1.1
  // está fora da lista da Análise — ficava sem porta. A peça se anexa AQUI, no próprio cartão.
  const anexarPeca = async (p: PendenciaJuridica, arquivo?: File | null) => {
    if (!arquivo) return;
    setAnexando(p.id);
    try { await uploadAnexoOrder(p.orderId, arquivo, 'DECISAO_INTEIRO_TEOR'); setAnexadas((s) => ({ ...s, [p.id]: arquivo.name })); }
    catch (e) { alert(erroDe(e, 'Não foi possível anexar a peça.')); }
    finally { setAnexando(null); }
  };
  if (carregandoLista) return <p>Carregando pendências…</p>;
  if (falhou) return <p role="alert">Não consegui carregar as pendências. <button type="button" onClick={recarregar}>Tentar de novo</button></p>;
  if (!itens.length) return <p>Nenhuma pendência aberta. Quando quem cota precisar de algo do jurídico, o pedido aparece aqui. (A “Pendência jurídica” que você mesma marca na análise de um pedido novo continua na aba “1. Análise”.)</p>;
  return (
    <div>
      {itens.map((p) => (
        <article key={p.id} className="mc-pend-card">
          <header>
            <span><span className="tipo">{p.tipoRotulo}</span> · pedido #{p.orderId} · <span className="col-paciente-upper">{p.paciente}</span></span>
            <small>{p.parada ? <strong style={{ color: '#b91c1c' }}>PARADA há {p.dias ?? 0} dia(s) — o pedido está fora da fila de orçamento enquanto isso</strong> : <>há {p.dias ?? 0} dia(s)</>} · pedido por {p.abertaPor || '—'} em {quando(p.abertaEm)}</small>
          </header>
          <div><small>{p.procedimento}{p.nprocesso ? ` · ${p.nprocesso}` : ''} · volta para “{p.faseOrigem}”</small></div>
          {p.foraDoJuridico && <p role="note" style={{ margin: '.4rem 0' }}><strong>Atenção:</strong> este pedido foi tirado do jurídico por outra tela e hoje está em “{p.faseAtual}”. Responder aqui <strong>registra a resposta e encerra a pendência</strong>, sem mover o pedido.</p>}
          <p style={{ margin: '.5rem 0' }}>{p.texto}</p>
          {p.tipo === 'INTEIRO_TEOR' && (
            <div>
              <label className="p-button p-button-outlined p-button-sm" style={{ cursor: 'pointer' }}>
                <i className="pi pi-paperclip" style={{ marginRight: '.4rem' }} />{anexando === p.id ? 'Anexando…' : 'Anexar peça de inteiro teor (PDF)'}
                <input type="file" accept="application/pdf" hidden disabled={anexando === p.id}
                  onChange={(e) => { anexarPeca(p, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {anexadas[p.id] && <small style={{ marginLeft: '.5rem' }}>✓ anexada: {anexadas[p.id]}</small>}
              <label style={{ display: 'block', marginTop: '.3rem' }}>
                <input type="checkbox" checked={!!semPeca[p.id]} onChange={(e) => setSemPeca((s) => ({ ...s, [p.id]: e.target.checked }))} />{' '}
                Não há peça nova para anexar (explique na resposta)
              </label>
            </div>
          )}
          {!readOnly && (
            <div className="acoes">
              <div style={{ flex: '1 1 18rem' }}>
                <InputTextarea value={respostas[p.id] || ''} autoResize style={{ width: '100%' }}
                  placeholder="Resposta para quem pediu (mínimo 10 caracteres)"
                  onChange={(e) => setRespostas((s) => ({ ...s, [p.id]: e.target.value }))} />
              </div>
              {p.tipo === 'ACHAR_MEDICO' && (
                <label style={{ flexBasis: '100%' }}>
                  <input type="checkbox" checked={!!semMedico[p.id]} onChange={(e) => setSemMedico((s) => ({ ...s, [p.id]: e.target.checked }))} />{' '}
                  Não encontrei médico (explique na resposta) — o pedido volta para Selecionar Médico
                </label>
              )}
              {p.tipo === 'ACHAR_MEDICO' && !semMedico[p.id] && (
                <Dropdown value={medicos[p.id] ?? null} options={opcoesMedico} filter showClear placeholder="Médico encontrado"
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

/** A LISTA por trás do número do menu: respostas do jurídico esperando o "Li" de quem pediu
 *  (Admin/Gerente veem também as de outros sem leitura há dias). Furo do juiz virgem: número sem lista. */
export function DialogRetornosDoJuridico({ visible, onHide, onAbrirFicha }:
  { visible: boolean; onHide: () => void; onAbrirFicha?: (orderId: number) => void }) {
  const [itens, setItens] = useState<PendenciaJuridica[]>([]);
  const [falhou, setFalhou] = useState(false);
  const recarregar = useCallback(() => {
    getPendenciasJuridicas({ paraLer: 1 }).then((r) => { setItens(r.data?.itens ?? []); setFalhou(false); }).catch(() => setFalhou(true));
  }, []);
  useEffect(() => { if (visible) recarregar(); }, [visible, recarregar]);
  const li = async (p: PendenciaJuridica) => {
    try { await marcarPendenciaLida(p.orderId, p.id); invalidarPendencias(); recarregar(); }
    catch (e) { alert(erroDe(e, 'Não foi possível marcar como lida.')); }
  };
  return (
    <Dialog header="Retornos do jurídico para ler" visible={visible} modal dismissableMask style={{ width: '46rem', maxWidth: '96vw' }} onHide={onHide}>
      {falhou && <p role="alert">Não consegui carregar os retornos. <button type="button" onClick={recarregar}>Tentar de novo</button></p>}
      {!falhou && !itens.length && <p>Nenhum retorno esperando leitura.</p>}
      <ul className="mc-pend-lista">
        {itens.map((p) => (
          <li key={p.id} className="respondida">
            <small>pedido #{p.orderId} · <span className="col-paciente-upper">{p.paciente}</span>{p.semLerHaDias ? ` · sem leitura há ${p.semLerHaDias} dia(s)` : ''}</small>
            <ItemPendencia p={p} />
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.4rem' }}>
              <Button label="Li" icon="pi pi-check" size="small" onClick={() => li(p)} />
              {onAbrirFicha && <Button label="Ficha" icon="pi pi-folder-open" size="small" outlined severity="secondary" onClick={() => onAbrirFicha(p.orderId)} />}
              <span>Copiar para o médico <BotaoCopiar valor={p.resposta} rotulo="resposta do jurídico" /></span>
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
