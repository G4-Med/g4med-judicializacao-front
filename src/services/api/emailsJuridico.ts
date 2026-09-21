import api from './../api';

/** Área "E-mails e ofícios que chegam" (ordem @R 21/09/2026): o que o monitor de e-mail NÃO
 *  transforma em pedido — remetente fora da allowlist (Defensoria, TJMG, CNJ, hospitais) e
 *  respostas soltas. É FILA: classe · dono · prazo · tratado. */
export type ClasseEmailJuridico = 'JUSTICA' | 'SES' | 'PRESTADOR' | 'OUTRO' | 'RUIDO';

export interface EmailJuridicoItem {
  id: number;
  emailProcessadoId: number;
  chegouEm: string;
  dataEmail: string | null;
  novo: boolean;
  remetente: string | null;
  assunto: string | null;
  motivoBarrado: string | null;
  statusMonitor: string;
  classe: ClasseEmailJuridico;
  cnj: string | null;
  orderId: number | null;
  temAnexo: boolean;
  anexos: string[];
  temIntegra: boolean;
  prazo: string | null;
  diasParaPrazo: number | null;
  vencido: boolean;
  dono: string | null;
  tratadoEm: string | null;
  tratadoPor: string | null;
  observacao: string | null;
}

export interface ContagemEmailsJuridico {
  abertos: number;
  vencidos: number;
  comPrazo: number;
  novosHoje: number;
  novos: number;
  abertosSemRuido: number;
  porClasse: Record<ClasseEmailJuridico, number>;
}

export interface ListaEmailsJuridico { itens: EmailJuridicoItem[]; n: number; contagem: ContagemEmailsJuridico }

export const listarEmailsJuridico = (params?: { status?: 'ABERTO' | 'TRATADO' | 'TODOS'; classe?: string; desde?: string }) =>
  api.get<ListaEmailsJuridico>('/emails/juridico/', { params });

export const conteudoEmailJuridico = (id: number) =>
  api.get<{ id: number; assunto: string | null; remetente: string | null; dataEmail: string | null; corpo: string; anexos: string[]; linkEml: string }>(
    `/emails/juridico/${id}/conteudo/`);

export const tratarEmailJuridico = (id: number, body: Partial<{
  classe: ClasseEmailJuridico; prazo: string | null; dono: string | null; orderId: number | null; observacao: string; tratado: boolean;
}>) => api.post<EmailJuridicoItem>(`/emails/juridico/${id}/tratar/`, body);

export const CLASSE_LABEL: Record<ClasseEmailJuridico, string> = {
  JUSTICA: 'Justiça', SES: 'SES', PRESTADOR: 'Hospital/prestador', OUTRO: 'Outro', RUIDO: 'Ruído',
};

export const baixarAnexoEmailJuridico = (id: number, n: number) =>
  api.get<Blob>(`/emails/juridico/${id}/anexo/${n}/`, { responseType: 'blob' });

export const baixarAnexoEmailOriginal = (orderId: number, anexoId: number, n: number) =>
  api.get<Blob>(`/orders/${orderId}/emails/${anexoId}/anexo/${n}/`, { responseType: 'blob' });

/** Responde o e-mail pelo endereço da plataforma (ato da pessoa; nunca automático). */
export const responderEmailJuridico = (id: number, dados: { para?: string; assunto: string; corpo: string; anexos: File[] }) => {
  const fd = new FormData();
  if (dados.para) fd.append('para', dados.para);
  fd.append('assunto', dados.assunto); fd.append('corpo', dados.corpo);
  dados.anexos.forEach((f) => fd.append('anexo', f));
  return api.post<{ ok: boolean; para: string; anexos: number; observacao: string }>(`/emails/juridico/${id}/responder/`, fd,
    { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const corrigirTextoEmail = (texto: string) =>
  api.post<{ texto: string }>('/emails/juridico/corrigir-texto/', { texto });
