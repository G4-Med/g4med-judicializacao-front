import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { salvarBlob } from '../../services/api/orders';
import {
  getPeticao, salvarPeticao, refazerPeticao, baixarPeticaoDocx, baixarPeticaoPdf,
  type EstadoPeticao, type Paragrafo, type TipoParagrafo, type CampoPeticao,
  previaFolhasAnexas,
} from '../../services/api/peticao';
import timbrado from '../../assets/peticao_timbrado.png';
import './PeticaoDialog.css';

/** Área da advogada no 4. Protocolar (#641).
 *  UX (@R 23/09 03:3x — "mais fácil de conferir e de editar, interativo, construir e ditar o texto"):
 *  • no centro, a FOLHA como vai sair (timbrado, fonte, recuos) — clicar num parágrafo edita ali mesmo;
 *  • à esquerda, PREENCHER: cada ⟦CAMPO⟧ do texto vira um input (nada de procurar marcador no texto);
 *  • conferência do valor e o que vai no arquivo para peticionar (petição + e-mail da SES + orçamento);
 *  • 🎤 dita no parágrafo selecionado (reconhecimento de voz do navegador, pt-BR). */
const TIPOS: { label: string; value: TipoParagrafo }[] = [
  { label: 'Parágrafo', value: 'corpo' },
  { label: 'Título', value: 'titulo' },
  { label: 'Cabeçalho', value: 'cabecalho' },
  { label: 'Nº do processo', value: 'processo' },
  { label: 'Centralizado', value: 'centro' },
  { label: 'Linha em branco', value: 'vazio' },
];
const RE_CAMPO = /⟦([A-Z_]+)⟧/g;
const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function erroDoBlob(e: any): Promise<string> {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); return [j.error, j.dica].filter(Boolean).join(' — '); } catch { return 'falha ao baixar'; }
  }
  return d?.error || e?.message || 'falha ao baixar';
}

/** Texto com campos aplicados — espelho de peticao.aplicar_campos no servidor. */
function aplicar(texto: string, valores: Record<string, string>, campos: CampoPeticao[]) {
  let t = texto;
  for (const c of campos) {
    if (c.trechoSeVazio && !(valores[c.chave] || '').trim()) t = t.split(c.trechoSeVazio).join('');
  }
  return t.replace(RE_CAMPO, (m, k) => (valores[k] || '').trim() || m);
}

/** Render de um parágrafo na folha: **negrito** e campos (preenchido = sublinhado verde, vazio = etiqueta âmbar). */
function Rico({ texto, valores, campos, onCampo }: {
  texto: string; valores: Record<string, string>; campos: CampoPeticao[]; onCampo: (k: string) => void;
}) {
  let t = texto;
  for (const c of campos) {
    if (c.trechoSeVazio && !(valores[c.chave] || '').trim() && valores[c.chave] !== undefined) t = t.split(c.trechoSeVazio).join('');
  }
  const partes = t.split('**');
  return (
    <>
      {partes.map((seg, i) => {
        const pedacos: React.ReactNode[] = [];
        let ultimo = 0;
        seg.replace(RE_CAMPO, (m, k, pos) => {
          if (pos > ultimo) pedacos.push(seg.slice(ultimo, pos));
          const v = (valores[k] || '').trim();
          const rot = campos.find(c => c.chave === k)?.rotulo || k;
          pedacos.push(v
            ? <span key={pos} className="pt-campo pt-campo--ok" title={`${rot} (clique para mudar)`}
                onClick={e => { e.stopPropagation(); onCampo(k); }}>{v}</span>
            : <span key={pos} className="pt-campo pt-campo--falta" title="Preencher"
                onClick={e => { e.stopPropagation(); onCampo(k); }}>{rot}</span>);
          ultimo = pos + m.length;
          return m;
        });
        if (ultimo < seg.length) pedacos.push(seg.slice(ultimo));
        return i % 2 ? <b key={i}>{pedacos}</b> : <span key={i}>{pedacos}</span>;
      })}
    </>
  );
}

