import { useEffect, useMemo, useState } from 'react';
import { Chart } from 'primereact/chart';
import { Dropdown } from 'primereact/dropdown';
import { DatePickerPeriodo, type PeriodoSelecionado } from '../../components/DatePicker/DatePicker';
import { getMedicosCompleto, getOrders, getPerdas, getResultados } from '../../services/api/orders';
import './DashboardPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { getKpiCompletude } from '../../services/api/orders';

interface MedicoOption {
  label: string;
  value: number | null;
}

interface OrderDashboard {
  id: number;
  idMedico?: number | null;
  area?: string | null;          // especialidade do PEDIDO (o backend já mandava)
  procedimento?: string | null;
  statusProcesso?: string | null;
  statusOrcamento?: string | null;
  statusPerda?: string | null;
  dataPedido?: string | null;
  valorOrcamento?: number | null;
  valorGanho?: number | null;
}

interface ResultadoDashboard {
  id: number;
  idMedico?: number | null;
  statusProcesso?: string | null;
  dataPedido?: string | null;
  valorOrcamento?: number | null;
  valorGanho?: number | null;
}

interface PerdaDashboard {
  id: number;
  idMedico?: number | null;
  statusPerda?: string | null;
  dataPedido?: string | null;
  valorOrcamento?: number | null;
  refPreco?: number | null;
}

interface MedicoLookup {
  id: number;
  nome: string;
  especialidade?: string | null;
  status?: string | null;
}

/* A mesma especialidade chega escrita de N jeitos ("Ortopedia", "ORTOPEDIA",
   "Ginecologia e Obstetrícia" × "GINECOLOGIA E OBSTETRICIA"): em produção são
   36 grafias cruas para 25 especialidades reais (medido 28/08). Sem normalizar,
   o dashboard mostraria a mesma especialidade partida em duas linhas. */
const normEsp = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

/* Só para exibir: ORTOPEDIA -> Ortopedia (mantendo siglas curtas em caixa alta). */
const tituloEsp = (s: string) =>
  s.toLowerCase().replace(/(^|[\s/-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase());

/* ============================================================
   MEDCHECK — paleta dos charts
   ============================================================ */
const MC = {
  green:    '#00a651',
  greenDk:  '#008f46',
  greenLt:  '#4fc588',
  navy:     '#0a3d62',
  navyMid:  '#1d5a8a',
  navyLt:   '#3a7aa8',
  rose:     '#c8394d',
  amber:    '#d08a1c',
  muted:    '#5b6b7a',
  border:   '#e3eaef',
};

/* Cor SEMÂNTICA por rótulo de status (¬por posição na lista — antes "Perda"
   caía no laranja e "Perda pelo Jurídico" no VERDE, invertendo a leitura). */
const corSemanticaStatus = (label: string): string => {
  const l = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (l.includes('perda') || l.includes('nao cotar')) return MC.rose;
  if (l.includes('ganho') || l.includes('enviado')) return MC.green;
  if (l.includes('aguardando') || l.includes('solicitar')) return MC.amber;
  return MC.navy;
};

/* Donut de perdas: TODAS as fatias são perda — variar em tons de vermelho/neutro
   (distinguível sem mentir a semântica; verde numa perda comunica o oposto). */
const TONS_PERDA = ['#c8394d', '#8f2436', '#e07a89', '#64748b', '#b5836a'];

function parseApiDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const [datePart, timePart] = value.split(' ');
  const bits = datePart?.split(/[/-]/) ?? [];
  if (bits.length !== 3) return null;
  const [first, second, third] = bits.map(Number);
  const hasTime = timePart ? `T${timePart}` : 'T00:00:00';
  if (String(bits[0]).length === 4) {
    const iso = `${first.toString().padStart(4, '0')}-${second.toString().padStart(2, '0')}-${third.toString().padStart(2, '0')}${hasTime}`;
    const result = new Date(iso);
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const br = `${third.toString().padStart(4, '0')}-${second.toString().padStart(2, '0')}-${first.toString().padStart(2, '0')}${hasTime}`;
  const result = new Date(br);
  return Number.isNaN(result.getTime()) ? null : result;
}

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function endOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }

function withinPeriodo(value: string | null | undefined, periodo: PeriodoSelecionado): boolean {
  const parsed = parseApiDate(value);
  if (!parsed) return false;
  const inicio = periodo.dataInicio ? startOfDay(periodo.dataInicio) : null;
  const fim = periodo.dataFim ? endOfDay(periodo.dataFim) : null;
  if (!inicio || !fim) return true;
  return parsed >= inicio && parsed <= fim;
}

function toNumber(value?: number | null): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

/* "2 anos e 3 meses" / "5 meses" / "12 dias" — arredonda pra baixo em cada
   unidade (2 anos e 11 meses ¬vira "3 anos"), porque o objetivo é responder
   "desde quando" com precisão, ¬impressionar com o número redondo maior. */
function tempoDecorridoTexto(inicio: Date, fim: Date): string {
  let anos = fim.getFullYear() - inicio.getFullYear();
  let meses = fim.getMonth() - inicio.getMonth();
  if (fim.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 0) { anos -= 1; meses += 12; }

  if (anos <= 0 && meses <= 0) {
    const dias = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000));
    if (dias <= 0) return 'hoje';
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }

  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
  return partes.join(' e ');
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return formatCurrency(value);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/* ============================================================
   Chart options — barras VERTICAIS coloridas (status pedido / perda)
   ============================================================ */
function createVerticalBarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: MC.navy, titleColor: '#fff', bodyColor: '#fff',
        borderColor: MC.green, borderWidth: 1, padding: 10, cornerRadius: 8,
      }
    },
    scales: {
      x: {
        ticks: { color: MC.muted, font: { family: 'Inter, sans-serif', size: 12 }, maxRotation: 90, autoSkip: false },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: MC.muted, font: { family: 'Inter, sans-serif', size: 11 }, precision: 0 },
        grid: { color: MC.border, drawBorder: false }
      }
    }
  };
}

/* coluna por dia */
function createColumnOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: MC.navy, titleColor: '#fff', bodyColor: '#fff',
        borderColor: MC.green, borderWidth: 1, padding: 10, cornerRadius: 8,
      }
    },
    scales: {
      x: {
        ticks: { color: MC.muted, font: { family: 'Inter, sans-serif', size: 11 } },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: MC.muted, font: { family: 'Inter, sans-serif', size: 11 }, precision: 0 },
        grid: { color: MC.border, drawBorder: false }
      }
    }
  };
}

/* doughnut da % de perda */
function createDoughnutOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: MC.navy, titleColor: '#fff', bodyColor: '#fff',
        padding: 10, cornerRadius: 8,
      }
    }
  };
}

export function DashboardPage() {
  // KPI '% cadastro completo' (task #217 peça 4) — série do completar_cadastro (batch 03:00)
  const [completude, setCompletude] = useState<any>(null);
  useEffect(() => {
    getKpiCompletude().then(({ data }) => setCompletude(data.ultima_medicao)).catch(() => setCompletude(null));
  }, []);

  const [medicosOptions, setMedicosOptions] = useState<MedicoOption[]>([
    { label: 'Todos os médicos', value: null }
  ]);
  const [medicoSelecionado, setMedicoSelecionado] = useState<number | null>(null);
  // @R 28/08: "selecionar a especialidade... entender os médicos por especialidade...
  // ou podemos escolher todos e ver todos os médicos". null = todas.
  const [especialidadeSel, setEspecialidadeSel] = useState<string | null>(null);
  const [medicosCompletos, setMedicosCompletos] = useState<MedicoLookup[]>([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoSelecionado>({
    tipo: 'atual',
    dataInicio: null,
    dataFim: null
  });
  const [orders, setOrders] = useState<OrderDashboard[]>([]);
  const [resultados, setResultados] = useState<ResultadoDashboard[]>([]);
  const [perdas, setPerdas] = useState<PerdaDashboard[]>([]);
  const [medicosLookup, setMedicosLookup] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([getOrders(), getResultados(), getPerdas(), getMedicosCompleto()])
      .then(([ordersRes, resultadosRes, perdasRes, medicosRes]) => {
        setOrders((ordersRes.data as OrderDashboard[]) ?? []);
        setResultados((resultadosRes.data as ResultadoDashboard[]) ?? []);
        setPerdas((perdasRes.data as PerdaDashboard[]) ?? []);

        const medicos = (medicosRes.data as any[]).map((medico) => ({
          id: medico.id,
          nome: medico.nomeSistema || medico.razaoSocial || medico.nome || `Médico ${medico.id}`,
          especialidade: medico.especialidade ?? null,
          status: medico.status ?? null,
        })) as MedicoLookup[];
        setMedicosCompletos(medicos);

        setMedicosOptions([
          { label: 'Todos os médicos', value: null },
          ...medicos.map((medico) => ({ label: medico.nome, value: medico.id }))
        ]);

        setMedicosLookup(
          medicos.reduce<Record<number, string>>((acc, medico) => {
            acc[medico.id] = medico.nome;
            return acc;
          }, {})
        );
      })
      .catch((error) => console.error('Erro ao carregar dashboard', error));
  }, []);

  const baseOrders = useMemo(() => {
    if (medicoSelecionado === null) return orders;
    return orders.filter((item) => item.idMedico === medicoSelecionado);
  }, [orders, medicoSelecionado]);

  const ordersLookup = useMemo(() => {
    return orders.reduce<Record<number, OrderDashboard>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [orders]);

  const resolveMedicoId = (id: number, idMedico?: number | null) => idMedico ?? ordersLookup[id]?.idMedico ?? null;
  const resolveMedicoNome = (id: number, idMedico?: number | null) => {
    const resolvedId = resolveMedicoId(id, idMedico);
    return resolvedId ? medicosLookup[resolvedId] || `Médico ${resolvedId}` : 'Sem médico';
  };

  const periodOrders = useMemo(() => baseOrders.filter((item) => withinPeriodo(item.dataPedido, periodoSelecionado)), [baseOrders, periodoSelecionado]);

  /* Período completo do médico — DE PROPÓSITO ignora periodoSelecionado (usa
     baseOrders, ¬periodOrders): o filtro de data recorta a ANÁLISE, mas "desde
     quando ele atua" é uma pergunta sobre a RELAÇÃO inteira, não sobre o
     recorte. Filtrar um médico em "este mês" e ver "atua há 2 anos" é o
     ponto — mostra o histórico por trás do recorte que está na tela. */
  const medicoInfo = useMemo(() => {
    if (medicoSelecionado === null) return null;

    const datas = baseOrders
      .map((item) => parseApiDate(item.dataPedido))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (datas.length === 0) return null;

    const primeiro = datas[0];
    const ultimo = datas[datas.length - 1];
    const hoje = new Date();
    const diasSemAtividade = Math.round((hoje.getTime() - ultimo.getTime()) / 86_400_000);

    return {
      nome: medicosLookup[medicoSelecionado] || `Médico ${medicoSelecionado}`,
      desde: formatDateBR(primeiro),
      ultimoPedido: formatDateBR(ultimo),
      tempoAtuacao: tempoDecorridoTexto(primeiro, hoje),
      totalPedidosVida: baseOrders.length,
      // >45 dias sem pedido novo = sinal de baixa atividade recente, ¬"inativo"
      // (não temos como saber a razão — só o dado observável).
      semAtividadeRecente: diasSemAtividade > 45,
    };
  }, [baseOrders, medicoSelecionado, medicosLookup]);

  const baseResultados = useMemo(() => {
    if (medicoSelecionado === null) return resultados;
    return resultados.filter((item) => resolveMedicoId(item.id, item.idMedico) === medicoSelecionado);
  }, [resultados, medicoSelecionado, ordersLookup]);

  const periodResultados = useMemo(() => baseResultados.filter((item) => withinPeriodo(item.dataPedido, periodoSelecionado)), [baseResultados, periodoSelecionado]);

  const basePerdas = useMemo(() => {
    if (medicoSelecionado === null) return perdas;
    return perdas.filter((item) => resolveMedicoId(item.id, item.idMedico) === medicoSelecionado);
  }, [perdas, medicoSelecionado, ordersLookup]);

  const periodPerdas = useMemo(() => basePerdas.filter((item) => withinPeriodo(item.dataPedido, periodoSelecionado)), [basePerdas, periodoSelecionado]);

  const kpis = useMemo(() => {
    const totalOrders = baseOrders.length;
    const totalOrdersPeriodo = periodOrders.length;
    const totalOrcamentoEnviado = baseOrders.filter((item) => item.statusOrcamento === 'Orçamento Enviado').length;
    const totalOrcamentoEnviadoPeriodo = periodOrders.filter((item) => item.statusOrcamento === 'Orçamento Enviado').length;
    const totalPerdas = basePerdas.length;
    const totalPerdasPeriodo = periodPerdas.length;

    const clientesAtivosTotal = new Set(baseOrders.filter((i) => i.statusProcesso !== 'Perda' && i.statusProcesso !== 'Ganho').map((i) => i.idMedico).filter(Boolean)).size;
    const clientesAtivosPeriodo = new Set(periodOrders.filter((i) => i.statusProcesso !== 'Perda' && i.statusProcesso !== 'Ganho').map((i) => i.idMedico).filter(Boolean)).size;

    const emAbertoTotal = baseOrders.filter((i) => i.statusProcesso !== 'Perda' && i.statusProcesso !== 'Ganho' && toNumber(i.valorOrcamento) > 0);
    const emAbertoPeriodo = periodOrders.filter((i) => i.statusProcesso !== 'Perda' && i.statusProcesso !== 'Ganho' && toNumber(i.valorOrcamento) > 0);

    const ganhosTotal = baseResultados.filter((i) => i.statusProcesso === 'Ganho');
    const ganhosPeriodo = periodResultados.filter((i) => i.statusProcesso === 'Ganho');

    const valorEmAbertoTotal = emAbertoTotal.reduce((acc, i) => acc + toNumber(i.valorOrcamento), 0);
    const valorEmAbertoPeriodo = emAbertoPeriodo.reduce((acc, i) => acc + toNumber(i.valorOrcamento), 0);
    const valorGanhoTotal = ganhosTotal.reduce((acc, i) => acc + toNumber(i.valorGanho), 0);
    const valorGanhoPeriodo = ganhosPeriodo.reduce((acc, i) => acc + toNumber(i.valorGanho), 0);
    const valorPerdaTotal = basePerdas.reduce((acc, i) => acc + (toNumber(i.valorOrcamento) || toNumber(i.refPreco)), 0);
    const valorPerdaPeriodo = periodPerdas.reduce((acc, i) => acc + (toNumber(i.valorOrcamento) || toNumber(i.refPreco)), 0);

    const cvtBase = valorGanhoTotal + valorPerdaTotal;
    const cvpBase = valorGanhoPeriodo + valorPerdaPeriodo;
    const conversaoValorTotal = cvtBase > 0 ? (valorGanhoTotal / cvtBase) * 100 : 0;
    const conversaoValorPeriodo = cvpBase > 0 ? (valorGanhoPeriodo / cvpBase) * 100 : 0;

    const qtdeEmAbertoTotal = emAbertoTotal.length;
    const qtdeEmAbertoPeriodo = emAbertoPeriodo.length;
    const qtdeGanhoTotal = ganhosTotal.length;
    const qtdeGanhoPeriodo = ganhosPeriodo.length;
    const qtdePerdaTotal = basePerdas.length;
    const qtdePerdaPeriodo = periodPerdas.length;

    const cqtBase = qtdeGanhoTotal + qtdePerdaTotal;
    const cqpBase = qtdeGanhoPeriodo + qtdePerdaPeriodo;
    const conversaoQtdeTotal = cqtBase > 0 ? (qtdeGanhoTotal / cqtBase) * 100 : 0;
    const conversaoQtdePeriodo = cqpBase > 0 ? (qtdeGanhoPeriodo / cqpBase) * 100 : 0;

    return {
      quantidadeProcessos: { periodo: totalOrdersPeriodo, total: totalOrders },
      quantidadeOrcamentoEnviado: { periodo: totalOrcamentoEnviadoPeriodo, total: totalOrcamentoEnviado },
      quantidadePerdas: { periodo: totalPerdasPeriodo, total: totalPerdas },
      quantidadeClientesAtivos: { periodo: clientesAtivosPeriodo, total: clientesAtivosTotal },
      valorEmAberto: { periodo: valorEmAbertoPeriodo, total: valorEmAbertoTotal },
      valorGanho: { periodo: valorGanhoPeriodo, total: valorGanhoTotal },
      valorPerda: { periodo: valorPerdaPeriodo, total: valorPerdaTotal },
      conversaoValor: { periodo: conversaoValorPeriodo, total: conversaoValorTotal },
      qtdeEmAberto: { periodo: qtdeEmAbertoPeriodo, total: qtdeEmAbertoTotal },
      qtdeGanho: { periodo: qtdeGanhoPeriodo, total: qtdeGanhoTotal },
      qtdePerda: { periodo: qtdePerdaPeriodo, total: qtdePerdaTotal },
      conversaoQtde: { periodo: conversaoQtdePeriodo, total: conversaoQtdeTotal },
    };
  }, [baseOrders, periodOrders, baseResultados, periodResultados, basePerdas, periodPerdas]);

  const charts = useMemo(() => {
    const statusPedidoMap = periodOrders.reduce<Record<string, number>>((acc, item) => {
      const chave = item.statusProcesso || 'Sem status';
      acc[chave] = (acc[chave] ?? 0) + 1;
      return acc;
    }, {});

    const medicoQtdMap = periodOrders.reduce<Record<string, number>>((acc, item) => {
      const nome = resolveMedicoNome(item.id, item.idMedico);
      acc[nome] = (acc[nome] ?? 0) + 1;
      return acc;
    }, {});

    const medicoOrcamentoMap = periodOrders.reduce<Record<string, number>>((acc, item) => {
      if (item.statusOrcamento !== 'Orçamento Enviado') return acc;
      const nome = resolveMedicoNome(item.id, item.idMedico);
      acc[nome] = (acc[nome] ?? 0) + toNumber(item.valorOrcamento);
      return acc;
    }, {});

    const pedidosPorDiaMap = periodOrders.reduce<Record<string, number>>((acc, item) => {
      const data = parseApiDate(item.dataPedido);
      if (!data) return acc;
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
      acc[chave] = (acc[chave] ?? 0) + 1;
      return acc;
    }, {});

    /* ===== Evolução mensal — últimos 12 meses (janela deslizante) =====
       Usa baseOrders (ignora filtro de período); janela = mês atual e os 11
       anteriores. Em maio/2026 → jun/2025 a mai/2026. */
    const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const hoje = new Date();
    const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    const ultimos12Meses: { ano: number; mes: number; chave: string; rotulo: string; quantidade: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(inicioJanela.getFullYear(), inicioJanela.getMonth() + i, 1);
      const ano = d.getFullYear();
      const mes = d.getMonth();
      ultimos12Meses.push({
        ano,
        mes,
        chave: `${ano}-${String(mes + 1).padStart(2, '0')}`,
        rotulo: `${MESES_ABREV[mes]}/${String(ano).slice(2)}`,
        quantidade: 0,
      });
    }
    const indicePorChave = new Map(ultimos12Meses.map((m, idx) => [m.chave, idx]));
    for (const item of baseOrders) {
      const data = parseApiDate(item.dataPedido);
      if (!data) continue;
      if (data < inicioJanela) continue;
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const idx = indicePorChave.get(chave);
      if (idx !== undefined) ultimos12Meses[idx].quantidade += 1;
    }

    const statusPerdaMap = periodPerdas.reduce<Record<string, number>>((acc, item) => {
      const chave = item.statusPerda || 'Sem status de perda';
      acc[chave] = (acc[chave] ?? 0) + 1;
      return acc;
    }, {});

    const medicoResultadoMap = baseResultados.reduce<Record<string, { ganho: number; perda: number }>>((acc, item) => {
      if (item.statusProcesso !== 'Ganho' && item.statusProcesso !== 'Perda') return acc;
      const nome = resolveMedicoNome(item.id, item.idMedico);
      const atual = acc[nome] ?? { ganho: 0, perda: 0 };
      if (item.statusProcesso === 'Ganho') atual.ganho += 1;
      if (item.statusProcesso === 'Perda') atual.perda += 1;
      acc[nome] = atual;
      return acc;
    }, {});

    const pedidosPorDiaEntries = Object.entries(pedidosPorDiaMap).sort((a, b) => a[0].localeCompare(b[0]));

    const medicoResultadoEntries = Object.entries(medicoResultadoMap)
      .filter(([, item]) => item.ganho > 0 || item.perda > 0)
      .map(([nome, item]) => {
        const total = item.ganho + item.perda;
        const percentualGanho = total > 0 ? Number(((item.ganho / total) * 100).toFixed(1)) : 0;
        const percentualPerda = total > 0 ? Number((100 - percentualGanho).toFixed(1)) : 0;
        return { nome, ganho: item.ganho, perda: item.perda, percentualGanho, percentualPerda };
      })
      .sort((a, b) => (b.ganho + b.perda) - (a.ganho + a.perda));

    /* ===== Médicos x qtde — TOP 6 ordenado, formato lista ===== */
    const medicoQtdList = Object.entries(medicoQtdMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, value]) => ({ nome, value }));
    const medicoQtdMax = Math.max(1, ...medicoQtdList.map((i) => i.value));

    /* ===== Médicos x valor orçamento — TOP 6 ordenado, formato lista ===== */
    const medicoOrcamentoList = Object.entries(medicoOrcamentoMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, value]) => ({ nome, value }));
    const medicoOrcamentoMax = Math.max(1, ...medicoOrcamentoList.map((i) => i.value));

    /* ===== Status perda donut: total + percentuais ===== */
    const statusPerdaLabels = Object.keys(statusPerdaMap);
    const statusPerdaValues = Object.values(statusPerdaMap);
    const statusPerdaTotal = statusPerdaValues.reduce((a, b) => a + b, 0);
    const statusPerdaItems = statusPerdaLabels.map((label, idx) => ({
      label,
      value: statusPerdaValues[idx],
      pct: statusPerdaTotal > 0 ? (statusPerdaValues[idx] / statusPerdaTotal) * 100 : 0,
      color: TONS_PERDA[idx % TONS_PERDA.length],
    }));

    return {
      /* Status pedido — barras VERTICAIS coloridas (cada barra cor diferente) */
      statusPedido: {
        labels: Object.keys(statusPedidoMap),
        datasets: [{
          label: 'Quantidade',
          data: Object.values(statusPedidoMap),
          backgroundColor: Object.keys(statusPedidoMap).map((k) => corSemanticaStatus(k)),
          borderRadius: 8,
          maxBarThickness: 56,
        }]
      },
      /* Médicos qtde — formato LISTA */
      medicoQtdList, medicoQtdMax,
      /* Médicos valor — formato LISTA */
      medicoOrcamentoList, medicoOrcamentoMax,
      /* Pedidos por dia — barras verdes verticais */
      pedidosDia: {
        labels: pedidosPorDiaEntries.map(([label]) => {
          const [, mes, dia] = label.split('-');
          return `${dia}/${mes}`;
        }),
        datasets: [{
          label: 'Pedidos',
          data: pedidosPorDiaEntries.map(([, value]) => value),
          backgroundColor: MC.green,
          borderRadius: 6,
          maxBarThickness: 32,
        }]
      },
      /* Pedidos por mês — últimos 12 meses (janela deslizante) */
      pedidosMes: {
        labels: ultimos12Meses.map((m) => m.rotulo),
        datasets: [{
          label: 'Pedidos',
          data: ultimos12Meses.map((m) => m.quantidade),
          backgroundColor: MC.navy,
          borderRadius: 6,
          maxBarThickness: 44,
        }]
      },
      pedidosMesPeriodoLabel: `${ultimos12Meses[0].rotulo} a ${ultimos12Meses[11].rotulo}`,
      /* Status perda — barras VERTICAIS rosa (todas mesma cor) */
      statusPerda: {
        labels: Object.keys(statusPerdaMap),
        datasets: [{
          label: 'Quantidade',
          data: Object.values(statusPerdaMap),
          backgroundColor: MC.rose,
          borderRadius: 8,
          maxBarThickness: 60,
        }]
      },
      /* Donut perda */
      statusPerdaDonut: {
        labels: statusPerdaLabels,
        datasets: [{
          data: statusPerdaValues,
          backgroundColor: statusPerdaItems.map((i) => i.color),
          borderColor: '#fff',
          borderWidth: 3,
        }]
      },
      statusPerdaItems,
      statusPerdaTotal,
      medicoPerdaGanho: medicoResultadoEntries
    };
  }, [periodOrders, periodPerdas, baseResultados, baseOrders, medicosLookup, ordersLookup]);

  const cards = [
    { titulo: 'Qtde processos', valor: kpis.quantidadeProcessos.periodo, total: kpis.quantidadeProcessos.total, icone: 'pi pi-briefcase' },
    { titulo: 'Qtde orçamento enviado', valor: kpis.quantidadeOrcamentoEnviado.periodo, total: kpis.quantidadeOrcamentoEnviado.total, icone: 'pi pi-send' },
    { titulo: 'Qtde perdas', valor: kpis.quantidadePerdas.periodo, total: kpis.quantidadePerdas.total, icone: 'pi pi-times-circle' },
    { titulo: 'Qtde de clientes ativos', valor: kpis.quantidadeClientesAtivos.periodo, total: kpis.quantidadeClientesAtivos.total, icone: 'pi pi-users' },
    { titulo: 'Valor em aberto', valor: formatCurrency(kpis.valorEmAberto.periodo), total: formatCurrency(kpis.valorEmAberto.total), icone: 'pi pi-wallet' },
    { titulo: 'Valor ganho', valor: formatCurrency(kpis.valorGanho.periodo), total: formatCurrency(kpis.valorGanho.total), icone: 'pi pi-check-circle', classeValor: 'kpi-value-success' },
    { titulo: 'Valor perda', valor: formatCurrency(kpis.valorPerda.periodo), total: formatCurrency(kpis.valorPerda.total), icone: 'pi pi-ban', classeValor: 'kpi-value-danger' },
    { titulo: 'Conversão valor', valor: formatPercent(kpis.conversaoValor.periodo), total: formatPercent(kpis.conversaoValor.total), icone: 'pi pi-percentage' },
    { titulo: 'Qtde em aberto', valor: kpis.qtdeEmAberto.periodo, total: kpis.qtdeEmAberto.total, icone: 'pi pi-inbox' },
    { titulo: 'Qtde ganho', valor: kpis.qtdeGanho.periodo, total: kpis.qtdeGanho.total, icone: 'pi pi-arrow-up-right', classeValor: 'kpi-value-success' },
    { titulo: 'Qtde perda', valor: kpis.qtdePerda.periodo, total: kpis.qtdePerda.total, icone: 'pi pi-arrow-down-right', classeValor: 'kpi-value-danger' },
    { titulo: 'Conversão qtde', valor: formatPercent(kpis.conversaoQtde.periodo), total: formatPercent(kpis.conversaoQtde.total), icone: 'pi pi-chart-line' },
  ];


  /* ── ESPECIALIDADES (@R 28/08) ────────────────────────────────────────────
     Uma linha por especialidade REAL (grafias normalizadas), com o que decide:
     quantos pedidos chegaram, quanto vale, quanto virou ganho, e QUANTOS
     MÉDICOS nossos atendem aquilo. A coluna que importa é a última: pedido que
     chega numa especialidade sem médico é pedido que a gente não consegue cotar
     — em produção há 54 pedidos de Cardiologia e nenhum cardiologista na base
     (medido 28/08). O dashboard passa a gritar isso em vez de esconder. */
  const especialidades = useMemo(() => {
    const mapa = new Map<string, { chave: string; rotulo: string; pedidos: number; valor: number;
                                   ganhos: number; valorGanho: number; medicos: MedicoLookup[] }>();
    const pega = (chave: string) => {
      if (!mapa.has(chave)) mapa.set(chave, { chave, rotulo: tituloEsp(chave), pedidos: 0, valor: 0,
                                              ganhos: 0, valorGanho: 0, medicos: [] });
      return mapa.get(chave)!;
    };
    orders.forEach((o) => {
      const chave = normEsp(o.area) || 'SEM ESPECIALIDADE';
      const e = pega(chave);
      e.pedidos += 1;
      e.valor += Number(o.valorOrcamento ?? 0);
      if (o.statusProcesso === 'Ganho') { e.ganhos += 1; e.valorGanho += Number(o.valorGanho ?? o.valorOrcamento ?? 0); }
    });
    medicosCompletos.forEach((m) => {
      const chave = normEsp(m.especialidade);
      if (chave) pega(chave).medicos.push(m);
    });
    return [...mapa.values()].sort((a, b) => b.pedidos - a.pedidos);
  }, [orders, medicosCompletos]);

  const opcoesEspecialidade = useMemo(() => ([
    { label: `Todas as especialidades (${especialidades.length})`, value: null },
    ...especialidades.map((e) => ({ label: `${e.rotulo} — ${e.pedidos} pedido${e.pedidos === 1 ? '' : 's'}`, value: e.chave })),
  ]), [especialidades]);

  // Médicos da especialidade escolhida (ou todos), com os números de cada um.
  const medicosDaEspecialidade = useMemo(() => {
    const alvo = especialidadeSel
      ? medicosCompletos.filter((m) => normEsp(m.especialidade) === especialidadeSel)
      : medicosCompletos;
    return alvo.map((m) => {
      const meus = orders.filter((o) => o.idMedico === m.id);
      const ganhos = meus.filter((o) => o.statusProcesso === 'Ganho');
      return {
        ...m,
        pedidos: meus.length,
        ganhos: ganhos.length,
        valor: meus.reduce((s, o) => s + Number(o.valorOrcamento ?? 0), 0),
        valorGanho: ganhos.reduce((s, o) => s + Number(o.valorGanho ?? o.valorOrcamento ?? 0), 0),
      };
    }).sort((a, b) => b.pedidos - a.pedidos);
  }, [medicosCompletos, orders, especialidadeSel]);

  const verticalBarOptions = useMemo(() => createVerticalBarOptions(), []);
  const columnOptions = useMemo(() => createColumnOptions(), []);
  const doughnutOptions = useMemo(() => createDoughnutOptions(), []);

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-header">
        <div className="dashboard-header__title">
          <h1>Dashboard</h1>
          <p>Visão geral da companhia para gestão e diretoria.</p>
        </div>

        <div className="dashboard-medico-filter">
          <label>Médico</label>
          <Dropdown
            value={medicoSelecionado}
            options={medicosOptions}
            onChange={(e) => setMedicoSelecionado(e.value)}
            placeholder="Selecione um médico"
            className="dashboard-medico-dropdown"
          />
        </div>

        <div className="dashboard-medico-filter">
          <label>Especialidade</label>
          <Dropdown
            value={especialidadeSel}
            options={opcoesEspecialidade}
            onChange={(e) => setEspecialidadeSel(e.value)}
            placeholder="Todas as especialidades"
            filter showClear
            className="dashboard-medico-dropdown"
          />
        </div>

        <div className="dashboard-date-filter">
          <label>Período</label>
          <div className="dashboard-date-filter__control">
            <DatePickerPeriodo value={periodoSelecionado} onChange={setPeriodoSelecionado} />
          </div>
        </div>
      </div>

      {medicoInfo && (
        <div className="dashboard-medico-info">
          <div className="dashboard-medico-info__nome">{medicoInfo.nome}</div>
          <div className="dashboard-medico-info__grid">
            <div className="dashboard-medico-info__item">
              <span>Atuando desde</span>
              <strong>{medicoInfo.desde}</strong>
            </div>
            <div className="dashboard-medico-info__item">
              <span>Tempo total de atuação</span>
              <strong>{medicoInfo.tempoAtuacao}</strong>
            </div>
            <div className="dashboard-medico-info__item">
              <span>Último pedido</span>
              <strong className={medicoInfo.semAtividadeRecente ? 'dashboard-medico-info__alerta' : ''}>
                {medicoInfo.ultimoPedido}
                {medicoInfo.semAtividadeRecente && ' ⚠'}
              </strong>
            </div>
            <div className="dashboard-medico-info__item">
              <span>Pedidos (vida toda)</span>
              <strong>{medicoInfo.totalPedidosVida}</strong>
            </div>
          </div>
          {medicoInfo.semAtividadeRecente && (
            <div className="dashboard-medico-info__nota">
              Mais de 45 dias sem pedido novo — não sabemos o motivo, só que a atividade caiu.
            </div>
          )}
        </div>
      )}

      {/* ── Especialidades × médicos (@R 28/08) ───────────────────────────── */}
      <section className="dashboard-esp">
        <div className="dashboard-esp__head">
          <h2>Especialidades</h2>
          <p>
            {especialidadeSel
              ? `Mostrando ${tituloEsp(especialidadeSel)} — troque no seletor acima ou limpe para ver todas.`
              : 'Cada especialidade com o que chegou, o que virou ganho e quantos médicos nossos atendem. Clique numa para ver os médicos dela.'}
          </p>
        </div>

        <div className="dashboard-esp__grid">
          {(especialidadeSel ? especialidades.filter((e) => e.chave === especialidadeSel) : especialidades).map((e) => {
            const semMedico = e.medicos.length === 0 && e.chave !== 'SEM ESPECIALIDADE';
            const ativo = especialidadeSel === e.chave;
            return (
              <button key={e.chave} type="button"
                className={'dashboard-esp__card' + (ativo ? ' dashboard-esp__card--ativo' : '') + (semMedico ? ' dashboard-esp__card--alerta' : '')}
                onClick={() => setEspecialidadeSel(ativo ? null : e.chave)}
                title={semMedico ? 'Chegam pedidos desta especialidade e não temos nenhum médico cadastrado nela' : 'Ver os médicos desta especialidade'}>
                <span className="dashboard-esp__nome">{e.rotulo}</span>
                <span className="dashboard-esp__num">{e.pedidos}<small>pedidos</small></span>
                <span className="dashboard-esp__linha">{formatCurrency(e.valor)} orçado</span>
                <span className="dashboard-esp__linha">{e.ganhos} ganho{e.ganhos === 1 ? '' : 's'} · {formatCurrency(e.valorGanho)}</span>
                <span className={'dashboard-esp__medicos' + (semMedico ? ' dashboard-esp__medicos--zero' : '')}>
                  {semMedico ? '⚠ nenhum médico nesta especialidade' : `${e.medicos.length} médico${e.medicos.length === 1 ? '' : 's'}`}
                </span>
              </button>
            );
          })}
        </div>

        <h3 className="dashboard-esp__sub">
          {especialidadeSel ? `Médicos de ${tituloEsp(especialidadeSel)}` : 'Todos os médicos'}
          <small> · {medicosDaEspecialidade.length}</small>
        </h3>
        <div className="dashboard-esp__tabela-wrap">
          <table className="dashboard-esp__tabela">
            <thead>
              <tr><th>Médico</th><th>Especialidade</th><th>Situação</th>
                  <th className="num">Pedidos</th><th className="num">Ganhos</th>
                  <th className="num">Orçado</th><th className="num">Ganho</th></tr>
            </thead>
            <tbody>
              {medicosDaEspecialidade.length === 0 && (
                <tr><td colSpan={7} className="dashboard-esp__vazio">
                  Nenhum médico cadastrado nesta especialidade — os pedidos que chegam aqui não têm quem cotar.
                </td></tr>
              )}
              {medicosDaEspecialidade.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td>{m.especialidade ? tituloEsp(normEsp(m.especialidade)) : '—'}</td>
                  <td>{m.status || '—'}</td>
                  <td className="num">{m.pedidos}</td>
                  <td className="num">{m.ganhos}</td>
                  <td className="num">{formatCurrency(m.valor)}</td>
                  <td className="num">{formatCurrency(m.valorGanho)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PainelKpis titulo="Indicadores">
      <div className="dashboard-kpi-grid">
        {cards.map((card) => (
          <div className="kpi-card" key={card.titulo}>
            <div className="kpi-header"><span>{card.titulo}</span><i className={card.icone}></i></div>
            <div className={`kpi-value ${card.classeValor ?? ''}`}>{card.valor}</div>
            <div className="dashboard-kpi-subvalue">Total: <strong>{card.total}</strong></div>
          </div>
        ))}
      </div>
      </PainelKpis>

      {completude && (
        <PainelKpis titulo="Cadastro dos pedidos (CNJ · SEI · Comarca · Anexo)">
          <div className="dashboard-completude" aria-label="Completude do cadastro por fase">
            {completude.telas?.filter((m: any) => m.tela !== 'todos').map((m: any) => (
              <div key={m.tela} className="dc-card">
                <span className="dc-tela">{({juridico:'1. Análise Jurídica',orcamento:'3. Orçamento Médico',protocolar:'4. Protocolar',protocolados:'5. Protocolados',segredo:'6. Segredo de Justiça'} as any)[m.tela] ?? m.tela}</span>
                <strong>{m.n ? Math.round(100*(m.cnj_ok+m.sei_ok+m.comarca_ok+m.anexo_ok)/(4*m.n)) : 100}%</strong>
                <small>CNJ {m.cnj_ok}/{m.n} · SEI {m.sei_ok}/{m.n} · Comarca {m.comarca_ok}/{m.n} · Anexo {m.anexo_ok}/{m.n}</small>
              </div>
            ))}
            <small className="dc-rodape">medição {completude.telas?.[0]?.dia} · atualiza todo dia às 03:00 (batch de completude)</small>
          </div>
        </PainelKpis>
      )}

      <PainelKpis titulo="Análises operacionais">
      <div className="dashboard-section-subtitle">Status, distribuição por médico e ticket médio do período.</div>
      <div className="dashboard-chart-grid dashboard-chart-grid--3">
        <div className="card chart-card">
          <div className="chart-title">Status pedido × quantidade</div>
          <div className="chart-subtitle">Volume por etapa do processo.</div>
          <div className="chart-wrapper">
            <Chart type="bar" data={charts.statusPedido} options={verticalBarOptions} />
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">Médicos × qtde pedidos</div>
          <div className="chart-subtitle">Top {charts.medicoQtdList.length} médicos do período.</div>
          <div className="medico-list">
            {charts.medicoQtdList.length === 0 ? (
              <div className="dashboard-empty-state">Nenhum dado para o período.</div>
            ) : charts.medicoQtdList.map((item) => (
              <div className="medico-list__row" key={item.nome}>
                <div className="medico-list__name" title={item.nome}>{item.nome}</div>
                <div className="medico-list__bar">
                  <div
                    className="medico-list__bar-fill medico-list__bar-fill--navy"
                    style={{ width: `${(item.value / charts.medicoQtdMax) * 100}%` }}
                  />
                </div>
                <div className="medico-list__value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">Médicos × valor orçamento enviado</div>
          <div className="chart-subtitle">Volume financeiro por médico.</div>
          <div className="medico-list">
            {charts.medicoOrcamentoList.length === 0 ? (
              <div className="dashboard-empty-state">Nenhum dado para o período.</div>
            ) : charts.medicoOrcamentoList.map((item) => (
              <div className="medico-list__row" key={item.nome}>
                <div className="medico-list__name" title={item.nome}>{item.nome}</div>
                <div className="medico-list__bar">
                  <div
                    className="medico-list__bar-fill medico-list__bar-fill--green"
                    style={{ width: `${(item.value / charts.medicoOrcamentoMax) * 100}%` }}
                  />
                </div>
                <div className="medico-list__value medico-list__value--money">{formatCurrencyShort(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </PainelKpis>

      <PainelKpis titulo="Evolução de pedidos">
      <div className="dashboard-section-subtitle">Volume por dia e por mês, lado a lado para comparar o ritmo.</div>
      <div className="dashboard-chart-grid">
        <div className="card chart-card">
          <div className="chart-title">Por dia</div>
          <div className="chart-subtitle">Dias com pedido no período.</div>
          <div className="chart-wrapper chart-wrapper--tall">
            <Chart type="bar" data={charts.pedidosDia} options={columnOptions} />
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">Por mês</div>
          <div className="chart-subtitle">Últimos 12 meses ({charts.pedidosMesPeriodoLabel}).</div>
          <div className="chart-wrapper chart-wrapper--tall">
            <Chart type="bar" data={charts.pedidosMes} options={columnOptions} />
          </div>
        </div>
      </div>
      </PainelKpis>

      <PainelKpis titulo="Análise de perdas">
      <div className="dashboard-section-subtitle">Status da perda e composição percentual.</div>
      <div className="dashboard-chart-grid">
        <div className="card chart-card">
          <div className="chart-title">Status de perda × quantidade</div>
          <div className="chart-wrapper">
            <Chart type="bar" data={charts.statusPerda} options={verticalBarOptions} />
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">% de perda × status</div>
          <div className="chart-subtitle">Distribuição percentual.</div>
          <div className="donut-block">
            <div className="donut-block__chart">
              <Chart type="doughnut" data={charts.statusPerdaDonut} options={doughnutOptions} />
              <div className="donut-block__center">
                <div className="donut-block__center-value">{charts.statusPerdaTotal}</div>
                <div className="donut-block__center-label">perdas totais</div>
              </div>
            </div>
            <div className="donut-block__legend">
              {charts.statusPerdaItems.map((item) => (
                <div className="donut-block__row" key={item.label}>
                  <span className="donut-block__dot" style={{ background: item.color }} />
                  <span className="donut-block__label" title={item.label}>{item.label}</span>
                  <span className="donut-block__pct">{Math.round(item.pct)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </PainelKpis>

      <PainelKpis titulo="Performance por médico">
      <div className="dashboard-section-subtitle">Comparativo ganho × perda por profissional.</div>
      <div className="dashboard-chart-grid">
        <div className="card chart-card chart-card-full">
          <div className="chart-title">Médico × perda × ganho</div>
          <div className="dashboard-medico-performance">
            {charts.medicoPerdaGanho.length === 0 ? (
              <div className="dashboard-empty-state">Nenhum resultado disponível para o período selecionado.</div>
            ) : (
              <>
                <div className="dashboard-medico-performance__header-row">
                  <div className="dashboard-medico-performance__header-cell dashboard-medico-performance__header-cell--right">qt.</div>
                  <div className="dashboard-medico-performance__header-cell dashboard-medico-performance__header-cell--right" style={{ color: 'var(--mc-green-600)' }}>ganho</div>
                  <div className="dashboard-medico-performance__header-cell">médico</div>
                  <div className="dashboard-medico-performance__header-cell" style={{ color: 'var(--mc-rose)' }}>perda</div>
                  <div className="dashboard-medico-performance__header-cell">qt.</div>
                </div>

                {charts.medicoPerdaGanho.map((item) => (
                  <div key={item.nome} className="dashboard-medico-performance__row">
                    <div className="dashboard-medico-performance__count dashboard-medico-performance__count--right">{item.ganho}</div>

                    <div className="dashboard-medico-performance__mini-bar dashboard-medico-performance__mini-bar--ganho">
                      <div
                        className="dashboard-medico-performance__mini-fill dashboard-medico-performance__mini-fill--ganho"
                        style={{ width: `${item.percentualGanho}%` }}
                      >
                        {formatPercent(item.percentualGanho)}
                      </div>
                    </div>

                    <div className="dashboard-medico-performance__doctor">
                      <strong>{item.nome}</strong>
                    </div>

                    <div className="dashboard-medico-performance__mini-bar dashboard-medico-performance__mini-bar--perda">
                      <div
                        className="dashboard-medico-performance__mini-fill dashboard-medico-performance__mini-fill--perda"
                        style={{ width: `${item.percentualPerda}%` }}
                      >
                        {formatPercent(item.percentualPerda)}
                      </div>
                    </div>

                    <div className="dashboard-medico-performance__count">{item.perda}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      </PainelKpis>
    </div>
  );
}
