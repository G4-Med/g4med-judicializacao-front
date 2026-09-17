export type UserGroup =
  | 'ADMIN'
  | 'GERENTE'
  | 'JURIDICO'
  | 'MEDICO'
  | 'SUPERVISOR'
  | 'SECRETARIA';

export type ScreenKey =
  | 'home'
  | 'dashboard'
  | 'processos'
  | 'clientes'
  | 'juridico'
  | 'selecionarMedico'
  | 'orcamentoMedico'
  | 'paraProtocolar'
  | 'protocolados'
  | 'segredoJustica'
  | 'resultados'
  | 'aguardandoCirurgia'
  | 'resultadosFinanceiros'
  | 'perdas'
  | 'emails'
  | 'relatorioResumido'
  | 'relatorioConsolidado'
  | 'usuarios'
  | 'configuracoes'
  | 'configuracoesEmails'
  | 'monitorIntegracao'
  | 'logs'
  | 'processoOperacional'
  | 'funil'
  | 'sla'
  | 'notificacoesHistorico'
  | 'lixeira'
  | 'orcamentosTerceiros'
  | 'centralEmails';

export type ReportKey = 'relatorioResumido' | 'relatorioConsolidado';

interface GroupPermissionConfig {
  view: ScreenKey[];
  edit: ScreenKey[];
  exportReports: ReportKey[];
  allMedicos: boolean;
}

export const GROUP_PERMISSIONS: Record<UserGroup, GroupPermissionConfig> = {
  ADMIN: {
    view: [
      'funil',
      'sla',
      'notificacoesHistorico',
      'processoOperacional',
      'home',
      'dashboard',
      'processos',
      'clientes',
      'juridico',
      'selecionarMedico',
      'orcamentoMedico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'emails',
      'relatorioResumido',
      'relatorioConsolidado',
      'usuarios',
      'configuracoes',
      'configuracoesEmails',
      'monitorIntegracao',
      'logs',
      'lixeira',
      'orcamentosTerceiros',
      'centralEmails',
    ],
    edit: [
      'lixeira',
      'home',
      'dashboard',
      'processos',
      'clientes',
      'juridico',
      'selecionarMedico',
      'orcamentoMedico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'emails',
      'relatorioResumido',
      'relatorioConsolidado',
      'usuarios',
      'configuracoes',
      'configuracoesEmails',
      'monitorIntegracao',
      'logs',
    ],
    exportReports: ['relatorioResumido', 'relatorioConsolidado'],
    allMedicos: true,
  },
  GERENTE: {
    view: [
      'funil',
      'sla',
      'notificacoesHistorico',
      'processoOperacional',
      'home',
      'dashboard',
      'processos',
      'clientes',
      'juridico',
      'selecionarMedico',
      'orcamentoMedico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'relatorioResumido',
      'relatorioConsolidado',
      'lixeira',
      'orcamentosTerceiros',
      'centralEmails',
      'configuracoesEmails',
    ],
    // Gerente era 100% somente-leitura por padrão — mas na prática precisa agir na
    // tela de orçamento médico (enviar orçamento, solicitar exames, recusar o
    // procedimento), em para protocolar (editar/protocolar/não protocolar) e em
    // protocolados (acompanhamento + decisão ganho/perda), achado 26/08 ao vivo
    // em produção (modal/tela sem nenhum botão de ação).
    edit: ['orcamentoMedico', 'paraProtocolar', 'protocolados', 'lixeira'],
    exportReports: ['relatorioResumido', 'relatorioConsolidado'],
    allMedicos: true,
  },
  JURIDICO: {
    view: [
      'funil',
      'sla',
      'notificacoesHistorico',
      'processoOperacional',
      'home',
      'clientes',
      'juridico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'relatorioResumido',
      'relatorioConsolidado',
      'lixeira',
      'orcamentosTerceiros',
      'centralEmails',
      'configuracoesEmails',
    ],
    edit: ['clientes', 'juridico', 'paraProtocolar', 'protocolados', 'segredoJustica', 'lixeira'],
    exportReports: ['relatorioResumido', 'relatorioConsolidado'],
    allMedicos: true,
  },
  MEDICO: {
    view: [
      'processoOperacional',
      'home',
      'orcamentoMedico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'relatorioResumido',
      'relatorioConsolidado',
    ],
    edit: ['home', 'orcamentoMedico'],
    exportReports: ['relatorioResumido', 'relatorioConsolidado'],
    allMedicos: false,
  },
  SUPERVISOR: {
    view: [
      'funil',
      'sla',
      'notificacoesHistorico',
      'processoOperacional',
      'home',
      'juridico',
      'selecionarMedico',
      'orcamentoMedico',
      'paraProtocolar',
      'protocolados',
      'segredoJustica',
      'resultados',
      'aguardandoCirurgia',
      'resultadosFinanceiros',
      'perdas',
      'relatorioResumido',
      'relatorioConsolidado',
    ],
    edit: [],
    exportReports: ['relatorioResumido', 'relatorioConsolidado'],
    allMedicos: false,
  },
  SECRETARIA: {
    view: ['processoOperacional', 'home', 'selecionarMedico'],
    edit: ['selecionarMedico'],
    exportReports: [],
    allMedicos: false,
  },
};