const AREA_UTIL_PX = 1123 - 140 - 104;   // A4 a 96 dpi menos topo/base do timbrado (= 105/78 pt do PDF)

interface Props { pedido: number | null; rotulo?: string; visivel: boolean; onFechar: () => void }

export function PeticaoDialog({ pedido, rotulo, visivel, onFechar }: Props) {
  const [estado, setEstado] = useState<EstadoPeticao | null>(null);
  const [paras, setParas] = useState<Paragrafo[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [comEmail, setComEmail] = useState(true);
  const [comOrc, setComOrc] = useState(true);
  const [ditando, setDitando] = useState(false);
  const reconhecedor = useRef<any>(null);
  const inputsCampo = useRef<Record<string, HTMLInputElement | null>>({});
  // PAGINAÇÃO REAL da prévia (@R 23/09 11:19): antes a folha era 1 bloco contínuo com o timbrado repetido
  // como fundo a cada 1123 px — o cabeçalho/rodapé da página 2 caía POR CIMA do texto. Agora cada página é
  // uma folha, e cada parágrafo vai para a página onde cabe (área útil = mesma do PDF: 105/78 pt de margem).
  const refsPar = useRef<(HTMLElement | null)[]>([]);
  const [paginas, setPaginas] = useState<number[][]>([]);
  useLayoutEffect(() => {
    const alturas = paras.map((_, i) => {
      const el = refsPar.current[i];
      if (!el) return 0;
      const cs = getComputedStyle(el);
      return el.offsetHeight + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0');
    });
    const pags: number[][] = [[]];
    let usado = 0;
    alturas.forEach((h, i) => {
      if (usado + h > AREA_UTIL_PX && pags[pags.length - 1].length) { pags.push([]); usado = 0; }
      pags[pags.length - 1].push(i); usado += h;
    });
    if (JSON.stringify(pags) !== JSON.stringify(paginas)) setPaginas(pags);
  });
  // Folhas que vão junto (e-mail da SES + orçamento), como sairão no arquivo para peticionar.
  const [anexosUrl, setAnexosUrl] = useState<string | null>(null);
  const [anexosEstado, setAnexosEstado] = useState<'nada' | 'carregando' | 'ok' | 'erro'>('nada');
  const [anexosErro, setAnexosErro] = useState('');
  useEffect(() => {
    if (!visivel || !pedido || (!comEmail && !comOrc)) { setAnexosEstado('nada'); setAnexosUrl(null); return; }
    let vivo = true; let url: string | null = null;
    setAnexosEstado('carregando');
    previaFolhasAnexas(pedido, { email: comEmail, orcamento: comOrc })
      .then(r => { if (!vivo) return; url = URL.createObjectURL(r.data as Blob); setAnexosUrl(url); setAnexosEstado('ok'); })
      .catch(async e => {
        if (!vivo) return;
        let msg = 'Não consegui carregar as folhas anexas.';
        try { const t = await (e?.response?.data as Blob)?.text?.(); const j = t ? JSON.parse(t) : null; if (j?.error) msg = j.error; } catch { /* mantém a genérica */ }
        setAnexosErro(msg); setAnexosEstado('erro');
      });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [visivel, pedido, comEmail, comOrc]);

  const aplicarEstado = (e: EstadoPeticao) => {
    setEstado(e); setParas(e.paragrafos); setAlterado(false);
    const v: Record<string, string> = { ...(e.valores || {}) };
    for (const c of e.campos || []) if (v[c.chave] === undefined && c.sugestao) v[c.chave] = c.sugestao;
    setValores(v);
  };

  useEffect(() => {
    if (!visivel || !pedido) return;
    setCarregando(true); setErro(null); setAviso(null); setEstado(null); setEditando(null);
    getPeticao(pedido).then(r => aplicarEstado(r.data))
      .catch(e => setErro(e?.response?.data?.error || 'Não foi possível carregar a petição.'))
      .finally(() => setCarregando(false));
    return () => pararDitado();
  }, [visivel, pedido]);

  const campos = estado?.campos || [];
  const faltando = useMemo(() => {
    const s = new Set<string>();
    for (const p of paras) for (const m of aplicar(p.texto, valores, campos).matchAll(RE_CAMPO)) s.add(m[1]);
    return [...s];
  }, [paras, valores, campos]);

  const mudarPar = (i: number, campo: keyof Paragrafo, v: string) => {
    setParas(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p))); setAlterado(true);
  };
  const inserir = (i: number) => {
    setParas(ps => [...ps.slice(0, i + 1), { tipo: 'corpo', texto: '' }, ...ps.slice(i + 1)]);
    setEditando(i + 1); setAlterado(true);
  };
  const remover = (i: number) => { setParas(ps => ps.filter((_, j) => j !== i)); setEditando(null); setAlterado(true); };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= paras.length) return;
    setParas(ps => { const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n; }); setEditando(j); setAlterado(true);
  };
  const focarCampo = (k: string) => {
    const el = inputsCampo.current[k]; if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };

  // ── ditado: o que for falado entra no fim do parágrafo selecionado ──
  function pararDitado() { try { reconhecedor.current?.stop(); } catch { /* já parado */ } setDitando(false); }
  const ditar = () => {
    if (ditando) { pararDitado(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setAviso('Este navegador não tem ditado por voz — use o Google Chrome.'); return; }
    if (editando == null) { setAviso('Clique primeiro no parágrafo onde quer ditar.'); return; }
    const alvo = editando;
    const r = new SR(); r.lang = 'pt-BR'; r.continuous = true; r.interimResults = false;
    r.onresult = (ev: any) => {
      let dito = '';
      for (let k = ev.resultIndex; k < ev.results.length; k++) if (ev.results[k].isFinal) dito += ev.results[k][0].transcript;
      if (!dito.trim()) return;
      setParas(ps => ps.map((p, j) => (j === alvo ? { ...p, texto: (p.texto ? p.texto.replace(/\s*$/, ' ') : '') + dito.trim() } : p)));
      setAlterado(true);
    };
    r.onerror = (ev: any) => { setAviso(ev?.error === 'not-allowed' ? 'O navegador bloqueou o microfone — libere no cadeado da barra de endereço.' : 'O ditado parou.'); setDitando(false); };
    r.onend = () => setDitando(false);
    reconhecedor.current = r; r.start(); setDitando(true); setAviso(null);
  };

  const salvar = async () => {
    if (!pedido) return null;
    setSalvando(true); setErro(null);
    try { const r = await salvarPeticao(pedido, paras, valores); aplicarEstado(r.data); return r.data; }
    catch (e: any) { setErro(e?.response?.data?.error || 'Não foi possível salvar.'); return null; }
    finally { setSalvando(false); }
  };
  const refazer = async () => {
    if (!pedido || !window.confirm('Descartar a edição e voltar ao texto gerado a partir do orçamento atual?')) return;
    setSalvando(true);
    try { aplicarEstado((await refazerPeticao(pedido)).data); setEditando(null); } finally { setSalvando(false); }
  };
  // Baixa sempre o que está SALVO — salva antes se há mudança (senão o arquivo sairia sem ela).
  const baixar = async (tipo: 'docx' | 'pdf' | 'pdf-so') => {
    if (!pedido) return;
    if (faltando.length && !window.confirm(`Ainda faltam ${faltando.length} campo(s) para preencher. Baixar assim mesmo?`)) return;
    setBaixando(tipo); setErro(null);
    try {
      if (alterado) await salvar();
      const r = tipo === 'docx' ? await baixarPeticaoDocx(pedido)
        : await baixarPeticaoPdf(pedido, { somente: tipo === 'pdf-so', email: comEmail, orcamento: comOrc });
      const docx = tipo === 'docx';
      salvarBlob(new Blob([r.data], { type: docx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' }),
        `peticao_${tipo === 'pdf' ? 'para_peticionar_' : ''}pedido_${pedido}.${docx ? 'docx' : 'pdf'}`);
    } catch (e) { setErro(await erroDoBlob(e)); }
    finally { setBaixando(null); }
  };

  const conf = estado?.conferencia;
  const rodape = (
    <div className="pt-rodape">
      <span className={`pt-status ${alterado ? 'pt-status--pendente' : ''}`}>
        {alterado ? '● Alterações não salvas' : estado?.salva ? `Salva por ${estado.salva.por || '—'}` : 'Rascunho gerado do orçamento'}
        {faltando.length > 0 && <> · <b>{faltando.length}</b> campo(s) a preencher</>}
      </span>
      <div className="pt-acoes">
        <Button label="Refazer do orçamento" icon="pi pi-refresh" text onClick={refazer} disabled={salvando} />
        <Button label="Salvar" icon="pi pi-check" outlined onClick={salvar} loading={salvando} disabled={!alterado || salvando} />
        <Button label="Word" icon="pi pi-file-word" outlined onClick={() => baixar('docx')} loading={baixando === 'docx'} />
        <Button label="PDF da petição" icon="pi pi-file-pdf" outlined onClick={() => baixar('pdf-so')} loading={baixando === 'pdf-so'} />
        <Button label="Arquivo para peticionar" icon="pi pi-download" onClick={() => baixar('pdf')} loading={baixando === 'pdf'} />
      </div>
    </div>
  );

  return (
    <Dialog header={`Petição de juntada${rotulo ? ` — ${rotulo}` : ''}`} visible={visivel} onHide={() => { pararDitado(); onFechar(); }}
      style={{ width: '96vw', maxWidth: '1500px', height: '94vh' }} contentStyle={{ padding: 0 }} modal footer={rodape} className="pt-dialogo">
      {carregando && <p className="pt-msg">Montando a petição a partir do orçamento…</p>}
      {erro && <div className="pt-erro">{erro}</div>}
      {estado && (
        <div className="pt-grade">
          <aside className="pt-lado">
            <section className="pt-cartao">
              <h4>Preencher {faltando.length === 0 ? <span className="pt-ok">✓ completo</span> : <span className="pt-falta">{faltando.length} faltando</span>}</h4>
              {campos.length === 0 && <p className="pt-dica">Nenhum dado faltando — tudo veio do pedido e do orçamento.</p>}
              {campos.map(c => (
                <label key={c.chave} className={`pt-input ${faltando.includes(c.chave) ? 'pt-input--falta' : ''}`}>
                  <span>{c.rotulo}</span>
                  <InputText ref={el => { inputsCampo.current[c.chave] = el as any; }} value={valores[c.chave] ?? ''}
                    placeholder={c.trechoSeVazio ? 'vazio = sem esta frase' : 'digite'}
                    onChange={e => { setValores(v => ({ ...v, [c.chave]: e.target.value })); setAlterado(true); }} />
                  {c.ajuda && <small>{c.ajuda}</small>}
                </label>
              ))}
            </section>

            <section className="pt-cartao">
              <h4>Conferência do valor <span className={conf?.ok ? 'pt-ok' : 'pt-falta'}>{conf?.ok ? 'bate' : 'conferir'}</span></h4>
              <table className="pt-tab"><tbody>
                {conf?.linhas.map(l => <tr key={l.fonte}><td>{l.fonte}</td><td>{brl(l.valor)}</td></tr>)}
              </tbody></table>
              {!!conf?.parcelas?.length && (
                <table className="pt-tab pt-tab--parcelas"><tbody>
                  {conf.parcelas.map(p => <tr key={p.nome}><td>{p.nome}</td><td>{brl(p.valor)}</td></tr>)}
                </tbody></table>
              )}
              {conf?.motivo && <p className="pt-dica pt-dica--alerta">{conf.motivo}</p>}
              {estado.salva?.orcamentoMudou && <p className="pt-dica pt-dica--alerta">O orçamento mudou depois desta edição — confira o valor ou use "Refazer do orçamento".</p>}
              {estado.pendencias.map(p => <p key={p} className="pt-dica pt-dica--alerta">{p}</p>)}
            </section>

            <section className="pt-cartao">
              <h4>Arquivo para peticionar</h4>
              <div className="pt-pacote"><span className="pt-num">1</span> Petição (com timbrado)</div>
              <label className="pt-pacote"><Checkbox checked={comEmail} onChange={e => setComEmail(!!e.checked)} /><span className="pt-num">2</span> E-mail da SES que pediu o orçamento</label>
              <label className="pt-pacote"><Checkbox checked={comOrc} onChange={e => setComOrc(!!e.checked)} /><span className="pt-num">3</span> Orçamento{conf?.versao ? ` (versão ${conf.versao})` : ''}</label>
              <p className="pt-dica">Assina: {estado.advogada.nome} · {estado.advogada.oab}</p>
            </section>
          </aside>

          <main className="pt-mesa" onClick={() => setEditando(null)}>
            {aviso && <div className="pt-aviso" onClick={e => { e.stopPropagation(); setAviso(null); }}>{aviso} <b>×</b></div>}
            {(paginas.flat().length === paras.length ? paginas : [paras.map((_, i) => i)]).map((idxs, pg, todas) => (
              <div key={pg} className="pt-folha" style={{ backgroundImage: `url(${timbrado})` }}>
                {idxs.map(i => { const p = paras[i]; return (editando === i ? (
                <div key={i} ref={el => { refsPar.current[i] = el; }} className="pt-edita" onClick={e => e.stopPropagation()}>
                  <div className="pt-barra">
                    <Dropdown value={p.tipo} options={TIPOS} onChange={e => mudarPar(i, 'tipo', e.value)} className="pt-tipo" />
                    <Button icon="pi pi-arrow-up" text rounded title="Subir" onClick={() => mover(i, -1)} />
                    <Button icon="pi pi-arrow-down" text rounded title="Descer" onClick={() => mover(i, 1)} />
                    <Button icon="pi pi-plus" text rounded title="Novo parágrafo abaixo" onClick={() => inserir(i)} />
                    <Button icon={ditando ? 'pi pi-stop-circle' : 'pi pi-microphone'} text rounded severity={ditando ? 'danger' : undefined}
                      title={ditando ? 'Parar ditado' : 'Ditar neste parágrafo'} onClick={ditar} />
                    <Button icon="pi pi-trash" text rounded severity="danger" title="Remover parágrafo" onClick={() => remover(i)} />
                    <span className="pt-barra-dica">**negrito** · clique fora para ver como fica</span>
                  </div>
                  <InputTextarea autoFocus autoResize value={p.texto} rows={2} onChange={e => mudarPar(i, 'texto', e.target.value)}
                    className={`pt-area pt-p--${p.tipo}`} />
                </div>
              ) : (
                <p key={i} ref={el => { refsPar.current[i] = el; }} className={`pt-p pt-p--${p.tipo}`} onClick={e => { e.stopPropagation(); setEditando(i); }} title="Clique para editar">
                  {p.texto ? <Rico texto={p.texto} valores={valores} campos={campos} onCampo={focarCampo} /> : ' '}
                </p>
              ))); })}
                {pg === todas.length - 1 && (
                  <button className="pt-novo" onClick={e => { e.stopPropagation(); inserir(paras.length - 1); }}>+ parágrafo no fim</button>
                )}
                <span className="pt-folha-num">Petição · página {pg + 1} de {todas.length}</span>
              </div>
            ))}
            <div className="pt-anexas">
              <h4>Folhas que vão junto no arquivo para peticionar</h4>
              {anexosEstado === 'nada' && <p className="pt-dica">Nenhuma marcada ao lado (e-mail da SES / orçamento).</p>}
              {anexosEstado === 'carregando' && <p className="pt-dica">Carregando o e-mail da SES e o orçamento…</p>}
              {anexosEstado === 'erro' && <p className="pt-dica pt-dica--alerta">{anexosErro}</p>}
              {anexosEstado === 'ok' && anexosUrl && (
                <iframe title="E-mail da SES e orçamento" src={anexosUrl} className="pt-anexas-pdf" />
              )}
            </div>
            <p className="pt-legenda">Prévia paginada como o PDF (mesmas margens do timbrado). No Word a quebra pode variar alguns centímetros.</p>
          </main>
        </div>
      )}
    </Dialog>
  );
}
