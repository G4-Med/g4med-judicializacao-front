import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import jsPDF from 'jspdf';
import { getMedicosCompleto, getOrders } from '../../services/api/orders';
import { getStatusTagStyle } from '../../utils/statusTag';

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  if (s.length !== 6) return [100, 116, 139];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function mixWithWhite([r, g, b]: [number, number, number], alpha: number): [number, number, number] {
  return [
    Math.round(r * alpha + 255 * (1 - alpha)),
    Math.round(g * alpha + 255 * (1 - alpha)),
    Math.round(b * alpha + 255 * (1 - alpha))
  ];
}
import './RelatoriosPage.css';
import '../dashboard/DashboardPage.css';
import { RelatorioPedidoCard } from './RelatorioPedidoCard';

interface MedicoOption {
  label: string;
  value: number | null;
}

interface OrderRow {
  id: number;
  paciente?: string;
  procedimento?: string;
  dataNascimento?: string | null;
  idade?: string | number | null;
  refPreco?: number | null;
  valorOrcamento?: number | null;
  statusProcesso?: string | null;
  statusOrcamento?: string | null;
  statusPerda?: string | null;
  nprocesso?: string | null;
  idMedico?: number | null;
  orcamentosJuridico?: unknown;
  justificativaPerda?: string | null;
  solicitacao?: string | null;
}

interface MedicoRow {
  id: number;
  nomeSistema?: string;
  razaoSocial?: string;
}

interface ResumoStatusRow {
  status: string;
  quantidade: number;
  valor: number;
}

const STATUS_ORDEM = [
  'Ganho',
  'Protocolado',
  'Segredo de Justiça',
  'Aguardando Protocolar',
  'Aguardando Orçamento',
  'Perda'
];

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function calcularIdade(dataNascimento?: string | null, idadeAtual?: string | number | null) {
  if (idadeAtual !== undefined && idadeAtual !== null && `${idadeAtual}`.trim() !== '') {
    return `${idadeAtual}`;
  }

  if (!dataNascimento) return '--';

  const nascimento = new Date(`${dataNascimento}T00:00:00`);
  if (Number.isNaN(nascimento.getTime())) return '--';

  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
    idade -= 1;
  }

  return idade >= 0 ? `${idade}` : '--';
}

function normalizarStatus(order: OrderRow) {
  const status = order.statusProcesso ?? '';

  if (status === 'Aguardando Resposta') return 'Protocolado';
  if (status === 'Aguardando Resposta - Segredo de Justiça') return 'Segredo de Justiça';
  return status || '--';
}

function normalizarOrcamentosApresentados(value: unknown) {
  if (Array.isArray(value)) {
    const itens = value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter(Boolean);
    return itens.length ? itens.join(' | ') : '--';
  }

  if (typeof value === 'string') {
    return value.trim() || '--';
  }

  if (value && typeof value === 'object') {
    return (
      Object.values(value as Record<string, unknown>)
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .join(' | ') || '--'
    );
  }

  return '--';
}

function montarObservacao(order: OrderRow, statusNormalizado: string) {
  if (order.justificativaPerda?.trim()) return order.justificativaPerda.trim();

  if (statusNormalizado === 'Segredo de Justiça') {
    return 'Orçamento concluído, mas o processo segue em segredo de justiça.';
  }

  if (statusNormalizado === 'Aguardando Protocolar') {
    return 'Orçamento concluído e aguardando protocolar no processo.';
  }

  if (statusNormalizado === 'Aguardando Orçamento') {
    return 'Pedido aguardando elaboração do orçamento.';
  }

  if (statusNormalizado === 'Protocolado') {
    return 'Pedido protocolado e aguardando desfecho do processo.';
  }

  if (statusNormalizado === 'Ganho') {
    return 'Processo finalizado com ganho.';
  }

  if (statusNormalizado === 'Perda') {
    return 'Processo finalizado com perda.';
  }

  if (order.solicitacao?.trim()) {
    return order.solicitacao.trim();
  }

  return '--';
}

