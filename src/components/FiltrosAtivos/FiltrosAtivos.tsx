import { Button } from 'primereact/button';
import './FiltrosAtivos.css';

/**
 * AVISO DE FILTROS ATIVOS — @R 17/09: ⟦"precisamos ter em cada tabela, ao lado de Ajustar
 * à tela, para saber se temos filtros ativos, para limpar eles e ter um aviso ao usuário"⟧.
 *
 * POR QUE ISTO NÃO É ENFEITE: a pessoa filtra, é interrompida, volta depois — e vê uma
 * tabela com menos linhas do que deveria. Sem aviso, a conclusão natural é "sumiram
 * pedidos" ou "o sistema perdeu dado", e o próximo passo é uma mensagem no WhatsApp
 * perguntando o que aconteceu. Filtro escondido não confunde só quem filtrou: confunde
 * quem senta na máquina depois.
 *
 * E o mesmo aviso protege os INDICADORES do topo, que são calculados sobre os dados
 * FILTRADOS: com filtro ativo e sem aviso, o número no topo parece o total da fase e é o
 * total do recorte — um erro que se propaga para fora da tela, porque esse número vira
 * conversa e vira relatório.
 *
 * Conta só o que tem VALOR: uma chave em `filters` com `value: null` existe para o
 * PrimeReact saber que a coluna é filtrável, e contar isso como "filtro ativo" acenderia
 * o aviso o tempo todo — um aviso que sempre aparece não avisa nada.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filtros = Record<string, any>;   // união do PrimeReact: só lemos `.value`

/** Quantas colunas estão de fato filtrando. `''` e `[]` contam como vazio. */
export function contarFiltrosAtivos(filtros: Filtros | undefined): number {
  if (!filtros) return 0;
  return Object.values(filtros).filter((f) => {
    const v = f?.value;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}

/**
 * Zera os valores PRESERVANDO as chaves e os matchModes.
 *
 * Por que não devolver `{}`: a caixa de filtro do PrimeReact (filterDisplay="row") só
 * aparece quando a chave existe no estado `filters`. Limpar apagando as chaves faria as
 * caixas SUMIREM da tabela — o botão "Limpar" quebraria a própria barra de filtros.
 *
 * O tipo do vazio segue o tipo do valor atual: filtro de texto volta a `''` (o que o
 * CONTAINS espera) e os demais voltam a `null`.
 */
export function limparValores<T extends Filtros>(filtros: T): T {
  const saida: Record<string, unknown> = {};
  for (const [chave, f] of Object.entries(filtros ?? {})) {
    const atual = (f as { value?: unknown } | undefined)?.value;
    saida[chave] = { ...(f as object), value: typeof atual === 'string' ? '' : null };
  }
  return saida as T;
}

export function FiltrosAtivos({
  filtros,
  aoLimpar,
  totalVisivel,
  totalSemFiltro,
}: {
  filtros: Filtros | undefined;
  aoLimpar: () => void;
  /** linhas na tela agora (opcional — quando vem, o aviso fica concreto) */
  totalVisivel?: number;
  /** linhas sem nenhum filtro (opcional) */
  totalSemFiltro?: number;
}) {
  const n = contarFiltrosAtivos(filtros);
  if (n === 0) return null;          // sem filtro, sem aviso: o normal não precisa avisar

  const escondidos = (totalSemFiltro !== undefined && totalVisivel !== undefined)
    ? totalSemFiltro - totalVisivel
    : undefined;

  return (
    <span className="filtros-ativos" role="status">
      <i className="pi pi-filter-fill" aria-hidden="true" />
      <span className="filtros-ativos__texto">
        <strong>{n}</strong> filtro{n > 1 ? 's' : ''} ativo{n > 1 ? 's' : ''}
        {escondidos !== undefined && escondidos > 0 && (
          <> — <strong>{escondidos}</strong> pedido{escondidos > 1 ? 's' : ''} fora da lista</>
        )}
      </span>
      <Button
        label="Limpar"
        icon="pi pi-times"
        size="small"
        text
        onClick={aoLimpar}
        aria-label={`Limpar os ${n} filtros ativos`}
      />
    </span>
  );
}

export default FiltrosAtivos;
