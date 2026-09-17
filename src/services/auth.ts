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
  return data;
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