export const SCREEN_PATHS: Record<ScreenKey, string> = {
  home: '/home',
  dashboard: '/dashboard',
  processos: '/processos',
  clientes: '/clientes',
  juridico: '/juridico',
  selecionarMedico: '/selecionar-medico',
  orcamentoMedico: '/orcamento-medico',
  paraProtocolar: '/para-protocolar',
  protocolados: '/protocolados',
  segredoJustica: '/segredo-justica',
  resultados: '/resultados',
  aguardandoCirurgia: '/aguardando-cirurgia',
  resultadosFinanceiros: '/resultados-financeiros',
  perdas: '/perdas',
  emails: '/emails',
  relatorioResumido: '/relatorios/resumido',
  relatorioConsolidado: '/relatorios/consolidado',
  usuarios: '/usuarios',
  configuracoes: '/configuracoes',
  configuracoesEmails: '/configuracoes-emails',
  monitorIntegracao: '/monitor-integracao',
  logs: '/logs',
  processoOperacional: '/processo-operacional',
  funil: '/funil',
  sla: '/sla',
  notificacoesHistorico: '/notificacoes-historico',
  lixeira: '/lixeira',
  orcamentosTerceiros: '/orcamentos-terceiros',
  centralEmails: '/central-emails',
};

export const SCREEN_ORDER: ScreenKey[] = [
  'home',
  'dashboard',
  'processos',
  'clientes',
  'juridico',
  'selecionarMedico',
  'orcamentoMedico',
  'paraProtocolar',
  'protocolados',
  'segredoJustica',
  'resultados',
  'aguardandoCirurgia',
  'resultadosFinanceiros',
  'perdas',
  'emails',
  'relatorioResumido',
  'relatorioConsolidado',
  'usuarios',
  'configuracoes',
  'configuracoesEmails',
  'monitorIntegracao',
  'logs',
  'lixeira',
  'orcamentosTerceiros',
  'centralEmails',
];

export const DEFAULT_GROUP: UserGroup = 'SECRETARIA';

export function normalizeGroupName(value: unknown): UserGroup | null {
  if (typeof value !== 'string') return null;

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .trim();

  if (normalized === 'ADMIN') return 'ADMIN';
  if (normalized === 'GERENTE' || normalized === 'GERENCIA' || normalized === 'MANAGER') return 'GERENTE';
  if (normalized === 'JURIDICO') return 'JURIDICO';
  if (normalized === 'MEDICO' || normalized === 'MEDICOS') return 'MEDICO';
  if (normalized === 'SUPERVISOR') return 'SUPERVISOR';
  if (normalized === 'SECRETARIA' || normalized === 'SECRETARIAS') return 'SECRETARIA';

  return null;
}

export function canViewScreen(group: UserGroup, screen: ScreenKey) {
  return GROUP_PERMISSIONS[group].view.includes(screen);
}

export function canEditScreen(group: UserGroup, screen: ScreenKey) {
  return GROUP_PERMISSIONS[group].edit.includes(screen);
}

export function canExportReport(group: UserGroup, report: ReportKey) {
  return GROUP_PERMISSIONS[group].exportReports.includes(report);
}

export function canSeeAllMedicos(group: UserGroup) {
  return GROUP_PERMISSIONS[group].allMedicos;
}

export function getDefaultRouteForGroup(group: UserGroup) {
  const screen = SCREEN_ORDER.find((item) => canViewScreen(group, item)) ?? 'home';
  return SCREEN_PATHS[screen];
}
