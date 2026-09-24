/**
 * MESMO PROCESSO EM OUTRO PEDIDO — #710 (24/09/2026). Caso fundador: #576 e #655 são o mesmo processo
 * (o número digitado diferente) e cada um foi à SES com um valor.
 *
 * Selo ao lado do nome do paciente em TODA fila (ponto único nomeComCopiar), com a mesma mecânica do
 * "!" das anotações: 1 chamada por tela, cache de módulo. Vermelho quando o outro pedido também está
 * em andamento (os dois podem ir à SES); âmbar quando o outro já é Perda/Ganho. Cópia histórica da
 * base antiga não vira selo (só a Ficha mostra). Clicar abre a Ficha do outro pedido.
 * Nada é juntado nem apagado: qual pedido segue é decisão do @R.
 */
import { useEffect, useState } from 'react';
import { getMesmoProcessoIds, type MesmoProcessoInfo } from '../../services/api/orders';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import './MesmoProcesso.css';

let cache: Record<string, MesmoProcessoInfo> | null = null;
let carregando: Promise<Record<string, MesmoProcessoInfo>> | null = null;

function carregar(): Promise<Record<string, MesmoProcessoInfo>> {
  if (cache) return Promise.resolve(cache);
  if (!carregando) {
    carregando = getMesmoProcessoIds().then((r) => { cache = r.data?.ids ?? {}; return cache; })
      .catch(() => { cache = {}; return cache; })
      .finally(() => { carregando = null; });
  }
  return carregando;
}

export function MarcadorMesmoProcesso({ orderId }: { orderId: number }) {
  const [info, setInfo] = useState<MesmoProcessoInfo | undefined>(cache?.[String(orderId)]);
  const { abrir } = useFichaPedido();
  useEffect(() => {
    let vivo = true;
    carregar().then((c) => { if (vivo) setInfo(c[String(orderId)]); });
    return () => { vivo = false; };
  }, [orderId]);
  if (!info || !info.outros.length) return null;
  const grave = info.nivel === 'andamento';
  const lista = info.outros.map((o) => `#${o.id} (${o.statusProcesso})`).join(', ');
  const primeiro = info.outros[0].id;
  return (
    <button type="button" className={grave ? 'mc-mesmo-proc mc-mesmo-proc--grave' : 'mc-mesmo-proc'}
      title={`Mesmo número de processo que ${lista}. ${grave ? 'Os dois estão em andamento — cuidado para não mandar dois orçamentos à SES.' : 'O outro pedido já tem desfecho.'} Nada foi juntado: qual segue é decisão do Rapha. Clique para abrir o #${primeiro}.`}
      aria-label={`Mesmo processo que ${lista} — abrir o pedido #${primeiro}`}
      onClick={(e) => { e.stopPropagation(); abrir(primeiro); }}>
      ⧉ #{primeiro}{info.outros.length > 1 ? ` +${info.outros.length - 1}` : ''}
    </button>
  );
}
