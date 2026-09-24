import api from './../api';


export const getOrders = () => api.get('/orders/listar/');
// Exclusão de lançamento errado — SÓ ADMIN; backend faz backup JSON antes (task #198)
// Excluir = lixeira, assinado com a senha do usuário (@R 28/08). DELETE com corpo:
// o axios manda `data` no DELETE e o DRF lê em request.data.
export const excluirOrder = (id: number, senha: string, motivo?: string) =>
  api.delete(`/orders/${id}/excluir/`, { data: { senha, motivo } });
/** Reabrir uma perda (@R 29/08 14:07): volta o pedido para a fase de onde saiu. */
export const reabrirPerda = (id: number, statusProcesso?: string) =>
  api.post(`/orders/${id}/reabrir/`, statusProcesso ? { statusProcesso } : {});
export const getLixeira = () => api.get('/orders/lixeira/');
export const restaurarOrder = (id: number, senha: string, statusProcesso?: string) =>
  api.post(`/orders/${id}/restaurar/`, { senha, statusProcesso });
export const getProcessosResumo = () => api.get('/orders/processos-resumo/');
export const getStatusOrders = () => api.get('/orders/status/');
export const atualizarOrder = (id: number, data: any) => api.patch(`/orders/${id}/atualizar/`, data);
export const getMedicosSelect = () => api.get('/client/medicos/');
export const getJuridico = () => api.get('/orders/juridico/');
export const salvarJuridico = (id: number, data: any) => api.post(`/orders/juridico/${id}/salvar/`, data);
export const getOrcamentoMedico = () => api.get('/orders/orcamento-medico/');
export const salvarOrcamentoMedico = (id: number, data: any) => api.post(`/orders/orcamento-medico/${id}/salvar/`, data);
export const marcarSemProfissional = (id: number) => api.post(`/orders/orcamento-medico/${id}/sem-profissional/`);
export const aplicarStatusOrcamentoManual = (id: number, status: string) =>
  api.post(`/orders/orcamento-medico/${id}/status-manual/`, { status });
export const trocarMedicoOrcamento = (id: number, idMedico: number) =>
  api.post(`/orders/orcamento-medico/${id}/trocar-medico/`, { idMedico });
export const getParaProtocolar = () => api.get('/orders/para-protocolar/');
export const salvarProtocolar = (id: number, data: any) => api.post(`/orders/para-protocolar/${id}/salvar/`, data);
// fila: 'analisar' (aguardando decisão) | 'ses' (orçamento já respondido à SES) |
// undefined = todas (task #222 — área "Enviado à SES — Segredo de Justiça").
export const getSegredoJustica = (fila?: 'analisar' | 'ses') =>
  api.get('/orders/segredo-justica/', { params: fila ? { fila } : {} });
export const salvarResultadoSegredo = (id: number, data: any) => api.post(`/orders/segredo-justica/${id}/salvar/`, data);

// Classificação retroativa (task #196, 26/08) — candidatos já no banco (menor de
// idade, ainda não marcados) e a ação de confirmar 1 candidato como segredo.
export const getCandidatosSegredoJustica = () => api.get('/orders/segredo-justica/candidatos/');
export const desmarcarSegredoJustica = (id: number, motivo: string) =>
  api.post(`/orders/segredo-justica/${id}/desmarcar/`, { motivo });
export const marcarSegredoJusticaRetroativo = (id: number) =>
  api.post(`/orders/segredo-justica/${id}/marcar-retroativo/`);
export const getProtocolados = () => api.get('/orders/protocolados/');
export const salvarResultadoProtocolado = (id: number, data: any) => api.post(`/orders/protocolados/${id}/salvar/`, data);
export const adicionarAcompanhamento = (id: number, data: any) => api.post(`/orders/protocolados/${id}/acompanhamento/`, data);
export const getResultados = () => api.get('/orders/resultados/');
/** Frescor dos dados do Estado no MedCheck (cadeia 331→548→aqui). Card da Home, 09/09. */
export type SaudeDados = {
  empenhos: { n: number; maxPagamento: string | null; maxEmpenho: string | null; atualizadoEm: string | null; idadeHoras: number | null; ok: boolean };
  regua: { n: number; atualizadoEm: string | null; idadeHoras: number | null; ok: boolean };
  medidoEm: string;
  /** @R 22/09: o primeiro elo parado da cadeia portal → coleta → carga → pagamentos, em português */
  resumo?: { ok: boolean; elo: 'portal' | 'coleta' | 'envio' | 'pagamentos' | null; texto: string | null;
             diasSemPagamentoNovo: number | null; limiteDias: number };
  fonte?: { disponivel: boolean; rodadaEm?: string; rodadaIdadeHoras?: number | null; rc?: number; etapa?: string;
            mensagem?: string; coletaIdadeHoras?: number | null; coletaMaxEmpenho?: string; coletaMaxEmpenhoBruto?: string;
            semCnj?: number | null; portalVazio?: boolean; portalDesde?: string };
};
export const getSaudeDados = () => api.get<SaudeDados>('/kpis/saude-dados/');
export const getPerdas = () => api.get('/orders/perdas/');
export const getEnviadoSes = () => api.get('/orders/enviado-ses/');
export const getMedicosCompleto = () => api.get('client/medico-completo/lista/');
export const getRelatorioResumido = (medicoId: number) => api.get(`/relatorios/resumido/${medicoId}/`);
export const enviarRelatorioResumido = (medicoId: number, destinatario?: string) =>
  api.post(`/relatorios/resumido/${medicoId}/enviar/`, destinatario ? { destinatario } : {});
export const getEmailsPendentes = (params?: { status?: string; tipoEmail?: string }) =>
  api.get('/orders/emails/', { params });
