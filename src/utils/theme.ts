// O tema LIGHT (lara-light-blue) já é importado no main.tsx como padrão
// permanente do bundle. Para trocar para DARK em runtime, injetamos um
// <link> adicional apontando pro CSS do tema dark via CDN. Se o CDN
// falhar, o light continua ativo — sem quebrar a UI.
const THEME_LINK_ID = 'app-theme-dark-override';
const DARK_THEME_URL =
  'https://unpkg.com/primereact/resources/themes/lara-dark-blue/theme.css';

export function setTheme(theme: 'light' | 'dark') {
  const existing = document.getElementById(THEME_LINK_ID);

  if (theme === 'dark') {
    if (!existing) {
      const link = document.createElement('link');
      link.id = THEME_LINK_ID;
      link.rel = 'stylesheet';
      link.href = DARK_THEME_URL;
      document.head.appendChild(link);
    }
  } else {
    // volta pro light: basta remover o override (o tema light bundled reassume)
    existing?.remove();
  }

  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');

  localStorage.setItem('theme', theme);
}