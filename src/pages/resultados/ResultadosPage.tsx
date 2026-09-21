import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Timeline } from 'primereact/timeline';
import { FilterMatchMode } from 'primereact/api';
import {
  getResultados,
  getOrders,
  getMedicosCompleto,
  getAnexosOrder,
  uploadAnexoOrder,
  adicionarAcompanhamento,
  salvarResultadoProtocolado,
} from '../../services/api/orders';
import { getStatusTagStyle } from '../../utils/statusTag';
import { useAccess } from '../../access/AccessContext';
import './ResultadosPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
// Reaproveita estilos do dialog Atualizar (timeline, update-section, anexo, etc).
import '../protocolados/ProtocoladosPage.css';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, colunaOrigem, filtroMaiorQue } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento, kpisEmpenho } from '../../components/ColunasEmpenho/colunasEmpenho';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { FiltroTexto } from '../../components/Tabela/FiltroTexto';

interface HistoricoAcompanhamento {
  id: number;
  acompanhamento: string;
  descricao: string;
  linkAnexo?: string | null;
  createDate: string;
}

interface DocumentoProcesso {
  label: string;
  nome: string;
  url: string;
  tipo: 'pdf' | 'imagem' | 'outro';
}

interface ResultadoProcesso {
  id: number;
  paciente: string;
  nprocesso: string;
  procedimento: string;
  area: string;
  refPreco: number;
  valorOrcamento: number;
  valorGanho: number;
  dataPedido: string | null;
  dataProtocoloApi?: string | null;
  dataResultado?: string | null;
  dias: number;
  statusProcesso: string;
  statusPerda: string;
  obsProtocolo: string;
  analiseJuridicaFinal: string;
  historico: HistoricoAcompanhamento[];
  idMedico?: number | null;
  // legados para tabela
  cliente: string;
  valor: number;
  numeroProcesso: string;
  dataProtocolo: string;
  status: string;
  resultado: string;
  confirmacaoJuridica?: string | null;
  confirmacaoJuridicaObs?: string | null;
  documentos: DocumentoProcesso[];
}

type ResultadoTipo = 'ganho' | 'perda' | '';


interface ResultadoProcessoTableRow extends ResultadoProcesso {
  sequencial: number;
  dias: number;
}

