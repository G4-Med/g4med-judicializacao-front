// Tema base do PrimeReact (light) empacotado no bundle — evita depender
// de CDN externo em produção. O setTheme() em utils/theme.ts injeta um
// <link> adicional pra trocar pra dark em runtime.
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { addLocale, locale } from 'primereact/api';
import App from './App';
import { instalarMedidaColunaFixa } from './lib/medidaColunaFixa';

// travada de 13 s ao abrir tabelas com colunas fixas (@R 23/09) — ver src/lib/medidaColunaFixa.ts
instalarMedidaColunaFixa();

addLocale('pt', {
  startsWith: 'Começa com',
  contains: 'Contém',
  notContains: 'Não contém',
  endsWith: 'Termina com',
  equals: 'Igual a',
  notEquals: 'Diferente de',
  noFilter: 'Sem filtro',
  filter: 'Filtrar',
  lt: 'Menor que',
  lte: 'Menor ou igual a',
  gt: 'Maior que',
  gte: 'Maior ou igual a',
  dateIs: 'Data igual a',
  dateIsNot: 'Data diferente de',
  dateBefore: 'Data antes de',
  dateAfter: 'Data depois de',
  clear: 'Limpar',
  apply: 'Aplicar',
  matchAll: 'Corresponder a todos',
  matchAny: 'Corresponder a qualquer',
  addRule: 'Adicionar regra',
  removeRule: 'Remover regra',
  accept: 'Sim',
  reject: 'Não',
  choose: 'Escolher',
  upload: 'Enviar',
  cancel: 'Cancelar',
});

locale('pt');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* base do bundle: '/' no Netlify, '/app/' quando publicamos pelo nosso proprio
        nginx. Ler do BASE_URL faz a MESMA build servir nos dois lugares. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
