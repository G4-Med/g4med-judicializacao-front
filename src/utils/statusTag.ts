// Paleta SÓBRIA de status — pílulas de tom suave (fundo claro + texto colorido
// escuro + borda sutil), agrupadas em 5 famílias semânticas. Antes eram 18 cores
// saturadas sólidas (rainbow "cara-de-IA"); agora é calmo, profissional e legível,
// mantendo a distinção funcional. Mandato @R 2026-07-21 ("nada muito colorido").
type TagStyle = { backgroundColor: string; color: string; borderColor: string };

// Famílias (soft tint): AZUL=jurídico/em-rota · ÂMBAR=aguardando · VERDE=positivo
// · VERMELHO=perda/negativo · NEUTRO=sem info/segredo.
const AZUL: TagStyle    = { backgroundColor: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' };
const AMBAR: TagStyle   = { backgroundColor: '#fef6e7', color: '#92600e', borderColor: '#f4dda8' };
const VERDE: TagStyle   = { backgroundColor: '#e9f7ef', color: '#15803d', borderColor: '#bbe6c9' };
const VERMELHO: TagStyle= { backgroundColor: '#fdecec', color: '#b42318', borderColor: '#f6cfcb' };
const NEUTRO: TagStyle  = { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' };

const STATUS_COLOR_MAP: Record<string, TagStyle> = {
  // Aguardando (em andamento)
  'aguardando juridico': AZUL,
  'aguardando orcamento': AMBAR,
  'aguardando protocolar': AMBAR,
  'aguardando resposta': AMBAR,
  'aguardando resposta - segredo de justica': NEUTRO,
  // Positivo / avançou
  ganho: VERDE,
  'orcamento enviado': VERDE,
  cotar: AZUL,
  'solicitado ao medico': AZUL,
  'solicitar exames': AMBAR,
  // Negativo / perda
  perda: VERMELHO,
  'nao cotar': VERMELHO,
  'perda pelo medico': VERMELHO,
  'perda pelo juridico': VERMELHO,
  'perda pelo orcamento': VERMELHO,
  'perda por falta de especialista': NEUTRO,
  // Neutro / sigilo
  'segredo de justica': NEUTRO,
};

function normalizeStatus(status: string) {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getStatusTagStyle(status: string): TagStyle {
  const normalizedStatus = normalizeStatus(status || '');
  return STATUS_COLOR_MAP[normalizedStatus] ?? NEUTRO;
}