export function ResultadosPage() {
  // A tabela recarrega quando a FICHA muda a situação de um pedido (@R 17/09:
  // "to mudando e a linha continua na tabela com os status incorretos"). O contexto
  // incrementa este número; ele entra nas dependências do efeito de carga abaixo.
  const { versaoDados } = useFichaPedido();
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<ResultadoProcesso[]>([]);
  const [selectedRegistros, setSelectedRegistros] = useState<ResultadoProcessoTableRow[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);

  const colunasCfg = useColunasVisiveis('resultados');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    cliente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    numeroProcesso: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    resultado: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

const carregarDados = async (): Promise<ResultadoProcesso[]> => {
  setLoading(true);
  try {
    const [resultadosRes, ordersRes, medicosRes] = await Promise.all([
      getResultados(),
      getOrders(),
      getMedicosCompleto(),
    ]);
    {
      const ordersLookup = (ordersRes.data as any[]).reduce<Record<number, any>>((acc, order) => {
        acc[order.id] = order;
        return acc;
      }, {});

      const mapeados = resultadosRes.data.map((o: any) => {
        const orderCompleta = ordersLookup[o.id];
        const medicoId = o.idMedico ?? orderCompleta?.idMedico ?? null;
        const medico = medicosRes.data.find((item: any) => item.id === medicoId);
        const valorOrcamento = o.valorOrcamento ?? orderCompleta?.valorOrcamento ?? 0;

        return {
          ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
          id: o.id,
          paciente: o.paciente ?? '',
          nprocesso: o.nprocesso ?? '',
          procedimento: o.procedimento ?? '',
          area: o.area ?? '',
          refPreco: o.refPreco ?? 0,
          valorOrcamento,
          valorGanho: o.valorGanho ?? 0,
          dataPedido: o.dataPedido,
          dataProtocoloApi: o.dataProtocolo ?? null,
          dataResultado: o.dataResultado ?? null,
          dias: o.dias ?? 0,
          statusProcesso: o.statusProcesso ?? '',
          statusPerda: o.statusPerda ?? '',
          obsProtocolo: o.obsProtocolo ?? '',
          analiseJuridicaFinal: o.analiseJuridicaFinal ?? '',
          historico: o.historico ?? [],
          idMedico: medicoId,
          // legados
          cliente: medico?.razaoSocial || medico?.nomeSistema || medico?.nomeCompleto || '',
          valor: valorOrcamento,
          numeroProcesso: o.nprocesso ?? '',
          dataProtocolo: o.dataProtocolo ?? o.dataResultado ?? '',
          status: o.statusProcesso ?? '',
          // 3 ESTADOS, não 2 (@R 08/09). `statusProcesso='Ganho'` responde "o processo
          // foi procedente?" — não "o dinheiro é nosso?". Dá para ganhar a causa e o
          // pagamento ir para outro prestador: isso é PERDA COMERCIAL contada hoje como
          // vitória. Só a advogada preenche `confirmacaoJuridica`, porque só ela sabe o
          // estado de HOJE — o banco guarda o que foi escrito até aquele dia.
          resultado:
            o.confirmacaoJuridica === 'NAO_NOSSO'
              ? 'Ganhou, não é nosso'
              : o.statusProcesso === 'Ganho' ? 'Ganho' : 'Perda',
          confirmacaoJuridica: o.confirmacaoJuridica ?? null,
          confirmacaoJuridicaObs: o.confirmacaoJuridicaObs ?? null,
          documentos: [] as DocumentoProcesso[],
        };
      });
      setRegistros(mapeados);
      return mapeados;
    }
  } catch (err) {
    console.error('Erro ao carregar resultados', err);
    return [];
  } finally {
    setLoading(false);
  }
  return [];
};

useEffect(() => { void carregarDados(); }, [versaoDados]);

const { isReadOnly } = useAccess();
const readOnly = isReadOnly('resultados');

// ===== Dialog "Atualização" (mesmo da tela Protocolados) =====
const [updateDialogVisible, setUpdateDialogVisible] = useState(false);
const [registroAtualizando, setRegistroAtualizando] = useState<ResultadoProcessoTableRow | null>(null);
const [novoAcompanhamento, setNovoAcompanhamento] = useState('');
const [tipoAcompanhamento, setTipoAcompanhamento] = useState<string>('');
const [anexoAcompanhamento, setAnexoAcompanhamento] = useState<File | null>(null);
const [salvandoAcompanhamento, setSalvandoAcompanhamento] = useState(false);

const TIPOS_ACOMPANHAMENTO = [
  'Valor já depositado ao medico',
  'Cirurgia Marcada',
  'Contato realizado pelo Juridico',
  'Informação Juridico',
];
const [parecerJuridico, setParecerJuridico] = useState('');
const [resultadoSelecionado, setResultadoSelecionado] = useState<ResultadoTipo>('');
const [valorGanhoDialog, setValorGanhoDialog] = useState<number | null>(null);
const [tipoAcao, setTipoAcao] = useState<'acompanhamento' | 'decisao' | ''>('');

const [previewVisible, setPreviewVisible] = useState(false);
const [previewUrl, setPreviewUrl] = useState('');
const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
const [previewNome, setPreviewNome] = useState('');

const fecharDialogAtualizacao = () => {
  setUpdateDialogVisible(false);
  setTipoAcao('');
  setNovoAcompanhamento('');
  setTipoAcompanhamento('');
  setAnexoAcompanhamento(null);
  setParecerJuridico('');
  setResultadoSelecionado('');
  setValorGanhoDialog(null);
};

const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
  setPreviewUrl(url);
  setPreviewNome(nome);
  setPreviewTipo(tipo);
  setPreviewVisible(true);
};

