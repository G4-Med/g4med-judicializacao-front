import api from './../api';

// ── Medico ──────────────────────────────────────────────
export const getMedicos = () => api.get('/client/medicos/');
export const getMedico = (id: number) => api.get(`/client/medicos/${id}/`);
export const createMedico = (data: any) => api.post('/client/medicos/', data);
export const updateMedico = (id: number, data: any) => api.patch(`/client/medicos/${id}/`, data);
export const deleteMedico = (id: number) => api.delete(`/client/medicos/${id}/`);
// #495 (@R 19/09): a lista esconde INATIVOS por padrão (seletores, cotação, ficha…);
// só a tela /clientes pede `incluirInativos` para ver e reativar.
export const getMedicosCompleto = (opts: { incluirInativos?: boolean } = {}) =>
  api.get('/client/medico-completo/lista/', { params: opts.incluirInativos ? { incluir_inativos: 1 } : {} });

/** A ÁREA do cliente (@R 17/09): taxa de resposta, perdas POR RESPONSABILIDADE, SLA,
 *  experiência por subárea. `pacientes=1` inclui a lista nominal (PII, sob demanda). */
export const getMetricasMedico = (id: number, comPacientes = false) =>
  api.get(`/medicos/${id}/metricas/${comPacientes ? '?pacientes=1' : ''}`);
export const getEspecialidades = () => api.get('/client/especialidades/');
export const getSubespecialidades = () => api.get('/client/subespecialidades/');
export const getHospitais = () => api.get('/client/hospitais/');
export const getBancos = () => api.get('/client/bancos/');
export const getStatusOrcamentoPersonalizado = (fase?: string) =>
  api.get('/client/status-orcamento-personalizado/', fase ? { params: { fase } } : undefined);
/** `fase` = chave do canon (status_canon.FASES). Sem fase, a etiqueta vale em todas. */
export const criarStatusOrcamentoPersonalizado = (nome: string, fase?: string) =>
  api.post('/client/status-orcamento-personalizado/', fase ? { nome, fase } : { nome });

// ── DadosMedico ─────────────────────────────────────────
export const getDadosMedico = (idMedico: number) => api.get(`/client/dados-medico/?idMedico=${idMedico}`);
export const createDadosMedico = (data: any) => api.post('/client/dados-medico/', data);
export const updateDadosMedico = (id: number, data: any) => api.patch(`/client/dados-medico/${id}/`, data);

// ── EmpresaMedico ───────────────────────────────────────
export const getEmpresaMedico = (idMedico: number) => api.get(`/client/empresa-medico/?idMedico=${idMedico}`);
export const createEmpresaMedico = (data: any) => api.post('/client/empresa-medico/', data);
export const updateEmpresaMedico = (id: number, data: any) => api.patch(`/client/empresa-medico/${id}/`, data);
// #485 C+E (@R 19/09): consulta pública do CNPJ (BrasilAPI, ReceitaWS de reserva) — não grava nada
export const consultarCnpj = (cnpj: string) => api.get(`/client/cnpj/${cnpj.replace(/\D/g, '')}/`);

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

// ── Grupos de WhatsApp do cliente (1:N com FUNÇÃO · @R 19/09/2026) ──────────
// `envioAtivo` nasce false no servidor e só quem tem permissão liga, cliente a cliente.
// O catálogo é a lista dos grupos que EXISTEM (JID vindo do roteador, não digitado).
export type GrupoWhatsappCliente = {
  id: number;
  idMedico: number;
  grupoJid: string;
  grupoNome: string;
  funcao: 'CONVERSA' | 'PRECO' | 'SOLICITACAO' | 'OUTRO';
  especialidadeAtendida: string | null;
  envioAtivo: boolean;
  confirmadoPor: string | null;
  createDate: string;
};
export type GrupoWhatsappCatalogo = { grupoNome: string; grupoJid: string; agenteDestino: string };
/** Todos os vínculos de uma vez — para a coluna "Grupo WhatsApp" na lista de clientes (@R 19/09). */
export const getGruposWhatsappTodos = () => api.get<GrupoWhatsappCliente[]>('/client/grupos-whatsapp/');
export const getGruposWhatsappCliente = (idMedico: number) =>
  api.get<GrupoWhatsappCliente[]>(`/client/grupos-whatsapp/?idMedico=${idMedico}`);
export const criarGrupoWhatsappCliente = (data: Partial<GrupoWhatsappCliente>) =>
  api.post<GrupoWhatsappCliente>('/client/grupos-whatsapp/', data);
export const atualizarGrupoWhatsappCliente = (id: number, data: Partial<GrupoWhatsappCliente>) =>
  api.patch<GrupoWhatsappCliente>(`/client/grupos-whatsapp/${id}/`, data);
export const removerGrupoWhatsappCliente = (id: number) => api.delete(`/client/grupos-whatsapp/${id}/`);
export const getCatalogoGruposWhatsapp = () =>
  api.get<{ grupos: GrupoWhatsappCatalogo[]; total: number; geradoEm: string | null }>('/client/grupos-whatsapp-catalogo/');
