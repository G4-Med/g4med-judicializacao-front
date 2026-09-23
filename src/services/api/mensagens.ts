import api from './../api';

/** Mensagens internas 1-a-1 (#632). Back: backend/mensagens.py.
 *  O resumo (pílula do cabeçalho) NÃO traz texto — o centro do cabeçalho é visível a quem passa.
 *  "Lida" é marcada pela LISTA de ids que a tela mostrou (nunca "até o id X"). */
export interface ResumoMensagens {
  naoLidas: number;
  antigas: number;
  ultima: { id: number; deId: number; deNome: string; em: string } | null;
}
export interface ContatoChat { id: number; nome: string; grupo: string; plataformaAberta: boolean }
export interface ConversaChat {
  com: { id: number; nome: string };
  ultima: { id: number; deMim: boolean; previa: string; em: string };
  naoLidas: number;
}
export interface PedidoNaMensagem {
  id: number;
  paciente?: string;
  fase?: string;
  excluido?: boolean;
  semAcesso?: boolean;
  inexistente?: boolean;
}
export interface MensagemChat {
  id: number;
  deMim: boolean;
  texto: string;
  enviadaEm: string;
  lidaEm: string | null;
  pedido: PedidoNaMensagem | null;
  clienteId: string;
}
export interface ConversaAberta {
  com: { id: number; nome: string; participa: boolean };
  mensagens: MensagemChat[];
  temMais: boolean;
}
export interface PedidoBusca { id: number; paciente: string; fase: string }

export const getResumoMensagens = () => api.get<ResumoMensagens>('/mensagens/resumo/');
export const getContatosChat = () => api.get<ContatoChat[]>('/mensagens/contatos/');
export const getConversasChat = () => api.get<ConversaChat[]>('/mensagens/conversas/');
export const getConversaCom = (uid: number, antes?: number) =>
  api.get<ConversaAberta>(`/mensagens/com/${uid}/`, { params: antes ? { antes } : {} });
export const enviarMensagem = (corpo: { para: number; texto: string; pedidoId: number | null; clienteId: string }) =>
  api.post<MensagemChat>('/mensagens/', corpo);
export const marcarLidas = (ids: number[]) => api.post<{ marcadas: number }>('/mensagens/lidas/', { ids });
// POST, não GET: o termo pode ser nome de paciente e a URL vai para o log do servidor.
export const buscarPedidoChat = (q: string) => api.post<PedidoBusca[]>('/mensagens/buscar-pedido/', { q });
