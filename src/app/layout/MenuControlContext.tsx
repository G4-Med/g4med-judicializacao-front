import { createContext, useContext, useMemo, useState } from 'react';

interface MenuControlValue {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MenuControlContext = createContext<MenuControlValue | null>(null);

// Ponte entre o Header (botão hamburguer) e quem mais precisa abrir/fechar o
// menu lateral programaticamente — hoje só o onboarding (26/08), que precisa
// abrir o off-canvas para destacar os itens do menu com o driver.js.
export function MenuControlProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const value = useMemo<MenuControlValue>(
    () => ({
      visible,
      open: () => setVisible(true),
      close: () => setVisible(false),
      toggle: () => setVisible((v) => !v),
    }),
    [visible],
  );

  return <MenuControlContext.Provider value={value}>{children}</MenuControlContext.Provider>;
}

export function useMenuControl(): MenuControlValue {
  const ctx = useContext(MenuControlContext);
  if (!ctx) throw new Error('useMenuControl deve ser usado dentro de MenuControlProvider');
  return ctx;
}
