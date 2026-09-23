import api from './../api';

/** Fase 3.1 "bater valores" (@R 22/09/2026 14:24). Back: backend/bater_valores.py.
 *  O sistema MOSTRA a diferença entre o nosso orçamento e o menor orçamento de terceiro do
 *  próprio processo; quem decide é a pessoa. Nunca sugerimos onde cortar (hospital, OPME e
 *  anestesista são custo de terceiro — só o honorário é negociável, e a decisão é do médico). */
export type EstadoGatilho = 'COM_CONCORRENTE' | 'INDETERMINADO' | 'SEM_CONCORRENTE';
// @R 22/09 21:22: ao recusar o valor, 2 saídas da fase — o médico recusa (volta a Selecionar médico) ou perda
export type Saida = 'CONFIRMADO' | 'REVISADO' | 'RECUSADO' | 'PERDA';

export interface DecisaoValor {
  saida: Saida | 'SEM_RETORNO';
  motivo: string | null;
  observacao: string | null;
  valorNovo: number | null;
  por: string | null;
  em: string | null;
  prazoAte: string | null;
}

export interface ItemBaterValores {
  pedido: number;
  paciente: string | null;
  procedimento: string | null;
  fase: string | null;
  faseExibida: string | null;
  estado: EstadoGatilho | null;
  nossoTotal: number | null;
  menorTerceiro: number | null;
  acimaPct: number | null;
  aviso: string | null;
  decisao: DecisaoValor | null;
  motivosRevisao: { valor: string; rotulo: string }[];
  origem?: 'MANUAL' | 'AUTOMATICA';
  jaFoiSES?: boolean;
  entrada?: EntradaManual | null;
}

export interface PainelBaterValores extends ItemBaterValores {
  /** o PDF que vai anexo à SES ao confirmar (o último ORCAMENTO do pedido) — null = falta anexar */
  pdfOrcamento?: { id: number; nome: string; em: string } | null;
  /** há e-mail de orçamento parado esperando esta decisão */
  temEmailRetido?: boolean;
  terceiros: { id: number; prestador: string | null; valorTotal: number; pagina: number | null;
               comparavel: boolean; procedimento: string | null;
               linkAbrir?: string | null; origemAbrir?: 'RECORTE' | 'ARQUIVO' | 'PECA' | null;
               comparativo?: ComparativoComponentes | null }[];
  /** @R 22/09 (#629): só VALIDADOS aparecem; os que esperam conferência viram contagem. */
  aguardandoConferencia?: number;
}

/** Comparativo por componente (#629) — a IA lê a folha; as contas são do servidor. */
export interface ComparativoComponentes {
  terceiro: number;
  linhas: { bloco: string; rotulo: string; nosso: number | null; terceiro: number; diferenca: number | null; pct: number | null }[];
  maiorDiferenca: string | null;
  somaRubricasTerceiro: number; totalDeclaradoTerceiro: number | null; naoDetalhadoTerceiro: number | null;
  /** true = a soma das linhas passa do total declarado (impossível): a tela não mostra "não detalhado". */
  inconsistenteTerceiro?: boolean;
  fonteTotalTerceiro?: string | null; totalLidoIATerceiro?: number | null;
  diariasTerceiro: {
    enfermaria: number | null; apartamento?: number | null; uti: number | null;
    outras?: { tipo: string; qtd: number }[];
  } | null;
  nossoSemComponentes: boolean;
  rubricas: { descricao: string; valor: number; bloco: string }[];
  legivel: boolean; observacao: string | null; regraAgregacao: string;
  lidoEm: string | null; lidoPor: string | null; modelo: string | null;
}

export const compararComponentes = (pedido: number, terceiro: number) =>
  api.post<ComparativoComponentes>(`/orders/${pedido}/bater-valores/componentes/`, { terceiro });

export interface FilaBaterValores {
  total: number;
  contagem: Record<EstadoGatilho, number>;
  itens: ItemBaterValores[];
}

export interface ResultadoEnvio { enviado: boolean; naFila: boolean; para?: string; motivo?: string }

export const listarBaterValores = (estado?: EstadoGatilho | 'todos') =>
  api.get<FilaBaterValores>('/orders/bater-valores/', { params: { estado } });

export const painelBaterValores = (pedido: number) =>
  api.get<PainelBaterValores>(`/orders/${pedido}/bater-valores/`);

export const decidirBaterValores = (pedido: number, corpo: {
  saida: Saida; motivo?: string; observacao?: string; valorNovo?: number | null;
}) => api.post<{ id: number; saida: Saida; liberado: boolean; envio: ResultadoEnvio | null; emailCancelado?: number | null }>(
  `/orders/${pedido}/bater-valores/decidir/`, corpo);

/** Entrada MANUAL (@R 22/09): qualquer pedido, qualquer fase, com motivo. A fase do pedido não muda. */
export interface EntradaManual {
  id: number; motivo: string; motivoRotulo: string; valorAlvo: number | null; prestador: string | null;
  anotacao: string; por: string | null; em: string | null;
}
export interface ResultadoBusca {
  pedido: number; paciente: string | null; procedimento: string | null; nprocesso: string | null;
  fase: string | null; jaFoiSES: boolean; temCotacaoNossa: boolean; jaNa31: boolean;
}
export const MOTIVOS_ENTRADA = [
  { valor: 'ORCAMENTO_MENOR', rotulo: 'Há orçamento menor no processo' },
  { valor: 'AJUSTE_JUIZ', rotulo: 'O juiz pediu ajuste de valor' },
  { valor: 'MUDANCA_PEDIDO', rotulo: 'O pedido mudou (procedimento/escopo)' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];
export const buscarParaBaterValores = (q: string) =>
  api.get<{ itens: ResultadoBusca[] }>('/orders/bater-valores/buscar/', { params: { q } });
export const colocarNaBaterValores = (pedido: number, corpo: {
  motivo: string; anotacao: string; valorAlvo?: number | null; prestador?: string;
}) => api.post<{ id: number; terceiroId: number | null; jaFoiSES: boolean }>(
  `/orders/${pedido}/bater-valores/entrada/`, corpo);
