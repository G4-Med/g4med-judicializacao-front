import api from './../api';

/**
 * FILA DE INVESTIGAÇÃO — pedidos marcados como PERDA cujo CNJ tem empenho do Estado.
 *
 * POR QUE EXISTE (@R 09/09, cartão tela_resultados_versoes): a tela chamava de "perda" 192
 * casos com empenho no mesmo processo. O @R escolheu a aba nova e, no falsificador do plano,
 * disse o uso: COBRAR — "com os 114 na tela eu consigo ESCOLHER quais processos investigar".
 * Logo isto é uma FILA A INVESTIGAR, ¬um total a receber. Não existe campo de soma por design.
 *
 * ⚠ Pagamento no mesmo CNJ NÃO é comissão nossa. Quem recebe do Estado é o médico
 * representado; só há comissão se `favorecido` for o `medico` daquele pedido. A comparação é
 * do humano — por isso as duas colunas saem lado a lado e o backend não conclui nada.
 */
export interface PerdaComPagamentoItem {
  orderId: number;
  paciente: string;
  /** `nomeCompleto` do Medico. Ver `semProfissional` antes de tratar como profissional real. */
  medico: string | null;
  /**
   * true = o pedido aponta o Medico id=1 "SEM PROFISSIONAL": não tínhamos quem operasse.
   * Não há médico nosso a quem uma comissão pudesse ser devida — a comparação com
   * `favorecido` não tem objeto. Medido 09/09: 88 dos 192.
   */
  semProfissional: boolean;
  /** Quem o Estado pagou, vindo do EMPENHO (¬do rastreio, que não tem este campo). */
  favorecido: string | null;
  statusPerda: string | null;
  cnj: string;
  valorPago: number | null;
  dataPagamento: string | null;
  /**
   * false NÃO significa "não pagaram": significa que o nosso coletor não foi buscar a data.
   * É COLUNA, nunca filtro — filtrar por ela escondia 78 dos 192 (refutação aceita 09/09).
   */
  dataPagamentoColetada: boolean;
  /**
   * O que a régua 548 SABE deste pedido. `FORA_DO_ALCANCE` = a régua nunca olhou — nome
   * honesto: ninguém vai perguntar, porque nem entrou no radar (¬"a perguntar", que promete
   * um perguntador que não existe).
   */
  procedenciaRegua: 'CONFIRMADO' | 'REVISAR_MANUAL' | 'RASTREADO' | 'FORA_DO_ALCANCE';
  /** TRAVA #326: o mesmo CNJ com pedidos de pacientes DIFERENTES — casar pagamento ao pedido
   *  errado é o dano que a trava impede. A linha vem MARCADA, ¬omitida. */
  cnjCompartilhado: boolean;
}

export interface PerdasComPagamentoResposta {
  itens: PerdaComPagamentoItem[];
  /** Dimensão 1 (régua). Soma == total — as duas dimensões são partições de verdade. */
  resumoRegua: Partial<Record<PerdaComPagamentoItem['procedenciaRegua'], number>>;
  /** Dimensão 2 (nossa coleta), ORTOGONAL à primeira. Soma == total. */
  resumoColeta: { comDataColetada: number; semDataColetada: number };
  cnjCompartilhado: number;
  semProfissional: number;
  /** A fila que o @R pode de fato cobrar (192 − 88 em 09/09). */
  comProfissional: number;
  total: number;
}

export async function getPerdasComPagamento(): Promise<PerdasComPagamentoResposta> {
  const { data } = await api.get<PerdasComPagamentoResposta>('/orders/perdas-com-pagamento/');
  return data;
}
