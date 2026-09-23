/**
 * Cura da TRAVADA ao abrir as tabelas com colunas fixas (@R 23/09 15:22: "/orcamento-medico dá uma pequena
 * travada antes de iniciar").
 *
 * MEDIDO (23/09, perfil de CPU da abertura da fase 3, build sem minificar): 17,1 s dentro de
 * DomHandler.getOuterWidth, chamado pelo efeito `updateStickyPosition` do PrimeReact 10.9 — o navegador
 * ficou congelado 13,1 s numa só tarefa. Para CADA célula de coluna fixa (3 colunas × 45 linhas), o efeito
 * LÊ a largura da célula vizinha e em seguida ESCREVE o `left` da sua — ler depois de escrever obriga o
 * navegador a recalcular o layout da tabela inteira, 135 vezes seguidas.
 *
 * A CURA: numa mesma rodada de efeitos, todas as células de uma coluna têm a MESMA largura (é uma <table>).
 * Então a 1ª leitura por (tabela, coluna) é real e as seguintes vêm deste cache — que vive só até o fim da
 * rodada (limpo num microtask), para nunca devolver largura velha depois de um redimensionamento. Vale para
 * as 12 telas com colunas fixas sem mexer em nenhuma. Qualquer elemento que não seja célula de tabela passa
 * direto para a medição original.
 */
import { DomHandler } from 'primereact/utils';

let instalado = false;

export function instalarMedidaColunaFixa() {
  if (instalado) return;
  const original = DomHandler.getOuterWidth.bind(DomHandler);
  let cache: WeakMap<Element, Map<string, number>> | null = null;

  (DomHandler as any).getOuterWidth = (el: any, margin?: boolean) => {
    const celula = el && (el.tagName === 'TD' || el.tagName === 'TH') ? el as HTMLTableCellElement : null;
    const tabela = celula?.closest('table');
    if (!celula || !tabela) return original(el, margin);
    if (!cache) {
      cache = new WeakMap();
      queueMicrotask(() => { cache = null; });   // fim da rodada: nada de largura velha na próxima
    }
    let porColuna = cache.get(tabela);
    if (!porColuna) { porColuna = new Map(); cache.set(tabela, porColuna); }
    const chave = `${celula.cellIndex}:${margin ? 1 : 0}`;
    const guardada = porColuna.get(chave);
    if (guardada !== undefined) return guardada;
    const w = original(el, margin);
    porColuna.set(chave, w);
    return w;
  };
  instalado = true;
}
