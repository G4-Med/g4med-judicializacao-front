import api from './../api';

/** Petição de juntada do orçamento (#641). Back: backend/peticao.py.
 *  O rascunho nasce dos dados do pedido (orçamento vigente); a advogada edita e baixa em Word
 *  (modelo dela) ou em PDF com o orçamento anexado. O que o sistema não sabe vem em `pendencias`
 *  e como ⟦CONFERIR⟧ no texto — nunca um valor inventado. */
export type TipoParagrafo = 'cabecalho' | 'processo' | 'corpo' | 'titulo' | 'centro' | 'vazio';
export interface Paragrafo { tipo: TipoParagrafo; texto: string }
export interface ConferenciaPeticao {
  ok: boolean;
  motivo: string | null;
  linhas: { fonte: string; valor: number | null }[];
  parcelas?: { nome: string; valor: number }[];
  versao?: number | null;
}
export interface CampoPeticao { chave: string; rotulo: string; sugestao: string; ajuda: string; trechoSeVazio: string | null }
export interface EstadoPeticao {
  orderId: number;
  paragrafos: Paragrafo[];
  /** o que o sistema não sabe: cada ⟦CHAVE⟧ do texto vira um input */
  campos: CampoPeticao[];
  valores: Record<string, string>;
  faltando: string[];
  salva: { por: string; em: string; orcamentoIdNaEdicao: number | null; orcamentoMudou: boolean } | null;
  pendencias: string[];
  conferencia: ConferenciaPeticao;
  advogada: { nome: string; oab: string };
}

export const getPeticao = (pedido: number) => api.get<EstadoPeticao>(`/orders/${pedido}/peticao/`);
export const salvarPeticao = (pedido: number, paragrafos: Paragrafo[], valores: Record<string, string>) =>
  api.post<EstadoPeticao>(`/orders/${pedido}/peticao/`, { paragrafos, valores });
export const refazerPeticao = (pedido: number) => api.post<EstadoPeticao>(`/orders/${pedido}/peticao/refazer/`);
export const baixarPeticaoDocx = (pedido: number) =>
  api.get(`/orders/${pedido}/peticao/docx/`, { responseType: 'blob' });
/** Arquivo para peticionar: petição → e-mail da SES que pediu o orçamento → orçamento (409 se falta o PDF do orçamento). */
export const baixarPeticaoPdf = (pedido: number, o: { somente?: boolean; email?: boolean; orcamento?: boolean } = {}) => {
  const q = o.somente ? '?somente=peticao' : `?email=${o.email === false ? 0 : 1}&orcamento=${o.orcamento === false ? 0 : 1}`;
  return api.get(`/orders/${pedido}/peticao/pdf/${q}`, { responseType: 'blob' });
};

/** Só as folhas que vão JUNTO (e-mail da SES + orçamento), para mostrar abaixo da petição na área de edição (@R 23/09). */
export const previaFolhasAnexas = (pedido: number, o: { email: boolean; orcamento: boolean }) =>
  api.get(`/orders/${pedido}/peticao/pdf/?somente=anexos&email=${o.email ? 1 : 0}&orcamento=${o.orcamento ? 1 : 0}`,
    { responseType: 'blob' });
