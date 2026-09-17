import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './homeOnboarding.css';
import { useAccess } from '../../access/AccessContext';
import { readAuthProfile } from '../../access/authProfile';
import { useMenuControl } from '../layout/MenuControlContext';
import { HOME_ONBOARDING_STEPS } from './homeOnboardingSteps';

// Mesma convenção de chave do PrimeiraVisitaInfo (mc_1a_visita_<id>_<usuario>) —
// "rever tour" no perfil só precisa apagar esta chave (Header.tsx).
export function chaveOnboardingHome(usuario: string) {
  return `mc_1a_visita_home-onboarding_${usuario || 'anonimo'}`;
}

const ATRASO_TRANSICAO_MENU_MS = 280; // Menu.css: transition transform .22s ease

export function useHomeOnboarding() {
  const { canView } = useAccess();
  const menu = useMenuControl();
  const menuAbertoRef = useRef(false);

  const iniciarTour = useCallback(() => {
    const passos = HOME_ONBOARDING_STEPS.filter(
      (passo) => !passo.requiredScreen || canView(passo.requiredScreen),
    );
    if (!passos.length) return;

    menuAbertoRef.current = false;
    menu.close();

    const marcarVisto = () => {
      try {
        const usuario = readAuthProfile()?.username ?? '';
        localStorage.setItem(chaveOnboardingHome(usuario), '1');
      } catch {
        /* sem storage: tour volta a aparecer na próxima visita — aceitável */
      }
    };

    const instancia = driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: 'Concluir',
      progressText: '{{current}} de {{total}}',
      popoverClass: 'mc-onboarding-popover',
      onDestroyed: () => {
        menu.close();
        marcarVisto();
      },
      steps: passos.map((passo) => ({
        element: passo.selector,
        popover: {
          title: passo.popover.title,
          description: passo.popover.description,
          side: passo.popover.side,
          align: passo.popover.align,
        },
        onHighlightStarted: (_el, _step, opts) => {
          const precisaMenuAberto = !!passo.openMenu;
          if (precisaMenuAberto === menuAbertoRef.current) return;
          menuAbertoRef.current = precisaMenuAberto;
          if (precisaMenuAberto) menu.open();
          else menu.close();
          // aguarda a transição CSS do off-canvas antes de reposicionar o spotlight
          setTimeout(() => opts.driver.refresh(), ATRASO_TRANSICAO_MENU_MS);
        },
      })),
    });

    instancia.drive();
  }, [canView, menu]);

  // Auto-dispara na 1ª visita à Home (por usuário/navegador)
  useEffect(() => {
    const usuario = readAuthProfile()?.username ?? '';
    const chave = chaveOnboardingHome(usuario);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!localStorage.getItem(chave)) {
        timer = setTimeout(iniciarTour, 600);
      }
    } catch {
      /* sem storage: não força tour automático */
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { iniciarTour };
}
