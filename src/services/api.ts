import axios from 'axios';
import { entrou, saiu } from './requisicoesEmVoo';

const API_BASE = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  entrou();   // contador de requisições em voo — alimenta o esqueleto de carregamento
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Padronização app-wide (#80, mandato @R): nomes de procedimento SEMPRE em CAIXA ALTA.
// Normalizar na FONTE (interceptor) cobre as 12 páginas que exibem o campo de uma vez —
// componente novo já nasce padronizado, sem depender de alguém lembrar do util.
const upperProcedimento = (data: unknown): unknown => {
  if (Array.isArray(data)) return data.map(upperProcedimento);
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key === 'procedimento' && typeof obj[key] === 'string') {
        obj[key] = (obj[key] as string).toUpperCase();
      } else if (obj[key] && typeof obj[key] === 'object') {
        upperProcedimento(obj[key]);
      }
    }
  }
  return data;
};

api.interceptors.response.use(
  (response) => {
    saiu();
    upperProcedimento(response.data);
    return response;
  },
  async (error) => {
    saiu();   // erro também FECHA a requisição — senão o esqueleto ficaria eterno
    const original = error.config;

    // Sessão única (26/08): outro login com o mesmo usuário derrubou esta sessão.
    // NÃO tenta refresh — o refresh token também carrega o session_token velho,
    // então "funcionaria" e só adiaria o mesmo 401 pra próxima chamada, sem o
    // usuário nunca entender por quê. Avisa e manda pro login direto.
    if (error.response?.status === 401 && error.response?.data?.code === 'sessao_revogada') {
      localStorage.clear();
      alert('Sua sessão foi encerrada porque outro acesso foi feito com este usuário.');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, { refresh });
        localStorage.setItem('access_token', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        // @R 22/09 "Login dura 1 dia completo": o refresh vence 24 h depois do login — diz isso na tela de entrada
        try { sessionStorage.setItem('aviso_login', 'Sua sessão de 1 dia terminou. Entre de novo com usuário, senha e CPF.'); } catch { /* sem storage */ }
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;