export const getEmailsPendentesKpis = () => api.get('/orders/emails/kpis/');

/** BAIXAR ANEXO — precisa passar pelo axios, ¬por <a href> (cicatriz @R 18/09).
 *
 *  O que eu fiz errado antes: liguei o botão num <a href> apontando para a rota. Navegação de
 *  browser NÃO manda header, e o token desta API vai em `Authorization: Bearer` pelo interceptor
 *  — resultado: HTTP 401 na cara do @R. Só a requisição pelo axios carrega a credencial.
 *  `responseType: 'blob'` é obrigatório: sem ele o axios trata o PDF como texto e corrompe. */
export const baixarAnexo = (anexoId: number) =>
  api.get(`/orders/anexos/${anexoId}/baixar/`, { responseType: 'blob' });

export const baixarAnexoDoTipo = (orderId: number, tipo: string) =>
  api.get(`/orders/${orderId}/baixar-tipo/${tipo}/`, { responseType: 'blob' });

/** Salva o blob como arquivo. Revoga o objectURL — sem isso, 23 MB ficam presos na memória
 *  da aba a cada download (o PDF do #1268 tem exatamente esse tamanho). */
export function salvarBlob(data: Blob, nome: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
export const getEmailsPendentesCount = () => api.get('/orders/emails/pendentes-count/');
export const enviarEmailPendente = (id: number) => api.post(`/orders/emails/${id}/enviar/`);
export const enviarEmailsPendentesLote = (ids: number[]) => api.post('/orders/emails/enviar-lote/', { ids });
/** Tira da fila um e-mail que não deve mais sair (o pedido voltou de fase, mudou a decisão).
 *  Não apaga: marca CANCELADO com quem e por quê — e-mail já ENVIADO devolve 409. */
/** Quanto ESTE médico vem cobrando, comparado à referência do pedido (razão orçado÷ref).
 *  Camadas: subárea → área → geral; a resposta diz em qual parou e com que n. */
/** Marca que pedimos o orçamento a este médico (o clique em copiar). `cancelar` desfaz:
 *  zera o contador e apaga a data — a marca nasce de um proxy, então é reversível. */
export const registrarCotacaoPedida = (orderId: number, cancelar = false) =>
  api.post(`/orders/${orderId}/cotacao-pedida/`, cancelar ? { cancelar: true } : {});
export const getPrecosDoMedico = (orderId: number, medicoId: number) =>
  api.get(`/orders/${orderId}/precos-medico/${medicoId}/`);
/** Escreve um e-mail ao solicitante em qualquer fase. Passa pela FILA (fica no
 *  histórico do pedido e pode ser cancelado); `enviarAgora` dispara na hora. */
export const enviarEmailAvulso = (orderId: number, payload: {
  destinatario?: string; assunto: string; corpo: string;
  anexoUrl?: string; enviarAgora?: boolean;
}) => api.post(`/orders/${orderId}/email-avulso/`, payload);
/** Rascunho da IA: ela escreve, você edita e envia. Nunca dispara sozinha. */
export const redigirEmailComIA = (orderId: number, intencao: string) =>
  api.post<{ assunto: string; corpo: string }>(`/ia/redigir-email/${orderId}/`, { intencao });
export const cancelarEmailPendente = (id: number, motivo?: string) =>
  api.post(`/orders/emails/${id}/cancelar/`, motivo ? { motivo } : {});
export const enviarEmailDireto = (payload: {
  emailPendenteId?: number;
  destinatario: string;
  assunto: string;
  corpo: string;
  anexoUrl?: string;
}) => api.post('/emails/enviar/', payload);
export const getConfiguracoesEmails = () => api.get('/emails/configuracoes/');
export const salvarConfiguracaoEmail = (payload: {
  tipoEmail: string;
  assunto: string;
  corpo: string;
  ativo?: boolean;
}) => api.post('/emails/configuracoes/', payload);
export const getEspecialidades = () => api.get('/client/especialidades/');
export const salvarEspecialidade = (payload: { especialidade: string }) => api.post('/client/especialidades/', payload);
export const getSubespecialidades = () => api.get('/client/subespecialidades/');
export const salvarSubespecialidade = (payload: { subespecialidade: string }) => api.post('/client/subespecialidades/', payload);
export const getHospitais = () => api.get('/client/hospitais/');
export const salvarHospital = (payload: { hospital: string }) => api.post('/client/hospitais/', payload);
export const getBancos = () => api.get('/client/bancos/');
export const salvarBanco = (payload: { codBanco: string; nomeBanco: string }) => api.post('/client/bancos/', payload);
export const atualizarConfiguracaoEmail = (
  id: number,
  payload: {
    assunto?: string;
    corpo?: string;
    ativo?: boolean;
  }
) => api.patch(`/emails/configuracoes/${id}/`, payload);
export function enviarOrcamentoArquivo(orderId: number, valorTotal: number) {
  return api.post('/api/orcamento/arquivo/', { orderId, valorTotal })
}
// #485 F (@R 19/09) — cotação no GRUPO WhatsApp do cliente (fila; o relay da máquina DEV envia)
export const getWhatsappGrupoPedido = (orderId: number) => api.get(`/orders/${orderId}/whatsapp-grupo/`);
export const enviarWhatsappGrupoPedido = (orderId: number, grupoId: number) =>
  api.post(`/orders/${orderId}/whatsapp-grupo/`, { grupoId });

// #485 A (@R 19/09) — VERSÕES do orçamento: a equipe refaz, a nova vira vigente; reenvio só com clique
export const getOrcamentoVersoes = (orderId: number) => api.get(`/orders/${orderId}/orcamento-versoes/`);
export const criarOrcamentoVersao = (orderId: number, data: {
  valorTotal: number; dataEmissao?: string; validade?: string | null; totalImpresso?: number | null;
  equipeMedicaValor?: number | null; anestesistaValor?: number | null; taxasHospitalaresValor?: number | null;
  opmeMateriaisValor?: number | null; anexoId?: number | null; observacao?: string; origemRefacao?: string; vigente?: boolean;
}) => api.post(`/orders/${orderId}/orcamento-versoes/`, data);
export const promoverOrcamentoVersao = (orderId: number, versaoId: number) =>
  api.post(`/orders/${orderId}/orcamento-versoes/${versaoId}/promover/`, {});
export const reenviarOrcamentoVersao = (orderId: number, versaoId: number) =>
  api.post(`/orders/${orderId}/orcamento-versoes/${versaoId}/reenviar/`, {});

export const uploadAnexoOrder = (orderId: number, file: File, tipo: string, opcoes?: { substituir?: boolean }) => {
  const form = new FormData();
  form.append('file', file);
  form.append('tipo', tipo);
  // #639: substituir=1 tira os orçamentos anteriores do PDF enviado (viram "substituído", não são apagados).
  if (opcoes?.substituir) form.append('substituir', '1');
  return api.post(`/orders/${orderId}/anexos/upload/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
/** Trocar a peça de inteiro teor (@R 21/09, pedido da Carol): a anterior NÃO é apagada — vira
 *  'Outro' renomeada com quem/quando trocou, e o pedido fica pronto para receber a nova. */
export const removerInteiroTeor = (orderId: number, motivo?: string) =>
  api.post(`/orders/${orderId}/inteiro-teor/remover/`, { motivo: motivo ?? '' });
export const getAnexosOrder = (orderId: number, tipo?: string) => {
  const params = tipo ? `?tipo=${tipo}` : '';
  return api.get(`/orders/${orderId}/anexos/${params}`);
};


export const getBaseOrcamento = (medicoId: number) =>
  api.get(`/client/medico/${medicoId}/base-orcamento/`);

export const criarOrderProcess = (payload: { json: Record<string, any>; processado: boolean }) =>
  api.post('/integracoes/order-process/', payload);

export const processarOrderProcess = () =>
  api.post('/integracoes/processar/', {});

export const uploadArquivoIntegracao = (file: File) => {
  const form = new FormData();
  form.append('file', file);

  return api.post('/integracoes/upload/', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

// ============================================================
// IA — sugestão de médico
// ============================================================
export interface SugestaoIAResposta {
  sugestaoId: number;
  orderId: number;
  idMedico: number | null;
  nomeMedico: string | null;
  justificativa: string;
  /** o que é o procedimento e quem costuma fazer — descrição GERAL da IA (@R 23/09); null no fallback */
  sobreProcedimento?: { oQueE: string; quemFaz: string } | null;
  confianca: 'alta' | 'media' | 'baixa';
  isFallback: boolean;
  /** a ORDEM, ¬um nome: os adequados do melhor para o menos indicado (@R 17/09, SPEC 3.1) */
  candidatos?: {
    idMedico: number; nomeMedico: string; porque: string;
    respondeOrcamento?: string | null; diasParaResponder?: number | null;
    jaFezDestaSubarea?: number | null; atendePediatrico?: string | null;
    cargaAtual?: string | null; cidade?: string | null;
    /** subáreas que ele JÁ ORÇOU, com a contagem — a prova de capacidade quando o
     *  cadastro é pobre (keywords vazia é a regra, ¬a exceção) */
    jaCotou?: string | null;
  }[];
  /** os números que sustentam a escolha — o motor já os calculava e descartava (@R 17/09) */
  dossieMedico?: {
    respondeOrcamento?: string;
    diasParaResponder?: number | null;
    jaFezDestaSubarea?: number;
    atendePediatrico?: string;
    pediatricosJaAtendidos?: number;
    cidade?: string;
  } | null;
  /** este paciente já passou por aqui? casado pelo NOME — por isso vai para conferência */
  historicoPaciente?: {
    pedidosAnteriores: number;
    jaTeveOrcamento?: boolean;
    mesmoProcedimentoAntes?: boolean;
    itens: { id: number; procedimento: string; dataPedido: string | null;
             statusProcesso: string; teveOrcamento: boolean; mesmoProcedimento: boolean }[];
  } | null;
}

/** A secretária LIGOU cobrando (@R 17/09). Incrementa — cobrança é evento, ¬estado. */
export const registrarRepedidoManual = (orderId: number) =>
  api.post(`/orders/${orderId}/repedido-manual/`);

export const sugerirMedicoIA = (orderId: number) =>
  api.post(`/ia/sugerir-medico/${orderId}/`);

export const aplicarSugestaoIA = (sugestaoId: number, idMedico: number) =>
  api.post(`/ia/sugestoes/${sugestaoId}/aplicar/`, { idMedico });

/** Quem foi convidado a cotar este pedido (cotação concorrente — @R 18/09).
 *  O registro é o que torna o convite AUDITÁVEL: hoje alguém cobra dois médicos pelo
 *  WhatsApp e o sistema não sabe de nenhum dos dois. */
export const listarCandidatosCotacao = (orderId: number) =>
  api.get(`/orders/${orderId}/candidatos-cotacao/`);

/** Troca um convidado errado por outro médico, ou torna-o o médico do pedido (@R 23/09 14:11). */
export const trocarConvidadoCotacao = (orderId: number, candId: number, body: { idMedico?: number; principal?: boolean }) =>
  api.post(`/orders/${orderId}/candidatos-cotacao/${candId}/trocar/`, body);

export const convidarCandidatoCotacao = (
  orderId: number,
  idMedico: number,
  extra?: { situacao?: string; valorRespondido?: number | string; observacao?: string },
) => api.post(`/orders/${orderId}/candidatos-cotacao/`, { idMedico, ...(extra ?? {}) });

/** Este orçamento é o que vale. O sistema NÃO elege sozinho (decisão 6d831a5fa8):
 *  quando a escolha não é a mais barata, o backend exige o motivo — é a pergunta que
 *  alguém faz depois ("por que pagamos mais?"), e ela merece resposta registrada. */
/** Baixa um arquivo do R2 PELO NOSSO domínio (same-origin) — @R/Yago 18/09.
 *  O bucket só libera CORS para o domínio antigo (Netlify), e desde 17/09 o front é
 *  servido pelo domínio da API: o fetch direto é bloqueado pelo browser. Passando por
 *  aqui não existe cross-origin, e nenhuma troca futura de domínio volta a quebrar. */
export const baixarArquivoR2 = (url: string) =>
  api.get('/arquivo-r2/', { params: { url }, responseType: 'arraybuffer' });

/** "Abri a página e confirmei que este número está certo" (@R 18/09).
 *  Aceita correção junto: quem abre e vê errado precisa de caminho que não seja
 *  deixar como está. O valor lido pela máquina vai para a observação, nunca some. */
export const conferirOrcamentoPeca = (
  orcamentoId: number,
  opts?: { desfazer?: boolean; valorCorrigido?: number; prestadorCorrigido?: string },
) => api.post(`/orcamentos-peca/${orcamentoId}/conferir/`, opts ?? {});

export const elegerVencedorCotacao = (
  orderId: number,
  idMedico: number,
  opts?: { motivo?: string; desfazer?: boolean },
) => api.post(`/orders/${orderId}/candidatos-cotacao/vencedor/`, { idMedico, ...(opts ?? {}) });

export interface AnalisarEmpenhoResposta {
  encontrado: boolean;
  mensagem?: string;
  dados?: {
    compatibilidade_legacy?: {
      valor_medio?: number;
      total_encontrados?: number;
    };
    [key: string]: any;
  };
}

export const analisarEmpenho = (procedimento: string) =>
  api.post<AnalisarEmpenhoResposta>('/analisar-empenho/', { procedimento });

export interface ExtrairEmailResposta {
  paciente?: string;
  dataNascimento?: string;
  procedimento?: string;
  refPreco?: number | string | null;
  area?: string;
  subarea?: string;
  dataPedido?: string;
  email?: {
    assunto?: string;
    observacoes?: string;
    remetente?: string;
    origem?: string;
    corpo?: string;
  };
  anexos?: any[];
  [key: string]: any;
}

export const extrairEmail = (corpoEmail: string) =>
  api.post<ExtrairEmailResposta>('/ia/extrair-email/', { corpo_email: corpoEmail });

/**
 * Baixa o orçamento CONSOLIDADO: o backend junta todos os anexos do tipo
 * ORCAMENTO num único PDF (e comprime se estourar o limite do e-mail).
 * `responseType: 'blob'` é obrigatório — sem ele o axios trata o PDF como
 * texto e o arquivo chega corrompido.
 */
export const getOrcamentoConsolidado = (orderId: number) =>
  api.get(`/orders/${orderId}/orcamento-consolidado/`, { responseType: 'blob' });

/**
 * PDF-comprovante do e-mail de recebimento da solicitação (De/Para/Cc/Data/
 * Assunto/corpo/anexos). Se o pedido é anterior a 25/08/2026 (sem .eml
 * arquivado), o backend reconstrói com os dados que tinha e rotula como tal.
 */
export const getEmailRecebimentoPdf = (orderId: number) =>
  api.get(`/orders/${orderId}/email-recebimento-pdf/`, { responseType: 'blob' });

/**
 * O funil: cada fase medida, onde o pedido morre e por quê.
 * `periodo` ∈ mensal | trimestral | semestral | anual | custom
 * (custom exige inicio e fim em AAAA-MM-DD).
 */
export const getFunil = (params: {
  periodo?: string; janelas?: number; inicio?: string; fim?: string;
} = {}) => api.get('/funil/', { params });

// SLA — os 4 endpoints. Índices/por-médico/estourados são agregados; a
// trajetória é por pedido (o "o que aconteceu com ESTE processo").
export const getSlaIndices = (params: {
  periodo?: string; janelas?: number; inicio?: string; fim?: string;
} = {}) => api.get('/sla/indices/', { params });

export const getSlaPorMedico = () => api.get('/sla/por-medico/');

export const getSlaEstourados = () => api.get('/sla/estourados/');
// SLA por responsabilidade (@R 23/09): os estouros da SUA parte — o sino leva para cá.
export const getSlaResponsabilidade = () => api.get('/sla/responsabilidade/');

export const getNotificacoesCentral = () => api.get('/notificacoes/central/');

export const getNotificacoesHistorico = () => api.get('/notificacoes/historico/');

// Log de auditoria + reverter fase (task #198, 26/08)
export const getLogAuditoria = (filtros: Record<string, string>) =>
  api.get('/admin/log-auditoria/', { params: filtros });
export const reverterHistorico = (historicoId: number) =>
  api.post(`/admin/log-auditoria/${historicoId}/reverter/`);

export const getSlaTrajetoria = (orderId: number) =>
  api.get(`/orders/${orderId}/trajetoria/`);

// Detalhe do funil — a lista por trás de cada número, com filtros.
// `formato: 'csv'` NÃO passa por aqui: o download usa a URL direta com o
// token, porque o navegador precisa receber o arquivo como anexo.
export const getFunilDetalhe = (params: Record<string, string | number> = {}) =>
  api.get('/funil/detalhe/', { params });

// Download do CSV: precisa do cabeçalho de autenticação, então NÃO dá para
// usar um <a href> simples — busca como blob e o componente entrega ao usuário.
export const baixarFunilCsv = (params: Record<string, string | number> = {}) =>
  api.get('/funil/detalhe/', { params: { ...params, formato: 'csv' }, responseType: 'blob' });

// Loop de inteligência do pedido (task #203, 27/08): "já respondemos? o que já cobramos?"
export const getInteligenciaPedido = (orderId: number) =>
  api.get(`/orders/${orderId}/inteligencia/`);

// Painel de preços do procedimento (task #207, 27/08): quanto o Estado vem pagando
// por ESTA cirurgia — 5 números, série da janela e os 10 últimos pagamentos com
// comarca e distância. Consulta pesada (~5s na 1ª vez, cache de 6h no backend):
// só chamar quando a linha for EXPANDIDA, nunca no carregamento da tabela.
export const getPrecosProcedimento = (orderId: number) =>
  api.get(`/orders/${orderId}/precos/`);

// Peças 3-4 do chip cadastro (task #217): candidato a CNJ extraído dos anexos pelo batch
// noturno — o humano confirma vendo a origem; e o KPI de completude (série do ledger).
export const getCnjCandidatos = (orderId: number) =>
  api.get(`/orders/${orderId}/cnj-candidatos/`);
export const confirmarCnj = (orderId: number, cnj: string, acao: 'confirmar' | 'corrigir') =>
  api.post(`/orders/${orderId}/cnj-confirmar/`, { cnj, acao });
export const getKpiCompletude = () => api.get('/kpis/completude/');

// Peça-envelope (task #249, @R 28/08). O pacote junta os exames/laudos do pedido venham
// eles da peça de inteiro teor ou do e-mail — é o que vai ao médico. A cotação MONTA o
// texto (não envia): o disparo sai por fora, e o texto tem uma fonte só.
export const getPacoteExames = (orderId: number) =>
  api.get(`/orders/${orderId}/pacote-exames/`);
/** `comLink`: a mensagem sai com 1 LINK SEGURO da G4MED (registra abertura, só leitura) — só peça
 *  quando o texto VAI ser enviado; sem ele volta só o nome dos documentos (ex.: o Copiar busca aqui
 *  apenas o aviso de especialidade e não pode criar link que ninguém mandou). */
export const montarCotacaoMedico = (orderId: number, medico?: string, comLink = false) =>
  api.post(`/orders/${orderId}/solicitar-cotacao-medico/`, { medico, comLink });
/** Uma mensagem para CADA candidato convidado (backend 8a0e542, @R 19/09): nunca uma só com
 *  todos juntos — os concorrentes não podem se ver. Pula quem recusou e "SEM PROFISSIONAL".
 *  Resposta: { mensagens: [{ idMedico, medico, assunto, mensagem, situacao }], ...campos do caminho antigo }. */
export const montarCotacaoTodosCandidatos = (orderId: number) =>
  api.post(`/orders/${orderId}/solicitar-cotacao-medico/`, { todosCandidatos: true, comLink: true });

// A morada do orçamento de terceiro: por pedido (histórico daquele processo) ou por
// procedimento (o que outros lugares cobraram pela MESMA cirurgia — a régua de preço).
export const getOrcamentosTerceiros = (params: { order?: number; procedimento?: string }) =>
  api.get('/orders/orcamentos-terceiros/', { params });

// Acervo de preços (@R 28/08): uma linha por procedimento, quatro lentes lado a lado —
// o que NÓS cobramos, o que TERCEIROS cobraram, o que o ESTADO pagou, quantos DOCUMENTOS
// temos — sempre com o N, porque mediana de um caso é um caso, não régua.
export const getAcervoPrecos = (params: { especialidade?: string; q?: string; so_sem_orcamento?: 1 }) =>
  api.get('/orders/acervo-precos/', { params });

// ── A FICHA DO PEDIDO (rastreabilidade por fase) e o AVISO por colaborador ──────
// A ficha LÊ o que já existe (nenhuma tabela nova). O aviso guarda o "não mostrar
// mais" em PreferenciaUsuario — por COLABORADOR, não por navegador: quem dispensou
// no computador de casa continua sem ver no do escritório, e vice-versa quando reativa.
export const getFichaPedido = (orderId: number) =>
  api.get(`/orders/${orderId}/ficha/`);

// Mover a fase/status pela ficha (@R 17/09). NÃO é o fluxo de operação: não dispara
// e-mail nem cria registro — é correção de cadastro, para quando o pedido está na fase
// errada e a operação real já aconteceu (ou não deve acontecer de novo).
export const moverSituacao = (orderId: number, campo: string, valor: string | null) =>
  api.post(`/orders/${orderId}/situacao/`, { campo, valor });

/** O TEXTO do e-mail original guardado no R2 (@R 17/09) — texto puro, nunca HTML.
 *  O backend parseia o .eml e devolve só o corpo legível; HTML cru abriria porta a
 *  script e ao pixel que avisa o remetente que a mensagem foi aberta. */
export const getConteudoEmail = (orderId: number, anexoId: number) =>
  api.get(`/orders/${orderId}/emails/${anexoId}/conteudo/`);

/** Lê o arquivo do orçamento com visão computacional e devolve os dados + os alertas de
 *  conferência (@R 17/09). PROPÕE — o arquivo nem é salvo; quem grava é o envio, depois
 *  que a pessoa confirma. */
export const lerOrcamentoDoArquivo = (orderId: number, arquivo: File) => {
  const form = new FormData();
  form.append('arquivo', arquivo);
  return api.post(`/orders/${orderId}/orcamento/ler/`, form);
};

/** Vários arquivos do orçamento → 1 PDF (na ordem dada). O que a tela lê e envia é ESTE PDF. */
export const unificarOrcamento = (orderId: number, arquivos: File[]) => {
  const form = new FormData();
  arquivos.forEach((a) => form.append('arquivo', a));
  return api.post(`/orders/${orderId}/orcamento/unificar/`, form, { responseType: 'blob' });
};

/** Edita assunto e corpo de um e-mail que ainda NÃO saiu (PENDENTE/ERRO). Não envia. */
export const editarEmailPendente = (id: number, assunto: string, corpo: string) =>
  api.post(`/orders/emails/${id}/editar/`, { assunto, corpo });

/** Dar perda na fase de orçamento. Se houver OUTRO médico convidado ainda cotando, o servidor devolve 409
 *  `outros_medicos_cotando`: a recusa de UM médico não é a perda do pedido (incidente do #1241, 20/09). Aqui a pessoa
 *  lê o motivo e só segue se confirmar que quer a negativa do pedido INTEIRO. Devolve false se ela desistiu. */
export const darPerdaNoOrcamento = async (id: number, dados: { motivoPerdaCategoria: unknown; parecer: string }): Promise<boolean> => {
  try {
    await salvarOrcamentoMedico(id, { acao: 'nao_faco', ...dados });
    return true;
  } catch (e: unknown) {
    const r = (e as { response?: { status?: number; data?: { codigo?: string; error?: string } } })?.response;
    if (r?.status !== 409 || r?.data?.codigo !== 'outros_medicos_cotando') throw e;
    if (!window.confirm(`${r.data.error}\n\nDar a perda do pedido INTEIRO mesmo assim?`)) return false;
    await salvarOrcamentoMedico(id, { acao: 'nao_faco', ...dados, confirmarPerdaComOutrosCotando: true });
    return true;
  }
};

export const getPreferencia = (chave: string) =>
  api.get(`/preferencias/${chave}/`);

// ⚠ PUT, não POST (medido 20/09 no nginx: POST devolvia 405 e o "Já sei, não mostrar mais"
// nunca gravava — o aviso voltava em toda tela; o back aceita GET/PUT).
export const salvarPreferencia = (chave: string, valor: Record<string, unknown>) =>
  api.put(`/preferencias/${chave}/`, { valor });

/** O jurídico escolhe (ou descarta) um dos números de processo que o documento trazia.
 *  Decisão @R 17/09/2026: com mais de um CNJ na peça, nada é gravado sozinho — quem
 *  escolhe é pessoa. Aplicar um número recusa os irmãos no mesmo ato. */
export const decidirCnjSugerido = (orderId: number, sugeridoId: number,
                                   acao: 'aplicar' | 'recusar' = 'aplicar') =>
  api.post(`/orders/${orderId}/cnj-sugerido/${sugeridoId}/decidir/`, { acao });

/** Relê os documentos anexados do pedido e popula CNJ/SEI/data com o que achar.
 *  @R 17/09/2026: a leitura automática só roda quando o documento entra — este é o
 *  caminho para tentar de novo depois que a leitura melhorou. */
export const extrairNumerosDosAnexos = (orderId: number) =>
  api.post(`/orders/${orderId}/extrair-numeros/`);
/** Botão "Reprocessar" ao lado do Inteiro teor (@R 19/09): devolve as peças à fila de leitura
 *  preservando a leitura anterior e relê CNJ/SEI PODENDO CORRIGIR o CNJ. O servidor exige
 *  `confirmar: true` — a confirmação é do usuário, mas quem garante é o backend. */
export const reprocessarDocumentos = (orderId: number) =>
  api.post(`/orders/${orderId}/reprocessar-documentos/`, { confirmar: true });

/** Os pedidos que esperam alguém escolher o número do processo — de QUALQUER fase.
 *  @R 17/09: a varredura gravou 163 sugestões e 65 dos 69 pedidos estão num status que
 *  nenhuma tela lista. A fase é o que esconde; por isso esta fila não filtra por ela. */
export const getCnjAConfirmar = () => api.get('/cnj-a-confirmar/');

// ── #507 (@R 20/09): os casos da fase 3 AGRUPADOS POR MÉDICO + a resposta "quer cotar / não quer" ──
export interface CasoPorMedico {
  id: number; paciente: string; procedimento: string; area: string; subarea: string;
  enviadoEm: string | null; diasEsperando: number | null;
  respostaCotacao: RespostaCotacao | null; respostaCotacaoEm: string | null;
  respostaCotacaoPor: string | null; respostaCotacaoOrigem: string | null;
  /** #509: com CONDICIONADO, o que o médico precisa antes de cotar (ex.: "ressonância de joelho"). */
  respostaCotacaoObs: string | null;
  cotacoesPedidas: number | null; ultimaCotacaoPedidaEm: string | null;
}
/** ACEITOU quer · RECUSOU não quer (e o pedido VOLTA à busca de cotador, #510) · CONDICIONADO quer mas espera algo (#509). */
export type RespostaCotacao = 'ACEITOU' | 'RECUSOU' | 'CONDICIONADO';
export interface MedicoComCasos {
  medico: { id: number; nome: string; categoria: string | null; grupoWhatsapp: string | null };
  total: number; semResposta: number; aceitou: number; recusou: number; condicionado: number;
  casos: CasoPorMedico[]; mensagem: string;
}
export const getOrcamentoMedicoPorMedico = () =>
  api.get<{ medicos: MedicoComCasos[]; totalPedidos: number; foraPorSegredo: number; prazoHoras: number }>(
    '/orders/orcamento-medico/por-medico/');
/** null limpa a marcação. `origem` fica 'plataforma' aqui; a Eliza-urgência manda 'eliza'. */
export const registrarRespostaCotacao = (
  orderId: number, resposta: RespostaCotacao | null, observacao?: string, categoria?: CategoriaRecusa) =>
  api.post<{ ok: boolean; devolvidoABusca: boolean; cotacaoRecusadaPor: string | null;
             ficouCom: { idMedico: number; nome: string } | null; avisos: string[] }>(
    `/orders/${orderId}/resposta-cotacao/`,
    { resposta, origem: 'plataforma', observacao: observacao || '', ...(categoria ? { categoria } : {}) });

/* RECUSA COM MOTIVO (@R 22/09 13:55): a categoria é fechada para poder CONTAR ("quem recusa mais e
   por quê"); o texto guarda as palavras do médico. Nada sobrescreve: cada recusa é uma linha. */
export type CategoriaRecusa = 'SEM_INTERESSE' | 'FORA_ESPECIALIDADE' | 'PRECO' | 'AGENDA' | 'FALTA_EXAME' | 'OUTRO';
export const CATEGORIAS_RECUSA: { valor: CategoriaRecusa; rotulo: string }[] = [
  { valor: 'SEM_INTERESSE', rotulo: 'Sem interesse' },
  { valor: 'FORA_ESPECIALIDADE', rotulo: 'Fora da especialidade' },
  { valor: 'PRECO', rotulo: 'Preço / valor' },
  { valor: 'AGENDA', rotulo: 'Agenda' },
  { valor: 'FALTA_EXAME', rotulo: 'Falta exame / documento' },
  { valor: 'OUTRO', rotulo: 'Outro (escreva o motivo)' },
];
export interface RecusaCotacao {
  id: number; idMedico: number; medico: string; categoria: string; categoriaRotulo: string;
  motivo: string | null; origem: string; registradoPor: string | null;
  ficouComMedico: number | null; em: string | null;
}
export const getRecusasDoPedido = (orderId: number) =>
  api.get<{ orderId: number; total: number; itens: RecusaCotacao[] }>(`/orders/${orderId}/recusas-cotacao/`);
/** ids dos pedidos com recusa → o selo nas filas (1 chamada por tela, igual ao "!" das anotações) */
export const getRecusasIds = () =>
  api.get<{ ids: Record<string, { n: number; medicos: string[] }> }>('/orders/recusas-cotacao/ids/');

/** Anotações internas do pedido (reunião Fabrício 20/09, Fase 5). */
export interface Anotacao { id: number; texto: string; usuario: string | null; createDate: string }
export const getAnotacoes = (orderId: number) => api.get<{ orderId: number; total: number; itens: Anotacao[] }>(`/orders/${orderId}/anotacoes/`);
export const criarAnotacao = (orderId: number, texto: string) => api.post<{ orderId: number; total: number; itens: Anotacao[] }>(`/orders/${orderId}/anotacoes/`, { texto });
export const apagarAnotacao = (orderId: number, anotacaoId: number) => api.delete(`/orders/${orderId}/anotacoes/${anotacaoId}/`);
/** ids dos pedidos com anotação → o "!" nas filas (1 chamada por tela) */
export const getAnotacoesIds = () => api.get<{ ids: Record<string, number> }>('/orders/anotacoes/ids/');

/** Bilhete de ida e volta fase 3 → jurídico (1.1) → fase 3 (pedido do Fabrício, reunião 20/09). */
export type TipoPendenciaJuridica = 'INTEIRO_TEOR' | 'ACHAR_MEDICO' | 'CONTATO_PACIENTE_ADVOGADO' | 'VERIFICACAO' | 'RECADO';
export interface PendenciaJuridica {
  id: number; orderId: number; tipo: TipoPendenciaJuridica; tipoRotulo: string; texto: string;
  status: 'ABERTA' | 'RESPONDIDA' | 'LIDA' | 'CANCELADA';
  abertaPor: string | null; abertaEm: string; faseOrigem: string; statusOrcamentoOrigem: string | null;
  resposta: string | null; medicoIndicado: number | null; medicoIndicadoNome: string | null;
  respondidaPor: string | null; respondidaEm: string | null; lidaPor: string | null; lidaEm: string | null;
  faseRestaurada?: boolean | null; canceladaPor?: string | null; canceladaEm?: string | null; motivoCancelamento?: string | null;
  pecasNaFilaDeLeitura?: number; medicoMudouNoMeio?: boolean; foraDoJuridico?: boolean; parada?: boolean; semLerHaDias?: number | null;
  paciente?: string; procedimento?: string; faseAtual?: string; nprocesso?: string | null; dias?: number;
}
export interface ParaAgirPendencias { meusRetornos: number; paradas: number; semLerAntigas: number }
export interface ListaPendenciasJuridicas { total: { ABERTA: number; RESPONDIDA: number; LIDA: number }; paraAgir?: ParaAgirPendencias; diasParada?: number; itens: PendenciaJuridica[] }
export const getPendenciasJuridicas = (params: { status?: string; orderId?: number; paraLer?: 1 } = {}) =>
  api.get<ListaPendenciasJuridicas>('/orders/pendencias-juridicas/', { params });
export const abrirPendenciaJuridica = (orderId: number, tipo: TipoPendenciaJuridica, texto: string) =>
  api.post<PendenciaJuridica>(`/orders/${orderId}/pendencia-juridica/`, { tipo, texto });
export const responderPendenciaJuridica = (orderId: number, pendenciaId: number, resposta: string, medicoId?: number | null, semPeca?: boolean, semMedico?: boolean) =>
  api.post<PendenciaJuridica>(`/orders/${orderId}/pendencia-juridica/${pendenciaId}/responder/`, { resposta, medicoId: medicoId ?? null, semPeca: !!semPeca, semMedico: !!semMedico });
export const cancelarPendenciaJuridica = (orderId: number, pendenciaId: number, motivo: string) =>
  api.post<PendenciaJuridica>(`/orders/${orderId}/pendencia-juridica/${pendenciaId}/cancelar/`, { motivo });
export const marcarPendenciaLida = (orderId: number, pendenciaId: number) =>
  api.post<PendenciaJuridica>(`/orders/${orderId}/pendencia-juridica/${pendenciaId}/lida/`, {});

/* LINK RASTREÁVEL DOS DOCUMENTOS (@R 21/09 18:27) — 1 link seguro da G4MED no lugar dos links
   públicos: registra cada abertura, só visualiza (imagem com marca d'água), revogável. */
export const previaLinkDocumentos = (orderId: number) =>
  api.get(`/orders/${orderId}/link-documentos/previa/`);
export const gerarLinkDocumentos = (orderId: number, dados: {
  destino?: string; medicoId?: number | null; mostrarValores: boolean;
  anexosExcluidos?: number[]; referenciasExcluidas?: number[];
  /** @R 22/09: os pagamentos do Estado que VÃO ao médico (lista positiva; [] = nenhum). */
  pagamentosIncluidos?: number[];
  /** @R 22/09: o relatório médico da IA que vai junto (o que quem copia viu). */
  resumoId?: number | null;
  /** #611 (@R 22/09): "Suas cotações anteriores" do próprio prestador. Nasce desligado. */
  historicoIncluido?: boolean;
  /** @R 23/09 12:51: valor que o médico vê, ajustado por quem copia — {idReferência: valor}. */
  valoresAjustados?: Record<string, number>;
  /** @R 23/09 13:19: link sem valores e o processo (inteiro teor) não tem orçamento de outro prestador. */
  avisoSemReferencia?: boolean;
}) =>
  api.post(`/orders/${orderId}/link-documentos/`, dados);
/* Relatório médico da IA (@R 22/09): gerado no clique, a partir dos documentos MARCADOS, com citação
   por documento e página. ~30 s. */
/* @R 22/09 12:03: a especialidade do pedido não consta no cadastro do destino → adicionar com 1 clique. */
export const adicionarEspecialidadeDestino = (orderId: number, medicoId: number) =>
  api.post(`/orders/${orderId}/link-documentos/especialidade-destino/`, { medicoId });
export const gerarRelatorioMedico = (orderId: number, anexosExcluidos: number[]) =>
  api.post(`/orders/${orderId}/link-documentos/relatorio/`, { anexosExcluidos }, { timeout: 120000 });
export const rastroLinksDocumentos = (orderId: number) =>
  api.get(`/orders/${orderId}/link-documentos/rastro/`);
export const revogarLinkDocumentos = (linkId: number) =>
  api.post(`/link-documentos/${linkId}/revogar/`, {});

/** Filtro por texto inteligente da tabela (@R 23/09): texto livre (médico, cirurgia, área, especialidade…)
 *  + ids que a tela mostra → a IA devolve os que casam, como entendeu e quais colunas usou. */
export interface FiltroTextoResposta {
  entendi: string; colunasUsadas: string[]; ids: number[]; porque: Record<string, string>;
  analisados: number; descartadosInvalidos: number;
}
export const filtrarTextoIA = (texto: string, ids: number[]) =>
  api.post<FiltroTextoResposta>('/ia/filtrar-texto/', { texto, ids });

/** @R 23/09 12:54: a IA confere se cada orçamento listado no Copiar COBRE a cirurgia pedida.
 *  Reusa o parecer guardado para o mesmo procedimento; forcar refaz. Só aponta, não muda o link. */
export interface ParecerCompat { compativel: 'SIM' | 'PARCIAL' | 'NAO' | 'ILEGIVEL' | 'FOLHA_INDISPONIVEL' | 'ERRO';
  oQueCobre?: string | null; motivo?: string | null;
  /** @R 23/09 15:18: o que FAZER com o orçamento + por quê + o que o médico lê no link */
  considerar?: 'SIM' | 'COM_RESSALVA' | 'NAO' | null; justificativa?: string | null; ressalvaParaMedico?: string | null }
export const conferirCompatibilidade = (orderId: number, forcar = false) =>
  api.post<{ procedimentoPedido: string; itens: Record<string, ParecerCompat>; restantes: number }>(
    `/orders/${orderId}/link-documentos/compatibilidade/`, { forcar });

/** Custo de IA (@R 23/09 13:54): somas feitas no banco por área, sistema, rota, modelo, usuário e dia. */
export interface LinhaCustoIA { chamadas: number; custoUsd: number; tokensEntrada: number; tokensSaida: number; falhas: number; semPreco: number; [campo: string]: any }
export interface CustosIA {
  dias: number; desde: string; contandoDesde: string | null;
  total: LinhaCustoIA; porArea: LinhaCustoIA[]; porSistema: LinhaCustoIA[]; porRota: LinhaCustoIA[];
  porModelo: LinhaCustoIA[]; porUsuario: LinhaCustoIA[];
  porDia: { dia: string; chamadas: number; custoUsd: number }[];
  ultimas: { em: string; area: string; sistema: string; rota: string | null; usuario: string | null; modelo: string;
    tokensEntrada: number | null; tokensSaida: number | null; custoUsd: number | null; duracaoMs: number | null; ok: boolean; erro: string | null }[];
  precos: Record<string, { entrada: number; saida: number }>;
}
export const getCustosIA = (dias: number) => api.get<CustosIA>('/ia/custos/', { params: { dias } });

/** Lápis do selo Segredo/Sem segredo (@R 23/09 15:25): motivo obrigatório, vira anotação na ficha. */
export const mudarSegredo = (orderId: number, segredo: boolean, motivo: string) =>
  api.post(`/orders/${orderId}/segredo/`, { segredo, motivo });
