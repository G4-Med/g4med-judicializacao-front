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
import { FilterMatchMode } from 'primereact/api';
import { Dialog } from 'primereact/dialog';
import { Timeline } from 'primereact/timeline';
import { getProtocolados, salvarResultadoProtocolado, adicionarAcompanhamento, getAnexosOrder, uploadAnexoOrder, getMedicosCompleto } from '../../services/api/orders';
import { InputNumber } from 'primereact/inputnumber';
import { getStatusTagStyle } from '../../utils/statusTag';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { useAccess } from '../../access/AccessContext';
import './ProtocoladosPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor, colunaEmailOrgao , cabecalhoComHint, colunaOrigem, filtroMaiorQue } from '../../components/ColunasIdentificacao/colunasIdentificacao';
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

interface Protocolado {
  id: number;
  paciente: string;
  nprocesso: string;
  procedimento: string;
  area: string;
  refPreco: number;
  valorOrcamento: number;
  dataStatusOrcamento: string | null;
  dataProtocoloApi?: string | null;
  dias: number;
  statusProcesso: string;
  obsProtocolo: string;
  analiseJuridicaFinal: string;
  historico: HistoricoAcompanhamento[];
  // campos legados
  cliente: string;
  valor: number;
  numeroProcesso: string;
  dataProtocolo: string;
  status: string;
  resultado: string;
  documentos: DocumentoProcesso[];
}

interface ProtocoladoTableRow extends Protocolado {
  sequencial: number;
  dias: number;
}

type ResultadoType = 'ganho' | 'perda' | '';

