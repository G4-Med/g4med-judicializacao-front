import api from './../api';

export interface UsuarioPayload {
  username: string;
  password?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  group_id?: number | null;
  medico_id?: number | null;
  medico_ids?: number[];
}

export const getUsuarios = () => api.get('/usuarios/');
export const getUsuario = (id: number) => api.get(`/usuarios/${id}/`);
export const criarUsuario = (payload: UsuarioPayload) => api.post('/usuarios/criar/', payload);
export const editarUsuario = (id: number, payload: Partial<UsuarioPayload>) =>
  api.patch(`/usuarios/${id}/editar/`, payload);
export const getGruposUsuarios = () => api.get('/usuarios/grupos/');
export const getMedicosUsuario = (userId: number) => api.get(`/usuarios/${userId}/medicos/`);

/** Admin apaga o CPF-chave de alguém (digitou errado no 1º acesso) — backend/cpf_acesso.py */
export const limparCpfAcesso = (userId: number) => api.post(`/usuarios/${userId}/cpf/limpar/`, {});
