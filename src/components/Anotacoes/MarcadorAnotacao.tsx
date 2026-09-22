import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getAnotacoesIds } from '../../services/api/orders';
import { BlocoAnotacoes } from './BlocoAnotacoes';
import './Anotacoes.css';

/* Cache de módulo: 1 chamada por carregamento de tela (não por linha). `invalidarAnotacoes()`
   é chamada pela ficha ao criar/apagar, para o "!" aparecer/sumir sem recarregar a página. */
let cache: Record<string, number> | null = null;
let carregando: Promise<Record<string, number>> | null = null;
const ouvintes = new Set<() => void>();

async function carregar(): Promise<Record<string, number>> {
  if (cache) return cache;
  if (!carregando) {
    carregando = getAnotacoesIds().then((r) => { cache = r.data?.ids ?? {}; return cache; })
      .catch(() => { cache = {}; return cache; })
      .finally(() => { carregando = null; });
  }
  return carregando;
}

export function invalidarAnotacoes() {
  cache = null;
  carregar().then(() => ouvintes.forEach((f) => f()));
}

export function MarcadorAnotacao({ orderId }: { orderId: number }) {
  const [n, setN] = useState<number>(cache?.[String(orderId)] ?? 0);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setN(cache?.[String(orderId)] ?? 0); };
    carregar().then(atualizar);
    ouvintes.add(atualizar);
    return () => { vivo = false; ouvintes.delete(atualizar); };
  }, [orderId]);
  const [aberto, setAberto] = useState(false);
  if (!n) return null;
  /* @R 22/09: "a exclamação tem que ser clicável para vermos o que é". Abre as anotações
     internas (quem, quando, texto) ali mesmo, sem sair da fila; dá para responder/apagar. */
  return (
    <>
      <button type="button" className="mc-anotacao-bang" title={`${n} anotação(ões) interna(s) — clique para ler`}
        aria-label={`Ler ${n} anotação(ões) interna(s) do pedido`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>!</button>
      {aberto && (
        <Dialog header={`Anotações internas · pedido #${orderId}`} visible modal dismissableMask
          style={{ width: '36rem', maxWidth: '94vw' }} onHide={() => setAberto(false)}
          onClick={(e) => e.stopPropagation()}>
          <BlocoAnotacoes orderId={orderId} />
        </Dialog>
      )}
    </>
  );
}
