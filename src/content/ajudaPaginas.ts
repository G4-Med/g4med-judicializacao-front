import { ETAPAS, DONOS } from '../pages/processoOperacional/conteudo';

/**
 * AJUDA POR PÁGINA — o conteúdo que o botão "?" do header mostra.
 *
 * POR QUE um arquivo separado: o mapa rota→ajuda cresce com o tempo e não
 * é lógica de UI — é conhecimento sobre o sistema. Separar deixa quem for
 * atualizar o texto de uma tela sem precisar mexer em componente.
 *
 * Páginas de Protocolos REUSAM `ETAPAS` (a mesma fonte do Processo
 * Operacional e do PrimeiraVisitaInfo) — nunca duplicam o texto.
 */

export interface AjudaPagina {
  titulo: string;
  oQueE: string;
  contem: string[];
  indicadores?: string[];
}

function ajudaDaEtapa(id: string): AjudaPagina | null {
  const etapa = ETAPAS.find((e) => e.id === id);
  if (!etapa) return null;
  return {
    titulo: etapa.titulo,
    oQueE: `${etapa.oQueFaz} Dono: ${DONOS[etapa.dono].rotulo}.${etapa.prazo ? ` SLA: ${etapa.prazo}.` : ''}`,
    contem: etapa.comoFazer,
  };
}

export const AJUDA_PAGINAS: Record<string, AjudaPagina> = {
  '/home': {
    titulo: 'Home',
    oQueE: 'Visão geral do mês atual — quantos pedidos entraram, quantos foram resolvidos e o volume por especialidade.',
    contem: ['Cards do mês atual (pedidos, ganhos, perdas)', 'Atalhos para as telas mais usadas'],
  },
  '/dashboard': {
    titulo: 'Dashboard',
    oQueE: 'Visão analítica com filtro por período e por médico — para entender o desempenho ao longo do tempo, não só o mês corrente.',
    contem: ['KPIs do período filtrado', 'Gráficos de evolução', 'Quando um médico é selecionado: período completo de atuação dele e tempo desde o primeiro pedido'],
  },
  '/funil': {
    titulo: 'Funil',
    oQueE: 'Mostra, de cada 100 pedidos que entram, quantos avançam por cada fase e onde eles "morrem" (perda) — a régua de saúde do processo inteiro.',
    contem: ['Funil por fase (Triagem → Médico → Orçamento → Protocolo → Decisão)', 'Lista detalhada por trás de cada número, com filtro por especialidade/médico/idade'],
  },
  '/sla': {
    titulo: 'SLA',
    oQueE: 'Quanto tempo cada fase levou, contra o prazo combinado com o Estado — e quem está segurando o quê agora.',
    contem: ['Cumprimento por período (mensal/trimestral/semestral/anual/personalizado)', 'Tempo por médico', 'Lista de fora do prazo agora', 'Trajetória de 1 pedido (busca por número ou nome do paciente)'],
  },
  '/processos': {
    titulo: 'Processos',
    oQueE: 'A lista mestra de todos os pedidos, com filtro em cada coluna — o painel de controle geral.',
    contem: ['Cards de indicador (recolhem no painel "Indicadores")', 'Tabela completa com filtros', 'O pontinho colorido ao lado do status mostra quem é o dono daquela fase (verde=Instituto Mateus, roxo=G4MED, laranja=Judiciário)'],
    indicadores: ['Total de Processos', 'Processos Ativos', 'Processos Baixados', '% de Respostas', 'Aguardando Jurídico/Orçamento/Protocolar/Respostas'],
  },
  '/clientes': {
    titulo: 'Clientes',
    oQueE: 'Cadastro de médicos e suas informações (especialidade, dados bancários, contato).',
    contem: ['Lista de médicos cadastrados', 'Edição de dados do médico'],
  },
  '/relatorios/resumido': {
    titulo: 'Relatório Resumido',
    oQueE: 'O resumo que sai da empresa PARA o médico — pendências dele com o SLA correndo e o que já foi resolvido, sem valor de comissão interna.',
    contem: ['Seleção de 1 médico', 'Pendentes agora, com aviso de prazo', 'Resolvidos recentemente', 'Botão para enviar por e-mail direto ao médico'],
  },
  '/relatorios/consolidado': {
    titulo: 'Relatório Consolidado',
    oQueE: 'Visão interna completa por médico — todos os status e valores, para o Instituto conferir antes de qualquer coisa sair.',
    contem: ['Filtro por médico', 'Resumo por status', 'Exportação em PDF'],
  },
  '/emails': {
    titulo: 'Emails',
    oQueE: 'Fila de e-mails que o sistema monta automaticamente (respostas à Secretaria, cobranças) e que ainda não foram enviados.',
    contem: ['Lista de e-mails pendentes', 'Envio individual ou em lote'],
  },
};

// Protocolos reusam ETAPAS — registrados aqui para o lookup por rota funcionar.
const MAPA_ROTA_ETAPA: Record<string, string> = {
  '/juridico': 'juridico',
  '/selecionar-medico': 'selecionar-medico',
  '/orcamento-medico': 'orcamento-medico',
  '/para-protocolar': 'para-protocolar',
  '/protocolados': 'protocolados',
  '/segredo-justica': 'segredo-justica',
};

Object.entries(MAPA_ROTA_ETAPA).forEach(([rota, etapaId]) => {
  const ajuda = ajudaDaEtapa(etapaId);
  if (ajuda) AJUDA_PAGINAS[rota] = ajuda;
});

export function ajudaDaRota(pathname: string): AjudaPagina | null {
  return AJUDA_PAGINAS[pathname] ?? null;
}
