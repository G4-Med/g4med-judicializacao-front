import type { MenuItem } from 'primereact/menuitem';
import type { NavigateFunction } from 'react-router-dom';
import type { ScreenKey } from '../../access/permissions';

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

export const MENU_CONFIG: MenuConfigItem[] = [
  { label: 'Home', icon: 'pi pi-home', path: '/home', screen: 'home' },
  { label: 'Dashboard', icon: 'pi pi-chart-bar', path: '/dashboard', screen: 'dashboard' },
  { label: 'Processos', icon: 'pi pi-briefcase', path: '/processos', screen: 'processos' },
  { label: 'Clientes', icon: 'pi pi-users', path: '/clientes', screen: 'clientes' },
  {
    label: 'Protocolos',
    icon: 'pi pi-file-edit',
    children: [
      { label: 'Jurídico', icon: 'pi pi-angle-right', path: '/juridico', screen: 'juridico' },
      { label: 'Selecionar Médico', icon: 'pi pi-angle-right', path: '/selecionar-medico', screen: 'selecionarMedico' },
      { label: 'Orçamento Médico', icon: 'pi pi-angle-right', path: '/orcamento-medico', screen: 'orcamentoMedico' },
      { label: 'Protocolar', icon: 'pi pi-angle-right', path: '/para-protocolar', screen: 'paraProtocolar' },
      { label: 'Protocolados', icon: 'pi pi-angle-right', path: '/protocolados', screen: 'protocolados' },
      { label: 'Env. à SES S/Prot', icon: 'pi pi-angle-right', path: '/enviado-ses', screen: 'protocolados' },
    ],
  },
  {
    label: 'Resultados',
    icon: 'pi pi-chart-line',
    children: [
      { label: 'Resultados', icon: 'pi pi-angle-right', path: '/resultados', screen: 'resultados' },
      { label: 'Perdas', icon: 'pi pi-angle-right', path: '/perdas', screen: 'perdas' },
    ],
  },
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
      { label: 'Logs', icon: 'pi pi-angle-right', path: '/logs', screen: 'logs' },
    ],
  },
];

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

  return MENU_CONFIG.flatMap((item) => {
    if (isGroup(item)) {
      const visibleChildren = item.children.filter((child) => canView(child.screen));
      if (!visibleChildren.length) return [];

      return [
        {
          label: item.label,
          icon: item.icon,
          className: visibleChildren.some((child) => child.path === currentPath) ? 'menu-active-item' : '',
          items: visibleChildren.map((child) => ({
            label: child.label,
            icon: child.icon,
            command: () => go(child.path),
            className: child.path === currentPath ? 'menu-active-item' : '',
          })),
        } as MenuItem,
      ];
    }

    if (!canView(item.screen)) return [];

    return [
      {
        label: item.label,
        icon: item.icon,
        command: () => go(item.path),
        className: currentPath === item.path || (item.path === '/home' && currentPath === '/') ? 'menu-active-item' : '',
      } as MenuItem,
    ];
  });
}
