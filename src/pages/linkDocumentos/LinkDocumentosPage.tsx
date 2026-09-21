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
  referencias: { categoria: string; valorReferencia: number }[];
  referenciasNota: string;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const cor = {
  fundo: '#f4f5f2', cartao: '#ffffff', texto: '#16181d', suave: '#5b616e', linha: '#e3e5df',
  marca: '#0d0d0f', destaque: '#009739', aviso: '#8a5a00',
};

function Visualizador({ token, doc, onVoltar }: { token: string; doc: Documento; onVoltar: () => void }) {
  // Carrega página a página: mostra a 1ª; ao terminar de carregar, pede a próxima. A que responder
  // 404 marca o fim. Assim não é preciso saber o total antes, e um documento longo não baixa tudo de uma vez.
  const [paginas, setPaginas] = useState<number[]>([1]);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState(false);
  const url = (n: number) => `${API}/d/${token}/doc/${doc.id}/pagina/${n}/`;

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
  const [falha, setFalha] = useState<'encerrado' | 'invalido' | 'rede' | null>(null);
  const [aberto, setAberto] = useState<Documento | null>(null);

  useEffect(() => {
    document.title = 'Documentos · G4MED';
    fetch(`${API}/d/${encodeURIComponent(token)}/`)
      .then(async (r) => {
        if (r.status === 410) return setFalha('encerrado');
        if (!r.ok) return setFalha('invalido');
        setDados(await r.json());
      })
      .catch(() => setFalha('rede'));
  }, [token]);

  const pagina: React.CSSProperties = {
    minHeight: '100vh', background: cor.fundo, color: cor.texto,
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 16,
  };

  if (aberto) {
    return <div style={pagina}><Visualizador token={token} doc={aberto} onVoltar={() => setAberto(null)} /></div>;
  }

  const agrupado = new Map<string, Documento[]>();
  for (const d of dados?.documentos || []) {
    if (!agrupado.has(d.rotulo)) agrupado.set(d.rotulo, []);
    agrupado.get(d.rotulo)!.push(d);
  }

  return (
    <div style={pagina}>
      <header style={{ background: cor.marca, color: '#fff', padding: '18px 16px 16px' }}>
        <div style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: 13, color: '#FEDD00' }}>G4MED</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
          {dados ? `Documentos do pedido #${dados.pedido}` : 'Documentos do pedido'}
        </div>
        {dados?.procedimento && <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{dados.procedimento}</div>}
      </header>

      <main style={{ padding: '16px 16px 40px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!dados && !falha && <div style={{ color: cor.suave }}>Carregando…</div>}
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
              <span>Ambiente seguro da G4MED, de acordo com a LGPD. Os documentos abrem só para leitura, sem download,
                e cada abertura é registrada (data, hora e aparelho). Não repasse este link.</span>
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

            {dados.referencias.length > 0 && (
              <section>
                <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: cor.suave, margin: '4px 4px 8px' }}>
                  Valores de referência
                </h2>
                <div style={{ background: cor.cartao, borderRadius: 12, border: `1px solid ${cor.linha}` }}>
                  {dados.referencias.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px',
                      borderTop: i ? `1px solid ${cor.linha}` : 'none', fontVariantNumeric: 'tabular-nums' }}>
                      <span>{r.categoria}</span>
                      <b>{brl(r.valorReferencia)}</b>
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
