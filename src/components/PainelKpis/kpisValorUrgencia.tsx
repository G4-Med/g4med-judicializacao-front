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
  todas,
  valorDe,
}: {
  /** o que está VISÍVEL na tabela (pós-filtro/paginação) */
  linhas: any[];
  /** a fase INTEIRA. Sem isto, cai em `linhas` — e aí o número é o da página. */
  todas?: any[];
  valorDe: (linha: any) => number;
}) {
  // @R 17/09: "as fases tem que ter o valor da oportunidade, para sabermos em cada fase
  // do funil quanto cada um está representando, para podermos priorizar por valor".
  // Priorizar ENTRE fases exige comparar fases inteiras — um número que encolhe quando
  // alguém filtra a tela não serve para isso. Por isso o valor é o da FASE; o que está
  // filtrado aparece embaixo, como recorte, quando for diferente.
  const base = todas && todas.length ? todas : linhas;
  const soma = (lista: any[]) => lista.reduce((acc, l) => acc + (valorDe(l) || 0), 0);
  const total = soma(base);
  const totalVisivel = soma(linhas);
  const filtrado = base.length !== linhas.length;
  const comUrgencia = base.filter((l) => nivelRepedido(l) !== 'nenhum');
  const valorUrgencia = soma(comUrgencia);

  const moeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <>
      <div className="kpi-card" title="Quanto esta fase do funil representa em dinheiro — a oportunidade parada aqui">
        <div className="kpi-header"><span>Oportunidade nesta fase</span><i className="pi pi-wallet" /></div>
        <div className="kpi-value">
          {moeda(total)}
          {filtrado && <span className="kpi-sub"> · filtrado {moeda(totalVisivel)}</span>}
        </div>
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
