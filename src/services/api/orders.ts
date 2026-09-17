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
export const getEmailsPendentesCount = () => api.get('/orders/emails/pendentes-count/');
export const enviarEmailPendente = (id: number) => api.post(`/orders/emails/${id}/enviar/`);
export const enviarEmailsPendentesLote = (ids: number[]) => api.post('/orders/emails/enviar-lote/', { ids });
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
export const uploadAnexoOrder = (orderId: number, file: File, tipo: string) => {
  const form = new FormData();
  form.append('file', file);
  form.append('tipo', tipo);
  return api.post(`/orders/${orderId}/anexos/upload/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
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
  confianca: 'alta' | 'media' | 'baixa';
  isFallback: boolean;
  /** a ORDEM, ¬um nome: os adequados do melhor para o menos indicado (@R 17/09, SPEC 3.1) */
  candidatos?: {
    idMedico: number; nomeMedico: string; porque: string;
    respondeOrcamento?: string | null; diasParaResponder?: number | null;
    jaFezDestaSubarea?: number | null; atendePediatrico?: string | null;
    cargaAtual?: string | null; cidade?: string | null;
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
export const montarCotacaoMedico = (orderId: number, medico?: string) =>
  api.post(`/orders/${orderId}/solicitar-cotacao-medico/`, { medico });

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

export const getPreferencia = (chave: string) =>
  api.get(`/preferencias/${chave}/`);

export const salvarPreferencia = (chave: string, valor: Record<string, unknown>) =>
  api.post(`/preferencias/${chave}/`, { valor });

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

/** Os pedidos que esperam alguém escolher o número do processo — de QUALQUER fase.
 *  @R 17/09: a varredura gravou 163 sugestões e 65 dos 69 pedidos estão num status que
 *  nenhuma tela lista. A fase é o que esconde; por isso esta fila não filtra por ela. */
export const getCnjAConfirmar = () => api.get('/cnj-a-confirmar/');
