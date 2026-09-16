import { useState } from 'react';
import type { ReactNode } from 'react';
import { usePrimeiraCarga } from '../usePrimeiraCarga';
import './PainelKpis.css';

/**
 * PAINEL DE INDICADORES — container com título para os kpi-grid soltos.
 *
 * POR QUE: os cards de KPI apareciam soltos na tela, sem moldura nem título
 * que explicasse o que aquele bloco significa — o @R apontou que isso "pecou
 * na estética" (comparado ao padrão já usado em SLA). Este componente dá aos
 * cards uma casa: título, borda, e a possibilidade de recolher quando o
 * indicador não é o foco do momento (a tabela é).
 *
 * COMO O RECOLHER FUNCIONA: expande no hover (o pedido explícito), mas
 * também aceita clique — hover sozinho exclui quem usa touch/tablet, e um
 * painel que só abre com o mouse suspenso é inacessível pra metade dos
 * dispositivos. Clique fixa aberto/fechado; tirar o mouse não fecha o que
 * foi fixado por clique.
 */
export function PainelKpis({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [fixado, setFixado] = useState<boolean | null>(null); // null = segue o hover
  // Enquanto a API não respondeu, os cards mostram ZERO — e zero é uma afirmação
  // ("não há nada"), não um "ainda não sei". O esqueleto diz a verdade nesse intervalo.
  const carregando = usePrimeiraCarga();

  const aberto = fixado ?? false;

  return (
    <div
      className={`painel-kpis ${aberto ? 'painel-kpis--aberto' : ''} ${fixado === null ? 'painel-kpis--hover-abre' : ''}`}
      onMouseEnter={() => { if (fixado === null) setFixado(null); }}
    >
      <button
        type="button"
        className="painel-kpis__cabecalho"
        onClick={() => setFixado((atual) => !(atual ?? false))}
        aria-expanded={aberto}
      >
        <span className="painel-kpis__titulo">
          <i className="pi pi-chart-bar" /> {titulo}
        </span>
        <i className={`pi ${aberto ? 'pi-chevron-up' : 'pi-chevron-down'} painel-kpis__seta`} />
      </button>
      <div className="painel-kpis__corpo">
        {carregando ? (
          <div className="painel-kpis__esqueleto" role="status" aria-live="polite">
            <span className="sr-only">Carregando os indicadores…</span>
            {[0, 1, 2, 3].map((i) => <span key={i} className="mc-esqueleto-card" aria-hidden="true" />)}
          </div>
        ) : children}
      </div>
    </div>
  );
}

export default PainelKpis;
