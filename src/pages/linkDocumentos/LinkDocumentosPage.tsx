import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/* ═══ PÁGINA DO LINK SEGURO — o que o médico abre no celular (@R 21/09 18:27 → 18:45) ═══
   Sem login, sem nada do sistema interno em volta. Mostra a lista do que tem, abre cada documento
   como IMAGEM página a página (o PDF nunca sai do servidor) e, se quem copiou escolheu, os valores
   de referência já com o deflator. Cada abertura é registrada no servidor.

   HONESTIDADE DO "NÃO BAIXA": aqui não há botão de baixar, o toque longo e o arrastar da imagem
   estão desligados e cada página leva marca d'água com o pedido e a hora. Uma captura de tela
   continua possível em qualquer celular — por isso a marca d'água, que identifica de onde saiu. */

const API = import.meta.env.VITE_API_URL as string;

interface Documento { id: number; tipo: string; rotulo: string; nome: string | null }
interface Dados {
  pedido: number;
  procedimento: string | null;
  aviso: string;
  documentos: Documento[];
  referencias: { categoria: string; valorReferencia: number; local?: string | null; descricao?: string | null;
                 data?: string | null; pagina?: number | null }[];
  referenciasNota: string;
  pagoPeloEstado?: { n: number; media: number; mediana: number; de: string; ate: string; aviso: string } | null;
  expiraEm?: string | null;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
const tituloSecao: React.CSSProperties = { fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5b616e', margin: '4px 4px 8px' };

const cor = {
  fundo: '#f4f5f2', cartao: '#ffffff', texto: '#16181d', suave: '#5b616e', linha: '#e3e5df',
  marca: '#0d0d0f', destaque: '#009739', aviso: '#8a5a00',
};

function Visualizador({ token, codigo, doc, onVoltar }: { token: string; codigo: string; doc: Documento; onVoltar: () => void }) {
  // Carrega página a página: mostra a 1ª; ao terminar de carregar, pede a próxima. A que responder
  // 404 marca o fim. Assim não é preciso saber o total antes, e um documento longo não baixa tudo de uma vez.
  const [paginas, setPaginas] = useState<number[]>([1]);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState(false);
  // o código vai em CADA página: sem ele, quem soubesse o endereço da imagem pularia a tela de código
  const url = (n: number) => `${API}/d/${token}/doc/${doc.id}/pagina/${n}/${codigo ? `?codigo=${encodeURIComponent(codigo)}` : ''}`;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', background: cor.marca, color: '#fff',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 2 }}>
        <button onClick={onVoltar} aria-label="Voltar para a lista"
          style={{ background: 'transparent', color: '#fff', border: '1px solid #ffffff55', borderRadius: 8,
            padding: '8px 12px', fontSize: 15 }}>← Voltar</button>
        <div style={{ fontSize: 14, lineHeight: 1.3, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{doc.rotulo}</div>
          {doc.nome && <div style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</div>}
        </div>
      </div>
      <div style={{ padding: '12px 8px 32px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {paginas.map((n) => (
          <img key={n} src={url(n)} alt={`${doc.rotulo}, página ${n}`} draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 4,
              boxShadow: '0 1px 3px rgba(0,0,0,.12)', userSelect: 'none', WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none' } as React.CSSProperties}
            onLoad={() => { if (n === paginas[paginas.length - 1] && !fim) setPaginas((p) => [...p, n + 1]); }}
            onError={() => {
              if (n === 1) setErro(true);
              setFim(true);
              setPaginas((p) => p.filter((x) => x !== n));
            }} />
        ))}
        {!fim && !erro && <div style={{ color: cor.suave, fontSize: 14, padding: 8 }}>Carregando página {paginas.length}…</div>}
        {erro && <div style={{ color: cor.aviso, fontSize: 15, padding: 16 }}>Não foi possível abrir este documento. Tente de novo em instantes.</div>}
        {fim && !erro && <div style={{ color: cor.suave, fontSize: 13, padding: 8 }}>Fim do documento · {paginas.length} página(s)</div>}
      </div>
    </div>
  );
}

export function LinkDocumentosPage() {
  const { token = '' } = useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState<'encerrado' | 'expirado' | 'invalido' | 'rede' | 'bloqueado' | null>(null);
  const [aberto, setAberto] = useState<Documento | null>(null);
  // @R 22/09: código de 4 dígitos que chega SÓ na mensagem. Guardado na aba (sessionStorage) para
  // recarregar a página não pedir de novo; nunca vai na URL (senão quem visse o link veria o código).
  const chave = `g4med_codigo_${token}`;
  const [codigo, setCodigo] = useState<string>(() => { try { return sessionStorage.getItem(chave) || ''; } catch { return ''; } });
  const [pedeCodigo, setPedeCodigo] = useState(false);
  const [digitado, setDigitado] = useState('');
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const carregar = (cod: string, veioDoFormulario = false) => {
    setConferindo(true);
    fetch(`${API}/d/${encodeURIComponent(token)}/${cod ? `?codigo=${encodeURIComponent(cod)}` : ''}`)
      .then(async (r) => {
        if (r.status === 410) {
          const j = await r.json().catch(() => ({}));
          return setFalha(j?.codigo === 'expirado' ? 'expirado' : 'encerrado');
        }
        if (r.status === 429) return setFalha('bloqueado');
        if (r.status === 401) {
          setPedeCodigo(true);
          try { sessionStorage.removeItem(chave); } catch { /* sem armazenamento: só pede de novo */ }
          if (veioDoFormulario) {
            const j = await r.json().catch(() => ({}));
            const resta = typeof j?.tentativasRestantes === 'number' ? j.tentativasRestantes : null;
            setErroCodigo(`Código incorreto.${resta !== null && resta >= 0 ? ` ${resta} tentativa(s) antes do bloqueio de 15 minutos.` : ''}`);
          }
          return;
        }
        if (!r.ok) return setFalha('invalido');
        setCodigo(cod);
        try { if (cod) sessionStorage.setItem(chave, cod); } catch { /* ok */ }
        setPedeCodigo(false);
        setDados(await r.json());
      })
      .catch(() => setFalha('rede'))
      .finally(() => setConferindo(false));
  };

  useEffect(() => {
    document.title = 'Documentos · G4MED';
    carregar(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const pagina: React.CSSProperties = {
    minHeight: '100vh', background: cor.fundo, color: cor.texto,
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 16,
  };

  if (aberto) {
    return <div style={pagina}><Visualizador token={token} codigo={codigo} doc={aberto} onVoltar={() => setAberto(null)} /></div>;
  }

  const agrupado = new Map<string, Documento[]>();
  for (const d of dados?.documentos || []) {
    if (!agrupado.has(d.rotulo)) agrupado.set(d.rotulo, []);
    agrupado.get(d.rotulo)!.push(d);
  }

  return (
    <div style={pagina}>
      <header style={{ background: cor.marca, color: '#fff', padding: '18px 16px 16px' }}>
        <div style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: 13, color: '#fff' }}>G<span style={{ color: '#FEDD00' }}>4</span>MED</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
          {dados ? `Documentos do pedido #${dados.pedido}` : 'Documentos do pedido'}
        </div>
        {dados?.procedimento && <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{dados.procedimento}</div>}
      </header>

      <main style={{ padding: '16px 16px 40px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!dados && !falha && !pedeCodigo && <div style={{ color: cor.suave }}>Carregando…</div>}
        {pedeCodigo && !falha && (
          <form onSubmit={(e) => { e.preventDefault(); if (digitado.length === 4) { setErroCodigo(null); carregar(digitado, true); } }}
            style={{ background: cor.cartao, borderRadius: 12, padding: 20, border: `1px solid ${cor.linha}`,
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label htmlFor="codigo-acesso" style={{ fontWeight: 600, fontSize: 17 }}>🔒 Código de acesso</label>
            <div style={{ fontSize: 14, color: cor.suave, lineHeight: 1.45 }}>
              Digite o código de 4 números que veio junto com a mensagem em que você recebeu este link.
              Conforme a LGPD, cada acesso é registrado (data, hora, IP, localização e aparelho) e a G4MED e a
              entidade responsável guardam o registro de todos os acessos a estes documentos.
            </div>
            <input id="codigo-acesso" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus
              value={digitado} onChange={(e) => setDigitado(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-invalid={!!erroCodigo} aria-describedby={erroCodigo ? 'codigo-erro' : undefined}
              style={{ fontSize: 28, letterSpacing: '0.5em', textAlign: 'center', padding: '10px 12px',
                borderRadius: 10, border: `1px solid ${erroCodigo ? cor.aviso : cor.linha}`, fontVariantNumeric: 'tabular-nums' }} />
            {erroCodigo && <div id="codigo-erro" role="alert" style={{ color: cor.aviso, fontSize: 14 }}>{erroCodigo}</div>}
            <button type="submit" disabled={digitado.length !== 4 || conferindo}
              style={{ background: cor.destaque, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 16px',
                fontSize: 16, fontWeight: 700, opacity: digitado.length !== 4 || conferindo ? 0.5 : 1 }}>
              {conferindo ? 'Conferindo…' : 'Abrir documentos'}
            </button>
          </form>
        )}
        {falha === 'expirado' && (
          <div style={{ background: cor.cartao, borderRadius: 12, padding: 16 }}>
            Este link expirou — a validade é de 72 horas a partir do envio. Se você ainda precisa dos documentos,
            responda a mensagem em que recebeu o link e pediremos um novo.
          </div>
        )}
        {falha === 'bloqueado' && (
          <div style={{ background: cor.cartao, borderRadius: 12, padding: 16 }}>
            Muitas tentativas com código errado. Por segurança, este link ficou bloqueado por 15 minutos.
            Se você não tem o código, responda a mensagem em que recebeu o link.
          </div>
        )}
        {falha === 'encerrado' && (
          <div style={{ background: cor.cartao, borderRadius: 12, padding: 16 }}>
            Este link foi encerrado pela G4MED. Se você ainda precisa dos documentos, responda a mensagem em que recebeu o link.
          </div>
        )}
        {falha === 'invalido' && (
          <div style={{ background: cor.cartao, borderRadius: 12, padding: 16 }}>
            Link não encontrado. Confira se ele foi copiado inteiro.
          </div>
        )}
        {falha === 'rede' && (
          <div style={{ background: cor.cartao, borderRadius: 12, padding: 16 }}>
            Sem conexão com a G4MED agora. Tente de novo em instantes.
          </div>
        )}

        {dados && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#eaf5ee', border: `1px solid #bfe3cb`,
              borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 1.45 }}>
              <span aria-hidden style={{ fontSize: 18 }}>🔒</span>
              <span>{dados.aviso}
                {dados.expiraEm && <><br /><b>Disponível até {new Date(dados.expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</b></>}</span>
            </div>

            {dados.documentos.length === 0 && (
              <div style={{ background: cor.cartao, borderRadius: 12, padding: 16, color: cor.suave }}>
                Ainda não há documentos clínicos neste pedido.
              </div>
            )}

            {[...agrupado.entries()].map(([rotulo, docs]) => (
              <section key={rotulo}>
                <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: cor.suave, margin: '4px 4px 8px' }}>
                  {rotulo}{docs.length > 1 ? ` (${docs.length})` : ''}
                </h2>
                <div style={{ background: cor.cartao, borderRadius: 12, overflow: 'hidden', border: `1px solid ${cor.linha}` }}>
                  {docs.map((d, i) => (
                    <button key={d.id} onClick={() => setAberto(d)}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, textAlign: 'left',
                        background: 'transparent', border: 'none', borderTop: i ? `1px solid ${cor.linha}` : 'none',
                        padding: '14px 16px', minHeight: 56, fontSize: 16, color: cor.texto, cursor: 'pointer' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{d.nome || `${rotulo} ${docs.length > 1 ? i + 1 : ''}`.trim()}</span>
                      <span aria-hidden style={{ color: cor.destaque, fontWeight: 700 }}>Abrir ›</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {/* @R 22/09 00:36: estimativa pelo que o Estado já pagou + cada orçamento do processo com
                local, descrição e valor total. Só aparece se quem copiou escolheu mandar valores. */}
            {dados.pagoPeloEstado && (
              <section>
                <h2 style={tituloSecao}>Estimativa · o que o Estado já pagou</h2>
                <div style={{ background: cor.cartao, borderRadius: 12, border: `1px solid ${cor.linha}`, padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>Média paga</span><b>{brl(dados.pagoPeloEstado.media)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>Mediana</span><b>{brl(dados.pagoPeloEstado.mediana)}</b>
                  </div>
                  <div style={{ fontSize: 13, color: cor.suave, lineHeight: 1.45 }}>
                    {dados.pagoPeloEstado.n} processo{dados.pagoPeloEstado.n === 1 ? '' : 's'} com procedimento parecido,
                    pagos entre {dataBR(dados.pagoPeloEstado.de)} e {dataBR(dados.pagoPeloEstado.ate)}. {dados.pagoPeloEstado.aviso}
                  </div>
                </div>
              </section>
            )}

            {dados.referencias.length > 0 && (
              <section>
                <h2 style={tituloSecao}>Referência de preço por procedimento</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dados.referencias.map((r, i) => (
                    <div key={i} style={{ background: cor.cartao, borderRadius: 12, border: `1px solid ${cor.linha}`,
                      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 15, lineHeight: 1.4, flex: '1 1 16rem' }}>
                          {r.descricao || (r.categoria !== 'Procedimento' ? r.categoria : 'Procedimento do pedido')}
                        </b>
                        <span style={{ textAlign: 'right' }}>
                          <b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums', display: 'block' }}>{brl(r.valorReferencia)}</b>
                          <span style={{ fontSize: 12, color: cor.suave }}>referência total</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: cor.suave }}>
                        {r.local || 'Local não identificado no documento'}
                        {r.categoria !== 'Procedimento' && r.descricao ? ` · ${r.categoria}` : ''}
                        {r.data ? ` · orçamento de ${dataBR(r.data)}` : ''}{r.pagina ? ` · página ${r.pagina} do processo` : ''}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: cor.suave, margin: '6px 4px 0' }}>{dados.referenciasNota}</div>
              </section>
            )}

            <footer style={{ fontSize: 12, color: cor.suave, textAlign: 'center', marginTop: 8 }}>
              G4MED · Pedido #{dados.pedido} · uso restrito ao orçamento deste pedido
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