export function RelatorioConsolidadoPage() {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [medicoSelecionado, setMedicoSelecionado] = useState<number | null>(null);

  const medicosOptions = useMemo<MedicoOption[]>(
    () => [
      { label: 'Todos os médicos', value: null },
      ...medicos.map((m) => ({
        label: m.razaoSocial || m.nomeSistema || `Médico ${m.id}`,
        value: m.id
      }))
    ],
    [medicos]
  );

  const ordersFiltrados = useMemo(
    () => (medicoSelecionado === null ? orders : orders.filter((o) => o.idMedico === medicoSelecionado)),
    [orders, medicoSelecionado]
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([getOrders(), getMedicosCompleto()])
      .then(([ordersRes, medicosRes]) => {
        setOrders(ordersRes.data ?? []);
        setMedicos(medicosRes.data ?? []);
      })
      .catch(() => console.error('Erro ao carregar relatório consolidado'))
      .finally(() => setLoading(false));
  }, []);

  const medicosLookup = useMemo(
    () =>
      medicos.reduce<Record<number, string>>((acc, medico) => {
        acc[medico.id] = medico.razaoSocial || medico.nomeSistema || `Médico ${medico.id}`;
        return acc;
      }, {}),
    [medicos]
  );

  const pedidos = useMemo(
    () =>
      ordersFiltrados.map((order) => {
        const status = normalizarStatus(order);
        const valorOrcamento = Number(order.valorOrcamento ?? 0);

        return {
          id: order.id,
          paciente: order.paciente?.trim() || 'Paciente não informado',
          status,
          idade: calcularIdade(order.dataNascimento, order.idade),
          procedimento: order.procedimento?.trim() || '--',
          valorG4Med: valorOrcamento > 0 ? formatarMoeda(valorOrcamento) : '--',
          valorNumerico: valorOrcamento > 0 ? valorOrcamento : 0,
          orcamentosApresentados: normalizarOrcamentosApresentados(order.orcamentosJuridico),
          processo: order.nprocesso?.trim() || '--',
          observacao: montarObservacao(order, status),
          cliente: order.idMedico ? medicosLookup[order.idMedico] || '--' : '--'
        };
      }),
    [medicosLookup, ordersFiltrados]
  );

  const pedidosOrdenados = useMemo(() => {
    const indice = (status: string) => {
      const i = STATUS_ORDEM.indexOf(status);
      return i === -1 ? STATUS_ORDEM.length : i;
    };
    return [...pedidos].sort((a, b) => {
      const diff = indice(a.status) - indice(b.status);
      if (diff !== 0) return diff;
      return a.paciente.localeCompare(b.paciente, 'pt-BR');
    });
  }, [pedidos]);

  const resumoStatus = useMemo<ResumoStatusRow[]>(() => {
    const mapa = pedidos.reduce<Record<string, ResumoStatusRow>>((acc, pedido) => {
      if (!acc[pedido.status]) {
        acc[pedido.status] = { status: pedido.status, quantidade: 0, valor: 0 };
      }

      acc[pedido.status].quantidade += 1;
      acc[pedido.status].valor += pedido.valorNumerico;
      return acc;
    }, {});

    const statusExtras = Object.keys(mapa)
      .filter((status) => !STATUS_ORDEM.includes(status))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const linhas = [...STATUS_ORDEM, ...statusExtras]
      .filter((status) => mapa[status])
      .map((status) => mapa[status]);

    const total = linhas.reduce(
      (acc, item) => ({
        status: 'Total',
        quantidade: acc.quantidade + item.quantidade,
        valor: acc.valor + item.valor
      }),
      { status: 'Total', quantidade: 0, valor: 0 }
    );

    return [...linhas, total];
  }, [pedidos]);

  const meta = useMemo(() => {
    const idsMedicos = [
      ...new Set(ordersFiltrados.map((item) => item.idMedico).filter((id): id is number => typeof id === 'number'))
    ];
    const cliente = idsMedicos.length === 1 ? medicosLookup[idsMedicos[0]] || '--' : 'Visão geral';
    const valorTotalOrcado = pedidos.reduce((acc, item) => acc + item.valorNumerico, 0);

    return {
      cliente,
      advocacia: '--',
      geradoEm: new Date().toLocaleString('pt-BR'),
      quantidadePacientes: pedidos.length,
      valorTotalOrcado
    };
  }, [medicosLookup, ordersFiltrados, pedidos]);

  const acoesPendentes = useMemo(() => {
    const aguardandoProtocolar = pedidos.filter((item) => item.status === 'Aguardando Protocolar');
    const segredo = pedidos.filter((item) => item.status === 'Segredo de Justiça');
    const aguardandoOrcamento = pedidos.filter((item) => item.status === 'Aguardando Orçamento');
    const protocolados = pedidos.filter((item) => item.status === 'Protocolado');

    const acoes: string[] = [];

    if (aguardandoProtocolar.length) {
      const total = aguardandoProtocolar.reduce((acc, item) => acc + item.valorNumerico, 0);
      acoes.push(`Protocolar orçamentos de ${aguardandoProtocolar.length} paciente(s) — ${formatarMoeda(total)}.`);
    }

    if (segredo.length) {
      const total = segredo.reduce((acc, item) => acc + item.valorNumerico, 0);
      acoes.push(`Segredo de Justiça com ${segredo.length} paciente(s) — ${formatarMoeda(total)} em orçamento concluído.`);
    }

    if (aguardandoOrcamento.length) {
      const nomes = aguardandoOrcamento.map((item) => item.paciente).slice(0, 5).join(', ');
      acoes.push(`Gerar orçamento para ${aguardandoOrcamento.length} paciente(s): ${nomes}${aguardandoOrcamento.length > 5 ? '...' : ''}.`);
    }

    if (protocolados.length) {
      acoes.push(`Acompanhar retorno de ${protocolados.length} pedido(s) protocolado(s).`);
    }

    if (!acoes.length && !loading) {
      acoes.push('Nenhuma ação pendente.');
    }

    return acoes;
  }, [loading, pedidos]);

  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 40;
    const contentWidth = pageWidth - marginX * 2;
    let y = 50;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - 40) {
        doc.addPage();
        y = 50;
      }
    };

    const writeWrapped = (text: string, x: number, maxWidth: number, lineHeight = 12) => {
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach((line: string) => {
        ensureSpace(lineHeight);
        doc.text(line, x, y);
        y += lineHeight;
      });
    };

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Relatório de Processos Judiciais', marginX, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Modelo consolidado para acompanhamento operacional e executivo.', marginX, y);
    doc.setTextColor(0);
    y += 20;

    // Meta
    const metaItems: [string, string][] = [
      ['Cliente', String(meta.cliente)],
      ['Advocacia', String(meta.advocacia)],
      ['Gerado em', String(meta.geradoEm)],
      ['Quantidade de pacientes', String(meta.quantidadePacientes)],
      ['Valor total orçado', formatarMoeda(meta.valorTotalOrcado)]
    ];
    doc.setFontSize(10);
    metaItems.forEach(([label, value]) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}: `, marginX, y);
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.text(value, marginX + labelWidth, y);
      y += 14;
    });
    y += 10;

    // Resumo por status (tabela)
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Resumo por status', marginX, y);
    y += 16;

    const colStatusW = contentWidth * 0.5;
    const colQtdW = contentWidth * 0.2;

    doc.setFontSize(10);
    doc.setFillColor(240, 240, 240);
    doc.rect(marginX, y - 10, contentWidth, 16, 'F');
    doc.text('Status', marginX + 4, y);
    doc.text('Quantidade', marginX + colStatusW + 4, y);
    doc.text('Valor orçado', marginX + colStatusW + colQtdW + 4, y);
    y += 12;
    doc.setFont('helvetica', 'normal');

    resumoStatus.forEach((item) => {
      ensureSpace(14);
      doc.text(String(item.status), marginX + 4, y);
      doc.text(String(item.quantidade), marginX + colStatusW + 4, y);
      doc.text(item.valor > 0 ? formatarMoeda(item.valor) : '--', marginX + colStatusW + colQtdW + 4, y);
      y += 12;
      doc.setDrawColor(220);
      doc.line(marginX, y - 4, marginX + contentWidth, y - 4);
    });
    y += 14;

    // Detalhamento dos pedidos
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Detalhamento dos pedidos', marginX, y);
    y += 16;

    pedidosOrdenados.forEach((item, index) => {
      ensureSpace(110);
      const style = getStatusTagStyle(item.status);
      const bgRgb = hexToRgb(style.backgroundColor);
      const borderRgb = hexToRgb(style.borderColor);
      const textRgb = hexToRgb(style.color);
      const cardBg = mixWithWhite(bgRgb, 0.12);

      const cardTop = y - 4;
      const cardLeft = marginX;

      // Mede altura primeiro renderizando em buffer? Simplificação: desenha header agora,
      // body depois e contorno ao final.
      const bodyStartY = y + 26;

      // Header colorido
      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.rect(cardLeft, cardTop, contentWidth, bodyStartY - cardTop, 'F');

      // Título paciente
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${index + 1}. ${item.paciente}`, cardLeft + 8, y + 12);

      // Badge de status
      doc.setFontSize(9);
      const badgeText = item.status;
      const badgeTextW = doc.getTextWidth(badgeText);
      const badgePadX = 8;
      const badgeH = 16;
      const badgeW = badgeTextW + badgePadX * 2;
      const badgeX = pageWidth - marginX - 8 - badgeW;
      const badgeY = y + 2;
      doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
      doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, 'FD');
      doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
      doc.text(badgeText, badgeX + badgePadX, badgeY + 11);
      doc.setTextColor(0);

      y = bodyStartY;

      const linhas: [string, string][] = [
        ['Idade', item.idade],
        ['Procedimento', item.procedimento],
        ['Valor G4Med', item.valorG4Med],
        ['Orçamentos apresentados', item.orcamentosApresentados],
        ['Processo', item.processo],
        ['Cliente', item.cliente],
        ['Observação', item.observacao]
      ];

      doc.setFontSize(9);
      linhas.forEach(([label, value]) => {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}: `, marginX + 6, y);
        const lw = doc.getTextWidth(`${label}: `);
        doc.setFont('helvetica', 'normal');
        writeWrapped(String(value ?? '--'), marginX + 6 + lw, contentWidth - 12 - lw, 11);
      });

      doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
      doc.setLineWidth(1);
      doc.rect(cardLeft, cardTop, contentWidth, y - cardTop + 4);
      doc.setLineWidth(0.2);
      y += 14;
    });

    // Ações pendentes
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Ações pendentes', marginX, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    acoesPendentes.forEach((acao, index) => {
      writeWrapped(`${index + 1}. ${acao}`, marginX, contentWidth, 13);
    });

    doc.save(`relatorio-consolidado-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="relatorios-page">
      <div className="page-header dashboard-header">
        <div className="dashboard-header__title">
          <h1>Relatório Consolidado</h1>
          <p>Visão consolidada para análise e exportação.</p>
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

        <button
          type="button"
          className="p-button p-component"
          onClick={handleExportPdf}
        >
          <i className="pi pi-file-pdf" style={{ marginRight: 8 }}></i>
          Exportar PDF
        </button>
      </div>

      <div className="card relatorio-consolidado-card">
        <section className="relatorio-consolidado-section relatorio-consolidado-section--header">
          <div>
            <h2>Relatório de Processos Judiciais</h2>
            <p>Modelo consolidado para acompanhamento operacional e executivo.</p>
          </div>

          <div className="relatorio-consolidado-meta-grid">
            <div className="relatorio-consolidado-meta-item">
              <span>Cliente</span>
              <strong>{meta.cliente}</strong>
            </div>
            <div className="relatorio-consolidado-meta-item">
              <span>Advocacia</span>
              <strong>{meta.advocacia}</strong>
            </div>
            <div className="relatorio-consolidado-meta-item">
              <span>Gerado em</span>
              <strong>{meta.geradoEm}</strong>
            </div>
            <div className="relatorio-consolidado-meta-item">
              <span>Quantidade de pacientes</span>
              <strong>{meta.quantidadePacientes}</strong>
            </div>
            <div className="relatorio-consolidado-meta-item">
              <span>Valor total orçado</span>
              <strong>{formatarMoeda(meta.valorTotalOrcado)}</strong>
            </div>
          </div>
        </section>

        <section className="relatorio-consolidado-section">
          <div className="relatorio-consolidado-section-title">Resumo por status</div>

          <div className="relatorio-consolidado-table-wrapper">
            <table className="relatorio-consolidado-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Quantidade</th>
                  <th>Valor orçado</th>
                </tr>
              </thead>
              <tbody>
                {resumoStatus.map((item) => (
                  <tr key={item.status}>
                    <td>{item.status}</td>
                    <td>{item.quantidade}</td>
                    <td>{item.valor > 0 ? formatarMoeda(item.valor) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="relatorio-consolidado-section">
          <div className="relatorio-consolidado-section-title">Detalhamento dos pedidos</div>

          <div className="relatorio-consolidado-pedidos">
            {pedidosOrdenados.map((item, index) => (
              <RelatorioPedidoCard
                key={item.id}
                index={index + 1}
                paciente={item.paciente}
                status={item.status}
                idade={item.idade}
                procedimento={item.procedimento}
                valorG4Med={item.valorG4Med}
                orcamentosApresentados={item.orcamentosApresentados}
                processo={item.processo}
                observacao={item.observacao}
              />
            ))}
          </div>
        </section>

        <section className="relatorio-consolidado-section">
          <div className="relatorio-consolidado-section-title">Ações pendentes</div>

          <ol className="relatorio-consolidado-acoes">
            {acoesPendentes.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
