import api from './../api';

// ── Medico ──────────────────────────────────────────────
export const getMedicos = () => api.get('/client/medicos/');
export const getMedico = (id: number) => api.get(`/client/medicos/${id}/`);
export const createMedico = (data: any) => api.post('/client/medicos/', data);
export const updateMedico = (id: number, data: any) => api.patch(`/client/medicos/${id}/`, data);
export const deleteMedico = (id: number) => api.delete(`/client/medicos/${id}/`);
export const getMedicosCompleto = () => api.get('/client/medico-completo/lista/');
export const getEspecialidades = () => api.get('/client/especialidades/');
export const getSubespecialidades = () => api.get('/client/subespecialidades/');
export const getHospitais = () => api.get('/client/hospitais/');
export const getBancos = () => api.get('/client/bancos/');
export const getStatusOrcamentoPersonalizado = () => api.get('/client/status-orcamento-personalizado/');
export const criarStatusOrcamentoPersonalizado = (nome: string) =>
  api.post('/client/status-orcamento-personalizado/', { nome });

// ── DadosMedico ─────────────────────────────────────────
export const getDadosMedico = (idMedico: number) => api.get(`/client/dados-medico/?idMedico=${idMedico}`);
export const createDadosMedico = (data: any) => api.post('/client/dados-medico/', data);
export const updateDadosMedico = (id: number, data: any) => api.patch(`/client/dados-medico/${id}/`, data);

// ── EmpresaMedico ───────────────────────────────────────
export const getEmpresaMedico = (idMedico: number) => api.get(`/client/empresa-medico/?idMedico=${idMedico}`);
export const createEmpresaMedico = (data: any) => api.post('/client/empresa-medico/', data);
export const updateEmpresaMedico = (id: number, data: any) => api.patch(`/client/empresa-medico/${id}/`, data);

// ── DadosPessoais ───────────────────────────────────────
export const getDadosPessoais = (idMedico: number) => api.get(`/client/dados-pessoais-medico/?idMedico=${idMedico}`);
export const createDadosPessoais = (data: any) => api.post('/client/dados-pessoais-medico/', data);
export const updateDadosPessoais = (id: number, data: any) => api.patch(`/client/dados-pessoais-medico/${id}/`, data);

// ── DadosBancarios ──────────────────────────────────────
export const getDadosBancarios = (idMedico: number) => api.get(`/client/dados-bancarios/?idMedico=${idMedico}`);
export const createDadosBancarios = (data: any) => api.post('/client/dados-bancarios/', data);
export const updateDadosBancarios = (id: number, data: any) => api.patch(`/client/dados-bancarios/${id}/`, data);


export const cadastrarUsuarioMedico = (medicoId: number) =>
  api.post(`/client/cadastrar-usuario-medico/${medicoId}/`);

export const verificarUsuarioMedico = (medicoId: number) =>
  api.get(`/client/verificar-usuario-medico/${medicoId}/`);

export type TipoBaseOrcamento = 'COTAR' | 'SEGREDO';

export const getBaseOrcamento = (medicoId: number, tipo: TipoBaseOrcamento = 'COTAR') =>
  api.get(`/client/medico/${medicoId}/base-orcamento/`, { params: { tipo } });

export const salvarBaseOrcamento = (medicoId: number, formData: FormData) =>
  api.post(`/client/medico/${medicoId}/base-orcamento/salvar/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const uploadArquivoStorage = (file: File) => {
  const form = new FormData();
  form.append('file', file);

  return api.post('/integracoes/upload/', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

// ── Menu de perfil / sessão única (26/08) ──────────────
export const getMinhaSessao = () => api.get('/usuarios/minha-sessao/');
export const trocarMinhaSenha = (senhaAtual: string, senhaNova: string) =>
  api.post('/usuarios/trocar-minha-senha/', { senhaAtual, senhaNova });
