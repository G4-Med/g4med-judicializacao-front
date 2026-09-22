import api from './../api';

/** @R 22/09 18:18 — histórico de login e quem está ativo. Back: backend/rotina_acessos.py (só Admin/Gerente; 403 aos demais). */
export interface LoginDia {
  usuario: string; nome: string; grupo: string | null; em: string; ip: string | null; aparelho: string | null;
  /** #634: lidos do user-agent no login (o que o navegador declara) */
  navegador?: string | null; navegadorVersao?: string | null; sistema?: string | null; dispositivo?: string | null;
  /** localização do navegador: PENDENTE (ainda não respondeu) | CONCEDIDA | NEGADA | INDISPONIVEL */
  localizacaoStatus?: string; latitude?: number | null; longitude?: number | null; precisaoM?: number | null;
  /** por que o navegador não deu: PERMISSION_DENIED | POSITION_UNAVAILABLE | TIMEOUT | SEM_API */
  localizacaoMotivo?: string | null;
  /** @R 22/09 23:47 "sem avisar": estimativa pelo IP, feita no servidor sem perguntar nada à pessoa */
  localizacaoIP?: LocalizacaoIP | null;
}

export interface LocalizacaoIP {
  fonte: 'ip'; cidade: string | null; uf: string | null; pais: string | null; provedor: string | null;
  latitude: number | null; longitude: number | null;
}

const MOTIVO_TXT: Record<string, string> = {
  PERMISSION_DENIED: 'a pessoa negou no navegador',
  POSITION_UNAVAILABLE: 'localização do computador/celular desligada',
  TIMEOUT: 'o aparelho não respondeu em 15 s',
  SEM_API: 'navegador sem localização',
};

/** Uma frase só para as 2 telas (Acessos e perfil). O ponto do navegador vence; sem ele, a estimativa pelo IP
 *  aparece SEMPRE com o rótulo "estimada pelo IP" e o provedor — em IP residencial ela costuma ser a cidade onde
 *  o provedor registrou o bloco, não a casa da pessoa (medido 22/09: login em MG saiu "Itapetininga/SP · Claro"). */
export function descreverLocalizacao(o: {
  localizacaoStatus?: string | null; latitude?: number | null; longitude?: number | null; precisaoM?: number | null;
  localizacaoMotivo?: string | null; localizacaoIP?: LocalizacaoIP | null;
}): { texto: string; mapa: string | null; dica: string } {
  if (o.localizacaoStatus === 'CONCEDIDA' && o.latitude != null && o.longitude != null) {
    return { texto: `localização do navegador${o.precisaoM != null ? ` (±${Math.round(o.precisaoM)} m)` : ''}`,
      mapa: `https://www.google.com/maps?q=${o.latitude},${o.longitude}`, dica: 'Ponto enviado pelo navegador, autorizado pela pessoa.' };
  }
  const porque = o.localizacaoMotivo ? MOTIVO_TXT[o.localizacaoMotivo] : null;
  const nav = o.localizacaoStatus === 'NEGADA' ? 'navegador: negada'
    : o.localizacaoStatus === 'INDISPONIVEL' ? `navegador: indisponível${porque ? ` (${porque})` : ''}`
      : 'navegador: sem resposta';
  const ip = o.localizacaoIP;
  if (ip && (ip.cidade || ip.uf || ip.provedor)) {
    const lugar = [ip.cidade?.replace(/\s*\(.*\)$/, ''), ip.uf].filter(Boolean).join('/');
    return {
      texto: `estimada pelo IP: ${lugar || ip.pais || '?'}${ip.provedor ? ` · ${ip.provedor}` : ''}`,
      mapa: ip.latitude != null && ip.longitude != null ? `https://www.google.com/maps?q=${ip.latitude},${ip.longitude}` : null,
      dica: `Estimativa pelo IP, sem perguntar à pessoa. É a região do PROVEDOR, não a casa de quem entrou — pode ser outra cidade. ${nav}.`,
    };
  }
  return { texto: `localização ${nav.replace('navegador: ', '')}`, mapa: null, dica: nav };
}
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
