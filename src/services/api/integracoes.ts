import api from './../api';

export type IntegracaoStatus = 'EXECUTANDO' | 'SUCESSO' | 'ERRO' | null;
export type IntegracaoTriggeredBy = 'CRON' | 'MANUAL';

export interface Integracao {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  ultimaExecucao: string | null;
  ultimaExecucaoFim: string | null;
  ultimaExecucaoStatus: IntegracaoStatus;
  ultimaPedidosCriados: number;
  ultimaTotalProcessados: number;
}

export interface IntegracaoKpis {
  total: number;
  aguardando: number;
  sucesso: number;
  erros: number;
  executando: number;
}

export interface DashboardIntegracoesResposta {
  integracoes: Integracao[];
  kpis: IntegracaoKpis;
}

export interface IntegracaoExecucao {
  id: number;
  integracaoId: number;
  dataInicio: string;
  dataFim: string | null;
  status: Exclude<IntegracaoStatus, null>;
  triggeredBy: IntegracaoTriggeredBy;
  pedidosCriados: number;
  totalProcessados: number;
  sumario: any;
  erroMensagem: string | null;
}

export interface ExecucoesResposta {
  integracao: Integracao;
  page: number;
  pageSize: number;
  total: number;
  execucoes: IntegracaoExecucao[];
}

export interface MonitorEmailConfig {
  id: number;
  intervaloMinutos: number;
  remetentesValidos: string;
  remetentesValidosLista: string[];
  maxPorCiclo: number;
  ativo: boolean;
  updateDate: string;
}

export const getDashboardIntegracoes = () =>
  api.get<DashboardIntegracoesResposta>('/integracoes/dashboard/');

export const getExecucoesIntegracao = (
  integracaoId: number,
  params?: { page?: number; pageSize?: number },
) =>
  api.get<ExecucoesResposta>(`/integracoes/dashboard/${integracaoId}/execucoes/`, { params });

export const executarIntegracao = (integracaoId: number) =>
  api.post(`/integracoes/dashboard/${integracaoId}/executar/`);

export const getMonitorEmailConfig = () =>
  api.get<MonitorEmailConfig>('/integracoes/monitor-email/config/');

export const salvarMonitorEmailConfig = (payload: Partial<{
  intervaloMinutos: number;
  remetentesValidos: string;
  maxPorCiclo: number;
  ativo: boolean;
}>) => api.put<MonitorEmailConfig>('/integracoes/monitor-email/config/', payload);

// Central de E-mails (@R 28/08): saúde do monitor · processados por dia/busca · caixa reconciliada.
export const getCentralSaude = () => api.get('/integracoes/central/saude/');
export const getCentralEmails = (params: Record<string, string>) => api.get('/integracoes/central/emails/', { params });
export const getCentralCaixa = (dias: number) => api.get('/integracoes/central/caixa/', { params: { dias } });
export const postCentralReprocessar = (messageId: string, orderId?: number) => api.post('/integracoes/central/reprocessar/', orderId ? { messageId, orderId } : { messageId });

// Respostas por destinatário (@R 28/08 21:07): o que o sistema montou para cada pessoa que pediu,
// e o que aconteceu com cada uma (fila · enviada · aberta · clicada · devolvida · spam).
export const getCentralRespostas = (params: { q?: string; status?: string; tipo?: string; dias?: number }) =>
  api.get('/integracoes/central/respostas/', { params });

// Thread de um pedido (loop "pedido sem anexo", @R 28/08): anexos + e-mails enviados e recebidos.
/** Cadastro MANUAL de pedido (@R 29/08 13:24): aparece na Análise Jurídica na hora, com selo Manual; sem e-mail automático. */
export const criarPedidoManual = (dados: Record<string, any>) => api.post('/integracoes/pedidos/criar-manual/', dados);
export const getThreadPedido = (orderId: number) => api.get(`/integracoes/central/pedidos/${orderId}/thread/`);
export const postThreadVista = (orderId: number) => api.post(`/integracoes/central/pedidos/${orderId}/thread/vista/`);
// Checkbox do dossiê (v2 ①): OK = equipe confirmou · NA = não se aplica · FALTA = falta mesmo com anexo · null = máquina decide.
export const patchDossie = (orderId: number, payload: Partial<Record<'oficio' | 'relatorio' | 'exames', 'OK' | 'NA' | 'FALTA' | null>>) =>
  api.patch(`/integracoes/central/pedidos/${orderId}/dossie/`, payload);
