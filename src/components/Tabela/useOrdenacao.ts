import { useState } from 'react';
import type { DataTableSortEvent } from 'primereact/datatable';

type Ordem = 1 | 0 | -1 | null | undefined;

/** Ordenação de DataTable que RESPONDE ao clique — uso: `<DataTable {...useOrdenacao('dataEnvio', -1)} />`.
 *
 *  POR QUE EXISTE (@R 21/09/2026: "toda vez que clico na coluna para mudar a ordem a tabela trava"):
 *  6 tabelas passavam `sortField="x" sortOrder={-1}` direto, SEM `onSort`. No PrimeReact isso torna a ordem
 *  CONTROLADA por um valor que ninguém atualiza: o clique dispara, a tabela inteira re-renderiza e a ordem
 *  volta para a mesma. Parece travamento; é um controle sem fio. As 14 telas que funcionavam tinham as 3
 *  linhas de estado copiadas à mão — esta peça é para a próxima tabela não depender de alguém lembrar. */
export function useOrdenacao(campoInicial: string, ordemInicial: Ordem = -1) {
  const [sortField, setSortField] = useState<string | undefined>(campoInicial);
  const [sortOrder, setSortOrder] = useState<Ordem>(ordemInicial);
  const onSort = (e: DataTableSortEvent) => { setSortField(e.sortField); setSortOrder(e.sortOrder); };
  return { sortField, sortOrder, onSort };
}
