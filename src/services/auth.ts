import axios from 'axios';
import { clearAuthProfile, persistAuthProfile } from '../access/authProfile';

const API_BASE = import.meta.env.VITE_API_URL;

const AUTH_URL = `${API_BASE}/auth/token/`;
const FORGOT_PASSWORD_BASE_URL = `${API_BASE}/auth/esqueci-senha`;

export async function login(username: string, password: string) {
  const { data } = await axios.post(AUTH_URL, { username, password });
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  persistAuthProfile(data);
  if (data.loginEvento) enviarLocalizacaoDoLogin(data.loginEvento, data.access);
  return data;
}

/**
 * #634 (@R 22/09): "de onde e como cada um está logando". O navegador pergunta à pessoa se autoriza a
 * localização; a resposta (ou a recusa) vai para o login recém-feito. NÃO bloqueia nem atrasa a entrada:
 * roda depois do login, sem await, e qualquer falha fica calada (o registro do login já existe com IP e navegador).
 */
function enviarLocalizacaoDoLogin(evento: number, access: string) {
  const url = `${API_BASE}/auth/login-localizacao/`;
  const headers = { Authorization: `Bearer ${access}` };
  const mandar = (corpo: Record<string, unknown>) =>
    axios.post(url, { evento, ...corpo }, { headers }).catch(() => undefined);
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    mandar({ status: 'INDISPONIVEL', motivo: 'SEM_API' });
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => mandar({ status: 'CONCEDIDA', latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy }),
    // o código do erro separa "a pessoa negou" de "a localização do Windows/aparelho está desligada" (22/09: os
    // 3 logins do @R no computador voltaram indisponível — o motivo diz qual das duas)
    (e) => mandar({
      status: e.code === e.PERMISSION_DENIED ? 'NEGADA' : 'INDISPONIVEL',
      motivo: e.code === e.PERMISSION_DENIED ? 'PERMISSION_DENIED' : e.code === e.TIMEOUT ? 'TIMEOUT' : 'POSITION_UNAVAILABLE',
    }),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
  );
}

export async function solicitarCodigoRecuperacao(email: string) {
  const { data } = await axios.post(`${FORGOT_PASSWORD_BASE_URL}/solicitar/`, { email });
  return data;
}

export async function validarCodigoRecuperacao(email: string, codigo: string) {
  const { data } = await axios.post(`${FORGOT_PASSWORD_BASE_URL}/validar/`, { email, codigo });
  return data;
}

export async function redefinirSenha(email: string, codigo: string, novaSenha: string) {
  const { data } = await axios.post(`${FORGOT_PASSWORD_BASE_URL}/redefinir/`, {
    email,
    codigo,
    novaSenha,
  });
  return data;
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  clearAuthProfile();
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('access_token');
}
