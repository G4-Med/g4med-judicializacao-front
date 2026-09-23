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
 *
 * QUEM ESTÁ ONLINE (@R 23/09 11:04): ícone 👥 ao lado do 💬 com quantos colegas do chat estão com a
 * plataforma aberta (mesma régua do painel de Acessos: requisição nos últimos 10 min). Clique lista os
 * colegas (verde = online) e abre a conversa. Reusa GET mensagens/contatos/ — sem rota nova.
 * O chat é só rapha, carol, valeria e fabricio (regra no servidor, PARTICIPANTES_CHAT).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Sidebar } from 'primereact/sidebar';
import { OverlayPanel } from 'primereact/overlaypanel';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import {
  baixarImagemChat, buscarPedidoChat, enviarMensagem, getContatosChat, getConversaCom, getConversasChat, getResumoMensagens,
  marcarLidas, type ContatoChat, type ConversaAberta, type ConversaChat, type MensagemChat, type PedidoBusca,
  type ImagemChat, type PedidoNaMensagem, type ResumoMensagens,
} from '../../services/api/mensagens';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import { DialogResumirConversa } from '../QuadroTarefas/QuadroTarefas';
import { MarcaG4med } from '../../app/layout/MarcaG4med';
import './ChatInterno.css';

const RESUMO_MS = 30000;
const RESUMO_OCULTA_A_CADA = 4;        // aba em 2º plano: 1 a cada 4 ticks = 2 min
const CONVERSA_MS = 10000;
const PRESENCA_MS = 60000;            // quem está online: 1 min com a aba visível
type Carga<T> = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; dados: T };
type Tela = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'conversa'; uid: number; nome: string };
type Pendente = { clienteId: string; texto: string; pedido: PedidoBusca | null; imagens: File[]; estado: 'enviando' | 'falhou' };
const IMAGENS_MAX = 4;
const IMAGEM_MAX_BYTES = 10 * 1024 * 1024;

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
      <PresencaEquipe onAbrir={abrirConversa} />
      {icone}
      {pilula && <div className="chat-slot-pilula">{pilula}</div>}
      <Sidebar visible={aberto} position="right" onHide={() => setAberto(false)} className="chat-sidebar"
        header={tela.tipo === 'conversa' ? tela.nome : tela.tipo === 'nova' ? 'Nova conversa' : (
          <span className="chat-cab"><MarcaG4med altura={22} /><span>Conversas internas</span></span>)}>
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

