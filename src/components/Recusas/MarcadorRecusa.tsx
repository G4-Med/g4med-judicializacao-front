import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getRecusasIds, getRecusasDoPedido } from '../../services/api/orders';
import type { RecusaCotacao } from '../../services/api/orders';

/* SELO DE RECUSA ao lado do nome do paciente (@R 22/09 13:55, via eliza-urgência): "um símbolo
   mostrando QUEM recusou, e o motivo ao passar o mouse/abrir".

   Mesmo desenho do "!" das anotações: 1 chamada por tela (cache de módulo), não uma por linha.
   `invalidarRecusas()` é chamada depois de registrar uma recusa, para o selo aparecer sem recarregar. */
type Resumo = { n: number; medicos: string[] };
let cache: Record<string, Resumo> | null = null;
let carregando: Promise<Record<string, Resumo>> | null = null;
const ouvintes = new Set<() => void>();

async function carregar(): Promise<Record<string, Resumo>> {
  if (cache) return cache;
  if (!carregando) {
    carregando = getRecusasIds().then((r) => { cache = r.data?.ids ?? {}; return cache; })
      .catch(() => { cache = {}; return cache; })
      .finally(() => { carregando = null; });
  }
  return carregando;
}

export function invalidarRecusas() {
  cache = null;
  carregar().then(() => ouvintes.forEach((f) => f()));
}

export function BlocoRecusas({ orderId }: { orderId: number }) {
  const [itens, setItens] = useState<RecusaCotacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    getRecusasDoPedido(orderId)
      .then((r) => { if (vivo) setItens(r.data?.itens ?? []); })
      /* erro de rede NÃO pode parecer "nenhuma recusa" — a lista vazia é uma afirmação. */
      .catch(() => { if (vivo) setErro('Não foi possível carregar o histórico de recusas.'); });
    return () => { vivo = false; };
  }, [orderId]);
  if (erro) return <div className="p-message p-message-error" style={{ padding: '.5rem .75rem' }}>{erro}</div>;
  if (itens === null) return <div style={{ color: 'var(--text-color-secondary)' }}>carregando…</div>;
  if (!itens.length) return <div style={{ color: 'var(--text-color-secondary)' }}>Nenhuma recusa registrada.</div>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.6rem' }}>
      {itens.map((r) => (
        <li key={r.id} style={{ borderLeft: '3px solid var(--red-400)', paddingLeft: '.6rem' }}>
          <strong>{r.medico}</strong> · {r.categoriaRotulo}
          {r.motivo && <div style={{ marginTop: '.15rem' }}>“{r.motivo}”</div>}
          <small style={{ color: 'var(--text-color-secondary)' }}>
            {r.em ? new Date(r.em).toLocaleString('pt-BR') : '—'}
            {r.registradoPor ? ` · por ${r.registradoPor}` : ''}
            {r.origem ? ` · ${r.origem}` : ''}
            {r.ficouComMedico ? ' · o pedido seguiu com outro convidado' : ' · voltou à busca de cotador'}
          </small>
        </li>
      ))}
    </ul>
  );
}

export function MarcadorRecusa({ orderId }: { orderId: number }) {
  const [resumo, setResumo] = useState<Resumo | null>(cache?.[String(orderId)] ?? null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setResumo(cache?.[String(orderId)] ?? null); };
    carregar().then(atualizar);
    ouvintes.add(atualizar);
    return () => { vivo = false; ouvintes.delete(atualizar); };
  }, [orderId]);
  if (!resumo?.n) return null;
  const quem = resumo.medicos.join(', ');
  return (
    <>
      <button type="button" className="mc-recusa-selo"
        title={`${resumo.n} recusa(s) de cotação — ${quem}. Clique para ver o motivo.`}
        aria-label={`Ver ${resumo.n} recusa(s) de cotação do pedido`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>⊘</button>
      {aberto && (
        <Dialog header={`Recusas de cotação · pedido #${orderId}`} visible modal dismissableMask
          style={{ width: '34rem', maxWidth: '94vw' }} onHide={() => setAberto(false)}
          onClick={(e) => e.stopPropagation()}>
          <BlocoRecusas orderId={orderId} />
        </Dialog>
      )}
    </>
  );
}
