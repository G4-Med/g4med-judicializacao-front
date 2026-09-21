import api from './../api';

/* Propostas comerciais (@R 21/09 19:31): servidor guarda os campos e o rastro (quem criou, editou e gerou o PDF). */
export const listarPropostas = () => api.get('/propostas-comerciais/');
export const criarProposta = (dados: object) => api.post('/propostas-comerciais/', dados);
export const salvarProposta = (id: number, dados: object) => api.put(`/propostas-comerciais/${id}/`, dados);
export const excluirProposta = (id: number) => api.delete(`/propostas-comerciais/${id}/`);
export const registrarPdfProposta = (id: number) => api.post(`/propostas-comerciais/${id}/pdf-gerado/`, {});
