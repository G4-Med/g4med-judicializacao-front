import { useEffect, useMemo, useState } from 'react';
import { getOrders, getPerdas, getResultados, getSaudeDados, type SaudeDados } from '../../services/api/orders';
import { estaEmAberto } from '../../services/reguaFases';
import { ComoEstamos } from './ComoEstamos';
import { Button } from 'primereact/button'
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useHomeOnboarding } from '../../app/onboarding/useHomeOnboarding';
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

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
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

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}






export function HomePage() {
  useHomeOnboarding();
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
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

    const orcamentosEnviadosMes = orders.filter(
      (item) =>
        item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO &&
        isSameMonth(agora, item.dataStatusOrcamento)
    ).length;
    const orcamentosEnviadosVida = orders.filter(
      (item) => item.statusOrcamento === STATUS_ORCAMENTO_ENVIADO
    ).length;

    const aguardandoOrcamentoMes = orders.filter(
      (item) =>
        item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO && isSameMonth(agora, item.dataPedido)
    ).length;
    const aguardandoOrcamentoVida = orders.filter(
      (item) => item.statusProcesso === STATUS_AGUARDANDO_ORCAMENTO
    ).length;

    const pedidosRecusadosMes = perdas.filter((item) =>
      isSameMonth(agora, item.dataStatusPerda ?? item.dataPedido)
    ).length;
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

    const cardsMesVida: CardMesVida[] = [
      {
        titulo: 'QTDE de Pedidos',
        icone: 'pi pi-inbox',
        valorMes: pedidosMes,
        valorVida: pedidosVida,
      },
      {
        titulo: 'QTDE Orçamentos Enviados',
        icone: 'pi pi-send',
        valorMes: orcamentosEnviadosMes,
        valorVida: orcamentosEnviadosVida,
      },
      {
        titulo: 'QTDE Aguardando Orçamento',
        icone: 'pi pi-clock',
        valorMes: aguardandoOrcamentoMes,
        valorVida: aguardandoOrcamentoVida,
      },
      {
        titulo: 'QTDE Pedidos Recusados',
        icone: 'pi pi-ban',
        valorMes: pedidosRecusadosMes,
        valorVida: pedidosRecusadosVida,
      },
    ];

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

    return {
      cardsMesVida,
      cardsValorQuantidade,
      graficoProcedimentos,
      maiorValorGrafico,
      mesAtualLabel: agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      pedidosAbertosQtd,
      ganhosQuantidade,
      perdasQuantidade,
    };
  }, [orders, perdas, resultados]);

  // Série temporal de perdas — agrupa por ANO quando a base cobre 2+ anos;
  // por MÊS quando ainda não (senão o gráfico teria uma barra só).



  const handleExportarRelatorio = async () => {
    const elemento = document.getElementById('home-report-export');
    if (!elemento || exportando) return;

    try {
      setExportando(true);

      const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f7fafc',
        logging: false,
        windowWidth: elemento.scrollWidth,
        windowHeight: elemento.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const imageHeight = (canvas.height * usableWidth) / canvas.width;

      let remainingHeight = imageHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imageHeight);
      remainingHeight -= pageHeight - margin * 2;

      while (remainingHeight > 0) {
        pdf.addPage();
        position = margin - (imageHeight - remainingHeight);
        pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imageHeight);
        remainingHeight -= pageHeight - margin * 2;
      }

      const dataArquivo = new Date().toISOString().slice(0, 10);
      pdf.save(`home-relatorio-${dataArquivo}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar relatório da Home:', error);
      alert('Não foi possível exportar o relatório em PDF.');
    } finally {
      setExportando(false);
    }
  };

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
          <div className="home-hero__actions">
            <Button
              label={exportando ? 'Exportando...' : 'Exportar relatório'}
              icon="pi pi-download"
              outlined
              disabled={loading || exportando}
              onClick={handleExportarRelatorio}
              className="home-hero__export-button"
            />
          </div>
        </div>

        <div className="home-hero__panel">
          <div className="home-hero__metric">
            <strong>Mês atual</strong>
            <span>{indicadores.mesAtualLabel}</span>
          </div>
          <div className="home-hero__metric"
            title="Pedidos que estão em alguma fase do funil (jurídico, orçamento, protocolar, aguardando resposta, enviado à SES). NÃO inclui ganho, perda, nem os registros de carga histórica — esses não são trabalho em aberto.">
            <strong>Pedidos em aberto</strong>
            <span>{loading ? '--' : indicadores.pedidosAbertosQtd}</span>
          </div>
          {/* A cadeia do dinheiro do Estado (portal MG → 331 → 548 → aqui) chegou hoje?
              Verde = empenhos tocados há <30h E régua há <3h. Vermelho diz QUAL elo parou.
              O dado é medido no banco, não em log — dado velho aqui é elo parado, sem exceção. */}
          <div
            className="home-hero__metric"
            title={
              saudeDados
                ? `Empenhos: ${saudeDados.empenhos.n} registros · pagamentos até ${saudeDados.empenhos.maxPagamento ?? '?'} · empenhos até ${saudeDados.empenhos.maxEmpenho ?? '?'} · atualizado há ${saudeDados.empenhos.idadeHoras ?? '?'}h\nRégua 548: ${saudeDados.regua.n} · atualizada há ${saudeDados.regua.idadeHoras ?? '?'}h`
                : 'Não foi possível medir o frescor dos dados do Estado'
            }
          >
            <strong>Dados do Estado</strong>
            <span>
              {!saudeDados
                ? '—'
                : saudeDados.empenhos.ok && saudeDados.regua.ok
                  ? `✓ atualizados · pagos até ${saudeDados.empenhos.maxPagamento ?? '?'}`
                  : !saudeDados.empenhos.ok
                    ? `⚠ empenhos parados há ${Math.round(saudeDados.empenhos.idadeHoras ?? 0)}h`
                    : `⚠ régua 548 parada há ${Math.round(saudeDados.regua.idadeHoras ?? 0)}h`}
            </span>
          </div>
          <div className="home-hero__metric"
            title="Vida toda, mesma fonte para os dois lados: pedidos com statusProcesso Ganho e Perda. Registros de carga histórica não entram em nenhum dos dois.">
            <strong>Ganhos x perdas <small>(vida toda)</small></strong>
            <span>
              {loading
                ? '--'
                : `${indicadores.ganhosQuantidade}  / ${indicadores.perdasQuantidade} `}
            </span>
          </div>
        </div>
      </section>

      <ComoEstamos linhas={orders as any[]} />

      <PainelColapsavel
        titulo="Visão mensal x histórico"
        sub="Valor principal do mês atual com apoio do número acumulado de toda a base."
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
              <span className="home-card__period">Mês atual</span>
              <div className="home-card__metric">{loading ? '--' : card.valorMes}</div>
              <div className="home-card__meta">
                <span>Vida toda:</span>
                <strong>{loading ? '--' : card.valorVida}</strong>
              </div>
            </article>
          ))}
        </div>
      </PainelColapsavel>

    </div>
  );
}
