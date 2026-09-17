import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type { DataTablePageEvent, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { FilterMatchMode } from 'primereact/api';
import type { DataTableFilterMeta } from 'primereact/datatable';
import {
  atualizarOrder,
  getMedicosCompleto,
  getProcessosResumo,
  marcarSemProfissional,
  sugerirMedicoIA,
  aplicarSugestaoIA,
  type SugestaoIAResposta,
} from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { tagTipoPaciente, colunaOrigem, filtroMaiorQue } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import './SelecionarMedicoPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint} from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';

interface ProcessoResumo {
  id: number;
  paciente: string;
  procedimento: string;
  area: string;
  subarea: string;
  dataPedido: string;
  diasSolicitados: number;
  refPreco: number;
  idMedico: number | null;
  medico: string;
  slaMedicoEstourado: boolean | null;
  slaMedicoHoras: number | null;
  slaFasePrazo?: string | null;
  slaFaseHorasRestantes?: number | null;
  slaFaseVencido?: boolean | null;
}

/** SLA da fase (@R 29/08): 1 dia útil para definir o médico; sexta fecha na segunda. */
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtHoras = (h: number) => (h >= 48 ? `${Math.round(h / 24)} d` : h >= 1 ? `${Math.round(h)} h` : `${Math.max(1, Math.round(h * 60))} min`);
function CelulaSlaFase({ r }: { r: ProcessoResumo }) {
  if (r.slaFaseHorasRestantes == null || !r.slaFasePrazo) return <span className="sm-sla-vazio">—</span>;
  const prazo = new Date(r.slaFasePrazo);
  const quando = `${DIAS_SEMANA[prazo.getDay()]} ${prazo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const h = r.slaFaseHorasRestantes;
  const classe = r.slaFaseVencido ? 'sm-sla sm-sla--vencido' : h <= 6 ? 'sm-sla sm-sla--urgente' : 'sm-sla sm-sla--ok';
  return (
    <span className={classe} title={`Prazo desta fase: ${prazo.toLocaleString('pt-BR')} (1 dia útil após o "Cotar"; fim de semana não conta)`}>
      <i className={r.slaFaseVencido ? 'pi pi-exclamation-triangle' : 'pi pi-clock'} />
      {r.slaFaseVencido ? <>vencido há <b>{fmtHoras(-h)}</b></> : <>até <b>{quando}</b> · {fmtHoras(h)}</>}
    </span>
  );
}

interface ProcessoResumoTableRow extends ProcessoResumo {
  sequencial: number;
  dias: number;
}

interface MedicoOption {
  label: string;
  value: number;
}

export function SelecionarMedicoPage() {
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const { isReadOnly, filterMedicosByAccess } = useAccess();
  const readOnly = isReadOnly('selecionarMedico');
  const [loading, setLoading] = useState(false);
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [selectedProcessos, setSelectedProcessos] = useState<ProcessoResumoTableRow[]>([]);
  const [medicosOptions, setMedicosOptions] = useState<MedicoOption[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMassaVisible, setDialogMassaVisible] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoResumoTableRow | null>(null);
  const [medicoSelecionado, setMedicoSelecionado] = useState<number | null>(null);
  const [medicoSelecionadoMassa, setMedicoSelecionadoMassa] = useState<number | null>(null);
  const [salvandoMedico, setSalvandoMedico] = useState(false);
  const [executandoAcaoMassa, setExecutandoAcaoMassa] = useState(false);
  const [iaLoadingId, setIaLoadingId] = useState<number | null>(null);
  const [iaDialogVisible, setIaDialogVisible] = useState(false);
  const [iaSugestao, setIaSugestao] = useState<SugestaoIAResposta | null>(null);
  const [iaOrderId, setIaOrderId] = useState<number | null>(null);
  const [iaAplicando, setIaAplicando] = useState(false);

  const colunasCfg = useColunasVisiveis('selecionar-medico');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    ...FILTRO_PAGAMENTO,   // @R 28/08: pedir cotação para caso JÁ PAGO é trabalho perdido
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    area: { value: '', matchMode: FilterMatchMode.CONTAINS },
    subarea: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
  });

  const [visibleProcessos, setVisibleProcessos] = useState<ProcessoResumoTableRow[]>([]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [processosRes, medicosRes] = await Promise.all([
        getProcessosResumo(),
        getMedicosCompleto(),
      ]);

      const medicos = filterMedicosByAccess(
        Array.isArray(medicosRes.data) ? medicosRes.data : [],
        (item: any) => item?.id
      );
      const medicosLookup = new Map<number, string>(
        medicos.map((item: any) => [item.id, item.nomeSistema ?? item.nomeCompleto ?? ''])
      );

      // Teste local 15/09: (1) "SEM PROFISSIONAL" (id 1) aparecia como opção — escolher não move o
      // pedido (a lista desta fase É idMedico=1) e nada avisa; ele fica fora do seletor. Perda por
      // falta de profissional tem botão próprio. (2) o seletor mostrava só o nome de sistema e o
      // resto do sistema mostra o nome completo ("LUIZ FELIPE ENDOSCOPIA" × "A DEFINIR - ENDOSCOPIA"):
      // quando os dois diferem, o seletor mostra os dois.
      setMedicosOptions(
        medicos
          .filter((item: any) => item.id !== 1)
          .map((item: any) => {
            const sistema = (item.nomeSistema ?? '').trim();
            // /client/medico-completo/lista/ devolve o nome completo em `nomeMedico` (medido 15/09),
            // não em `nomeCompleto` — ler só nomeCompleto deixava o segundo nome sempre vazio.
            const completo = (item.nomeMedico ?? item.nomeCompleto ?? '').trim();
            const label = sistema && completo && sistema.toUpperCase() !== completo.toUpperCase()
              ? `${sistema} — ${completo}`
              : (sistema || completo || `Médico ${item.id}`);
            return { label, value: item.id };
          })
      );

      const lista = Array.isArray(processosRes.data) ? processosRes.data : [];
      setProcessos(
        lista.map((item: any) => ({
          // Cicatriz 29/08 00:15 (@R "não estão populados os dados"): o mapeamento copiava só
          // os campos que conhecia e DESCARTAVA CNJ/SEI/comarca/solicitante/peça/dossiê/re-pedido
          // que a API já devolvia. Espalha tudo primeiro; o que vem abaixo só normaliza.
          ...item,
          id: item.id,
          paciente: item.paciente ?? '',
          procedimento: item.procedimento ?? '',
          area: item.area ?? '',
          subarea: item.subarea ?? '',
          dataPedido: item.dataPedido ?? '',
          diasSolicitados: Number(item.diasSolicitados ?? 0),
          refPreco: Number(item.refPreco ?? 0),
          idMedico: item.idMedico ?? null,
          medico:
            item.medico ??
            (item.idMedico ? medicosLookup.get(item.idMedico) ?? '' : ''),
          slaMedicoEstourado: item.slaMedicoEstourado ?? null,
          slaMedicoHoras: item.slaMedicoHoras ?? null,
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar processos resumo:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarDados();
  }, []);

  const dataComCamposCalculados = useMemo<ProcessoResumoTableRow[]>(() => {
    return processos.map((item, index) => {
      return {
        ...item,
        sequencial: index + 1,
        dias: Number(item.diasSolicitados ?? 0),
      };
    });
  }, [processos]);

  useEffect(() => { setVisibleProcessos(dataComCamposCalculados); }, [dataComCamposCalculados]);

  const kpis = useMemo(() => {
    const total = visibleProcessos.length;
    const somaRefPreco = visibleProcessos.reduce(
      (acc, item) => acc + (item.refPreco ?? 0),
      0,
    );
    const valorMedio = total > 0 ? somaRefPreco / total : 0;
    const maisAntigo = total > 0 ? Math.max(...visibleProcessos.map((p) => p.dias)) : 0;

    // @R 17/09: "quantos temos em cada situação EM CADA PÁGINA para sabermos". O
    // `visibleProcessos` já é a página visível (onValueChange do DataTable) — o contador
    // acompanha filtro e paginação sem nenhuma query a mais.
    const semMedico = visibleProcessos.filter((p: any) => !p.idMedico || p.idMedico === 1).length;
    const emSegredo = visibleProcessos.filter((p: any) => p.segredo === 'sim').length;
    return {
      total,
      semMedico,
      emSegredo,
      valorMedio,
      maisAntigo,
    };
  }, [visibleProcessos]);

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  const abrirDialog = (rowData: ProcessoResumoTableRow) => {
    setProcessoSelecionado(rowData);
    setMedicoSelecionado(rowData.idMedico ?? null);
    setDialogVisible(true);
  };

  const handleSalvarMedico = async () => {
    if (!processoSelecionado || !medicoSelecionado) {
      alert('Selecione um médico.');
      return;
    }

    setSalvandoMedico(true);
    try {
      await atualizarOrder(processoSelecionado.id, { idMedico: medicoSelecionado });
      await carregarDados();
      setDialogVisible(false);
      setProcessoSelecionado(null);
      setMedicoSelecionado(null);
    } catch (error) {
      console.error('Erro ao selecionar médico:', error);
      alert('Erro ao salvar o médico do processo.');
    } finally {
      setSalvandoMedico(false);
    }
  };

  const handleMarcarSemProfissional = async (rowData: ProcessoResumoTableRow) => {
    try {
      await marcarSemProfissional(rowData.id);
      await carregarDados();
    } catch (error) {
      console.error('Erro ao marcar perda por falta de profissional:', error);
      alert('Erro ao marcar perda por falta de profissional.');
    }
  };

  const handleMarcarSemProfissionalEmMassa = async () => {
    if (selectedProcessos.length === 0) {
      alert('Selecione pelo menos um processo.');
      return;
    }

    setExecutandoAcaoMassa(true);
    try {
      await Promise.all(selectedProcessos.map((item) => marcarSemProfissional(item.id)));
      await carregarDados();
      setSelectedProcessos([]);
    } catch (error) {
      console.error('Erro ao marcar perda por falta de profissional em massa:', error);
      alert('Erro ao marcar perda por falta de profissional em massa.');
    } finally {
      setExecutandoAcaoMassa(false);
    }
  };

  const abrirDialogMassa = () => {
    if (selectedProcessos.length === 0) {
      alert('Selecione pelo menos um processo.');
      return;
    }

    setMedicoSelecionadoMassa(null);
    setDialogMassaVisible(true);
  };

  const handleSelecionarMedicoEmMassa = async () => {
    if (!medicoSelecionadoMassa) {
      alert('Selecione um médico.');
      return;
    }

    setExecutandoAcaoMassa(true);
    try {
      await Promise.all(
        selectedProcessos.map((item) => atualizarOrder(item.id, { idMedico: medicoSelecionadoMassa }))
      );
      await carregarDados();
      setSelectedProcessos([]);
      setDialogMassaVisible(false);
      setMedicoSelecionadoMassa(null);
    } catch (error) {
      console.error('Erro ao selecionar médico em massa:', error);
      alert('Erro ao salvar o médico em massa.');
    } finally {
      setExecutandoAcaoMassa(false);
    }
  };

  const handleSugerirMedicoIA = async (rowData: ProcessoResumoTableRow) => {
    setIaLoadingId(rowData.id);
    try {
      const { data } = await sugerirMedicoIA(rowData.id);
      const sug = data as SugestaoIAResposta;
      setIaSugestao(sug);
      setIaOrderId(rowData.id);
      setIaDialogVisible(true);
    } catch (error: any) {
      console.error('Erro ao sugerir médico via IA:', error);
      alert(error?.response?.data?.detail ?? 'Erro ao gerar sugestão.');
    } finally {
      setIaLoadingId(null);
    }
  };

  const fecharIaDialog = () => {
    setIaDialogVisible(false);
    setIaSugestao(null);
    setIaOrderId(null);
  };

  const handleAplicarSugestaoIA = async () => {
    if (!iaSugestao || !iaOrderId) return;
    if (!iaSugestao.idMedico) {
      alert('A IA não conseguiu identificar um médico — não há sugestão para aplicar.');
      return;
    }
    setIaAplicando(true);
    try {
      await aplicarSugestaoIA(iaSugestao.sugestaoId, iaSugestao.idMedico);
      fecharIaDialog();
      await carregarDados();
    } catch (error: any) {
      console.error('Erro ao aplicar sugestão IA:', error);
      alert(error?.response?.data?.detail ?? 'Erro ao aplicar a sugestão.');
    } finally {
      setIaAplicando(false);
    }
  };

  return (
    <div className="selecionar-medico-page">
      <PrimeiraVisitaInfo etapaId="selecionar-medico" />
      <div className="page-header">
        <CabecalhoFase nome="Selecionar Médico" screen="selecionarMedico"
          subtitulo="Defina o médico responsável para os processos pendentes." />
        {!readOnly && (
          <div className="page-actions">
            <Button
              label=""
              tooltip='Sugerir médico via IA (em lote) — em breve'
              tooltipOptions={{ position: 'bottom' }}
              icon="pi pi-sparkles"
              outlined
              disabled
            />
            <Button
              label=""
              tooltip='Selecionar médico Manualmente'
              tooltipOptions={ { position: 'bottom' } }
              icon="pi pi-user-edit"
              outlined
              onClick={abrirDialogMassa}
              disabled={executandoAcaoMassa}
            />
            <Button
              label={executandoAcaoMassa ? 'Processando...' : ''}
              tooltip='Perda por falta de profissional'
              tooltipOptions={ { position: 'bottom' } }
              icon="pi pi-user-minus"
              severity="danger"
              outlined
              onClick={() => void handleMarcarSemProfissionalEmMassa()}
              loading={executandoAcaoMassa}
            />
          </div>
        )}
      </div>

      {readOnly && <ReadOnlyBanner />}

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total de Processos</span>
            <i className="pi pi-list" />
          </div>
          <div className="kpi-value">{kpis.total}</div>
        </div>

        {/* Contadores da PÁGINA (¬do total): acompanham filtro e paginação. */}
        <div className="kpi-card kpi-sem-medico">
          <div className="kpi-header">
            <span>Sem médico nesta página</span>
            <i className="pi pi-user-minus" />
          </div>
          <div className="kpi-value">{kpis.semMedico}</div>
        </div>

        <div className="kpi-card kpi-segredo">
          <div className="kpi-header">
            <span>Em segredo nesta página</span>
            <i className="pi pi-lock" />
          </div>
          <div className="kpi-value">{kpis.emSegredo}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor Médio dos Processos</span>
            <i className="pi pi-dollar" />
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorMedio)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Processo mais antigo em dias</span>
            <i className="pi pi-clock" />
          </div>
          <div className="kpi-value">{kpis.maisAntigo}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Pedidos aguardando seleção de médico</h2>
          <AcoesTabela>
            <BotaoExportarExcel todos={dataComCamposCalculados} visiveis={visibleProcessos} nome="selecionar-medico" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable
          scrollable
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Pedidos aguardando seleção de médico"
          value={dataComCamposCalculados}
          onValueChange={(value) => setVisibleProcessos(value as ProcessoResumoTableRow[])}
          rowClassName={(r: any) => [((rowData: ProcessoResumoTableRow) =>
            rowData.slaMedicoEstourado ? 'linha-fora-sla' : ''
          )(r), rowClassRepedido(r),
            // @R 17/09: "itens sem o médico tenham uma cor diferente... e itens em segredo
            // de justiça". Medido nesta fase: 11 de 41 sem médico, 9 em segredo — a cor
            // DISCRIMINA (a suposição de que a fase inteira era idMedico=1 estava errada).
            (!r?.idMedico || r.idMedico === 1) ? 'linha-sem-medico' : '',
            (r?.segredo === 'sim') ? 'linha-segredo' : '',
          ].filter(Boolean).join(' ')}
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
          selection={selectedProcessos}
          onSelectionChange={(e) => setSelectedProcessos((e.value ?? []) as ProcessoResumoTableRow[])}
          tableStyle={{ minWidth: '92rem' }}
          className="selecionar-medico-table"
          emptyMessage="Nenhum processo encontrado."
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          {!readOnly && <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />}
          <Column field="sequencial" header="#" style={{ minWidth: '4rem' }} frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08): a decisão desta tela é escolher o médico. */}
{colunaAcoesFase({
            readOnly,
            principal: { label: 'Selecionar médico', icon: 'pi pi-user-edit', onClick: (r) => abrirDialog(r) },
            secundarias: [
              { label: 'Sugerir médico via IA', icon: 'pi pi-sparkles', onClick: (r) => void handleSugerirMedicoIA(r),
                loading: (r) => iaLoadingId === r.id, disabled: (r) => iaLoadingId !== null && iaLoadingId !== r.id },
              { label: 'Perda por falta de profissional', icon: 'pi pi-user-minus', severity: 'danger',
                onClick: (r) => void handleMarcarSemProfissional(r) },
            ],
            excluir: carregarDados,
            largura: '17rem',
          })}
          <Column
            field="paciente" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
            frozen alignFrozen="left"
          />
          {colunaOrigem()}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo()}
          {colunaRepedido()}
          <Column field="idade" header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento. Criança/recém-nascido recebe o e-mail pediátrico de exames.')}
            sortable filter filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '6rem' }}
            body={(r: any) => r.idade ?? <span className="sm-sla-vazio">—</span>} />
          <Column field="tipoPaciente" header={cabecalhoComHint('Tipo', 'Recém-nascido (≤28 dias) · Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')}
            sortable style={{ minWidth: '7rem' }} body={(r: any) => tagTipoPaciente(r.tipoPaciente)} />
          <Column
            field="procedimento" className="col-procedimento-upper"
            header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '22rem' }}
          />
          <Column
            field="area"
            header="Área"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '10rem' }}
          />
          <Column
            field="subarea"
            header="Subárea"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '10rem' }}
          />
          <Column
            field="medico"
            header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
          />
          <Column
            field="slaFaseHorasRestantes"
            header={cabecalhoComHint('SLA fase', 'Prazo para definir o médico: 1 dia útil depois que a análise jurídica salvou "Cotar". Pedido que chega na sexta fecha na segunda (fim de semana não conta). Verde = no prazo · laranja = menos de 6 h · vermelho = vencido.')}
            sortable
            body={(r: ProcessoResumoTableRow) => <CelulaSlaFase r={r} />}
            style={{ minWidth: '11rem' }}
          />
          <Column
            field="dias"
            header={cabecalhoComHint('Dias', 'Dias corridos desde a entrada do pedido nesta fase. Compare com o SLA no cabeçalho.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '7rem' }}
          />
          {colunaAnexosSES()}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaInteiroTeor()}
          {colunaSolicitante()}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>
      </div>

      <Dialog
        header="Selecionar Médico"
        visible={dialogVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={() => setDialogVisible(false)}
        className="selecionar-medico-dialog"
      >
        {processoSelecionado && (
          <div className="selecionar-medico-dialog-content">
            <div className="selecionar-medico-resumo">
              <div>
                <span className="resumo-label">Paciente</span>
                <strong>{processoSelecionado.paciente}</strong>
              </div>
              <div>
                <span className="resumo-label">Procedimento</span>
                <strong>{processoSelecionado.procedimento}</strong>
              </div>
              <div>
                <span className="resumo-label">Área</span>
                <strong>{processoSelecionado.area || '-'}</strong>
              </div>
              <div>
                <span className="resumo-label">Subárea</span>
                <strong>{processoSelecionado.subarea || '-'}</strong>
              </div>
            </div>

            <div className="field">
              <label>Médico</label>
              <Dropdown
                value={medicoSelecionado}
                options={medicosOptions}
                onChange={(e) => setMedicoSelecionado(e.value)}
                placeholder="Selecione o médico"
                filter
                disabled={readOnly}
              />
            </div>

            <div className="dialog-footer-actions">
              <Button label="Cancelar" outlined onClick={() => setDialogVisible(false)} />
              {!readOnly && (
                <Button
                  label={salvandoMedico ? 'Salvando...' : 'Salvar'}
                  icon="pi pi-check"
                  onClick={handleSalvarMedico}
                  loading={salvandoMedico}
                />
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        header="Selecionar Médico em Massa"
        visible={dialogMassaVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={() => setDialogMassaVisible(false)}
        className="selecionar-medico-dialog"
      >
        <div className="selecionar-medico-dialog-content">
          <div className="selecionar-medico-resumo">
            <div>
              <span className="resumo-label">Processos selecionados</span>
              <strong>{selectedProcessos.length}</strong>
            </div>
            <div>
              <span className="resumo-label">Ação</span>
              <strong>Selecionar médico em lote</strong>
            </div>
          </div>

          <div className="field">
            <label>Médico</label>
            <Dropdown
              value={medicoSelecionadoMassa}
              options={medicosOptions}
              onChange={(e) => setMedicoSelecionadoMassa(e.value)}
              placeholder="Selecione o médico"
              filter
            />
          </div>

          <div className="dialog-footer-actions">
            <Button label="Cancelar" outlined onClick={() => setDialogMassaVisible(false)} />
            {!readOnly && (
              <Button
                label={executandoAcaoMassa ? 'Salvando...' : 'Salvar'}
                icon="pi pi-check"
                onClick={handleSelecionarMedicoEmMassa}
                loading={executandoAcaoMassa}
              />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Sugestão da IA"
        visible={iaDialogVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={fecharIaDialog}
      >
        {iaSugestao && (
          <div className="ia-sugestao-dialog">
            <div className="ia-sugestao-dialog__bloco">
              <div className="ia-sugestao-dialog__label">Médico sugerido</div>
              <div className="ia-sugestao-dialog__valor">
                {iaSugestao.nomeMedico ?? '(nenhum)'}
              </div>
            </div>

            <div className="ia-sugestao-dialog__bloco">
              <div className="ia-sugestao-dialog__label">Justificativa</div>
              <div className="ia-sugestao-dialog__texto">
                {iaSugestao.justificativa || '-'}
              </div>
            </div>

            <div className="ia-sugestao-dialog__row">
              <div className="ia-sugestao-dialog__bloco">
                <div className="ia-sugestao-dialog__label">Confiança</div>
                <div className="ia-sugestao-dialog__valor">
                  {iaSugestao.confianca}
                </div>
              </div>

              {iaSugestao.isFallback && (
                <div className="ia-sugestao-dialog__warning">
                  <i className="pi pi-exclamation-triangle" /> Fallback (Hospital IBG)
                </div>
              )}
            </div>

            <div className="ia-sugestao-dialog__actions">
              <Button
                label="Cancelar"
                outlined
                onClick={fecharIaDialog}
                disabled={iaAplicando}
              />
              <Button
                label={iaAplicando ? 'Aplicando...' : 'Confirmar Médico'}
                icon="pi pi-check"
                severity="success"
                onClick={handleAplicarSugestaoIA}
                loading={iaAplicando}
                disabled={!iaSugestao.idMedico}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}


