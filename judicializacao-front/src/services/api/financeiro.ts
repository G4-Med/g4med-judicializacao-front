import api from './../api';

export interface AguardandoCirurgiaItem {
  id: number;
  paciente: string;
  procedimento: string;
  idMedico: number | null;
  medico: string;
  valor: number;
  valorOrcamento: number;
  valorGanho: number;
  nprocesso: string;
  dias: number;
  dataPedido: string | null;
  statusProcesso: string;
  takeRate: number;
  comissaoEstimada: number;
}

export interface AguardandoCirurgiaKpis {
  quantidade: number;
  valorGanhos: number;
  comissaoEsperada: number;
}

export interface AguardandoCirurgiaResposta {
  kpis: AguardandoCirurgiaKpis;
  itens: AguardandoCirurgiaItem[];
}

export interface ResultadoFinanceiroItem {
  id: number;
  orderId: number;
  paciente: string;
  procedimento: string;
  idMedico: number | null;
  medico: string;
  valor: number;
  valorComissao: number;
  statusCirurgia: boolean;
  descCirurgiaPerda: string;
  nprocesso: string;
  dias: number;
  diasAteResultado: number;
  dataPedido: string | null;
  dataConfirmacao: string | null;
  createDate: string | null;
}

export interface ResultadosFinanceirosKpis {
  qtdRealizadas: number;
  valorPagoComissao: number;
  qtdARealizar: number;
  valorARepassar: number;
  qtdPerdas: number;
  valorPerdaCirurgia: number;
}

/**
 * Pedido SEM registro financeiro ainda: ou o processo foi ganho e ninguem abriu o
 * registro, ou o Estado pagou depois do pedido e falta conferir se e nosso.
 *
 * NAO e um ResultadoFinanceiroItem e nao pode ser misturado com `itens`: nao tem
 * `id` de Financeiro (use `orderId`) nem `statusCirurgia`. Renderizar isto na
 * tabela de `itens` mostraria todo ganho como "Perda" (null e falsy) e o Ver
 * Detalhes cairia em 404. Contrato do backend: views.py listar_resultados_financeiros.
 */
export interface ResultadoFinanceiroPendente {
  id: null;
  orderId: number;
  paciente: string;
  valorProcedimento: number;
  /** Comissao LANCADA. Sem ficha financeira vale 0 por definicao — nao e "nao ha o que
   *  receber", e "ninguem lancou ainda". Para o quanto DEVERIA vir, use comissaoEstimada. */
  valorComissao: number;
  /** Comissao ESTIMADA pelo takeRate do medico (08/09). So GANHO tem valor; perda e
   *  fonte `estado_pagou` vem 0.0 de proposito — comissao e % do fechamento da cirurgia,
   *  e sem ganho nao ha cirurgia. Opcional: backend antigo nao envia. */
  comissaoEstimada?: number;
  /** Nome do medico do pedido — a quem perguntar "te pagaram?". Opcional: backend antigo nao envia. */
  nomeMedico?: string;
  /** Quanto NOS pedimos (orcamento). Comparar com empenho548.pago responde "o valor bate?". */
  valorOrcamento?: number;
  /** O que o ESTADO pagou neste processo. `null` = sem registro (nao e "pagou zero"). */
  empenho548?: {
    pago: number;
    empenhado: number;
    /** Data do ultimo pagamento — ou do EMPENHO, quando o portal nao expoe a do pagamento. */
    ultimoPagamento: string | null;
    ultimoPagamentoTipo: 'pagamento' | 'empenho' | null;
    /** Regua de ATRIBUICAO: pagamento no CNJ nao significa ESTE pedido pago. */
    sinal: 'PAGO_APOS_O_PEDIDO' | 'REVISAR_VALOR_BATE' | 'PROVAVEL_OUTRO_ITEM' | 'EMPENHADO' | 'DEPOSITO_NO_PROCESSO';
    classe: 'EXATO' | 'NAO_EXATO' | 'EMPENHADO' | 'SEM_REGISTRO';
  } | null;
  statusCirurgia: null;
  dataConfirmacao: null;
  origemLinha: 'ganho_sem_financeiro' | 'estado_pagou';
  statusProcesso: string;
  nprocesso: string | null;
  cnj20: string | null;
  idMedico: number | null;
  valorGanho: number;
  statusConferencia: string;
  statusConferenciaRotulo: string;
  acaoSugerida: string;
  motivoConferencia: string;
  estadoPagouAposPedido: boolean;
  faseFinanceira: string | null;
  resultado: 'Ganho' | 'Perda' | 'Em aberto';
  tipoPerda: string | null;
}

export interface ResultadosFinanceirosResposta {
  kpis: ResultadosFinanceirosKpis;
  itens: ResultadoFinanceiroItem[];
  /** Opcional de proposito: campo novo, telas antigas seguem sem conhece-lo. */
  itensPendentes?: ResultadoFinanceiroPendente[];
  porStatusConferencia?: Record<string, { qtd: number; rotulo: string; acao: string }>;
}

export interface FinanceiroDetalhe extends ResultadoFinanceiroItem {}

export const getAguardandoCirurgia = () =>
  api.get<AguardandoCirurgiaResposta>('/financeiro/aguardando-cirurgia/');

export const confirmarCirurgia = (
  orderId: number,
  payload: { valorComissao: number; dataConfirmacao: string; linkAnexo?: string | null },
) => api.post(`/financeiro/${orderId}/confirmar/`, payload);

export const registrarPerdaCirurgia = (
  orderId: number,
  payload: { descCirurgiaPerda: string; dataConfirmacao: string; linkAnexo?: string | null },
) => api.post(`/financeiro/${orderId}/perda/`, payload);

export const getResultadosFinanceiros = () =>
  api.get<ResultadosFinanceirosResposta>('/financeiro/resultados/');

export const getFinanceiroDetalhe = (financeiroId: number) =>
  api.get<FinanceiroDetalhe>(`/financeiro/${financeiroId}/`);
