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
  /** Parecer do revisor por IA sobre a FOLHA (@R 22/09): visão lê a imagem, Jev lê o texto.
   *  O veredito é calculado no servidor; só NAO_E_ORCAMENTO (os 2 concordam) descarta sozinho. */
  ia: {
    tipo: string; rotulo: string; emissor: string | null; timbrado: boolean;
    confianca: number | null; jev: number | null; motivo: string | null;
    veredito: 'NAO_E_ORCAMENTO' | 'ORCAMENTO' | 'DIVERGENTE' | 'INDETERMINADO' | null;
    /** O que a IA SUGERE (a pessoa decide): só a imagem não descarta sozinha — medido 22/09. */
    sugestao?: 'DESCARTAR' | 'VALIDAR' | null;
    modelo: string | null; em: string | null;
  } | null;
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

/** Botão "Revisar com IA" (@R 22/09): a IA olha a folha de cada orçamento sem decisão humana, em segundo plano. */
export interface ProgressoRevisaoIa {
  progresso: { inicio: string; fim?: string; total: number; feitos: number; erros: number; estado: string; por: string;
               emCurso: boolean; resultado: Partial<Record<EstadoConferencia, number>> } | null;
  emCurso: boolean;
}
export const progressoRevisaoIa = () => api.get<ProgressoRevisaoIa>('/conferencia/orcamentos/revisar-ia/');
export const iniciarRevisaoIa = (estado: EstadoConferencia | 'todos', refazer = false) =>
  api.post('/conferencia/orcamentos/revisar-ia/', { estado, refazer });
