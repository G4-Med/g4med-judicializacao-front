import api from './../api';

/** Central do médico — fase A (GO @R 22/09): ficha INTERNA do prestador do pedido. */
export interface CotacaoFicha {
  pedido: number; procedimento: string; data: string | null; valor: number | null;
  desfecho: 'GANHOU' | 'NAO_SEGUIU' | 'EM_ANDAMENTO'; desfechoRotulo: string;
  processo: { existe: boolean; menor: number | null; conferido: boolean; texto: string };
}
export interface FichaPrestador {
  prestador: { id: number; nome: string; rotulo: string; categoria: string | null; especialidade: string | null };
  cotacoesTotal: number; cotacoes: CotacaoFicha[]; poucasCotacoes: string | null;
  tempoResposta: { n: number; medianaDias: number | null; texto: string | null; fonte: string };
  aviso: string;
}
export const getFichaPrestador = (medicoId: number, pedido?: number) =>
  api.get<FichaPrestador>(`/prestadores/${medicoId}/ficha/`, { params: pedido ? { pedido } : {} });
