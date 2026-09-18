import type { MenuItem } from 'primereact/menuitem';
import type { NavigateFunction } from 'react-router-dom';
import type { ScreenKey } from '../../access/permissions';
import { ETAPAS } from '../../pages/processoOperacional/conteudo';

// Pedido @R 26/08: o menu lateral usa o MESMO número da regra do Processo
// Operacional (SSOT em conteudo.ts) — assim quem opera (ex.: Yago) liga o item
// do menu à regra numerada sem precisar decorar qual etapa é qual. Derivado, não
// duplicado: se a numeração mudar em conteudo.ts, o menu acompanha sozinho.
const NUMERO_REGRA_POR_PATH: Record<string, number> = Object.fromEntries(
  ETAPAS.filter((etapa) => etapa.rota).map((etapa) => [etapa.rota as string, etapa.numero]),
);

// Mesmo pedido — quem é dono de cada etapa (G4MED ou Instituto Mateus), pra um
// hint visual no menu (26/08). Derivado do MESMO SSOT, mesma razão do número.
export const DONO_POR_PATH: Record<string, 'INSTITUTO' | 'G4MED'> = Object.fromEntries(
  ETAPAS.filter((etapa) => etapa.rota).map((etapa) => [etapa.rota as string, etapa.dono]),
);

interface MenuLeafConfig {
  label: string;
  icon?: string;
  path: string;
  screen: ScreenKey;
}

interface MenuGroupConfig {
  label: string;
  icon: string;
  children: MenuLeafConfig[];
}

type MenuConfigItem = MenuLeafConfig | MenuGroupConfig;

const isGroup = (item: MenuConfigItem): item is MenuGroupConfig => 'children' in item;

export const MENU_CONFIG_CLEAN: MenuConfigItem[] = [
  { label: 'Processo Operacional', icon: 'pi pi-book', path: '/processo-operacional', screen: 'processoOperacional' },
  { label: 'Home', icon: 'pi pi-home', path: '/home', screen: 'home' },
  { label: 'Dashboard', icon: 'pi pi-chart-bar', path: '/dashboard', screen: 'dashboard' },
  { label: 'Funil', icon: 'pi pi-filter', path: '/funil', screen: 'funil' },
  { label: 'SLA', icon: 'pi pi-clock', path: '/sla', screen: 'sla' },
  { label: 'Notificações', icon: 'pi pi-bell', path: '/notificacoes-historico', screen: 'notificacoesHistorico' },
  { label: 'Base de Processos', icon: 'pi pi-briefcase', path: '/processos', screen: 'processos' },
  { label: 'Acervo de preços', icon: 'pi pi-dollar', path: '/orcamentos-terceiros', screen: 'orcamentosTerceiros' },
  { label: 'Central de E-mails', icon: 'pi pi-inbox', path: '/central-emails', screen: 'centralEmails' },
  { label: 'Lixeira', icon: 'pi pi-trash', path: '/lixeira', screen: 'lixeira' },
  { label: 'Clientes', icon: 'pi pi-users', path: '/clientes', screen: 'clientes' },
  {
    label: 'Processo SES-MG',
    icon: 'pi pi-file-edit',
    children: [
      { label: 'Análise Jurídica', icon: 'pi pi-angle-right', path: '/juridico', screen: 'juridico' },
      { label: 'Selecionar Médico', icon: 'pi pi-angle-right', path: '/selecionar-medico', screen: 'selecionarMedico' },
      { label: 'Orçamento Médico', icon: 'pi pi-angle-right', path: '/orcamento-medico', screen: 'orcamentoMedico' },
      { label: 'Protocolar', icon: 'pi pi-angle-right', path: '/para-protocolar', screen: 'paraProtocolar' },
      { label: 'Protocolados', icon: 'pi pi-angle-right', path: '/protocolados', screen: 'protocolados' },
      // sub-item de Protocolados: caminho IRMÃO, ¬passo seguinte (ver conteudo.ts, 5.1)
      { label: 'Enviados sem protocolar', icon: 'pi pi-angle-double-right', path: '/enviado-ses', screen: 'protocolados' },
    ],
  },
  // RESULTADOS — 1 entrada, 5 abas (@R 08/09, olhando a tela: ⟦não era melhor tirar
  // resultados, aguardando cirurgia, resultados financeiros e perdas e ter tudo ali uma
  // coisa só⟧). Eram 4 sub-itens para UM assunto; quem procurava "quanto é nosso" tinha
  // que adivinhar em qual dos 4 olhar — e a resposta não estava em nenhum deles.
  // As rotas antigas continuam existindo como redirect (AppRoutes.tsx), então link velho
  // salvo no navegador de alguém ainda abre a aba certa.
  { label: 'Resultados', icon: 'pi pi-chart-line', path: '/painel-resultados', screen: 'resultados' },
  { label: 'Emails', icon: 'pi pi-envelope', path: '/emails', screen: 'emails' },
  {
    label: 'Relatórios',
    icon: 'pi pi-file-pdf',
    children: [
      { label: 'Relatório Resumido', icon: 'pi pi-angle-right', path: '/relatorios/resumido', screen: 'relatorioResumido' },
      { label: 'Relatório Consolidado', icon: 'pi pi-angle-right', path: '/relatorios/consolidado', screen: 'relatorioConsolidado' },
    ],
  },
  {
    label: 'Admin',
    icon: 'pi pi-cog',
    children: [
      { label: 'Usuários', icon: 'pi pi-angle-right', path: '/usuarios', screen: 'usuarios' },
      { label: 'Configurações', icon: 'pi pi-angle-right', path: '/configuracoes', screen: 'configuracoes' },
      { label: 'Configurações Emails', icon: 'pi pi-angle-right', path: '/configuracoes-emails', screen: 'configuracoesEmails' },
      { label: 'Colunas das tabelas', icon: 'pi pi-angle-right', path: '/configuracoes-colunas', screen: 'configuracoes' },
      { label: 'Monitor de Integração', icon: 'pi pi-angle-right', path: '/monitor-integracao', screen: 'monitorIntegracao' },
      { label: 'Logs', icon: 'pi pi-angle-right', path: '/logs', screen: 'logs' },
    ],
  },
];

