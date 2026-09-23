/**
 * CHAT INTERNO 1-a-1 (#632, @R 22/09 19:12: "criar um chat entre as pessoas").
 *
 * Ícone 💬 no canto direito do cabeçalho (contador) + pílula no CENTRO da barra quando chega
 * mensagem nova + painel lateral com Conversas · Nova conversa · Conversa aberta. Cada mensagem pode
 * levar um pedido (paciente + fase + abre a Ficha do Pedido). Mostra enviada e lida.
 *
 * Regras do desenho grau 1 (v3) que este arquivo carrega:
 *  - erro NUNCA vira zero: contador "?" e listas com "não consegui carregar — tentar de novo" (F2/F15);
 *  - "lida" só com a pessoa vendo: painel aberto + aba visível + janela com foco + balão ≥1 s na tela (F3);
 *  - lidas que falharem voltam para a fila e são reenviadas (até 3 vezes) — erra para "não lida" (F16);
 *  - envio idempotente: o retry reusa o MESMO clienteId (F1);
 *  - a pílula não mostra o texto (o centro do cabeçalho é público — F14);
 *  - aba visível consulta a cada 30 s; aba em 2º plano a cada 2 min e mostra "(N)" no título da aba (F13 + A3);
 *  - 403 = usuário fora do chat → o componente some.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Sidebar } from 'primereact/sidebar';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputText } from 'primereact/inputtext';
import {
  buscarPedidoChat, enviarMensagem, getContatosChat, getConversaCom, getConversasChat, getResumoMensagens,
  marcarLidas, type ContatoChat, type ConversaAberta, type ConversaChat, type MensagemChat, type PedidoBusca,
  type PedidoNaMensagem, type ResumoMensagens,
} from '../../services/api/mensagens';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import './ChatInterno.css';

const RESUMO_MS = 30000;
const RESUMO_OCULTA_A_CADA = 4;        // aba em 2º plano: 1 a cada 4 ticks = 2 min
const CONVERSA_MS = 10000;
type Carga<T> = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; dados: T };
type Tela = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'conversa'; uid: number; nome: string };
type Pendente = { clienteId: string; texto: string; pedido: PedidoBusca | null; estado: 'enviando' | 'falhou' };

const status = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;
const hora = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return d.toLocaleString('pt-BR', mesmoDia
    ? { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }
    : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};
const novoId = () => (crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));
const visivel = () => document.visibilityState === 'visible';

function CartaoPedido({ p, abrir }: { p: PedidoNaMensagem; abrir: (id: number) => void }) {
  if (p.inexistente) return <div className="chat-pedido chat-pedido--morto">pedido #{p.id} não existe mais</div>;
  if (p.semAcesso) return <div className="chat-pedido chat-pedido--morto">pedido #{p.id} (sem acesso)</div>;
  if (p.excluido) return <div className="chat-pedido chat-pedido--morto">pedido #{p.id} na lixeira · {p.paciente}</div>;
  return (
    <button type="button" className="chat-pedido" onClick={() => abrir(p.id)} title="Abrir a Ficha do Pedido">
      <span className="chat-pedido__num">#{p.id}</span> {p.paciente}
      <span className="chat-pedido__fase">{p.fase}</span>
    </button>
  );
}

export function ChatInterno() {
  const { abrir: abrirFicha } = useFichaPedido();
  const [fora, setFora] = useState(false);              // 403: não participa do chat
  const [resumo, setResumo] = useState<ResumoMensagens | null>(null);
  const [resumoErro, setResumoErro] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [pilulaFechadaEm, setPilulaFechadaEm] = useState<number | null>(null);

  // ── R1: resumo a cada 30 s, só com a aba visível ──
  const tick = useRef(0);
  const carregarResumo = useCallback(async (doTimer = false) => {
    if (doTimer && !visivel() && (tick.current++ % RESUMO_OCULTA_A_CADA) !== 0) return;
    try {
      const { data } = await getResumoMensagens();
      setResumo(data); setResumoErro(false);
    } catch (e) {
      const s = status(e);
      if (s === 403) { setFora(true); return; }
      if (s === 401) return;                  // o interceptor da API cuida da sessão
      setResumoErro(true);                    // rede/5xx → "?" — nunca 0
    }
  }, []);
  useEffect(() => {
    void carregarResumo();
    const id = window.setInterval(() => { void carregarResumo(true); }, RESUMO_MS);
    const onVis = () => { if (visivel()) void carregarResumo(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [carregarResumo]);

  // título da aba: "(N) …" — o único sinal para quem está em outra janela (sem notificação do sistema)
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    const n = resumo?.naoLidas ?? 0;
    document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
  }, [resumo?.naoLidas]);

  const abrirConversa = (uid: number, nome: string) => { setTela({ tipo: 'conversa', uid, nome }); setAberto(true); };

  if (fora) return null;
  const n = resumo?.naoLidas ?? 0;
  const ultima = resumo?.ultima ?? null;
  const mostrarPilula = !!ultima && n > 0 && pilulaFechadaEm !== ultima.id && !aberto;

  const icone = (
    <div className="mc-notif">
      <Button icon="pi pi-comments" text rounded className="mc-iconbtn" aria-label="Mensagens"
        onClick={() => { setAberto((v) => !v); if (!aberto) setTela({ tipo: 'lista' }); }} />
      {resumoErro
        ? <span className="mc-iconbtn__dot chat-dot--erro" title="Sem conexão com as mensagens">?</span>
        : n > 0 && <span className="mc-iconbtn__dot">{n > 99 ? '99+' : n}</span>}
    </div>
  );
  const pilula = mostrarPilula && ultima && (
    <div className={`chat-pilula${(resumo?.antigas ?? 0) > 0 ? ' chat-pilula--antiga' : ''}`} role="status">
      <button type="button" className="chat-pilula__abrir" onClick={() => abrirConversa(ultima.deId, ultima.deNome)}>
        💬 <strong>{ultima.deNome}</strong>: nova mensagem{n > 1 ? ` (${n} não lidas)` : ''}
        {(resumo?.antigas ?? 0) > 0 && <span> · {resumo!.antigas} há mais de 1 dia</span>}
      </button>
      <button type="button" className="chat-pilula__x" aria-label="Fechar aviso" onClick={() => setPilulaFechadaEm(ultima.id)}>×</button>
    </div>
  );

  return (
    <>
      {icone}
      {pilula && <div className="chat-slot-pilula">{pilula}</div>}
      <Sidebar visible={aberto} position="right" onHide={() => setAberto(false)} className="chat-sidebar"
        header={tela.tipo === 'conversa' ? tela.nome : tela.tipo === 'nova' ? 'Nova conversa' : 'Mensagens'}>
        {aberto && tela.tipo === 'lista' && (
          <Lista onAbrir={abrirConversa} onNova={() => setTela({ tipo: 'nova' })} />
        )}
        {aberto && tela.tipo === 'nova' && (
          <Contatos onEscolher={abrirConversa} onVoltar={() => setTela({ tipo: 'lista' })} />
        )}
        {aberto && tela.tipo === 'conversa' && (
          <Conversa key={tela.uid} uid={tela.uid} abrirFicha={abrirFicha} onVoltar={() => { setTela({ tipo: 'lista' }); void carregarResumo(); }}
            onLeu={() => void carregarResumo()} />
        )}
      </Sidebar>
    </>
  );
}

function EstadoCarga({ c, vazio, tentar }: { c: Carga<unknown[]>; vazio: string; tentar: () => void }) {
  if (c.estado === 'carregando') return <div className="chat-info">Carregando…</div>;
  if (c.estado === 'erro') return (
    <div className="chat-info chat-info--erro">Não consegui carregar. <Button label="Tentar de novo" text size="small" onClick={tentar} /></div>
  );
  if (c.dados.length === 0) return <div className="chat-info">{vazio}</div>;
  return null;
}

function Lista({ onAbrir, onNova }: { onAbrir: (uid: number, nome: string) => void; onNova: () => void }) {
  const [c, setC] = useState<Carga<ConversaChat[]>>({ estado: 'carregando' });
  const carregar = useCallback(() => {
    setC({ estado: 'carregando' });
    getConversasChat().then(({ data }) => setC({ estado: 'ok', dados: data })).catch(() => setC({ estado: 'erro' }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <div className="chat-lista">
      <Button label="Nova conversa" icon="pi pi-plus" size="small" onClick={onNova} className="chat-nova" />
      <EstadoCarga c={c} vazio="Nenhuma conversa ainda." tentar={carregar} />
      {c.estado === 'ok' && c.dados.map((cv) => (
        <button key={cv.com.id} type="button" className="chat-linha" onClick={() => onAbrir(cv.com.id, cv.com.nome)}>
          <span className="chat-linha__nome">{cv.com.nome}</span>
          <span className="chat-linha__quando">{hora(cv.ultima.em)}</span>
          <span className="chat-linha__previa">{cv.ultima.deMim ? 'Você: ' : ''}{cv.ultima.previa}</span>
          {cv.naoLidas > 0 && <span className="chat-linha__n">{cv.naoLidas}</span>}
        </button>
      ))}
    </div>
  );
}

function Contatos({ onEscolher, onVoltar }: { onEscolher: (uid: number, nome: string) => void; onVoltar: () => void }) {
  const [c, setC] = useState<Carga<ContatoChat[]>>({ estado: 'carregando' });
  const [filtro, setFiltro] = useState('');
  const carregar = useCallback(() => {
    setC({ estado: 'carregando' });
    getContatosChat().then(({ data }) => setC({ estado: 'ok', dados: data })).catch(() => setC({ estado: 'erro' }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const lista = c.estado === 'ok' ? c.dados.filter((p) => p.nome.toLowerCase().includes(filtro.toLowerCase())) : [];
  return (
    <div className="chat-lista">
      <Button label="Voltar" icon="pi pi-arrow-left" text size="small" onClick={onVoltar} />
      <InputText value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Procurar pessoa" className="chat-busca" />
      <EstadoCarga c={c} vazio="Ninguém mais no chat." tentar={carregar} />
      {lista.map((p) => (
        <button key={p.id} type="button" className="chat-linha" onClick={() => onEscolher(p.id, p.nome)}>
          <span className="chat-linha__nome">{p.nome}</span>
          <span className={`chat-presenca${p.plataformaAberta ? ' chat-presenca--on' : ''}`}
            title="com a plataforma aberta nos últimos 10 min">{p.plataformaAberta ? 'com a plataforma aberta' : ''}</span>
          <span className="chat-linha__previa">{p.grupo}</span>
        </button>
      ))}
    </div>
  );
}

function Conversa({ uid, abrirFicha, onVoltar, onLeu }: {
  uid: number; abrirFicha: (id: number) => void; onVoltar: () => void; onLeu: () => void;
}) {
  const [c, setC] = useState<Carga<MensagemChat[]>>({ estado: 'carregando' });
  const [info, setInfo] = useState<ConversaAberta['com'] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [antigas, setAntigas] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [pedido, setPedido] = useState<PedidoBusca | null>(null);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const filaLidas = useRef<Map<number, number>>(new Map());   // id → tentativas
  const vistos = useRef<Set<number>>(new Set());

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setC({ estado: 'carregando' });
    if (!visivel()) return;
    try {
      const { data } = await getConversaCom(uid);
      setC({ estado: 'ok', dados: data.mensagens }); setInfo(data.com); setTemMais(data.temMais);
    } catch { if (!silencioso) setC({ estado: 'erro' }); }
  }, [uid]);
  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => { void carregar(true); void enviarLidas(); }, CONVERSA_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [c.estado === 'ok' ? c.dados.length : 0, pendentes.length]);

  // ── lidas: só o que a pessoa VIU (≥1 s na tela, aba visível, janela com foco) ──
  const enviarLidas = useCallback(async () => {
    const ids = [...filaLidas.current.keys()].slice(0, 50);
    if (!ids.length) return;
    try {
      await marcarLidas(ids);
      ids.forEach((i) => filaLidas.current.delete(i));
      onLeu();
    } catch {
      ids.forEach((i) => {
        const t = (filaLidas.current.get(i) ?? 0) + 1;
        if (t >= 3) filaLidas.current.delete(i); else filaLidas.current.set(i, t);   // volta como não lida na próxima abertura
      });
    }
  }, [onLeu]);
  const observar = useMemo(() => {
    const timers = new Map<number, number>();
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        const id = Number((en.target as HTMLElement).dataset.id);
        if (en.isIntersecting) {
          if (!timers.has(id)) timers.set(id, window.setTimeout(() => {
            timers.delete(id);
            if (visivel() && document.hasFocus() && !vistos.current.has(id)) {
              vistos.current.add(id); filaLidas.current.set(id, 0); void enviarLidas();
            }
          }, 1000));
        } else if (timers.has(id)) { window.clearTimeout(timers.get(id)); timers.delete(id); }
      });
    }, { threshold: 0.6 });
    return obs;
  }, [enviarLidas]);
  useEffect(() => () => observar.disconnect(), [observar]);
  const refBalao = (m: MensagemChat) => (el: HTMLDivElement | null) => {
    if (el && !m.deMim && !m.lidaEm && !vistos.current.has(m.id)) observar.observe(el);
  };

  const carregarAntigas = async () => {
    const todas = [...antigas, ...(c.estado === 'ok' ? c.dados : [])];
    if (!todas.length) return;
    try {
      const { data } = await getConversaCom(uid, todas[0].id);
      setAntigas([...data.mensagens, ...antigas]); setTemMais(data.temMais);
    } catch { setErroEnvio('Não consegui carregar as mensagens anteriores.'); }
  };

  const mandar = async (p: Pendente) => {
    setPendentes((ps) => ps.map((x) => x.clienteId === p.clienteId ? { ...x, estado: 'enviando' } : x));
    try {
      await enviarMensagem({ para: uid, texto: p.texto, pedidoId: p.pedido?.id ?? null, clienteId: p.clienteId });
      setPendentes((ps) => ps.filter((x) => x.clienteId !== p.clienteId));
      setErroEnvio(null);
      void carregar(true);
    } catch (e) {
      const s = status(e);
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (s && s >= 400 && s < 500 && s !== 408) {
        // recusa do servidor (texto grande, pessoa fora do chat…): não adianta tentar de novo
        setPendentes((ps) => ps.filter((x) => x.clienteId !== p.clienteId));
        setTexto(p.texto); setPedido(p.pedido);
        setErroEnvio(msg ?? 'A mensagem foi recusada.');
      } else {
        setPendentes((ps) => ps.map((x) => x.clienteId === p.clienteId ? { ...x, estado: 'falhou' } : x));
      }
    }
  };
  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    const p: Pendente = { clienteId: novoId(), texto: t, pedido, estado: 'enviando' };
    setPendentes((ps) => [...ps, p]); setTexto(''); setPedido(null);
    void mandar(p);
  };

  const msgs = [...antigas, ...(c.estado === 'ok' ? c.dados : [])];
  return (
    <div className="chat-conversa">
      <Button label="Conversas" icon="pi pi-arrow-left" text size="small" onClick={onVoltar} />
      <div className="chat-msgs">
        {temMais && <Button label="Mensagens anteriores" text size="small" onClick={() => void carregarAntigas()} />}
        {c.estado !== 'ok' && <EstadoCarga c={c as Carga<unknown[]>} vazio="" tentar={() => void carregar()} />}
        {c.estado === 'ok' && msgs.length === 0 && !pendentes.length && <div className="chat-info">Nenhuma mensagem ainda.</div>}
        {msgs.map((m) => (
          <div key={m.id} data-id={m.id} ref={refBalao(m)} className={`chat-balao${m.deMim ? ' chat-balao--meu' : ''}`}>
            {m.pedido && <CartaoPedido p={m.pedido} abrir={abrirFicha} />}
            <div className="chat-balao__texto">{m.texto}</div>
            <div className="chat-balao__meta">
              {m.deMim
                ? <>enviada {hora(m.enviadaEm)}{m.lidaEm ? <> · <span className="chat-lida">✓✓ lida {hora(m.lidaEm)}</span></> : ' · ✓'}</>
                : hora(m.enviadaEm)}
            </div>
          </div>
        ))}
        {pendentes.map((p) => (
          <div key={p.clienteId} className="chat-balao chat-balao--meu chat-balao--pendente">
            {p.pedido && <div className="chat-pedido chat-pedido--morto">#{p.pedido.id} {p.pedido.paciente}</div>}
            <div className="chat-balao__texto">{p.texto}</div>
            <div className="chat-balao__meta">
              {p.estado === 'enviando' ? 'enviando…'
                : <>não enviada — <button type="button" className="chat-link" onClick={() => void mandar(p)}>tentar de novo</button></>}
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>
      {info && !info.participa
        ? <div className="chat-info chat-info--erro">Essa pessoa não está mais no chat.</div>
        : (
          <div className="chat-compositor">
            {erroEnvio && <div className="chat-info chat-info--erro">{erroEnvio}</div>}
            {pedido && (
              <div className="chat-anexo">📎 #{pedido.id} {pedido.paciente} · {pedido.fase}
                <button type="button" className="chat-link" onClick={() => setPedido(null)}>tirar</button></div>
            )}
            <AnexarPedido onEscolher={setPedido} />
            <InputTextarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoResize maxLength={4000}
              placeholder="Escreva… (Enter envia · Shift+Enter quebra linha)"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            <Button label="Enviar" icon="pi pi-send" size="small" onClick={enviar} disabled={!texto.trim()} />
          </div>
        )}
    </div>
  );
}

function AnexarPedido({ onEscolher }: { onEscolher: (p: PedidoBusca) => void }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [c, setC] = useState<Carga<PedidoBusca[]> | null>(null);
  useEffect(() => {
    const t = q.trim().replace(/^#/, '');
    if (!(/^\d+$/.test(t) || t.length >= 3)) { setC(null); return; }
    const id = window.setTimeout(() => {
      setC({ estado: 'carregando' });
      buscarPedidoChat(t).then(({ data }) => setC({ estado: 'ok', dados: data })).catch(() => setC({ estado: 'erro' }));
    }, 400);
    return () => window.clearTimeout(id);
  }, [q]);
  if (!aberto) return <Button label="Anexar pedido" icon="pi pi-paperclip" text size="small" onClick={() => setAberto(true)} />;
  return (
    <div className="chat-anexar">
      <InputText autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº do pedido ou 3 letras do nome" />
      <button type="button" className="chat-link" onClick={() => { setAberto(false); setQ(''); }}>cancelar</button>
      {c && <EstadoCarga c={c} vazio="Nenhum pedido encontrado." tentar={() => setQ((v) => v + ' ')} />}
      {c?.estado === 'ok' && c.dados.map((p) => (
        <button key={p.id} type="button" className="chat-linha" onClick={() => { onEscolher(p); setAberto(false); setQ(''); }}>
          <span className="chat-linha__nome">#{p.id} {p.paciente}</span>
          <span className="chat-linha__previa">{p.fase}</span>
        </button>
      ))}
    </div>
  );
}
