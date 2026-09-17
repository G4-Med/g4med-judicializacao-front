import type { ScreenKey } from '../../access/permissions';

export interface OnboardingStep {
  id: string;
  /** Seletor CSS do elemento a destacar. Ausente = popover centralizado, sem spotlight. */
  selector?: string;
  /** Só entra no tour se o usuário logado enxergar esta tela (canView). */
  requiredScreen?: ScreenKey;
  /** Este passo precisa do menu lateral aberto para o elemento existir na tela. */
  openMenu?: boolean;
  popover: {
    title: string;
    description: string;
    side?: 'left' | 'right' | 'top' | 'bottom';
    align?: 'start' | 'center' | 'end';
  };
}

// Roteiro aprovado por @R em 26/08 — cada passo aqui é 1 mensagem específica
// já validada; mudar TEXTO/ORDEM é decisão de produto, não só de código.
export const HOME_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'boas-vindas',
    popover: {
      title: 'Bem-vindo ao MedCheck Jurídico!',
      description: 'Vou te mostrar rapidinho como o sistema funciona. Leva menos de 1 minuto — e você pode rever isso quando quiser.',
    },
  },
  {
    id: 'menu-geral',
    selector: '.mc-sidebar__nav',
    openMenu: true,
    popover: {
      title: 'Menu lateral',
      description: 'Aqui fica tudo organizado por área — Processos, Clientes, Protocolos e mais.',
      side: 'right',
      align: 'start',
    },
  },
  {
    id: 'menu-home',
    selector: '[data-tour="menu-home"]',
    requiredScreen: 'home',
    openMenu: true,
    popover: {
      title: 'Você está aqui: Home',
      description: 'A página inicial mostra a visão geral dos casos urgentes.',
      side: 'right',
    },
  },
  {
    id: 'menu-protocolos',
    selector: '[data-tour="menu-protocolos"]',
    requiredScreen: 'juridico',
    openMenu: true,
    popover: {
      title: 'Processo SES-MG',
      description: 'Aqui você conduz o processo: jurídico → médico → protocolar.',
      side: 'right',
    },
  },
  {
    id: 'menu-admin',
    selector: '[data-tour="menu-admin"]',
    requiredScreen: 'usuarios',
    openMenu: true,
    popover: {
      title: 'Administração',
      description: 'Área de administração — usuários, configurações, logs.',
      side: 'right',
    },
  },
  {
    id: 'home-metricas',
    selector: '.home-hero__panel',
    popover: {
      title: 'Indicadores do mês',
      description: 'Esses números mostram o que precisa da sua atenção agora.',
      side: 'left',
    },
  },
  {
    id: 'perfil',
    selector: '.mc-perfil__trigger',
    popover: {
      title: 'Seu perfil',
      description: 'Aqui fica sua sessão — e se quiser rever este tour, é só clicar aqui.',
      side: 'bottom',
      align: 'end',
    },
  },
];