function PresencaEquipe({ onAbrir }: { onAbrir: (uid: number, nome: string) => void }) {
  const [c, setC] = useState<Carga<ContatoChat[]>>({ estado: 'carregando' });
  const painel = useRef<OverlayPanel>(null);
  const carregar = useCallback(async (doTimer = false) => {
    if (doTimer && !visivel()) return;
    try { const { data } = await getContatosChat(); setC({ estado: 'ok', dados: data }); }
    catch (e) { if (status(e) !== 401) setC({ estado: 'erro' }); }   // erro → "?" (nunca "ninguém online")
  }, []);
  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => { void carregar(true); }, PRESENCA_MS);
    const onVis = () => { if (visivel()) void carregar(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [carregar]);
  const online = c.estado === 'ok' ? c.dados.filter((p) => p.plataformaAberta) : [];
  const lista = c.estado === 'ok'
    ? [...c.dados].sort((a, b) => Number(b.plataformaAberta) - Number(a.plataformaAberta) || a.nome.localeCompare(b.nome))
    : [];
  return (
    <div className="mc-notif">
      <Button icon="pi pi-users" text rounded className="mc-iconbtn" aria-label="Quem está online"
        title="Quem está online" onClick={(e) => { void carregar(); painel.current?.toggle(e); }} />
      {c.estado === 'erro'
        ? <span className="mc-iconbtn__dot chat-dot--erro" title="Não consegui ver quem está online">?</span>
        : online.length > 0 && <span className="mc-iconbtn__dot presenca-dot">{online.length}</span>}
      <OverlayPanel ref={painel} className="presenca-painel">
        <div className="presenca-titulo">Quem está online</div>
        {c.estado === 'carregando' && <div className="chat-info">carregando…</div>}
        {c.estado === 'erro' && (
          <div className="chat-info chat-info--erro">Não consegui carregar. <button type="button" className="chat-link"
            onClick={() => void carregar()}>tentar de novo</button></div>
        )}
        {c.estado === 'ok' && lista.length === 0 && <div className="chat-info">Nenhum colega no chat.</div>}
        {lista.map((p) => (
          <button key={p.id} type="button" className="presenca-linha" title="Abrir conversa"
            onClick={() => { painel.current?.hide(); onAbrir(p.id, p.nome); }}>
            <span className={`presenca-bola${p.plataformaAberta ? ' presenca-bola--on' : ''}`} aria-hidden />
            <span className="presenca-nome">{p.nome}</span>
            <span className={`chat-presenca${p.plataformaAberta ? ' chat-presenca--on' : ''}`}>
              {p.plataformaAberta ? 'online' : 'fora'}</span>
          </button>
        ))}
        <div className="presenca-rodape">online = usou a plataforma nos últimos 10 min</div>
      </OverlayPanel>
    </div>
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

/* Lista de conversas (@R 23/09 17:17-17:18: "mais legal ... conversas internas G4MED com a logo ... o dia da última
   mensagem e quantos dias tem ... e vermos quem está online ou offline e podermos clicar para mandar mensagem").
   Presença = mesma régua do cabeçalho: usou a plataforma nos últimos 10 min (servidor, SessaoAtiva). */
const iniciais = (nome: string) => nome.split(/\s+/).filter((x) => /^\p{L}/u.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?';
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function quandoFoi(iso: string) {
  const d = new Date(iso);
  const dias = Math.round((inicioDoDia(new Date()) - inicioDoDia(d)) / 86_400_000);
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '');
  if (dias <= 0) return { data: `hoje · ${hh}`, ha: 'hoje', dias: 0 };
  if (dias === 1) return { data: `ontem · ${hh}`, ha: 'há 1 dia', dias };
  return { data: `${semana}, ${dia}`, ha: `há ${dias} dias`, dias };
}

function Avatar({ nome, online }: { nome: string; online?: boolean }) {
  return (
    <span className="chat-avatar" aria-hidden>
      {iniciais(nome)}
      {online !== undefined && <span className={`chat-avatar__bola${online ? ' chat-avatar__bola--on' : ''}`} />}
    </span>
  );
}

function Lista({ onAbrir, onNova }: { onAbrir: (uid: number, nome: string) => void; onNova: () => void }) {
  const [c, setC] = useState<Carga<ConversaChat[]>>({ estado: 'carregando' });
  const [equipe, setEquipe] = useState<ContatoChat[] | null>(null);
  const carregar = useCallback(() => {
    setC({ estado: 'carregando' });
    getConversasChat().then(({ data }) => setC({ estado: 'ok', dados: data })).catch(() => setC({ estado: 'erro' }));
    getContatosChat().then(({ data }) => setEquipe(Array.isArray(data) ? data : [])).catch(() => setEquipe(null));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const presenca = new Map((equipe ?? []).map((p) => [p.id, p.plataformaAberta]));
  const pessoas = [...(equipe ?? [])].sort((a, b) => Number(b.plataformaAberta) - Number(a.plataformaAberta) || a.nome.localeCompare(b.nome));
  const nOnline = pessoas.filter((p) => p.plataformaAberta).length;
  return (
    <div className="chat-lista">
      {equipe && pessoas.length > 0 && (
        <section className="chat-equipe" aria-label="Equipe">
          <div className="chat-secao">Equipe <span>· {nOnline} online agora</span></div>
          <div className="chat-equipe__linha">
            {pessoas.map((p) => (
              <button key={p.id} type="button" className="chat-pessoa" onClick={() => onAbrir(p.id, p.nome)}
                title={`${p.nome} — ${p.plataformaAberta ? 'online' : 'offline'} · clique para mandar mensagem`}>
                <Avatar nome={p.nome} online={p.plataformaAberta} />
                <span className="chat-pessoa__nome">{p.nome.split(' ')[0]}</span>
                <span className={`chat-pessoa__estado${p.plataformaAberta ? ' chat-pessoa__estado--on' : ''}`}>
                  {p.plataformaAberta ? 'online' : 'offline'}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="chat-secao chat-secao--conversas">
        Conversas
        <Button label="Nova" icon="pi pi-plus" size="small" text onClick={onNova} className="chat-nova" />
      </div>
      <EstadoCarga c={c} vazio="Nenhuma conversa ainda — clique numa pessoa acima para começar." tentar={carregar} />
      {c.estado === 'ok' && c.dados.map((cv) => {
        const q = quandoFoi(cv.ultima.em);
        return (
          <button key={cv.com.id} type="button" className={`chat-linha chat-linha--nova${cv.naoLidas > 0 ? ' chat-linha--naolida' : ''}`}
            onClick={() => onAbrir(cv.com.id, cv.com.nome)}>
            <Avatar nome={cv.com.nome} online={presenca.get(cv.com.id)} />
            <span className="chat-linha__corpo">
              <span className="chat-linha__topo">
                <span className="chat-linha__nome">{cv.com.nome}</span>
                <span className="chat-linha__quando" title={new Date(cv.ultima.em).toLocaleString('pt-BR')}>{q.data}</span>
              </span>
              <span className="chat-linha__baixo">
                <span className="chat-linha__previa">{cv.ultima.deMim ? 'Você: ' : ''}{cv.ultima.previa}</span>
                <span className={`chat-linha__ha${q.dias >= 7 ? ' chat-linha__ha--velha' : ''}`}>{q.ha}</span>
                {cv.naoLidas > 0 && <span className="chat-linha__n">{cv.naoLidas}</span>}
              </span>
            </span>
          </button>
        );
      })}
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
  const [imagens, setImagens] = useState<File[]>([]);   // coladas/escolhidas, ainda não enviadas (#662)
  const escolherRef = useRef<HTMLInputElement | null>(null);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resumirAberto, setResumirAberto] = useState(false);   // botão de IA (@R 23/09 15:13)
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

  // Ctrl+V, botão "Imagem" e arrastar: todos passam por aqui (tipo e tamanho conferidos antes de enviar;
  // o servidor confere de novo pelos bytes).
  const juntarImagens = (fs: File[]) => {
    const ok = fs.filter((f) => f.type.startsWith('image/'));
    const grandes = ok.filter((f) => f.size > IMAGEM_MAX_BYTES);
    if (grandes.length) setErroEnvio(`Imagem acima de 10 MB não vai: ${grandes.map((f) => f.name).join(', ')}.`);
    const cabem = ok.filter((f) => f.size <= IMAGEM_MAX_BYTES);
    if (!cabem.length) return;
    setImagens((atuais) => {
      const todas = [...atuais, ...cabem.map((f, i) => (f.name && f.name !== 'image.png' ? f
        : new File([f], `imagem-colada-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })))];
      if (todas.length > IMAGENS_MAX) setErroEnvio(`No máximo ${IMAGENS_MAX} imagens por mensagem.`);
      return todas.slice(0, IMAGENS_MAX);
    });
  };
  const aoColar = (e: React.ClipboardEvent) => {
    const fs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!fs.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();   // colou só a imagem: não cola "nada" no texto
    juntarImagens(fs);
  };

  const mandar = async (p: Pendente) => {
    setPendentes((ps) => ps.map((x) => x.clienteId === p.clienteId ? { ...x, estado: 'enviando' } : x));
    try {
      await enviarMensagem({ para: uid, texto: p.texto, pedidoId: p.pedido?.id ?? null, clienteId: p.clienteId }, p.imagens);
      setPendentes((ps) => ps.filter((x) => x.clienteId !== p.clienteId));
      setErroEnvio(null);
      void carregar(true);
    } catch (e) {
      const s = status(e);
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (s && s >= 400 && s < 500 && s !== 408) {
        // recusa do servidor (texto grande, pessoa fora do chat…): não adianta tentar de novo
        setPendentes((ps) => ps.filter((x) => x.clienteId !== p.clienteId));
        setTexto(p.texto); setPedido(p.pedido); setImagens(p.imagens);
        setErroEnvio(msg ?? 'A mensagem foi recusada.');
      } else {
        setPendentes((ps) => ps.map((x) => x.clienteId === p.clienteId ? { ...x, estado: 'falhou' } : x));
      }
    }
  };
  const enviar = () => {
    const t = texto.trim();
    if (!t && !imagens.length) return;
    const p: Pendente = { clienteId: novoId(), texto: t, pedido, imagens, estado: 'enviando' };
    setPendentes((ps) => [...ps, p]); setTexto(''); setPedido(null); setImagens([]);
    void mandar(p);
  };

  const msgs = [...antigas, ...(c.estado === 'ok' ? c.dados : [])];
  return (
    <div className="chat-conversa">
      <div className="chat-conversa__topo">
        <Button label="Conversas" icon="pi pi-arrow-left" text size="small" onClick={onVoltar} />
        <Button label="Resumir com IA" icon="pi pi-sparkles" size="small" outlined className="chat-ia-btn"
          title="A IA resume a conversa (último dia, semana ou mês), diz em que ponto cada um está e monta as tarefas"
          onClick={() => setResumirAberto(true)} />
      </div>
      <DialogResumirConversa uid={uid} nome={info?.nome ?? ''} visible={resumirAberto}
        onHide={() => setResumirAberto(false)} abrirPedido={abrirFicha} />
      <div className="chat-msgs">
        {temMais && <Button label="Mensagens anteriores" text size="small" onClick={() => void carregarAntigas()} />}
        {c.estado !== 'ok' && <EstadoCarga c={c as Carga<unknown[]>} vazio="" tentar={() => void carregar()} />}
        {c.estado === 'ok' && msgs.length === 0 && !pendentes.length && <div className="chat-info">Nenhuma mensagem ainda.</div>}
        {msgs.map((m) => (
          <div key={m.id} data-id={m.id} ref={refBalao(m)} className={`chat-balao${m.deMim ? ' chat-balao--meu' : ''}`}>
            {m.pedido && <CartaoPedido p={m.pedido} abrir={abrirFicha} />}
            {!!m.imagens?.length && <ImagensDaMensagem mid={m.id} imagens={m.imagens} />}
            {m.texto && <div className="chat-balao__texto">{m.texto}</div>}
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
            {!!p.imagens.length && <div className="chat-info">📷 {p.imagens.length} {p.imagens.length === 1 ? 'imagem' : 'imagens'}</div>}
            {p.texto && <div className="chat-balao__texto">{p.texto}</div>}
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
          <div className="chat-compositor"
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }}
            onDrop={(e) => { const fs = Array.from(e.dataTransfer?.files ?? []); if (fs.length) { e.preventDefault(); juntarImagens(fs); } }}>
            {erroEnvio && <div className="chat-info chat-info--erro">{erroEnvio}</div>}
            {pedido && (
              <div className="chat-anexo">📎 #{pedido.id} {pedido.paciente} · {pedido.fase}
                <button type="button" className="chat-link" onClick={() => setPedido(null)}>tirar</button></div>
            )}
            {!!imagens.length && <PreviasParaEnviar imagens={imagens} tirar={(i) => setImagens((xs) => xs.filter((_, k) => k !== i))} />}
            <div className="chat-anexar-linha">
              <AnexarPedido onEscolher={setPedido} />
              <Button label="Imagem" icon="pi pi-image" text size="small" onClick={() => escolherRef.current?.click()}
                title="Escolher imagem — ou cole com Ctrl+V no campo de texto" disabled={imagens.length >= IMAGENS_MAX} />
              <input ref={escolherRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
                onChange={(e) => { juntarImagens(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </div>
            <InputTextarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoResize maxLength={4000}
              placeholder="Escreva… (Enter envia · Shift+Enter quebra linha · Ctrl+V cola imagem)"
              onPaste={aoColar}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            <Button label="Enviar" icon="pi pi-send" size="small" onClick={enviar} disabled={!texto.trim() && !imagens.length} />
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


/* ── Imagens do chat (#662, @R 23/09 16:54: "o usuário poder abrir ou ver e dar zoom ou baixar") ──────────────
   O arquivo só sai pela API com o token (o servidor confere que você é um dos 2 da conversa), então a tela baixa
   o blob e mostra por URL local. Cache por imagem: rolar a conversa não baixa de novo. */
const cacheImagens = new Map<string, Promise<string>>();
function urlDaImagem(mid: number, iid: number): Promise<string> {
  const k = `${mid}:${iid}`;
  let p = cacheImagens.get(k);
  if (!p) {
    p = baixarImagemChat(mid, iid).then(({ data }) => URL.createObjectURL(data));
    p.catch(() => cacheImagens.delete(k));   // falhou: a próxima tentativa baixa de novo
    cacheImagens.set(k, p);
  }
  return p;
}

function ImagensDaMensagem({ mid, imagens }: { mid: number; imagens: ImagemChat[] }) {
  const [aberta, setAberta] = useState<ImagemChat | null>(null);
  return (
    <div className="chat-imagens">
      {imagens.map((im) => <Miniatura key={im.id} mid={mid} im={im} abrir={() => setAberta(im)} />)}
      {aberta && <Visualizador mid={mid} im={aberta} fechar={() => setAberta(null)} />}
    </div>
  );
}

function Miniatura({ mid, im, abrir }: { mid: number; im: ImagemChat; abrir: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    urlDaImagem(mid, im.id).then((u) => { if (vivo) setUrl(u); }).catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [mid, im.id]);
  if (erro) return <div className="chat-imagem chat-imagem--erro">imagem indisponível</div>;
  return (
    <button type="button" className="chat-imagem" onClick={abrir} title="Abrir (zoom e baixar)" disabled={!url}>
      {url ? <img src={url} alt={im.nome || 'imagem'} /> : <span className="chat-imagem__carregando">carregando…</span>}
    </button>
  );
}

function Visualizador({ mid, im, fechar }: { mid: number; im: ImagemChat; fechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => { urlDaImagem(mid, im.id).then(setUrl).catch(() => setUrl(null)); }, [mid, im.id]);
  const mudar = (f: number) => setZoom((z) => Math.min(6, Math.max(0.25, Math.round(z * f * 100) / 100)));
  const nome = im.nome || `imagem-${im.id}`;
  return (
    <Dialog header={nome} visible onHide={fechar} maximizable style={{ width: 'min(92vw, 1100px)' }} className="chat-visualizador"
      footer={(
        <div className="chat-visualizador__barra">
          <Button icon="pi pi-search-minus" text rounded aria-label="Diminuir" onClick={() => mudar(1 / 1.25)} />
          <button type="button" className="chat-link" onClick={() => setZoom(1)} title="Ajustar à janela">{Math.round(zoom * 100)}%</button>
          <Button icon="pi pi-search-plus" text rounded aria-label="Aumentar" onClick={() => mudar(1.25)} />
          <span className="chat-visualizador__espaco" />
          {url && <a className="p-button p-button-sm p-button-outlined" href={url} target="_blank" rel="noreferrer">
            <i className="pi pi-external-link" style={{ marginRight: 6 }} />Abrir em nova aba</a>}
          {url && <a className="p-button p-button-sm" href={url} download={nome}>
            <i className="pi pi-download" style={{ marginRight: 6 }} />Baixar</a>}
        </div>
      )}>
      <div className="chat-visualizador__area"
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); mudar(e.deltaY < 0 ? 1.1 : 1 / 1.1); } }}>
        {url ? <img src={url} alt={nome} style={{ width: `${zoom * 100}%` }} onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))} />
          : <span className="chat-imagem__carregando">carregando…</span>}
      </div>
      <div className="chat-info">Ctrl + roda do mouse ou os botões dão zoom · duplo clique alterna 100%/200%.</div>
    </Dialog>
  );
}

function PreviasParaEnviar({ imagens, tirar }: { imagens: File[]; tirar: (i: number) => void }) {
  const urls = useMemo(() => imagens.map((f) => URL.createObjectURL(f)), [imagens]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="chat-previas">
      {urls.map((u, i) => (
        <div key={u} className="chat-previa">
          <img src={u} alt={imagens[i].name} />
          <button type="button" className="chat-previa__tirar" aria-label="Tirar esta imagem" onClick={() => tirar(i)}>×</button>
        </div>
      ))}
    </div>
  );
}
