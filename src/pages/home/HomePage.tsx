import { Fragment, useEffect, useMemo, useState } from 'react';
import { getOrders, getPerdas, getResultados, getSaudeDados, type SaudeDados } from '../../services/api/orders';
import { estaEmAberto } from '../../services/reguaFases';
import { ComoEstamos } from './ComoEstamos';
import { AcessosBloco } from './AcessosBloco';
import { Button } from 'primereact/button'
import { useHomeOnboarding } from '../../app/onboarding/useHomeOnboarding';
import { useEmailsJuridicoContagem } from '../emailsJuridico/EmailsJuridicoPage';
import { useNavigate } from 'react-router-dom';
import { listarBaterValores, type ItemBaterValores } from '../../services/api/baterValores';
import './HomePage.css';

interface OrderResumo {
  id: number;
  paciente?: string;
  procedimento?: string;
  dataPedido?: string | null;
  dataStatusPerda?: string | null;
  statusProcesso?: string | null;
  statusOrcamento?: string | null;
  statusJuridico?: string | null;
  refPreco?: number | null;
  valorOrcamento?: number | null;
  valorGanho?: number | null;
  dataStatusOrcamento?: string | null;
}

interface ResultadoResumo {
  id: number;
  procedimento?: string;
  dataPedido?: string | null;
  dataResultado?: string | null;
  valorOrcamento?: number | null;
  valorGanho?: number | null;
  statusProcesso?: string | null;
}

interface PerdaResumo {
  id: number;
  procedimento?: string;
  dataPedido?: string | null;
  dataStatusPerda?: string | null;
  valorOrcamento?: number | null;
  refPreco?: number | null;
}

