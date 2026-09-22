import api from './../api';

export type TipoAtividade = 'ALTERACAO' | 'REGISTRO' | 'ARQUIVO' | 'DOWNLOAD' | 'PAGINA' | 'LOGIN';

export interface Atividade {
  id: number; em: string; usuario: string | null; acao: string; metodo: string; rota: string;
  pedido: number | null; objeto: number | null; status: number; duracaoMs: number | null; ip: string | null;
  leitura: boolean; tipo: TipoAtividade;
}

export interface AtividadesResposta {
  total: number; itens: Atividade[]; porTipo: Partial<Record<TipoAtividade, number>>;
  porPessoa: { usuario: string | null; acoes: number; ultima: string | null }[];
  desde: string | null; nota: string;
}

export const getAtividades = (params: Record<string, string>) =>
  api.get<AtividadesResposta>('/admin/atividades/', { params });

/** Avisa a tela aberta (a API não vê troca de página no navegador). Falha é silenciosa: auditoria nunca
 *  atrapalha o uso. */
export const registrarPagina = (caminho: string, titulo: string) =>
  api.post('/atividade/pagina/', { caminho, titulo }).catch(() => undefined);
