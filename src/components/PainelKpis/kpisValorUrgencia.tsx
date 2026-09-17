import { nivelRepedido } from '../Repedido/repedido';
import './PainelKpis.css';

/**
 * DOIS INDICADORES DE DINHEIRO NA FASE (@R 17/09/2026): "adicionar indicadores do valor
 * total no funil e o valor de urgencia que estão com repedido nos indicadores".
 *
 * POR QUE O TOTAL, SE JÁ HAVIA A MÉDIA: média responde "quanto vale um pedido típico";
 * total responde "quanto dinheiro está parado NESTA fase". São perguntas diferentes, e é
 * a segunda que decide onde a equipe gasta o dia — 16 pedidos de R$ 3 mil e 3 de R$ 40 mil
 * têm médias parecidas e urgências opostas.
 *
 * POR QUE A URGÊNCIA SEPARADA: repedido é a SES pedindo de novo o que já pediu (a régua
 * é a mesma que pinta a linha — `nivelRepedido`, um lugar só, para cor e número nunca
 * discordarem). Esse recorte responde "do dinheiro parado aqui, quanto já está sendo
 * cobrado?" — que é a fila que não pode esperar.
 *
 * Os dois números seguem o que está VISÍVEL na tabela (pós-filtro), igual aos demais
 * cards: filtrar a tela e ver o indicador não mudar seria o mesmo que ter dois números
 * contando coisas diferentes na mesma linha do olho.
 */
export function KpisValorEUrgencia({
  linhas,
  valorDe,
}: {
  linhas: any[];
  valorDe: (linha: any) => number;
}) {
  const total = linhas.reduce((acc, l) => acc + (valorDe(l) || 0), 0);
  const comUrgencia = linhas.filter((l) => nivelRepedido(l) !== 'nenhum');
  const valorUrgencia = comUrgencia.reduce((acc, l) => acc + (valorDe(l) || 0), 0);

  const moeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <>
      <div className="kpi-card" title="Soma do valor de todos os pedidos visíveis nesta fase">
        <div className="kpi-header"><span>Valor total na fase</span><i className="pi pi-wallet" /></div>
        <div className="kpi-value">{moeda(total)}</div>
      </div>
      <div
        className="kpi-card"
        title="Soma do valor dos pedidos que a SES já pediu mais de uma vez (ou cobrou por telefone)"
      >
        <div className="kpi-header"><span>Valor em urgência (re-pedido)</span><i className="pi pi-exclamation-triangle" /></div>
        <div className="kpi-value">
          {moeda(valorUrgencia)}
          {comUrgencia.length > 0 && (
            <span className="kpi-sub"> · {comUrgencia.length} pedido{comUrgencia.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </>
  );
}
