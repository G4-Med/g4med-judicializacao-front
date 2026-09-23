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
export interface EstadoPeticao {
  orderId: number;
  paragrafos: Paragrafo[];
  salva: { por: string; em: string; orcamentoIdNaEdicao: number | null; orcamentoMudou: boolean } | null;
  pendencias: string[];
  marcasAbertas: number;
  conferencia: ConferenciaPeticao;
  advogada: { nome: string; oab: string };
}

export const MARCA_CONFERIR = '⟦CONFERIR⟧';

export const getPeticao = (pedido: number) => api.get<EstadoPeticao>(`/orders/${pedido}/peticao/`);
export const salvarPeticao = (pedido: number, paragrafos: Paragrafo[]) =>
  api.post<EstadoPeticao>(`/orders/${pedido}/peticao/`, { paragrafos });
export const refazerPeticao = (pedido: number) => api.post<EstadoPeticao>(`/orders/${pedido}/peticao/refazer/`);
export const baixarPeticaoDocx = (pedido: number) =>
  api.get(`/orders/${pedido}/peticao/docx/`, { responseType: 'blob' });
/** `somente=true` → só a petição; sem ele o PDF leva o orçamento atrás (409 se o pedido não tem o PDF). */
export const baixarPeticaoPdf = (pedido: number, somente = false) =>
  api.get(`/orders/${pedido}/peticao/pdf/${somente ? '?somente=peticao' : ''}`, { responseType: 'blob' });