const handleBaixarDocumento = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const handleVisualizarDocumento = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
  abrirPreview(url, nome, tipo);
};

const handleSalvarAcompanhamento = async () => {
  if (!registroAtualizando) return;
  if (!tipoAcompanhamento) {
    alert('Selecione um tipo de acompanhamento.');
    return;
  }
  setSalvandoAcompanhamento(true);
  try {
    let linkAnexo: string | null = null;
    if (anexoAcompanhamento) {
      const resUpload: any = await uploadAnexoOrder(
        registroAtualizando.id,
        anexoAcompanhamento,
        'ACOMPANHAMENTO',
      );
      linkAnexo = resUpload?.data?.linkImagem ?? resUpload?.data?.url ?? null;
    }
    await adicionarAcompanhamento(registroAtualizando.id, {
      acompanhamento: tipoAcompanhamento,
      descricao: novoAcompanhamento,
      linkAnexo,
    });
    const atualizados = await carregarDados();
    const atualizado = atualizados.find((item) => item.id === registroAtualizando.id);
    if (atualizado) {
      setRegistroAtualizando((atual) =>
        atual ? ({ ...atual, ...atualizado } as ResultadoProcessoTableRow) : atual,
      );
    }
    setNovoAcompanhamento('');
    setTipoAcompanhamento('');
    setAnexoAcompanhamento(null);
    setTipoAcao('');
  } catch {
    alert('Erro ao salvar acompanhamento.');
  } finally {
    setSalvandoAcompanhamento(false);
  }
};

const handleSalvarDecisao = async () => {
  if (!registroAtualizando || !resultadoSelecionado) {
    alert('Selecione Ganho ou Perda antes de salvar.');
    return;
  }
  if (valorGanhoDialog === null || valorGanhoDialog <= 0) {
    alert(resultadoSelecionado === 'ganho' ? 'Informe o valor ganho.' : 'Informe o valor da causa.');
    return;
  }
  try {
    await salvarResultadoProtocolado(registroAtualizando.id, {
      acao: resultadoSelecionado,
      analise: parecerJuridico,
      valorGanho: valorGanhoDialog,
    });
    await carregarDados();
    fecharDialogAtualizacao();
  } catch {
    alert('Erro ao salvar decisão.');
  }
};

