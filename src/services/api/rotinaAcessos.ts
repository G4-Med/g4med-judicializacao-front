import api from './../api';

/** @R 22/09 18:18 — histórico de login e quem está ativo. Back: backend/rotina_acessos.py (só Admin/Gerente; 403 aos demais). */
export interface LoginDia { usuario: string; nome: string; grupo: string | null; em: string; ip: string | null; aparelho: string | null }
export interface PessoaAgora {
  usuario: string; nome: string; grupo: string | null;
  ultimoLogin: string | null; ultimaAtividade: string | null; logado: boolean; ativo: boolean;
  /** @R 22/09 19:25: a última alteração GRAVADA (ação efetiva), ≠ ultimaAtividade (qualquer requisição). */
  ultimaAlteracao?: { em: string; pedido: number | null; paciente: string | null; campo: string; de: string | null; para: string | null } | null;
  alteracoesHoje?: number;
}
export interface Acessos {
  dia: string; logins: LoginDia[]; mes: { dia: string; logins: number; pessoas: number }[];
  agora: PessoaAgora[]; ativosAgora: number; logadosAgora: number;
  regras: { ativoMinutos: number; logadoHoras: number }; historicoDesde: string | null;
}
export const getAcessos = (dia?: string) => api.get<Acessos>('/kpis/acessos/', { params: dia ? { dia } : {} });

/** @R 22/09 18:19 — a rotina dos dados do Estado, etapa por etapa. */
export type Situacao = 'ok' | 'atencao' | 'parado' | 'sem_info';
export interface EtapaRotina {
  chave: string; nome: string; oQueFaz: string; agenda: string; ultimaExecucao: string | null;
  resultado: string; proximaExecucao: string | null; situacao: Situacao; detalhe: string | null;
}
export interface RotinaDadosEstado {
  medidoEm: string; resumo: { ok: boolean; texto: string }; etapas: EtapaRotina[];
  historico: { ts: string; rc: number | null; etapa: string | null; mensagem: string | null; portalVazio: boolean; coletaMaxEmpenho: string | null }[];
}
export const getRotinaDadosEstado = () => api.get<RotinaDadosEstado>('/kpis/rotina-dados-estado/');
