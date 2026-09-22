import api from './../api';

/** Conferência dos orçamentos lidos das peças (decisão @R 22/09/2026 "encolher").
 *  O médico só vê o que está VALIDADO. A máquina propõe (regra calculada na hora); a pessoa
 *  decide e a decisão dela sempre vence. Back: backend/conferencia_orcamento.py. */
export type EstadoConferencia = 'REVISAR' | 'DESCARTADO' | 'VALIDADO';

export interface ItemConferencia {
  id: number;
  pedido: number;
  paciente: string | null;
  fase: string | null;
  prestador: string | null;
  valorTotal: number;
  pagina: number | null;
  procedimento: string | null;
  observacao: string | null;
  estado: EstadoConferencia;
  regra: string;
  frase: string;
  decididoPorPessoa: boolean;
  conferenciaPor: string | null;
  conferenciaEm: string | null;
  conferenciaMotivo: string | null;
  linkAbrir: string | null;
  origemAbrir: 'RECORTE' | 'ARQUIVO' | 'PECA' | null;
}

export interface ListaConferencia {
  contagem: Record<EstadoConferencia, number>;
  itens: ItemConferencia[];
}

export const listarConferencia = (params: { estado?: EstadoConferencia | 'todos'; pedido?: number; todasFases?: boolean }) =>
  api.get<ListaConferencia>('/conferencia/orcamentos/', {
    params: { estado: params.estado, pedido: params.pedido, todasFases: params.todasFases ? 1 : undefined },
  });

export const decidirConferencia = (id: number, acao: 'VALIDAR' | 'DESCARTAR' | 'DESFAZER', motivo?: string) =>
  api.post<{ id: number; estado: EstadoConferencia; visivelAoMedico: boolean }>(
    `/conferencia/orcamentos/${id}/decidir/`, { acao, motivo });
