/**
 * A RÉGUA DAS FASES — um lugar só, porque duas cópias sempre divergem.
 *
 * POR QUE ESTE ARQUIVO EXISTE (@R 17/09/2026): a home dizia "775 pedidos em aberto" e a
 * dashboard calculava "em aberto" e "clientes ativos" pela mesma régua torta, cada uma
 * com sua cópia da regra. A régua era por SUBTRAÇÃO — "tudo que não é Ganho nem Perda" —
 * e isso varre para dentro do número os registros de carga histórica.
 *
 * Medido em produção (17/09, 1.158 pedidos):
 *   Histórico - Base Antiga  371  ·  Histórico - Sem Rastro  195   = 566 (49% da base)
 *   fases vivas: Aguardando Resposta 94 · Enviado à SES 58 · Orçamento 45 ·
 *                Protocolar 9 · Jurídico 3                          = 209
 *
 * SUBTRAÇÃO vs INCLUSÃO é a decisão central: com subtração, qualquer status novo (ou um
 * legado que apareça amanhã) entra no "em aberto" sozinho, sem ninguém decidir. Com
 * inclusão, para entrar alguém precisa escrevê-lo aqui, de propósito — e quem escrever
 * lê este comentário antes.
 */

/** As fases do funil onde existe trabalho a fazer. Espelha `backend/status_canon.py`. */
export const FASES_EM_ABERTO = [
  'Aguardando Juridico',
  'Aguardando Orçamento',
  'Aguardando Protocolar',
  'Aguardando Resposta',
  'Aguardando Resposta - Segredo de Justiça',
  'Enviado à SES - Sem Protocolo',
] as const;

/** Carga anterior ao sistema: tem data e valor, mas ninguém trabalha nela. */
export const FASES_HISTORICAS = [
  'Histórico - Base Antiga',
  'Histórico - Sem Rastro',
] as const;

export const estaEmAberto = (statusProcesso?: string | null): boolean =>
  FASES_EM_ABERTO.includes((statusProcesso ?? '') as typeof FASES_EM_ABERTO[number]);

export const ehHistorico = (statusProcesso?: string | null): boolean =>
  FASES_HISTORICAS.includes((statusProcesso ?? '') as typeof FASES_HISTORICAS[number]);

/** Ganho e Perda são DESFECHOS — não estão em aberto, mas também não são histórico. */
export const temDesfecho = (statusProcesso?: string | null): boolean =>
  statusProcesso === 'Ganho' || statusProcesso === 'Perda';
