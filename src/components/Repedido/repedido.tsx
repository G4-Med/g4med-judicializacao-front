import { Column } from 'primereact/column';
import { cabecalhoComHint } from '../ColunasIdentificacao/colunasIdentificacao';

/**
 * RE-PEDIDO (@R 28/08 17:17): "pedidos duplicados sao contados para o pedido para dar a
 * devida urgencia no pedido em qualquer fase... clicar uma exclamação para numero de
 * pedidos e deixar a cor da linha mais escura nas tabelas".
 *
 * Um lugar só para as 9 telas de fase: a coluna com o "!" e a classe da linha. Medido em
 * produção 28/08: 29 pedidos tinham sido pedidos 2-3× pela SES sem ninguém saber — 17
 * deles estavam em Perda.
 */

const fmt = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Linha mais escura quando o pedido foi pedido mais de uma vez. */
export const rowClassRepedido = (r: any) =>
  ((r?.vezesPedido ?? 1) > 1 ? 'mc-linha-repedido' : '');

/** Coluna "!" — só mostra algo quando há repetição; o resto da linha fica limpo. */
export const colunaRepedido = () => (
  <Column
    key="vezesPedido"
    field="vezesPedido"
    header={<span className="mc-repedido-cab"><i className="pi pi-exclamation-triangle" aria-hidden="true" />{cabecalhoComHint('Re-pedido', 'Quantas vezes a SES pediu este mesmo paciente. Mais de 1 = urgência: o pedido voltou e ninguém respondeu. Atenção: a linha fica marcada em toda tela.')}</span>}
    sortable
    style={{ width: '7rem' }}
    bodyStyle={{ textAlign: 'center' }}
    body={(r: any) => {
      const n = r?.vezesPedido ?? 1;
      if (n <= 1) return <span style={{ opacity: 0.25 }}>—</span>;
      return (
        <span className="mc-repedido-badge"
          title={`Pedido ${n} vezes pela SES${r?.ultimoPedidoEm ? ` — último em ${fmt(r.ultimoPedidoEm)}` : ''}`}
          aria-label={`Pedido ${n} vezes`}>
          <i className="pi pi-exclamation-triangle" /> {n}×
        </span>
      );
    }}
  />
);