// Painel colapsável da home (mandato @R 22/08): painéis nascem FECHADOS — o hover
// destaca o cabeçalho e o clique abre/fecha. `extras` (busca/badge) só aparecem
// abertos e não disparam o toggle (stopPropagation).
function PainelColapsavel({
  titulo,
  sub,
  extras,
  className,
  children,
}: {
  titulo: string;
  sub?: string;
  extras?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className={`home-collapse ${aberto ? 'home-collapse--open' : ''} ${className ?? ''}`}>
      <div className="home-collapse__head">
        <button
          type="button"
          className="home-collapse__toggle"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
        >
          <span className="home-collapse__chevron">
            <i className={`pi ${aberto ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
          </span>
          <span className="home-collapse__titles">
            <span className="home-panel__title">{titulo}</span>
            {sub && <span className="home-panel__sub">{sub}</span>}
          </span>
        </button>
        {aberto && extras && (
          <div className="home-collapse__extras" onClick={(e) => e.stopPropagation()}>
            {extras}
          </div>
        )}
      </div>
      {aberto && <div className="home-collapse__body">{children}</div>}
    </section>
  );
}

interface CardMesVida {
  titulo: string;
  icone: string;
  valorMes: number;
  valorVida: number;
  /** % do total que entrou no mês (@R 22/09: "o SLA que precisamos saber") e o mesmo % do mês passado. */
  pctMes: number | null;
  pctMesPassado: number | null;
  qtdMesPassado: number;
  /** @R 22/09 18:30: subir é bom (enviados) ou ruim (aguardando, recusados)? Pinta o p.p. de verde/vermelho. */
  bomSeSobe: boolean | null;
  /** @R 22/09 18:21: R$ do mês. Projetado = soma da referência de preço (refPreco); realizado = soma do
      orçamento que mandamos (valorOrcamento) — só existe onde houve orçamento. */
  projetado: number;
  realizado: number | null;
  semReferencia: number;
}

/** Uma linha da comparação mês a mês (coorte: pedidos que ENTRARAM no mês, onde estão hoje). */
interface LinhaComparacaoMes {
  chave: string;
  rotulo: string;
  total: number;
  enviados: number;
  aguardando: number;
  recusados: number;
  projetado: number;
  realizadoEnviados: number;
}

interface CardBaseValorQuantidade {
  titulo: string;
  icone: string;
  valorPrincipal: number;
  quantidade: number;
  tipo?: 'success' | 'danger' | 'warning' | 'info';
  // ── A RÉGUA DE CADA PERCENTUAL, declarada pelo CARD (08/09) ──────────────────
  // Medição da eliza-financeiro: circulam 4 números de conversão nas telas e nenhum
  // diz seu denominador — 30,2% (19/63, só quem teve orçamento decidido) e 5,1%
  // (19/372, todo desfecho) são os DOIS verdadeiros e parecem contradizer-se.
  // Sublinha e não tooltip: tooltip esconde a régua atrás de um gesto, e quem lê o
  // número rápido é exatamente quem precisa dela.
  // Por que a régua é do CARD e não do render: o render antes assumia que
  // `percentual: true` significava "conversão por valor", e imprimia a régua da
  // conversão em QUALQUER card percentual — o Segredo de Justiça herdava a legenda
  // "por valor (R$ ganho ÷ ...)" sendo % de pedidos, e imprimia a CONTAGEM com "%".
}

// O TIPO é o assert (sugestão da eliza-financeiro, 08/09): card `percentual` SEM régua
// declarada não compila — `npm run build` falha em vez de herdar a legenda do vizinho.
// Sem isto, o terceiro card a usar a flag repete o bug: a garantia seria "lembrar", e
// lembrar não é garantia. O custo do assert é zero em runtime (some no build).
type CardValorQuantidade =
  | (CardBaseValorQuantidade & {
      percentual?: false;
      reguaPrincipal?: never;
      reguaSecundaria?: never;
      secundariaEhPercentual?: never;
    })
  | (CardBaseValorQuantidade & {
      percentual: true;
      reguaPrincipal: string;      // o denominador do número GRANDE, em palavras
      reguaSecundaria: string;     // o que o número de baixo significa
      // false = `quantidade` é contagem (imprime "N"), true = é percentual ("N%").
      // Este campo É o bug do "123%": sem ele, o render imprimia "%" numa CONTAGEM.
      secundariaEhPercentual: boolean;
    });

interface GraficoPerdaProcedimento {
  procedimento: string;
  valorOrcamentoEnviado: number;
  valorOrcamentoGanho: number;
  dataStatusPerda?: string | null;
}

const STATUS_AGUARDANDO_ORCAMENTO = 'Aguardando Orçamento';
const STATUS_ORCAMENTO_ENVIADO = 'Orçamento Enviado';
const STATUS_PROCESSO_GANHO = 'Ganho';
const STATUS_PROCESSO_PERDA = 'Perda';
// Espelho de `STATUS_HISTORICOS` (backend/models.py). São 566 dos 1133 pedidos —
// METADE da base é carga histórica, e ela nunca foi pedido vivo. Qualquer taxa cujo
// numerador só possa vir de pedido vivo precisa deste denominador, não do total.
const STATUS_PROCESSO_HISTORICOS = ['Histórico - Base Antiga', 'Histórico - Sem Rastro'];

// ── POR QUE A COMPARAÇÃO IGNORA ACENTO (08/09, achado da eliza-financeiro) ──────
// O SQL Server aqui tem collation ACCENT-INSENSITIVE: no Django, filtrar por
// 'Historico' (sem acento) casa os mesmos 566 que 'Histórico'. O ORM PERDOA — e por
// isso um filtro escrito errado funciona por sorte de banco, sem nunca acusar.
// O JavaScript não perdoa: compara byte a byte. Um espelho manual com o acento
// errado (ou em NFD, que é IDÊNTICO na tela e diferente na memória) faria
// `pedidosVivos` filtrar ZERO, o denominador voltar a 1133 e a sublinha mentir de
// novo — muda, sem erro, exatamente o engano que acabamos de curar.
// Medido nos dois lados HOJE: front e API estão em NFC (U+00F3), então funciona.
// Isto aqui não é o conserto de um defeito vivo — é tirar a classe do caminho, para
// que a próxima pessoa a editar a lista não precise saber de nada disso.
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const STATUS_HISTORICOS_NORM = STATUS_PROCESSO_HISTORICOS.map(semAcento);
const ehCargaHistorica = (status?: string | null) =>
  STATUS_HISTORICOS_NORM.includes(semAcento(status ?? ''));

function parseApiDate(value?: string | null): Date | null {
  if (!value) return null;

  /* ⚠ O `T00:00:00` NÃO É ENFEITE — sem ele TODA data voltava um dia (medido 19/09).
     A API manda DateField puro ("2026-09-15", sem hora). `new Date("2026-09-15")` é lido
     como meia-noite UTC; em Brasília (UTC-3) isso vira 14/09 às 21h. Acrescentar a hora
     faz o JS interpretar como data LOCAL, que é o que ela é.
     O efeito nos cards era nas bordas do mês: pedido do dia 1º de setembro NÃO contava em
     setembro, e o do dia 1º de outubro CONTAVA. Medido em produção: 52 dos 1.163 pedidos
     (4,5%) têm dataPedido no dia 1. Mesmo defeito que o ComoEstamos.tsx teve e curou. */
  const semHora = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const normalized = semHora
    ? `${value}T00:00:00`
    : (value.includes('T') ? value : value.replace(' ', 'T'));
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) return parsed;

  const [datePart, timePart] = value.split(' ');
  const dateBits = datePart?.split(/[/-]/) ?? [];

  if (dateBits.length === 3) {
    const [first, second, third] = dateBits.map(Number);
    const hasTime = timePart ? `T${timePart}` : 'T00:00:00';

    if (String(dateBits[0]).length === 4) {
      const iso = `${first.toString().padStart(4, '0')}-${second.toString().padStart(2, '0')}-${third
        .toString()
        .padStart(2, '0')}${hasTime}`;
      const isoParsed = new Date(iso);
      return Number.isNaN(isoParsed.getTime()) ? null : isoParsed;
    }

    const br = `${third.toString().padStart(4, '0')}-${second.toString().padStart(2, '0')}-${first
      .toString()
      .padStart(2, '0')}${hasTime}`;
    const brParsed = new Date(br);
    return Number.isNaN(brParsed.getTime()) ? null : brParsed;
  }

  return null;
}

function isSameMonth(reference: Date, value?: string | null): boolean {
  const parsed = parseApiDate(value);
  if (!parsed) return false;

  return parsed.getFullYear() === reference.getFullYear() && parsed.getMonth() === reference.getMonth();
}

function toNumber(value?: number | null): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

/** Verde quando a variação vai no sentido bom do indicador; vermelho no ruim (@R 22/09 18:30). */
function classeDelta(delta: number, bomSeSobe: boolean | null): string {
  if (bomSeSobe === null || Math.abs(delta) < 0.05) return '';
  return (delta > 0) === bomSeSobe ? 'delta-bom' : 'delta-ruim';
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}






/** "2026-09-11" → "11/09" */
const dataCurta = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '?');

/** Dica do card "Dados do Estado": cada elo da cadeia, na ordem em que o dado anda (@R 22/09). */
function textoSaudeDados(d: SaudeDados): string {
  const f = d.fonte;
  const linhas = [
    `1. Portal do Estado (dados.mg.gov.br): ${!f?.disponivel ? 'sem informação' : f.portalVazio ? `publicando arquivos VAZIOS (visto em ${f.portalDesde?.slice(0, 16).replace('T', ' ')})` : 'arquivos com dados'}`,
    `2. Coleta: ${f?.disponivel ? `último dado novo há ${Math.round((f.coletaIdadeHoras ?? 0) / 24)} dia(s) · empenhos até ${dataCurta(f.coletaMaxEmpenho)} (com nº do processo) · ${f.semCnj ?? '?'} sem nº do processo` : 'sem informação'}`,
    `3. Carga no MedCheck (diária 08:07): ${f?.disponivel ? `última rodada ${f.rodadaEm?.slice(0, 16).replace('T', ' ')} · ${f.rc === 0 ? 'ok' : `falhou (${f.etapa})`}` : 'nunca mandou o estado'}`,
    `4. Pagamentos no MedCheck: ${d.empenhos.n} registros · o mais recente é de ${dataCurta(d.empenhos.maxPagamento)} (${d.resumo?.diasSemPagamentoNovo ?? '?'} dias; alerta acima de ${d.resumo?.limiteDias ?? 7})`,
    `5. Régua de preços: recalculada há ${d.regua.idadeHoras ?? '?'} h`,
  ];
  return linhas.join('\n');
}

export function HomePage() {
  const emailsJur = useEmailsJuridicoContagem();   // linha 1.2 do painel (@R 21/09)
  /* Linha 3.1 do painel (@R 22/09: "criar uma fase bater preços na parte de baixo para ela").
     Vem da PRÓPRIA fila da 3,1 (a mesma régua da tela). null = não carregou → mostra '--', nunca 0. */
  const [fila31, setFila31] = useState<ItemBaterValores[] | null>(null);
  useEffect(() => {
    listarBaterValores('todos').then((r) => setFila31(r.data.itens)).catch(() => setFila31(null));
  }, []);
  const navigate = useNavigate();
  const [compararAberto, setCompararAberto] = useState(false);
  useHomeOnboarding();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderResumo[]>([]);
  const [resultados, setResultados] = useState<ResultadoResumo[]>([]);
  const [perdas, setPerdas] = useState<PerdaResumo[]>([]);
  // Contagens (mês×vida) = número neutro (só o ícone guarda a categoria).
  const metricCardVariants = [
    'home-card--navy home-card--count',
    'home-card--green home-card--count',
    'home-card--amber home-card--count',
    'home-card--rose home-card--count',
  ];
  // Valores: cor semântica SÓ onde importa — Ganho (verde) e Perda (vermelho).
  // Em aberto e Conversão ficam neutros (evita o arco-íris "cara-de-IA").

  // Frescor dos dados do ESTADO (@R 09/09: "saber que a atualização está rodando"). Busca
  // separada e fail-soft: se este endpoint cair, a Home continua; o card mostra "—".
  const [saudeDados, setSaudeDados] = useState<SaudeDados | null>(null);
  useEffect(() => {
    getSaudeDados()
      .then((r) => setSaudeDados(r.data))
      .catch(() => setSaudeDados(null));
  }, []);

  useEffect(() => {
    setLoading(true);

    Promise.all([getOrders(), getResultados(), getPerdas()])
      .then(([ordersRes, resultadosRes, perdasRes]) => {
        setOrders((ordersRes.data as OrderResumo[]) ?? []);
        setResultados((resultadosRes.data as ResultadoResumo[]) ?? []);
        setPerdas((perdasRes.data as PerdaResumo[]) ?? []);
      })
      .catch((error) => {
        console.error('Erro ao carregar dashboard da Home', error);
      })
      .finally(() => setLoading(false));
  }, []);

  const indicadores = useMemo(() => {
    const agora = new Date();

    const pedidosMes = orders.filter((item) => isSameMonth(agora, item.dataPedido)).length;
    const pedidosVida = orders.length;

    /* COORTE DO MÊS (@R 22/09 14:00: "precisamos ver as métricas do mês corrente e não pegar um
       pedido da competência anterior e ver ela na competência atual"). Os 4 cartões do mês
       contam os MESMOS pedidos — os que ENTRARAM no mês (dataPedido) — e dizem onde cada um
       está. Antes cada cartão usava a data do seu evento: "recusados" mostrava 15 em setembro
       quando só 5 dos 48 que entraram tinham sido perdidos; os outros 10 eram de meses atrás. */
    const coorteMes = orders.filter((item) => isSameMonth(agora, item.dataPedido));
    const orcamentosEnviadosMes = coorteMes.filter(
      (item) => item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO
    ).length;
    const orcamentosEnviadosVida = orders.filter(
      (item) => item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO
    ).length;

    const aguardandoOrcamentoMes = coorteMes.filter(
      (item) => item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO
    ).length;
    const aguardandoOrcamentoVida = orders.filter(
      (item) => item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO
    ).length;

    const pedidosRecusadosMes = coorteMes.filter((item) => item.statusProcesso === 'Perda').length;
    const pedidosRecusadosVida = perdas.length;

    /* "EM ABERTO" SÓ CONTA QUEM ESTÁ MESMO EM ALGUMA FASE (@R 17/09: "isso aqui tá
       errado também").
       A régua antiga era por SUBTRAÇÃO: tudo que não é Ganho nem Perda. Medido em
       produção 17/09 isso dava 775 de 1.158 — e dentro desses 775 estavam 371
       "Histórico - Base Antiga" + 195 "Histórico - Sem Rastro", 566 registros de carga
       histórica que não estão em fase nenhuma e ninguém vai trabalhar. O número real de
       pedidos vivos é 209.
       Régua por INCLUSÃO: está em aberto quem está numa das fases do funil. Assim um
       status novo (ou um legado que apareça amanhã) não entra por acidente — para
       entrar, alguém precisa listá-lo aqui, de propósito. */
    /* A lista de fases mora em services/reguaFases — a mesma que a dashboard usa. Ela
       nasceu aqui como cópia local e durou 20 minutos: duas cópias da mesma régua é
       exatamente como a home e a dashboard passaram a discordar sem ninguém notar. */
    const pedidosEmAberto = orders.filter((item) => estaEmAberto(item.statusProcesso));
    const pedidosEmAbertoComOrcamento = pedidosEmAberto.filter(
      (item) => toNumber(item.valorOrcamento) > 0
    );

    const valorEmAberto = pedidosEmAbertoComOrcamento.reduce(
      (acc, item) => acc + toNumber(item.valorOrcamento),
      0
    );

    /* GANHOS E PERDAS SAÍRAM DE `resultados` E VIERAM PARA `orders` (@R 17/09).
       As duas listas chegam de rotas diferentes, com recortes diferentes — e estavam
       lado a lado na mesma faixa da tela, como se falassem da mesma coisa. Medido:
       a tela mostrava 19/44 enquanto o banco tem 19 Ganho e 364 Perda. O 19 batia por
       coincidência (todos os ganhos estão nos dois recortes); o 44 era outro universo.
       Dois números vizinhos precisam vir da MESMA fonte, senão o leitor faz a conta
       entre eles e a conta mente. */
    const ganhos = orders.filter((item) => item.statusProcesso === STATUS_PROCESSO_GANHO);
    const valorGanho = ganhos.reduce(
      (acc, item) => acc + (toNumber(item.valorGanho) || toNumber(item.valorOrcamento)),
      0
    );

    const perdasResultado = orders.filter((item) => item.statusProcesso === STATUS_PROCESSO_PERDA);
    const valorPerda = perdasResultado.reduce(
      (acc, item) => acc + (toNumber(item.valorOrcamento) || 0),
      0
    );

    const conversaoValorBase = valorGanho + valorPerda;
    const conversaoValor = conversaoValorBase > 0 ? (valorGanho / conversaoValorBase) * 100 : 0;

    const ganhosQuantidade = ganhos.length;
    const perdasQuantidade = perdasResultado.length;
    const conversaoQuantidadeBase = ganhosQuantidade + perdasQuantidade;
    const conversaoQuantidade =
      conversaoQuantidadeBase > 0 ? Math.round((ganhosQuantidade / conversaoQuantidadeBase) * 100) : 0;

    /* SLA DO MÊS (@R 22/09 15:55: "o percentual do Total de cada um do mês para sabermos nosso
       aproveitamento... e compararmos com o mês passado... isso para mim é o sla"). Mesmo corte de
       coorte dos números: denominador = pedidos que ENTRARAM no mês; numerador = quantos deles estão
       hoje em cada situação. ⚠ O mês passado é a foto de HOJE da coorte dele — ela teve mais tempo
       para andar, então "enviados" tende a ser maior e "aguardando" menor lá. Está dito na dica. */
    const mesPassadoRef = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const coortePassado = orders.filter((item) => isSameMonth(mesPassadoRef, item.dataPedido));
    const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);
    const slaPar = (filtro: (item: OrderResumo) => boolean) => {
      const mes = coorteMes.filter(filtro).length;
      const passado = coortePassado.filter(filtro).length;
      return { pctMes: pct(mes, coorteMes.length), pctMesPassado: pct(passado, coortePassado.length), qtdMesPassado: passado };
    };
    const slaEnviados = slaPar((item) => item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO);
    const slaAguardando = slaPar((item) => item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO);
    const slaRecusados = slaPar((item) => item.statusProcesso === 'Perda');
    const slaPedidos = { pctMes: coorteMes.length ? 100 : null, pctMesPassado: coortePassado.length ? 100 : null, qtdMesPassado: coortePassado.length };

    const ehEnviado = (item: OrderResumo) => item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO;
    const ehAguardando = (item: OrderResumo) => item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO;
    const ehRecusado = (item: OrderResumo) => item.statusProcesso === 'Perda';
    // R$ da coorte do mês (@R 22/09 18:21). Mesmos pedidos do número grande.
    const reais = (filtro: (item: OrderResumo) => boolean, comRealizado: boolean) => {
      const grupo = coorteMes.filter(filtro);
      return {
        projetado: grupo.reduce((acc, item) => acc + toNumber(item.refPreco), 0),
        realizado: comRealizado ? grupo.reduce((acc, item) => acc + toNumber(item.valorOrcamento), 0) : null,
        semReferencia: grupo.filter((item) => !(toNumber(item.refPreco) > 0)).length,
      };
    };

    const cardsMesVida: CardMesVida[] = [
      {
        titulo: 'QTDE de Pedidos',
        icone: 'pi pi-inbox',
        valorMes: pedidosMes,
        valorVida: pedidosVida,
        ...slaPedidos,
        bomSeSobe: null,
        ...reais(() => true, false),
      },
      {
        titulo: 'QTDE Orçamentos Enviados',
        icone: 'pi pi-send',
        valorMes: orcamentosEnviadosMes,
        valorVida: orcamentosEnviadosVida,
        ...slaEnviados,
        bomSeSobe: true,
        ...reais(ehEnviado, true),
      },
      {
        titulo: 'QTDE Aguardando Orçamento',
        icone: 'pi pi-clock',
        valorMes: aguardandoOrcamentoMes,
        valorVida: aguardandoOrcamentoVida,
        ...slaAguardando,
        bomSeSobe: false,
        ...reais(ehAguardando, false),
      },
      {
        titulo: 'QTDE Pedidos Recusados',
        icone: 'pi pi-ban',
        valorMes: pedidosRecusadosMes,
        valorVida: pedidosRecusadosVida,
        ...slaRecusados,
        bomSeSobe: false,
        ...reais(ehRecusado, false),
      },
    ];

    /* @R 22/09 18:30: "um botão para abrir todos os meses e fazermos uma comparação — ver a evolução
       do SLA". Mesma régua dos cartões (coorte por dataPedido, situação de HOJE), um mês por linha. */
    const porMes = new Map<string, LinhaComparacaoMes>();
    for (const item of orders) {
      if (!item.dataPedido) continue;
      const chave = String(item.dataPedido).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(chave)) continue;
      let linha = porMes.get(chave);
      if (!linha) {
        const [a, m] = chave.split('-');
        linha = { chave, rotulo: `${m}/${a}`, total: 0, enviados: 0, aguardando: 0, recusados: 0, projetado: 0, realizadoEnviados: 0 };
        porMes.set(chave, linha);
      }
      linha.total += 1;
      linha.projetado += toNumber(item.refPreco);
      if (ehEnviado(item)) { linha.enviados += 1; linha.realizadoEnviados += toNumber(item.valorOrcamento); }
      if (ehAguardando(item)) linha.aguardando += 1;
      if (ehRecusado(item)) linha.recusados += 1;
    }
    const comparacaoMeses = [...porMes.values()].sort((x, y) => (x.chave < y.chave ? 1 : -1));

    // Taxa de Segredo de Justiça (task #194, 26/08) — classifica o banco inteiro (¬só
    // o mês) contra o "Segredo de Justiça" já gravado em statusJuridico (censo 26/08:
    // é texto livre marcado manualmente no Jurídico, sem enum dedicado — comparação
    // por igualdade de string é o que o resto do sistema já faz com este campo).
    const segredoJusticaOrders = orders.filter((item) => item.statusJuridico === 'Segredo de Justiça');
    const segredoJusticaQtd = segredoJusticaOrders.length;
    // ── O DENOMINADOR TEM QUE SER DA MESMA POPULAÇÃO DO NUMERADOR (08/09) ────────
    // Media em produção: 123 pedidos em segredo de justiça, e ZERO deles é carga
    // histórica. Mas `pedidosVida` (= orders.length, 1133) tem 566 históricos dentro
    // — metade da base. Dividir um numerador 100% vivo por um denominador vivo+morto
    // dilui a taxa pela metade: dava 10,9% quando a régua honesta é 21,7% (123/567).
    // Não é arredondamento: é a taxa errada, e para baixo — some justamente o sinal.
    // Filtrar aqui é seguro nos dois mundos: se a API um dia já mandar `orders` sem
    // histórico, `pedidosVivos` passa a ser igual a `orders.length` e nada muda.
    const pedidosVivos = orders.filter((item) => !ehCargaHistorica(item.statusProcesso)).length;
    const segredoJusticaTaxa = pedidosVivos > 0 ? (segredoJusticaQtd / pedidosVivos) * 100 : 0;

    const cardsValorQuantidade: CardValorQuantidade[] = [
      {
        titulo: 'Valor em Aberto',
        icone: 'pi pi-wallet',
        valorPrincipal: valorEmAberto,
        quantidade: pedidosEmAbertoComOrcamento.length,
        tipo: 'warning',
      },
      {
        titulo: 'Valor Ganho',
        icone: 'pi pi-check-circle',
        valorPrincipal: valorGanho,
        quantidade: ganhosQuantidade,
        tipo: 'success',
      },
      {
        titulo: 'Valor Perda',
        icone: 'pi pi-times-circle',
        valorPrincipal: valorPerda,
        quantidade: perdasQuantidade,
        tipo: 'danger',
      },
      {
        titulo: 'Conversão',
        icone: 'pi pi-percentage',
        valorPrincipal: conversaoValor,
        quantidade: conversaoQuantidade,
        tipo: 'info',
        percentual: true,
        reguaPrincipal: `do VALOR: ${formatCurrency(valorGanho)} de ${formatCurrency(conversaoValorBase)} decididos`,
        reguaSecundaria: `${ganhosQuantidade} de ${conversaoQuantidadeBase} pedidos com desfecho`,
        secundariaEhPercentual: true,
      },
      {
        titulo: 'Taxa Segredo de Justiça',
        icone: 'pi pi-lock',
        valorPrincipal: segredoJusticaTaxa,
        quantidade: segredoJusticaQtd,
        tipo: 'info',
        percentual: true,
        reguaPrincipal: `${segredoJusticaQtd} de ${pedidosVivos} pedidos vivos (fora carga histórica)`,
        reguaSecundaria: 'pedidos em segredo de justiça',
        secundariaEhPercentual: false,
      },
    ];

    const perdasOrders = orders.filter(
      (item) =>
        item.statusProcesso === STATUS_PROCESSO_PERDA &&
        (toNumber(item.valorOrcamento) > 0 || toNumber(item.valorGanho) > 0)
    );

    const mapaGrafico = new Map<string, GraficoPerdaProcedimento>();

    perdasOrders.forEach((item) => {
      const procedimento = item.procedimento?.trim() || 'Procedimento não informado';
      const atual = mapaGrafico.get(procedimento) ?? {
        procedimento,
        valorOrcamentoEnviado: 0,
        valorOrcamentoGanho: 0,
        dataStatusPerda: item.dataStatusPerda ?? null,
      };

      atual.valorOrcamentoEnviado += toNumber(item.valorOrcamento);
      atual.valorOrcamentoGanho += toNumber(item.valorGanho);
      const dataAtual = parseApiDate(atual.dataStatusPerda);
      const dataItem = parseApiDate(item.dataStatusPerda);
      if (dataItem && (!dataAtual || dataItem.getTime() > dataAtual.getTime())) {
        atual.dataStatusPerda = item.dataStatusPerda ?? null;
      }
      mapaGrafico.set(procedimento, atual);
    });

    const graficoProcedimentos = Array.from(mapaGrafico.values())
      .sort((a, b) => {
        const dataA = parseApiDate(a.dataStatusPerda)?.getTime() ?? 0;
        const dataB = parseApiDate(b.dataStatusPerda)?.getTime() ?? 0;
        return dataB - dataA;
      })
      .slice(0, 10);

    const maiorValorGrafico = graficoProcedimentos.reduce((acc, item) => {
      return Math.max(acc, item.valorOrcamentoEnviado, item.valorOrcamentoGanho);
    }, 0);

    const pedidosAbertosQtd = pedidosEmAberto.length;
    /* Quantos pedidos esperam ação em CADA fase (@R 19/09/2026: "adicionar quantos pedidos na
       fase 1, fase 2, fase 3, fase 4 aguardando ação"). O total continua sendo o mesmo
       `pedidosEmAberto` — é só a mesma contagem aberta por fase, pela régua de reguaFases.
       Os rótulos são os valores EXATOS do banco (censo 19/09: 'Enviado à SES - Sem Protocolo'
       tem sufixo — um filtro por 'Enviado à SES' devolvia zero em silêncio). */
    const contarFase = (...status: string[]) =>
      pedidosEmAberto.filter((item) => status.includes(item.statusProcesso ?? '')).length;
    /* Reunião @R × Fabrício 20/09 (00:10:54): "selecionar médico tá com zero, mas era legal ela
       mostrar aqui que ela tá com zero". Fase 2 (Selecionar médico) e fase 3 (Orçamento) têm o
       MESMO statusProcesso; o que separa é ter médico (idMedico > 1) ou não. A fase 2 aparece
       SEMPRE, inclusive com 0 — zero visível é informação; fase ausente é dúvida. */
    const emOrcamento = pedidosEmAberto.filter((item) => item.statusProcesso === 'Aguardando Orçamento');
    const semMedico = (item: any) => !item.idMedico || Number(item.idMedico) === 1;
    const noJuridico = pedidosEmAberto.filter((item) => item.statusProcesso === 'Aguardando Juridico');
    const emPendencia = (item: any) => item.statusJuridico === 'Pendência jurídica';
    const porFase = [
      /* @R 21/09 01:53: "no home terá que colocar no painel principal mais uma fase ali para saber".
         1.1 = pedido que está no jurídico COM pendência (mesmo statusProcesso da fase 1; o que separa
         é statusJuridico). Aparece sempre, inclusive com 0. A fase 1 desconta a 1.1 para a soma das
         linhas continuar igual ao total de pedidos aguardando ação. */
      { fase: '1', nome: 'Jurídico', rota: '/juridico', qtd: noJuridico.filter((item) => !emPendencia(item)).length },
      { fase: '1.1', nome: 'Pendências jurídicas', rota: '/juridico?aba=pendencias', qtd: noJuridico.filter(emPendencia).length },
      { fase: '2', nome: 'Selecionar médico', rota: '/selecionar-medico', qtd: emOrcamento.filter(semMedico).length },
      { fase: '3', nome: 'Orçamento', rota: '/orcamento-medico', qtd: emOrcamento.filter((item) => !semMedico(item)).length },
      { fase: '4', nome: 'Protocolar', rota: '/para-protocolar', qtd: contarFase('Aguardando Protocolar') },
      { fase: '5', nome: 'Aguardando resposta', rota: '/protocolados', qtd: contarFase('Aguardando Resposta', 'Aguardando Resposta - Segredo de Justiça') },
      { fase: '5b', nome: 'Enviado à SES (sem protocolo)', rota: '/enviado-ses', qtd: contarFase('Enviado à SES - Sem Protocolo') },
    ];

    /* A VERIFICAR — o Estado pagou e o pedido continua aberto (medido 21/09/2026 em produção,
       com a MESMA função que alimenta esta tela: 103 pedidos em aberto com sinal
       PAGO_APOS_O_PEDIDO, R$ 6,86 mi; em 28 o valor pago bate com o nosso orçamento em até 2%).
       `empenho548.pago` aqui já é o pago DEPOIS do pedido (0 divergências contra pagoAposPedido
       nos 103). A régua da podeDarBaixa dá 98 — são 5 casos de critério, não erro: esta linha
       segue a mesma régua das outras telas de empenho. O dado já existia e a tela de conferência já o lista;
       o que faltava era alguém AVISAR daqui — a Home não tinha nenhum caminho até ela, então a
       fila crescia sem ninguém ver (mediana de 24 dias sem toque).

       NÃO é "ganho": o favorecido do empenho é sempre o Tribunal (depósito judicial), nunca o
       prestador — conferido nos 28. Pagamento no processo é SINAL forte de desfecho, e o valor
       idêntico é o mais forte que temos; quem confirma é a pessoa, na tela de conferência. */
    const pagoEstadoAberto = pedidosEmAberto.filter(
      (item: any) => item?.empenho548?.sinal === 'PAGO_APOS_O_PEDIDO'
    );
    const valorBate = (item: any) => {
      const orcado = toNumber(item.valorOrcamento);
      const pago = toNumber(item?.empenho548?.pago);
      return orcado > 0 && pago > 0 && Math.abs(pago - orcado) / orcado <= 0.02;
    };
    const aVerificar = {
      qtd: pagoEstadoAberto.length,
      valorPago: pagoEstadoAberto.reduce((acc, item: any) => acc + toNumber(item?.empenho548?.pago), 0),
      exatos: pagoEstadoAberto.filter(valorBate).length,
    };

    return {
      aVerificar,
      cardsMesVida,
      comparacaoMeses,
      cardsValorQuantidade,
      graficoProcedimentos,
      maiorValorGrafico,
      mesAtualLabel: agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      pedidosAbertosQtd,
      porFase,
      ganhosQuantidade,
      perdasQuantidade,
    };
  }, [orders, perdas, resultados]);

  // Série temporal de perdas — agrupa por ANO quando a base cobre 2+ anos;
  // por MÊS quando ainda não (senão o gráfico teria uma barra só).



  return (
    <div className="home-page" id="home-report-export">
      <section className="home-hero">
        <div className="home-hero__content">
          <span className="home-hero__eyebrow"><Button icon="pi pi-circle-fill"></Button> PAINEL PRINCIPAL · {indicadores.mesAtualLabel}</span>
          <h1>Acompanhe a <span>urgência e emergência</span> de casos judiciais em um só lugar</h1>
          <p>
            Auditoria e gestão dos processos do mês com o histórico consolidado da base.
            Visualize valores em aberto, conversão financeira e a performance dos procedimentos
            com a precisão que a MEDCHECK entrega à saúde de Minas Gerais.
          </p>
        </div>

        <div className="home-hero__panel">
          <div className="home-hero__metric">
            <strong>Mês atual</strong>
            <span>{indicadores.mesAtualLabel}</span>
          </div>
          {/* @R 19/09/2026: no lugar de "Pedidos em aberto 211 / Ganhos x perdas", quantos
              esperam ação em CADA fase. O total é o mesmo 211 — aberto por fase. */}
          <div className="home-hero__metric home-hero__metric--fases"
            title="Pedidos que esperam ação, por fase do funil. NÃO inclui ganho, perda, nem os registros de carga histórica — esses não são trabalho em aberto.">
            <strong>Aguardando ação <small>({loading ? '--' : indicadores.pedidosAbertosQtd} pedidos)</small></strong>
            <ul className="home-hero__fases" aria-label="Pedidos aguardando ação por fase">
              {indicadores.porFase.map((f) => {
                /* A 3,1 automática é pedido da fase 3 parado antes da SES: sai da 3 e entra na 3.1, para a
                   soma continuar igual ao total. A MANUAL (Valéria) fica na fase em que está — só aparece no selo. */
                const auto31 = new Set((fila31 ?? []).filter((i) => i.origem !== 'MANUAL').map((i) => i.pedido));
                const manuais31 = (fila31 ?? []).filter((i) => i.origem === 'MANUAL').length;
                const qtd = f.fase === '3' && fila31
                  ? (orders as any[]).filter((o) => estaEmAberto(o.statusProcesso) && o.statusProcesso === 'Aguardando Orçamento'
                      && o.idMedico && Number(o.idMedico) !== 1 && !auto31.has(o.id)).length
                  : f.qtd;
                return (
                  <Fragment key={f.fase}>
                    {/* @R 22/09: clicar no nome da fase leva à tela da fase */}
                    <li style={{ cursor: 'pointer' }} title={`Abrir a fase ${f.fase} — ${f.nome}`}
                      onClick={() => navigate(f.rota)} role="link" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(f.rota); }}>
                      <em>{f.fase}</em>
                      <span className="home-hero__fase-nome home-hero__fase-link">{f.nome}</span>
                      <b>{loading ? '--' : qtd}</b>
                    </li>
                    {f.fase === '3' && (
                      <li className={auto31.size || manuais31 ? 'home-hero__fase--alerta' : ''}
                        title={fila31 ? `Orçamentos parados antes de ir à SES para conferir o valor: ${auto31.size} entraram sozinhos (há orçamento de outro prestador no processo) · ${manuais31} colocado(s) à mão (ajuste do juiz, mudança do pedido…), que continuam na fase em que estão.` : 'Não foi possível carregar a fila da 3,1'}
                        style={{ cursor: 'pointer' }} onClick={() => navigate('/bater-valores')}>
                        <em>3.1</em>
                        <span className="home-hero__fase-nome">
                          Bater valores
                          {manuais31 ? <span className="home-hero__selo">+{manuais31} manual(is)</span> : null}
                        </span>
                        <b>{fila31 ? auto31.size : '--'}</b>
                      </li>
                    )}
                  </Fragment>
                );
              })}
              {/* @R 21/09/2026 (verbatim): "área no próprio sistema em /home para ver todos [os ofícios]
                  que chegam". Não é pedido, é e-mail/ofício sem tratamento — por isso fora da soma acima. */}
              <li key="1.2" className={(emailsJur?.novosJustica || emailsJur?.vencidosJustica) ? 'home-hero__fase--alerta' : ''}
                title={emailsJur ? `Justiça: ${emailsJur.abertosJustica} sem tratamento · ${emailsJur.novosJustica} novo(s) desde 01/09 · ${emailsJur.vencidosJustica} com prazo vencido — outros e-mails na fila: ${emailsJur.abertosSemRuido - emailsJur.abertosJustica}` : 'carregando'}
                style={{ cursor: 'pointer' }} onClick={() => navigate('/emails-juridico?classe=JUSTICA')}>
                <em>1.2</em>
                <span className="home-hero__fase-nome">
                  Avisos da Justiça
                  {emailsJur?.novosJustica ? <span className="home-hero__selo">🔔 {emailsJur.novosJustica} novo(s)</span> : null}
                  {emailsJur?.vencidosJustica ? <span className="home-hero__selo home-hero__selo--vencido">{emailsJur.vencidosJustica} vencido(s)</span> : null}
                </span>
                <b>{emailsJur ? emailsJur.abertosJustica : '--'}</b>
              </li>
              {/* O Estado pagou e o pedido continua aberto. Fora da soma das fases: não é uma fase
                  do funil, é dinheiro esperando conferência humana — e sem esta linha ninguém
                  chegava à tela que já listava tudo. */}
              <li key="verificar" className={indicadores.aVerificar.exatos ? 'home-hero__fase--alerta' : ''}
                title={`O portal do Estado registra pagamento DEPOIS do nosso pedido em ${indicadores.aVerificar.qtd} pedido(s) ainda em aberto — ${formatCurrency(indicadores.aVerificar.valorPago)} no total. Em ${indicadores.aVerificar.exatos} deles o valor pago bate com o nosso orçamento (até 2%), o sinal mais forte de que a cirurgia foi a nossa. O favorecido do empenho é sempre o Tribunal, então isto NÃO é ganho confirmado: quem confirma é você, na tela de conferência.`}
                style={{ cursor: 'pointer' }} onClick={() => navigate('/painel-resultados?aba=verificar')}>
                <em>💰</em>
                <span className="home-hero__fase-nome">
                  A verificar — o Estado pagou
                  {indicadores.aVerificar.exatos
                    ? <span className="home-hero__selo">{indicadores.aVerificar.exatos} com valor idêntico</span>
                    : null}
                </span>
                <b>{loading ? '--' : indicadores.aVerificar.qtd}</b>
              </li>
            </ul>
          </div>
          {/* A cadeia do dinheiro do Estado (portal MG → 331 → 548 → aqui) chegou hoje?
              Verde = empenhos tocados há <30h E régua há <3h. Vermelho diz QUAL elo parou.
              O dado é medido no banco, não em log — dado velho aqui é elo parado, sem exceção. */}
          <div
            className="home-hero__metric home-hero__metric--link"
            role="link"
            tabIndex={0}
            onClick={() => navigate('/rotina-dados-estado')}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/rotina-dados-estado'); }}
            title={(saudeDados ? textoSaudeDados(saudeDados) : 'Não foi possível medir o frescor dos dados do Estado')
              + '\n\nClique para ver a rotina inteira, etapa por etapa.'}
          >
            <strong>Dados do Estado</strong>
            <span style={saudeDados && !(saudeDados.resumo?.ok ?? (saudeDados.empenhos.ok && saudeDados.regua.ok)) ? { color: '#fcd34d' } : undefined}>
              {!saudeDados
                ? '—'
                : saudeDados.resumo
                  ? (saudeDados.resumo.ok
                    ? `✓ pagos até ${dataCurta(saudeDados.empenhos.maxPagamento)}`
                    : `⚠ ${saudeDados.resumo.texto} · pagos até ${dataCurta(saudeDados.empenhos.maxPagamento)}`)
                  : saudeDados.empenhos.ok && saudeDados.regua.ok
                    ? `✓ atualizados · pagos até ${saudeDados.empenhos.maxPagamento ?? '?'}`
                    : `⚠ dados parados · pagos até ${saudeDados.empenhos.maxPagamento ?? '?'}`}
            </span>
          </div>
        </div>
      </section>

      <ComoEstamos linhas={orders as any[]} />

      {/* @R 22/09 18:18: quem entrou, quando, e quem está ativo agora. Só aparece para Admin/Gerente (o servidor recusa os demais). */}
      <AcessosBloco />

      <PainelColapsavel
        titulo="Visão mensal x histórico"
        sub="Número grande: só os pedidos que ENTRARAM neste mês e onde cada um está hoje (a soma não passa do total do mês). Embaixo, a base inteira."
        className="home-block"
      >
        <div className="home-grid home-grid--four">
          {indicadores.cardsMesVida.map((card, index) => (
            <article key={card.titulo} className={`home-card home-card--metric home-card--count ${metricCardVariants[index] ?? 'home-card--navy'}`}>
              <div className="home-card__top">
                <h3 className="home-card__title">{card.titulo}</h3>
                <div className="home-card__icon">
                  <i className={card.icone} />
                </div>
              </div>
              <span className="home-card__period" title="Só os pedidos que entraram neste mês — onde cada um está hoje">Entraram no mês</span>
              <div className="home-card__metric">
                {loading ? '--' : card.valorMes}
                {!loading && card.pctMes !== null && index > 0 && (
                  <small className="home-card__pct" title="Percentual do total de pedidos que entraram neste mês">{card.pctMes.toLocaleString('pt-BR')}%</small>
                )}
              </div>
              {!loading && index > 0 && (
                <div className="home-card__sla"
                  title={`Mês passado: ${card.qtdMesPassado} pedido(s) da coorte do mês passado estão hoje nesta situação. Atenção: eles tiveram mais tempo para andar — compare sabendo disso.`}>
                  Mês passado: <strong>{card.pctMesPassado === null ? '—' : `${card.pctMesPassado.toLocaleString('pt-BR')}%`}</strong>
                  {card.pctMes !== null && card.pctMesPassado !== null && (
                    <span className={`home-card__sla-delta ${classeDelta(card.pctMes - card.pctMesPassado, card.bomSeSobe)}`}>
                      {` (${card.pctMes - card.pctMesPassado >= 0 ? '+' : ''}${(Math.round((card.pctMes - card.pctMesPassado) * 10) / 10).toLocaleString('pt-BR')} p.p.)`}
                    </span>
                  )}
                </div>
              )}
              {!loading && index === 0 && (
                <div className="home-card__sla" title="Pedidos que entraram no mês passado inteiro">
                  Mês passado: <strong>{card.qtdMesPassado}</strong>
                </div>
              )}
              {!loading && (
                <div className="home-card__reais"
                  title={`Projetado = soma da referência de preço dos pedidos deste cartão (${card.semReferencia} sem referência entram como R$ 0).${card.realizado !== null ? ' Realizado = soma do orçamento que enviamos.' : ''}`}>
                  <span>{index === 0 ? 'Valor total do mês (projetado)' : 'Projetado'}</span>
                  <strong>{formatCurrency(card.projetado)}</strong>
                  {card.realizado !== null && (
                    <>
                      <span>Realizado (orçado)</span>
                      <strong>{formatCurrency(card.realizado)}</strong>
                    </>
                  )}
                  {index > 0 && indicadores.cardsMesVida[0].projetado > 0 && (
                    <small>{(Math.round((card.projetado / indicadores.cardsMesVida[0].projetado) * 1000) / 10).toLocaleString('pt-BR')}% do valor do mês</small>
                  )}
                </div>
              )}
              <div className="home-card__meta">
                <span>Vida toda:</span>
                <strong>{loading ? '--' : card.valorVida}</strong>
              </div>
            </article>
          ))}
        </div>
        <div className="home-comparar">
          <button type="button" className="home-comparar__botao" onClick={() => setCompararAberto((v) => !v)}>
            <i className={compararAberto ? 'pi pi-chevron-up' : 'pi pi-chart-line'} /> {compararAberto ? 'Fechar comparação' : 'Comparar todos os meses'}
          </button>
          {compararAberto && (
            <div className="home-comparar__tabela">
              <p>Cada linha = os pedidos que <b>entraram</b> naquele mês e onde estão <b>hoje</b>. Meses antigos tiveram mais tempo para andar — por isso "aguardando" costuma ser menor neles.</p>
              <table>
                <thead>
                  <tr><th>Mês</th><th>Entraram</th><th>Enviados</th><th>Aguardando</th><th>Recusados</th><th>R$ projetado</th><th>R$ orçado (enviados)</th></tr>
                </thead>
                <tbody>
                  {indicadores.comparacaoMeses.map((l, i) => {
                    const ant = indicadores.comparacaoMeses[i + 1];
                    const p = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 1000) / 10 : null);
                    const cel = (n: number, bomSeSobe: boolean, antN?: number) => {
                      const v = p(n, l.total);
                      const va = ant ? p(antN ?? 0, ant.total) : null;
                      const cls = v !== null && va !== null ? classeDelta(v - va, bomSeSobe) : '';
                      return <td className={cls}>{n} <small>{v === null ? '' : `(${v.toLocaleString('pt-BR')}%)`}</small></td>;
                    };
                    return (
                      <tr key={l.chave}>
                        <td>{l.rotulo}</td>
                        <td>{l.total}</td>
                        {cel(l.enviados, true, ant?.enviados)}
                        {cel(l.aguardando, false, ant?.aguardando)}
                        {cel(l.recusados, false, ant?.recusados)}
                        <td>{formatCurrency(l.projetado)}</td>
                        <td>{formatCurrency(l.realizadoEnviados)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="home-comparar__legenda"><span className="delta-bom">verde</span> = melhorou em relação ao mês anterior · <span className="delta-ruim">vermelho</span> = piorou.</p>
            </div>
          )}
        </div>
      </PainelColapsavel>

    </div>
  );
}
