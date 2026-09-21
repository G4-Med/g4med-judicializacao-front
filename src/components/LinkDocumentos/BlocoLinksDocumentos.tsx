import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { rastroLinksDocumentos, revogarLinkDocumentos } from '../../services/api/orders';

/* RASTRO DO LINK SEGURO NA FICHA (@R 21/09 18:27: "registrar quem abriu, e o momento que o item foi
   aberto e termos o rastro da abertura de arquivos"). Sem login do médico, "quem" é o LINK (cada
   destino tem o seu) + o aparelho e a rede — não a pessoa. Isso é dito na tela, para ninguém ler
   "aberto" como "o Dr. X leu". */

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};
// "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)…" → "iPhone"
const aparelho = (ua: string) => {
  const u = ua || '';
  if (/iPhone/i.test(u)) return 'iPhone';
  if (/iPad/i.test(u)) return 'iPad';
  if (/Android/i.test(u)) return 'Android';
  if (/Windows/i.test(u)) return 'Windows';
  if (/Macintosh/i.test(u)) return 'Mac';
  if (/WhatsApp/i.test(u)) return 'prévia do WhatsApp';
  return u ? u.slice(0, 30) : 'desconhecido';
};
const ROTULO: Record<string, string> = { PAGINA: 'abriu a lista', DOCUMENTO: 'abriu', NEGADO: 'tentou abrir (link encerrado)' };

export function BlocoLinksDocumentos({ orderId }: { orderId: number }) {
  const [links, setLinks] = useState<any[] | null>(null);
  const [erro, setErro] = useState(false);
  const carregar = () => rastroLinksDocumentos(orderId)
    .then((r) => { setLinks(r.data.links ?? []); setErro(false); })
    .catch(() => setErro(true));
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

  const encerrar = async (id: number) => {
    if (!window.confirm('Encerrar este link? Quem tentar abrir verá "link encerrado". Não dá para reabrir o mesmo link — um novo Copiar gera outro.')) return;
    try { await revogarLinkDocumentos(id); await carregar(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Não foi possível encerrar o link.'); }
  };

  if (erro) return (
    <section className="fic__situacao"><header className="fic__situacao-cab"><strong>Link seguro dos documentos</strong>
      <small>Não foi possível carregar o rastro agora.</small></header></section>
  );
  if (!links || links.length === 0) return null;

  return (
    <section className="fic__situacao">
      <header className="fic__situacao-cab">
        <strong>Link seguro dos documentos</strong>
        <small>Cada abertura fica registrada. Sem login do médico, o registro diz qual link, quando e de que aparelho — não o nome de quem abriu.</small>
      </header>
      {links.map((lk) => {
        const docs = (lk.acessos || []).filter((a: any) => a.tipo === 'DOCUMENTO');
        return (
          <div key={lk.id} style={{ borderTop: '1px solid #eee', padding: '.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>
                <b>{lk.destino || (lk.medicoId ? `médico ${lk.medicoId}` : 'sem destino')}</b>
                {' · '}criado {fmt(lk.criadoEm)}{lk.criadoPor ? ` por ${lk.criadoPor}` : ''}
                {lk.mostrarValores ? ' · com valores' : ' · sem valores'}
                {' · '}{docs.length ? `${docs.length} documento(s) aberto(s)` : 'nenhum documento aberto ainda'}
              </span>
              {lk.revogadoEm
                ? <small>encerrado {fmt(lk.revogadoEm)}{lk.revogadoPor ? ` por ${lk.revogadoPor}` : ''}</small>
                : <Button label="Encerrar link" size="small" text severity="danger" onClick={() => encerrar(lk.id)} />}
            </div>
            {(lk.acessos || []).length > 0 && (
              <ul style={{ margin: '.25rem 0 0', paddingLeft: '1.1rem', fontSize: '.85rem' }}>
                {lk.acessos.slice(0, 20).map((a: any, i: number) => (
                  <li key={i}>
                    {fmt(a.momento)} · {ROTULO[a.tipo] || a.tipo}{a.documento ? ` ${a.documento}` : ''} · {aparelho(a.aparelho)}
                  </li>
                ))}
                {lk.acessos.length > 20 && <li>… e mais {lk.acessos.length - 20}</li>}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