function rotularComNumeroDaRegra(label: string, path: string): string {
  const numero = NUMERO_REGRA_POR_PATH[path];
  if (!numero) return label;
  // sub-fase (5.1) entra sem o ponto final, para não virar "5.1." — e a vírgula decimal
  // é a do português, que é como o número aparece escrito em todo o resto da tela.
  const ehSub = !Number.isInteger(numero);
  return ehSub ? `${String(numero).replace('.', ',')} ${label}` : `${numero}. ${label}`;
}

export function buildMenuItems({
  navigate,
  currentPath,
  canView,
  onNavigate,
}: {
  navigate: NavigateFunction;
  currentPath: string;
  canView: (screen: ScreenKey) => boolean;
  onNavigate?: () => void;
}): MenuItem[] {
  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return MENU_CONFIG_CLEAN.flatMap((item) => {
    if (isGroup(item)) {
      const visibleChildren = item.children.filter((child) => canView(child.screen));
      if (!visibleChildren.length) return [];

      return [
        {
          label: item.label,
          icon: item.icon,
          className: visibleChildren.some((child) => child.path === currentPath) ? 'menu-active-item' : '',
          items: visibleChildren.map((child) => ({
            label: rotularComNumeroDaRegra(child.label, child.path),
            icon: child.icon,
            command: () => go(child.path),
            className: child.path === currentPath ? 'menu-active-item' : '',
            dono: DONO_POR_PATH[child.path],
          })),
        } as MenuItem,
      ];
    }

    if (!canView(item.screen)) return [];

    return [
      {
        label: rotularComNumeroDaRegra(item.label, item.path),
        icon: item.icon,
        command: () => go(item.path),
        className: currentPath === item.path || (item.path === '/home' && currentPath === '/') ? 'menu-active-item' : '',
      } as MenuItem,
    ];
  });
}
