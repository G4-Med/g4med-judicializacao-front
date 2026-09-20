import { useEffect, useState } from 'react';
import { getAnotacoesIds } from '../../services/api/orders';
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
  if (!n) return null;
  return (
    <span className="mc-anotacao-bang" title={`${n} anotação(ões) interna(s) — abra a Ficha do pedido`}
      aria-label={`${n} anotação interna`}>!</span>
  );
}
