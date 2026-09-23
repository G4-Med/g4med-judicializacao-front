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
/** Imagem colada no chat (#662). O arquivo só sai pela API com o token (os 2 da conversa) — nunca por <img src> direto. */
export interface ImagemChat { id: number; tipo: string; tamanho: number; nome: string }
export interface MensagemChat {
  id: number;
  imagens?: ImagemChat[];
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
export const enviarMensagem = (corpo: { para: number; texto: string; pedidoId: number | null; clienteId: string },
  imagens: File[] = []) => {
  if (!imagens.length) return api.post<MensagemChat>('/mensagens/', corpo);
  const f = new FormData();
  f.append('para', String(corpo.para)); f.append('texto', corpo.texto); f.append('clienteId', corpo.clienteId);
  if (corpo.pedidoId != null) f.append('pedidoId', String(corpo.pedidoId));
  imagens.forEach((a) => f.append('imagens', a, a.name || 'imagem.png'));
  return api.post<MensagemChat>('/mensagens/', f);
};
export const baixarImagemChat = (mid: number, iid: number) =>
  api.get<Blob>(`/mensagens/${mid}/imagens/${iid}/`, { responseType: 'blob' });
export const marcarLidas = (ids: number[]) => api.post<{ marcadas: number }>('/mensagens/lidas/', { ids });
// POST, não GET: o termo pode ser nome de paciente e a URL vai para o log do servidor.
export const buscarPedidoChat = (q: string) => api.post<PedidoBusca[]>('/mensagens/buscar-pedido/', { q });

/** Resumo do chat por IA que vira quadro de tarefas (@R 23/09 15:13/15:14). */
export type PeriodoResumo = 'dia' | 'semana' | 'mes';
export interface TarefaQuadro { tarefa: string; responsavel: string; prazo: string; pedidos: number[] }
export interface PontoQuadro { assunto: string; levantadoPor: string; situacao: string; comQuem: string; proximoPasso: string; pedidos: number[] }
export interface ConteudoQuadro {
  vazio?: boolean; resumo?: string; periodo: PeriodoResumo; desde?: string; com?: string; foco?: string;
  pontos?: PontoQuadro[]; tarefas?: TarefaQuadro[]; emQuePonto?: { nome: string; situacao: string }[];
  analisadas?: number; total?: number; cortadas?: number;
}
export interface QuadroTarefas {
  id: number; criadoEm: string; periodo: PeriodoResumo; foco: string | null; criadoPor: string; com: string;
  meu: boolean; nTarefas: number; resumo: string; conteudo?: ConteudoQuadro;
}
export const resumirConversa = (uid: number, periodo: PeriodoResumo, foco: string) =>
  api.post<ConteudoQuadro & { id?: number; criadoEm?: string }>(`/mensagens/resumir/${uid}/`, { periodo, foco });
export const getQuadrosTarefas = () => api.get<QuadroTarefas[]>('/mensagens/quadros/');
export const excluirQuadroTarefas = (id: number) => api.delete(`/mensagens/quadros/${id}/`);