const abrirDialogAtualizar = (rowData: ResultadoProcessoTableRow) => {
  setRegistroAtualizando({ ...rowData, documentos: [] });
  setNovoAcompanhamento('');
  setTipoAcompanhamento('');
  setAnexoAcompanhamento(null);
  setParecerJuridico('');
  setResultadoSelecionado('');
  setValorGanhoDialog(null);
  setTipoAcao('');
  getAnexosOrder(rowData.id, 'ORCAMENTO')
    .then((res: any) => {
      const anexos: any[] = res.data.anexos ?? [];
      const documentos: DocumentoProcesso[] = anexos.map((anexo, index) => {
        const nome = anexo.linkImagem.split('/').pop() || `Orçamento ${index + 1}`;
        const extensao = nome.split('.').pop()?.toLowerCase();
        const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
          ? 'pdf'
          : ['jpg', 'jpeg', 'png', 'webp'].includes(extensao ?? '')
            ? 'imagem'
            : 'outro';
        return {
          label: `Orçamento ${index + 1}`,
          nome,
          url: anexo.linkImagem,
          tipo,
        };
      });
      setRegistroAtualizando((atual) =>
        atual && atual.id === rowData.id ? { ...atual, documentos } : atual,
      );
    })
    .catch(() => {
      setRegistroAtualizando((atual) =>
        atual && atual.id === rowData.id ? { ...atual, documentos: [] } : atual,
      );
    });
  setUpdateDialogVisible(true);
};




  const dataComCamposCalculados = useMemo<ResultadoProcessoTableRow[]>(() => {
    return registros.map((item, index) => {
      const dataPedido = item.dataPedido ? new Date(`${item.dataPedido}T00:00:00`) : null;
      const dataResultado = item.dataResultado ? new Date(`${item.dataResultado}T00:00:00`) : null;
      const dias =
        dataPedido && dataResultado
          ? Math.max(0, Math.floor((dataResultado.getTime() - dataPedido.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

      return {
        ...item,
        sequencial: index + 1,
        dias
      };
    });
  }, [registros]);

const kpis = useMemo(() => {
  const totalProcessos = dataComCamposCalculados.length;

  const mediaProcessos = totalProcessos
    ? Math.round(dataComCamposCalculados.reduce((acc, item) => acc + item.dias, 0) / totalProcessos)
    : 0;

  const ganhos = dataComCamposCalculados.filter(
    (item) => item.statusProcesso === 'Ganho'
  );
  const perdas = dataComCamposCalculados.filter(
    (item) => item.statusProcesso === 'Perda'
  );

  const ganhosValor = ganhos.reduce((acc, item) => acc + (item.valorGanho || item.valorOrcamento), 0);
  const perdasValor = perdas.reduce((acc, item) => acc + (item.valorOrcamento || item.refPreco), 0);
  const valorTotal = ganhosValor + perdasValor;

  const ganhosPercentual = valorTotal > 0 ? (ganhosValor / valorTotal) * 100 : 0;
  const perdasPercentual = valorTotal > 0 ? (perdasValor / valorTotal) * 100 : 0;

  // @R 28/08 02:46: "quero os ganhos exatos e os ganhos não exatos" — exato =
  // pagamento do Estado bate com o valor do ganho/orçado (±0,5%): confirmação
  // independente de que o Estado pagou exatamente o que declaramos ganhar.
  const ehGanhoExato = (item: any) => {
    const pago = item.empenho548?.pago ?? 0;
    const base = item.valorGanho || item.valorOrcamento || 0;
    return pago > 0 && base > 0 && Math.abs(pago - base) / base < 0.005;
  };
  const ganhosExatos = ganhos.filter(ehGanhoExato).length;
  const ganhosNaoExatos = ganhos.length - ganhosExatos;

  return {
    ganhosExatos,
    ganhosNaoExatos,
    totalProcessos,
    mediaProcessos,
    valorTotal,
    ganhosValor,
    perdasValor,
    ganhosPercentual,
    perdasPercentual,
  };
}, [dataComCamposCalculados]);



  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const formatarPercentual = (valor: number) =>
    `${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}%`;

  const getStatusSeverity = (
    status: string
  ): 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast' => {
    const valor = status.toLowerCase();

    if (['concluído', 'concluido', 'finalizado'].includes(valor)) return 'success';
    if (['em andamento'].includes(valor)) return 'warning';
    if (['indeferido'].includes(valor)) return 'danger';

    return 'secondary';
  };

  const precoBodyTemplate = (rowData: ResultadoProcessoTableRow) => formatarMoeda(rowData.valor);

  const diasBodyTemplate = (rowData: ResultadoProcessoTableRow) => (
    <span className="dias-cell">{rowData.dias}</span>
  );

  const resultadoBodyTemplate = (rowData: ResultadoProcessoTableRow) => {
    // O 3º estado tem cor PRÓPRIA (âmbar), ¬a do ganho nem a da perda: ele não é
    // nenhum dos dois. Pintá-lo de verde repetiria o erro que ele existe p/ corrigir
    // (ganho jurídico contado como ganho comercial); de vermelho apagaria que a causa
    // FOI ganha — informação que o jurídico precisa. O title carrega a explicação da
    // advogada, que é o dado que de fato justifica a classificação.
    if (rowData.confirmacaoJuridica === 'NAO_NOSSO') {
      return (
        <Tag
          value="Ganhou, não é nosso"
          className="status-tag-custom"
          style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #d08a1c', fontWeight: 600 }}
          title={rowData.confirmacaoJuridicaObs || 'Confirmado pelo jurídico: o pagamento não foi nosso'}
        />
      );
    }
    return (
      <Tag
        value={rowData.resultado}
        severity={getStatusSeverity(rowData.resultado)}
        style={getStatusTagStyle(rowData.resultado)}
        className="status-tag-custom"
        // Ganho JÁ confirmado pela advogada ganha o ✓ — separa "procedente" de
        // "procedente E conferido por quem sabe o estado de hoje".
        title={rowData.confirmacaoJuridica === 'NOSSO'
          ? `Confirmado pelo jurídico${rowData.confirmacaoJuridicaObs ? ': ' + rowData.confirmacaoJuridicaObs : ''}`
          : undefined}
      />
    );
  };

  const atualizarBodyTemplate = (rowData: ResultadoProcessoTableRow) => (
    <Button
      label="Atualizar"
      icon="pi pi-refresh"
      outlined
      onClick={() => abrirDialogAtualizar(rowData)}
    />
  );

  const formatarData = (data: string) => {
    if (!data) return '-';
    const partes = data.split('-');
    if (partes.length !== 3) return data;
    const [ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
  };

  // Aceita ISO ('2026-04-17T16:18:34.635068+00:00'), Django ('2026-04-17 16:18:34.635068+00:00')
  // ou só data ('2026-04-17'). Devolve "dd/mm/aaaa hh:mm" no fuso local.
  const formatarDataHora = (value?: string | null): string => {
    if (!value) return '-';
    const normalizado = value.includes('T') ? value : value.replace(' ', 'T');
    const d = new Date(normalizado);
    if (Number.isNaN(d.getTime())) return '-';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hh}:${mm}`;
  };

  const filterElement = (options: any, placeholder: string) => {
    return (
      <FiltroTexto
        options={options}
        placeholder={placeholder}
        className="p-column-filter"
      />
    );
  };

  return (
    <div className="resultados-page">
      {/* Sem cabeçalho próprio (08/09): esta página não tem mais rota — é a aba
          "Desfechos" do Painel de Resultados, que já traz o título. */}
      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-5">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Processos</span>
            <i className="pi pi-list"></i>
          </div>
          <div className="kpi-value">{kpis.totalProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Média/Processos</span>
            <i className="pi pi-chart-line"></i>
          </div>
          <div className="kpi-value">{kpis.mediaProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor Total</span>
            <i className="pi pi-dollar"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorTotal)}</div>
        </div>

        <div className="kpi-card" title="Somatório do que o Estado já PAGOU (empenho, base 548) nos CNJs desta tela · nº de pedidos com pagamento — sinal para conferir o desfecho, não repasse ao prestador">
          <div className="kpi-header">
            <span>Pago pelo Estado (548)</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpisEmpenho(dataComCamposCalculados).somaPago)} · {kpisEmpenho(dataComCamposCalculados).nPagos}</div>
          <div className="kpi-subvalue">sinal forte · +{kpisEmpenho(dataComCamposCalculados).nHistorico} histórico ñ-atribuível</div>
        </div>

        <div className="kpi-card" title="Ganhos cujo pagamento do Estado BATE com o orçado (±0,5%) × ganhos ainda sem confirmação exata de valor — inteligência de conferência">
          <div className="kpi-header">
            <span>Ganhos</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value kpi-value-success">{formatarMoeda(kpis.ganhosValor)}</div>
          <div className="kpi-subvalue">
            {formatarPercentual(kpis.ganhosPercentual)} · {kpis.ganhosExatos} exatos (pago = orçado) · {kpis.ganhosNaoExatos} não exatos
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Perdas</span>
            <i className="pi pi-times-circle"></i>
          </div>
          <div className="kpi-value kpi-value-danger">{formatarMoeda(kpis.perdasValor)}</div>
          <div className="kpi-subvalue">{formatarPercentual(kpis.perdasPercentual)}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Processos finalizados — resultado (ganho ou perda), valor e tempo de tramitação</h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            <BotaoExportarExcel todos={dataComCamposCalculados} nome="resultados" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable rowClassName={rowClassRepedido}
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Processos finalizados — resultado (ganho ou perda), valor e tempo de tramitação"
          value={dataComCamposCalculados}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          totalRecords={dataComCamposCalculados.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          selectionMode="multiple"
          selection={selectedRegistros}
          onSelectionChange={(e) => setSelectedRegistros(e.value as ResultadoProcessoTableRow[])}
          tableStyle={{ minWidth: '90rem' }}
          emptyMessage="Nenhum resultado encontrado."
          className="resultados-table"
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column
            field="id"
            header="#"
            style={{ minWidth: '4rem' }}
            body={(rowData: ResultadoProcessoTableRow) => rowData.id}
           frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{/* A etiqueta Ganho/Perda SAIU daqui (@R 08/09: ⟦ou você tira de ações os status e
    passa para uma coluna para fazer o filtro, ou dá a ela o cabeçalho para filtrar⟧).
    Dentro de "Ações" ela não tinha cabeçalho próprio — logo não tinha filtro nem
    ordenação, e a informação mais importante da tela (ganhou ou perdeu?) só podia ser
    lida linha a linha. Virou a coluna "Resultado" logo abaixo, com filtro de seleção. */}
{colunaAcoesFase({ corpo: (r: any) => atualizarBodyTemplate(r), excluir: carregarDados })}
          <Column
            field="resultado"
            header={cabecalhoComHint('Resultado', 'Ganho ou Perda do processo. Use o filtro para ver só um dos dois.')}
            sortable
            filter
            showFilterMenu={false}
            filterElement={(options) => (
              <Dropdown
                value={options.value}
                options={[
                  { label: 'Todos', value: '' },
                  { label: 'Ganho', value: 'Ganho' },
                  { label: 'Ganhou, não é nosso', value: 'Ganhou, não é nosso' },
                  { label: 'Perda', value: 'Perda' },
                ]}
                onChange={(e) => options.filterApplyCallback(e.value)}
                placeholder="Todos"
                className="p-column-filter"
                showClear={false}
              />
            )}
            style={{ minWidth: '8.5rem' }}
            body={(r: any) => resultadoBodyTemplate(r)}
          />
          <Column
            field="paciente" className="col-paciente-upper" body={(r: any) => nomeComCopiar(r.paciente, r.id)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem(dataComCamposCalculados)}
          {colunaSegredo(undefined, dataComCamposCalculados)}
          {colunaRepedido(dataComCamposCalculados)}
          <Column
            field="cliente"
            header={cabecalhoComHint('Cliente', 'Empresa/prestador que responde pelo orçamento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          <Column
            field="valor"
            header={cabecalhoComHint('Valor', 'Valor do orçamento que enviamos ao Estado por este pedido.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={precoBodyTemplate}
            style={{ minWidth: '10rem' }}
          />
          <Column
            field="numeroProcesso"
            header="Processo"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          <Column
            field="dias"
            header={cabecalhoComHint('Desde a chegada', 'Dias corridos desde que o pedido CHEGOU no sistema (não desde a entrada nesta fase). Compare com o SLA no cabeçalho.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            body={diasBodyTemplate}
            style={{ minWidth: '7rem' }}
          />
          {colunaAnexosSES(dataComCamposCalculados)}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaInteiroTeor()}
          {colunaSolicitante('13rem', dataComCamposCalculados)}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>
      </div>

      <Dialog
        header="Atualização"
        visible={updateDialogVisible}
        style={{ width: '72rem', maxWidth: '96vw' }}
        modal
        onHide={fecharDialogAtualizacao}
        className="protocolado-update-dialog"
      >
        {registroAtualizando && (
          <div className="update-processo-layout">
            <div className="update-topbar">
              <div className="update-processo-title">
                Processo {registroAtualizando.numeroProcesso}
              </div>
              <Button label="Voltar" outlined onClick={fecharDialogAtualizacao} />
            </div>

            <section className="update-section">
              <h3>Informações do Processo</h3>
              <div className="update-info-grid">
                <div><strong>Paciente</strong><span>{registroAtualizando.paciente}</span></div>
                <div><strong>Cliente</strong><span>{registroAtualizando.cliente}</span></div>
                <div><strong>Procedimento</strong><span>{registroAtualizando.procedimento}</span></div>
                <div><strong>Valor</strong><span>{formatarMoeda(registroAtualizando.valor)}</span></div>
                <div><strong>Data Protocolo</strong><span>{formatarData(registroAtualizando.dataProtocolo)}</span></div>
                <div><strong>Dias desde o protocolo</strong><span>{registroAtualizando.dias} dias</span></div>
              </div>
            </section>

            <section className="update-section">
              <h3>Orçamento do Pedido</h3>
              {registroAtualizando.documentos.length === 0 && (
                <div className="timeline-empty">Nenhum orçamento anexado.</div>
              )}
              {registroAtualizando.documentos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {registroAtualizando.documentos.map((doc, index) => {
                    const icone = doc.tipo === 'pdf'
                      ? 'pi pi-file-pdf'
                      : doc.tipo === 'imagem'
                        ? 'pi pi-image'
                        : 'pi pi-file';
                    return (
                      <button
                        key={`${doc.nome}-${index}`}
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          background: 'transparent',
                          color: '#374151',
                          fontSize: '0.9rem',
                          width: '100%',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        onClick={() => handleVisualizarDocumento(doc.url, doc.nome, doc.tipo)}
                      >
                        <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{doc.nome || `Orçamento ${index + 1}`}</span>
                        <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="update-section">
              <h3>Histórico de Acompanhamento</h3>
              {registroAtualizando.historico.length > 0 ? (
                <Timeline
                  value={registroAtualizando.historico}
                  align="left"
                  content={(item: HistoricoAcompanhamento) => (
                    <div className="timeline-card">
                      <div className="timeline-date">
                        {formatarDataHora(item.createDate)}
                      </div>
                      <div className="timeline-title">{item.acompanhamento}</div>
                      <div className="timeline-description">{item.descricao}</div>
                      {item.linkAnexo && (
                        <a
                          className="timeline-anexo-link"
                          href={item.linkAnexo}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <i className="pi pi-paperclip" /> Ver anexo
                        </a>
                      )}
                    </div>
                  )}
                  className="processo-timeline"
                />
              ) : (
                <div className="timeline-empty">Nenhum acompanhamento registrado.</div>
              )}
            </section>

            <section className="update-section">
              <h3>Adicionar Acompanhamento</h3>
              {!readOnly && (
                <div className="resultado-actions">
                  <Button
                    label="Acompanhamento"
                    severity={tipoAcao === 'acompanhamento' ? 'info' : 'secondary'}
                    outlined={tipoAcao !== 'acompanhamento'}
                    onClick={() => setTipoAcao('acompanhamento')}
                  />
                  <Button
                    label="Decisão do Processo"
                    severity={tipoAcao === 'decisao' ? 'warning' : 'secondary'}
                    outlined={tipoAcao !== 'decisao'}
                    onClick={() => setTipoAcao('decisao')}
                  />
                </div>
              )}

              {tipoAcao === 'acompanhamento' && (
                <div className="update-form-grid">
                  <div className="field field-span-4">
                    <label>Tipo de Acompanhamento *</label>
                    <div className="resultado-actions" style={{ flexWrap: 'wrap' }}>
                      {TIPOS_ACOMPANHAMENTO.map((tipo) => (
                        <Button
                          key={tipo}
                          label={tipo}
                          severity={tipoAcompanhamento === tipo ? 'info' : 'secondary'}
                          outlined={tipoAcompanhamento !== tipo}
                          onClick={() => setTipoAcompanhamento(tipo)}
                        />
                      ))}
                    </div>
                  </div>

                  {tipoAcompanhamento && (
                    <>
                      <div className="field field-span-4">
                        <label>Descrição (opcional)</label>
                        <InputTextarea
                          value={novoAcompanhamento}
                          onChange={(e) => setNovoAcompanhamento(e.target.value)}
                          rows={4}
                          placeholder="Detalhes do acompanhamento..."
                        />
                      </div>
                      <div className="field field-span-4">
                        <label>Anexo (opcional)</label>
                        <div className="acompanhamento-anexo-row">
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            onChange={(e) =>
                              setAnexoAcompanhamento(e.target.files?.[0] ?? null)
                            }
                          />
                          {anexoAcompanhamento && (
                            <span className="acompanhamento-anexo-info">
                              <i className="pi pi-file" />
                              {anexoAcompanhamento.name}
                              <button
                                type="button"
                                className="acompanhamento-anexo-remove"
                                onClick={() => setAnexoAcompanhamento(null)}
                                title="Remover"
                              >
                                <i className="pi pi-times" />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="field field-span-4" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          label={salvandoAcompanhamento ? 'Salvando...' : 'Salvar Acompanhamento'}
                          icon="pi pi-check"
                          loading={salvandoAcompanhamento}
                          disabled={salvandoAcompanhamento}
                          onClick={handleSalvarAcompanhamento}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {tipoAcao === 'decisao' && (
                <div className="update-form-grid">
                  <div className="field field-span-4">
                    <label>Resultado</label>
                    <div className="resultado-actions">
                      <Button
                        label="Procedente (Ganho)"
                        severity={resultadoSelecionado === 'ganho' ? 'success' : 'secondary'}
                        outlined={resultadoSelecionado !== 'ganho'}
                        onClick={() => {
                          setResultadoSelecionado('ganho');
                          setValorGanhoDialog(registroAtualizando.valorOrcamento);
                        }}
                      />
                      <Button
                        label="Improcedente (Perda)"
                        severity={resultadoSelecionado === 'perda' ? 'danger' : 'secondary'}
                        outlined={resultadoSelecionado !== 'perda'}
                        onClick={() => {
                          setResultadoSelecionado('perda');
                          setValorGanhoDialog(null);
                        }}
                      />
                    </div>
                  </div>

                  {resultadoSelecionado !== '' && (
                    <div className="field field-span-2">
                      <label>{resultadoSelecionado === 'ganho' ? 'Valor Ganho' : 'Valor da Causa'}</label>
                      <InputNumber
                        value={valorGanhoDialog ?? undefined}
                        onValueChange={(e) => setValorGanhoDialog(e.value ?? null)}
                        mode="currency" currency="BRL" locale="pt-BR"
                        className={valorGanhoDialog === null || valorGanhoDialog <= 0 ? 'p-invalid' : ''}
                      />
                    </div>
                  )}

                  <div className="field field-span-4">
                    <label>Análise Jurídica Final</label>
                    <InputTextarea
                      value={parecerJuridico}
                      onChange={(e) => setParecerJuridico(e.target.value)}
                      rows={5}
                      placeholder="Descreva o parecer jurídico final..."
                    />
                  </div>

                  <div className="field field-span-4" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      label="Salvar Decisão"
                      icon="pi pi-check"
                      severity={resultadoSelecionado === 'ganho' ? 'success' : 'danger'}
                      onClick={handleSalvarDecisao}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </Dialog>

      <Dialog
        header={previewNome}
        visible={previewVisible}
        style={{ width: '80vw', maxWidth: '1100px' }}
        modal
        onHide={() => setPreviewVisible(false)}
      >
        <div style={{ minHeight: '70vh' }}>
          {previewTipo === 'pdf' && (
            <iframe
              src={previewUrl}
              title={previewNome}
              width="100%"
              height="700px"
              style={{ border: 'none', borderRadius: '8px' }}
            />
          )}
          {previewTipo === 'imagem' && (
            <img
              src={previewUrl}
              alt={previewNome}
              style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }}
            />
          )}
          {previewTipo === 'outro' && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
              <Button
                label="Baixar arquivo"
                icon="pi pi-download"
                onClick={() => handleBaixarDocumento(previewUrl)}
              />
            </div>
          )}
        </div>
        <div className="dialog-footer-actions">
          <Button label="Baixar" icon="pi pi-download" outlined onClick={() => handleBaixarDocumento(previewUrl)} />
          <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
        </div>
      </Dialog>
    </div>
  );
}