export function ProtocoladosPage() {
  // A tabela recarrega quando a FICHA muda a situação de um pedido (@R 17/09:
  // "to mudando e a linha continua na tabela com os status incorretos"). O contexto
  // incrementa este número; ele entra nas dependências do efeito de carga abaixo.
  const { versaoDados } = useFichaPedido();
  const { isReadOnly } = useAccess();
  // @R 28/08 02:1x: "vamos buscar os pagamentos do 5" — expander com os empenhos
  // pagos do Estado (base 548) também nos Protocolados.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const readOnly = isReadOnly('protocolados');
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<Protocolado[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);

  const colunasCfg = useColunasVisiveis('protocolados');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    diasSemAtualizacao: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    cliente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    numeroProcesso: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    status: { value: '', matchMode: FilterMatchMode.CONTAINS },
    resultado: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

  const [visibleProcessos, setVisibleProcessos] = useState<ProtocoladoTableRow[]>([]);

  const [updateDialogVisible, setUpdateDialogVisible] = useState(false);
  const [registroAtualizando, setRegistroAtualizando] = useState<ProtocoladoTableRow | null>(null);

  const [novoAcompanhamento, setNovoAcompanhamento] = useState('');
  const [tipoAcompanhamento, setTipoAcompanhamento] = useState<string>('');
  const [anexoAcompanhamento, setAnexoAcompanhamento] = useState<File | null>(null);
  const [salvandoAcompanhamento, setSalvandoAcompanhamento] = useState(false);
  const [parecerJuridico, setParecerJuridico] = useState('');
  const [resultadoSelecionado, setResultadoSelecionado] = useState<ResultadoType>('');
  // Peça de inteiro teor (sentença/acórdão) — obrigatória pra registrar ganho ou
  // perda: sem o documento, a decisão fica sem prova documental no processo.
  const [pecaInteiroTeor, setPecaInteiroTeor] = useState<File | null>(null);
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);

  // 'Anotação do jurídico' vem PRIMEIRO e é o default: os outros três são EVENTOS
  // (algo aconteceu), mas o uso mais comum é a nota de andamento — "acompanhei hoje,
  // segue aguardando decisão". Sem esse tipo, quem só queria anotar não tinha onde.
  const ANOTACAO_LIVRE = 'Anotação do jurídico';
  const TIPOS_ACOMPANHAMENTO = [
    ANOTACAO_LIVRE,
    'Valor já depositado ao medico',
    'Cirurgia Marcada',
    'Contato realizado pelo Juridico',
  ];



  
  // estado para valor ganho
  const [valorGanho, setValorGanho] = useState<number | null>(null);
  // estado para tipo de ação no form
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
    setValorGanho(null);
    setPecaInteiroTeor(null);
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [protocoladosRes, medicosRes] = await Promise.all([
        getProtocolados(),
        getMedicosCompleto().catch(() => ({ data: [] })),
      ]);

      const medicosLista = Array.isArray(medicosRes.data) ? medicosRes.data : [];
      const medicosLookup = medicosLista.reduce<Record<number, any>>((acc, m: any) => {
        acc[m.id] = m;
        return acc;
      }, {});

      const registrosMapeados = protocoladosRes.data.map((o: any) => {
        const medico = o.idMedico != null ? medicosLookup[o.idMedico] : null;
        const nomeCliente = medico?.razaoSocial || medico?.nomeMedico || medico?.nomeSistema || '';

        return {
          ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
          id: o.id,
          paciente: o.paciente ?? '',
          nprocesso: o.nprocesso ?? '',
          procedimento: o.procedimento ?? '',
          area: o.area ?? '',
          refPreco: o.refPreco ?? 0,
          valorOrcamento: o.valorOrcamento ?? 0,
          dataStatusOrcamento: o.dataStatusOrcamento,
          dataProtocoloApi: o.dataProtocolo ?? null,
          dias: o.dias ?? 0,
          statusProcesso: o.statusProcesso ?? '',
          obsProtocolo: o.obsProtocolo ?? '',
          analiseJuridicaFinal: o.analiseJuridicaFinal ?? '',
          historico: o.historico ?? [],
          // legados
          cliente: nomeCliente,
          valor: o.valorOrcamento ?? o.refPreco ?? 0,
          numeroProcesso: o.nprocesso ?? '',
          dataProtocolo: o.dataProtocolo ?? '',
          status: 'Protocolado',
          resultado: 'Em andamento',
          documentos: [],
        };
      });

      setRegistros(registrosMapeados);
      return registrosMapeados;
    } catch {
      console.error('Erro ao carregar protocolados');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregarDados(); }, [versaoDados]);

  const handleSalvarAcompanhamento = async () => {
    if (!registroAtualizando) return;
    // Se a pessoa só escreveu a observação e não marcou tipo, isso é uma ANOTAÇÃO —
    // ¬motivo para bloquear. Bloquear aqui era o que fazia a tela parecer que não
    // aceitava texto (o campo ficava escondido até escolher tipo).
    const tipoFinal = tipoAcompanhamento || (novoAcompanhamento.trim() ? ANOTACAO_LIVRE : '');
    if (!tipoFinal) {
      alert('Escreva uma observação ou selecione um tipo de acompanhamento.');
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
        acompanhamento: tipoFinal,
        descricao: novoAcompanhamento,
        linkAnexo,
      });
      const registrosAtualizados = await carregarDados();
      const registroAtualizado = registrosAtualizados.find(
        (item: Protocolado) => item.id === registroAtualizando.id
      );
      if (registroAtualizado) {
        setRegistroAtualizando((atual) =>
          atual ? { ...atual, ...registroAtualizado } as ProtocoladoTableRow : atual
        );
      }
      setNovoAcompanhamento('');
      setTipoAcompanhamento('');
      setAnexoAcompanhamento(null);
      setTipoAcao('');
    } catch (err) {
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
    if (valorGanho === null || valorGanho <= 0) {
      alert(resultadoSelecionado === 'ganho' ? 'Informe o valor ganho.' : 'Informe o valor da causa.');
      return;
    }
    if (!pecaInteiroTeor) {
      alert('Anexe a peça de inteiro teor (sentença/acórdão) — é obrigatória para registrar a decisão.');
      return;
    }
    setSalvandoDecisao(true);
    try {
      await uploadAnexoOrder(registroAtualizando.id, pecaInteiroTeor, 'DECISAO_INTEIRO_TEOR');
      await salvarResultadoProtocolado(registroAtualizando.id, {
        acao: resultadoSelecionado,
        analise: parecerJuridico,
        valorGanho,
      });
      // Teste local 15/09: a decisão era gravada (201) mas o modal ficava aberto esperando a lista
      // recarregar. Agora fecha e tira o pedido decidido da tabela NA HORA; recarrega em segundo plano.
      const idDecidido = registroAtualizando.id;
      setTipoAcao('');
      fecharDialogAtualizacao();
      setRegistros((atual) => atual.filter((r) => r.id !== idDecidido));
      void carregarDados();
    } catch (err) {
      alert('Erro ao salvar decisão.');
    } finally {
      setSalvandoDecisao(false);
    }
  };




  const dataComCamposCalculados = useMemo<ProtocoladoTableRow[]>(() => {
    const hoje = new Date();

    return registros.map((item, index) => {
      const dataBase = new Date(`${item.dataProtocolo}T00:00:00`);
      const diferencaMs = hoje.getTime() - dataBase.getTime();
      const dias = Math.max(0, Math.floor(diferencaMs / (1000 * 60 * 60 * 24)));

      return {
        ...item,
        sequencial: index + 1,
        dias
      };
    });
  }, [registros]);

  useEffect(() => { setVisibleProcessos(dataComCamposCalculados); }, [dataComCamposCalculados]);

  const kpis = useMemo(() => {
    const totalProcessos = visibleProcessos.length;
    const mediaProcessos = totalProcessos
      ? Math.round(
          visibleProcessos.reduce((acc, item) => acc + item.dias, 0) / totalProcessos
        )
      : 0;

    const valorTotal = visibleProcessos.reduce((acc, item) => acc + item.valor, 0);
    const mediaValorProcessos = totalProcessos ? valorTotal / totalProcessos : 0;

    return {
      totalProcessos,
      mediaProcessos,
      valorTotal,
      mediaValorProcessos,
    };
  }, [visibleProcessos]);

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

  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split('-');
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



  const getResultadoSeverity = (
    resultado: string
  ): 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast' => {
    const valor = resultado.toLowerCase();

    if (['ganho', 'procedente'].includes(valor)) return 'success';
    if (['perda', 'improcedente'].includes(valor)) return 'danger';
    if (['em andamento'].includes(valor)) return 'warning';

    return 'secondary';
  };

  const precoBodyTemplate = (rowData: ProtocoladoTableRow) => formatarMoeda(rowData.valor);
  const diasBodyTemplate = (rowData: ProtocoladoTableRow) => <span className="dias-cell">{rowData.dias}</span>;
  const statusBodyTemplate = (rowData: ProtocoladoTableRow) => (
    <Tag value={rowData.status} style={getStatusTagStyle(rowData.status)} className="status-tag-custom" />
  );
  const resultadoBodyTemplate = (rowData: ProtocoladoTableRow) => (
    <Tag value={rowData.resultado} severity={getResultadoSeverity(rowData.resultado)} />
  );

  const atualizarBodyTemplate = (rowData: ProtocoladoTableRow) => {
    return (
      <Button
        label="Atualizar"
        icon="pi pi-refresh"
        outlined
        onClick={() => {
          setRegistroAtualizando({ ...rowData, documentos: [] });
          setNovoAcompanhamento('');
          setTipoAcompanhamento('');
          setAnexoAcompanhamento(null);
          setParecerJuridico('');
          setResultadoSelecionado('');
          getAnexosOrder(rowData.id, 'ORCAMENTO')
            .then((res: any) => {
              const anexos: any[] = res.data.anexos ?? [];
              const documentos = anexos.map((anexo, index) => {
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
                atual && atual.id === rowData.id ? { ...atual, documentos } : atual
              );
            })
            .catch(() => {
              setRegistroAtualizando((atual) =>
                atual && atual.id === rowData.id ? { ...atual, documentos: [] } : atual
              );
            });
          setUpdateDialogVisible(true);
        }}
      />
    );
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




  return (
    <div className="protocolados-page">
      <PrimeiraVisitaInfo etapaId="protocolados" />
      <div className="page-header">
        <CabecalhoFase nome="Protocolados" slaTexto="atualizar a cada 15 dias" screen="protocolados"
          subtitulo="Protocolados nos autos — acompanhamento até a decisão" />

        <div className="page-actions">
          {!readOnly && <Button
            label="Novo Protocolo"
            icon="pi pi-plus"
          />}
        </div>
      </div>

      {readOnly && <ReadOnlyBanner />}

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Processos</span>
            <i className="pi pi-list"></i>
          </div>
          <div className="kpi-value">{kpis.totalProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Média de dias dos Processos</span>
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

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Média Valor Processos</span>
            <i className="pi pi-wallet"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.mediaValorProcessos)}</div>
        </div>

        <div className="kpi-card" title="Só sinal FORTE (pago depois do pedido ou valor compatível) — régua anti-inflação da 548. Valor do empenho, não repasse">
          <div className="kpi-header">
            <span>Pago pelo Estado (sinal forte)</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpisEmpenho(visibleProcessos).somaPago)}</div>
          <div className="kpi-subvalue">{kpisEmpenho(visibleProcessos).nPagos} pedidos · {kpisEmpenho(visibleProcessos).nExatos} exatos · {kpisEmpenho(visibleProcessos).nHistorico} histórico ñ-atribuível</div>
        </div>

        <div className="kpi-card" title="Pedidos SEM pagamento atribuível — o que ainda esperamos do Estado (soma do orçado)">
          <div className="kpi-header">
            <span>Em aberto</span>
            <i className="pi pi-hourglass"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpisEmpenho(visibleProcessos).somaAberto)}</div>
          <div className="kpi-subvalue">{kpisEmpenho(visibleProcessos).nAbertos} pedidos</div>
        </div>

      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Pedidos protocolados</h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            <BotaoExportarExcel todos={dataComCamposCalculados} visiveis={visibleProcessos} nome="protocolados" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable rowClassName={rowClassRepedido}
          aria-label="Pedidos protocolados"
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          value={dataComCamposCalculados}
          onValueChange={(value) => setVisibleProcessos(value as ProtocoladoTableRow[])}
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
          tableStyle={{ minWidth: '95rem' }}
          emptyMessage="Nenhum processo encontrado."
          className="protocolados-table"
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          {!readOnly && <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />}
          <Column
            field="id"
            header="#"
            style={{ minWidth: '4rem' }}
            body={(rowData: ProtocoladoTableRow) => rowData.id}
           frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{atualizarBodyTemplate(r)}{resultadoBodyTemplate(r)}</>, excluir: carregarDados })}
          <Column
            field="paciente" className="col-paciente-upper" body={(r: any) => nomeComCopiar(r.paciente, r.id)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem(dataComCamposCalculados)}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
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
            header={cabecalhoComHint('Dias protocolo', 'Dias desde a data em que a peça foi protocolada nos autos.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            body={diasBodyTemplate}
            style={{ minWidth: '8rem' }}
          />
          {/* @R 28/08 02:0x: "quantos dias desde a última atualização... pelo menos
              de 15 em 15 dias o processo precisa ser atualizado" — SLA de acompanhamento */}
<Column
            field="diasSemAtualizacao"
            header={cabecalhoComHint('Sem atualização', 'Dias desde o último acompanhamento registrado. SLA: atualizar a cada 15 dias.')}
            sortable
            filter
            showFilterMenu={false}
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '9rem' }}
            body={(r: any) => (r.diasSemAtualizacao >= 30
              ? <Tag value={`${r.diasSemAtualizacao}d`} severity="danger" icon="pi pi-exclamation-triangle"
                  title="30+ dias sem atualização — 2 ciclos de SLA vencidos (o processo deve ser atualizado a cada 15 dias)" />
              : r.diasSemAtualizacao >= 15
                ? <Tag value={`${r.diasSemAtualizacao}d`} severity="warning" icon="pi pi-clock"
                    title="15+ dias sem atualização — SLA de acompanhamento vencido (atualizar a cada 15 dias)" />
                : <span title="Dentro do SLA de 15 dias">{r.diasSemAtualizacao ?? '—'}d</span>)}
          />
          <Column
            field="status"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={statusBodyTemplate}
            style={{ minWidth: '12rem' }}
          />
          {colunaAnexosSES(dataComCamposCalculados)}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaInteiroTeor()}
          {colunaEmailOrgao()}
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

              <Button
                label="Voltar"
                outlined
                onClick={fecharDialogAtualizacao}
              />
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
              {!readOnly && <div className="resultado-actions">
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
              </div>}

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

                  {/* SEMPRE visível: antes ficava escondido atrás da escolha de tipo, e
                      quem só queria anotar concluía que a tela não aceitava texto. */}
                  <div className="field field-span-4">
                    <label>Observação</label>
                    <InputTextarea
                      value={novoAcompanhamento}
                      onChange={(e) => setNovoAcompanhamento(e.target.value)}
                      rows={4}
                      placeholder="Ex: acompanhei hoje, processo segue aguardando decisão."
                    />
                  </div>
                  {tipoAcompanhamento && (
                    <>
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
                          setValorGanho(registroAtualizando.valorOrcamento);
                        }}
                      />
                      <Button
                        label="Improcedente (Perda)"
                        severity={resultadoSelecionado === 'perda' ? 'danger' : 'secondary'}
                        outlined={resultadoSelecionado !== 'perda'}
                        onClick={() => {
                          setResultadoSelecionado('perda');
                          setValorGanho(null);
                        }}
                      />
                    </div>
                  </div>

                  {resultadoSelecionado !== '' && (
                    <div className="field field-span-2">
                      <label>{resultadoSelecionado === 'ganho' ? 'Valor Ganho' : 'Valor da Causa'}</label>
                      <InputNumber
                        value={valorGanho ?? undefined}
                        onValueChange={(e) => setValorGanho(e.value ?? null)}
                        mode="currency" currency="BRL" locale="pt-BR"
                        className={valorGanho === null || valorGanho <= 0 ? 'p-invalid' : ''}
                      />
                    </div>
                  )}

                  {resultadoSelecionado !== '' && (
                    <div className="field field-span-2">
                      <label>
                        Peça de Inteiro Teor (sentença/acórdão)
                        <span style={{ color: '#ef4444', marginLeft: '4px' }}>*obrigatório</span>
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: `2px dashed ${pecaInteiroTeor ? '#f97316' : '#d1d5db'}`,
                          background: pecaInteiroTeor ? '#fff7ed' : 'var(--mc-surface-2, #f9fafb)',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: pecaInteiroTeor ? '#f97316' : 'var(--mc-ink-2, #6b7280)',
                        }}
                      >
                        <i className={pecaInteiroTeor ? 'pi pi-file-check' : 'pi pi-upload'} />
                        <span>{pecaInteiroTeor ? pecaInteiroTeor.name : 'Selecionar peça...'}</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          style={{ display: 'none' }}
                          onChange={(e) => setPecaInteiroTeor(e.target.files?.[0] ?? null)}
                        />
                      </label>
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
                      label={salvandoDecisao ? 'Salvando...' : 'Salvar Decisão'}
                      icon="pi pi-check"
                      severity={resultadoSelecionado === 'ganho' ? 'success' : 'danger'}
                      loading={salvandoDecisao}
                      disabled={salvandoDecisao}
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
          <Button
            label="Baixar"
            icon="pi pi-download"
            outlined
            onClick={() => handleBaixarDocumento(previewUrl)}
          />
          <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
        </div>
      </Dialog>
    </div>
  );
}
