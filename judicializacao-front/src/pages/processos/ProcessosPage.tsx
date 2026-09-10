import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DataTable } from 'primereact/datatable';
import { excluirOrder, getOrders, getStatusOrders, atualizarOrder, getMedicosCompleto, getAnexosOrder, uploadAnexoOrder, criarOrderProcess, processarOrderProcess, salvarJuridico, uploadArquivoIntegracao, marcarSemProfissional, analisarEmpenho, extrairEmail } from '../../services/api/orders';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { colunaRepedido } from '../../components/Repedido/repedido';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { FilterMatchMode } from 'primereact/api';
import { useSearchParams } from 'react-router-dom';
import { TieredMenu } from 'primereact/tieredmenu';
import type { MenuItem } from 'primereact/menuitem';
import { useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { getStatusTagStyle } from '../../utils/statusTag';
import { EnviarOrcamentoDialog } from '../orcamentoMedico/EnviarOrcamentoDialog';
import { useAccess } from '../../access/AccessContext';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import './ProcessosPage.css';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, EXPLICA_STATUS, colunaOrigem } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';

const STATUS_PROCESSO_FALLBACK = [
  'Aguardando Juridico',
  'Aguardando Orçamento',
  'Aguardando Protocolar',
  'Aguardando Resposta',
  'Aguardando Resposta - Segredo de Justiça',
  'Ganho',
  'Perda',
];

const STATUS_JURIDICO_FALLBACK = [
  'Cotar',
  'Não Cotar',
  'Segredo de Justiça',
];

const STATUS_ORCAMENTO_FALLBACK = [
  'Solicitado ao Medico',
  'Solicitar Exames',
  'Orçamento Enviado',
  'Perda pelo Medico',
];

const STATUS_PERDA_FALLBACK = [
  'Perda Pelo Juridico',
  'Perda pelo Medico',
  'Perda por falta de especialista',
  'Perda pelo Orçamento',
];

const STATUS_PROCESSOS_ATIVOS = [
  'Aguardando Juridico',
  'Aguardando Orçamento',
  'Aguardando Protocolar',
  'Aguardando Resposta',
  'Aguardando Resposta - Segredo de Justiça',
];

const STATUS_PROCESSOS_BAIXADOS = [
  'Ganho',
  'Perda',
];

// Quem é dono de cada status — espelha backend/funil.py FASES (em_curso_status
// → dono), a fonte oficial do processo. Se o funil mudar de dono numa fase,
// atualizar aqui junto (mesmo padrão já usado em SlaPage.tsx/DONO_COR).
// EXCEÇÃO deliberada: o funil chama a fase 'recebido' de dono 'sistema'
// (ninguém agiu ainda), mas 'Aguardando Juridico' é literalmente a fila de
// trabalho da tela /juridico — mostrar 'Instituto Mateus' aqui é mais útil
// para quem olha esta tabela do que o dono filosófico da fase.
const STATUS_DONO: Record<string, string> = {
  'Aguardando Juridico': 'Instituto Mateus',
  'Aguardando Orçamento': 'G4MED + médico',
  'Aguardando Protocolar': 'Instituto Mateus',
  'Aguardando Resposta': 'Judiciário',
  'Aguardando Resposta - Segredo de Justiça': 'Judiciário',
};

const DONO_COR: Record<string, string> = {
  'Instituto Mateus': '#0F766E',
  'G4MED': '#7C3AED',
  'G4MED + médico': '#7C3AED',
  'Judiciário': '#B45309',
};

interface Processo {
  id: number;
  paciente: string;
  idade: number;
  procedimento: string;
  refPreco: number;
  medico: string;
  area: string;
  subarea: string;
  dataSolicitacao: string;
  status: string;
  statusJuridico: string;
  dataStatusJuridico: string;
  statusMedico: string;
  statusOrcamento: string;
  dataStatusOrcamento: string;
  valorOrcamento: number | null;
  justificativaPerda: string;
  situacao: string;
  dataSituacao: string;
  valorGanho: number | null;
  nprocesso: string;
  empresa: string;
  statusPerda: string;
  dataStatusPerda: string;
  idMedico: number | null;
}

interface ProcessoTableRow extends Processo {
  sequencial: number;
  dias: number;
}

interface Anexo {
  id: number
  linkImagem: string
  tipo: string
  createDate: string
}

interface EmailPayload {
  assunto: string;
  observacoes: string;
  remetente: string;
  origem: string;
  corpo: string;
}

interface OrderProcessJson {
  paciente: string;
  dataNascimento: string;
  procedimento: string;
  refPreco: number;
  area: string;
  subarea: string;
  dataPedido: string;
  email: EmailPayload;
  anexos: string[];
}

interface ManualProcessForm {
  paciente: string;
  dataNascimento: string;
  procedimento: string;
  refPreco: number | null;
  area: string;
  subarea: string;
  dataPedido: string;
  emailAssunto: string;
  emailObservacoes: string;
  emailRemetente: string;
  emailCorpo: string;
}

interface ProcessAttachmentInput {
  id: number;
  file: File | null;
}

interface JsonBatchProcessItem {
  id: number;
  payload: OrderProcessJson;
  attachments: ProcessAttachmentInput[];
}

const createAttachmentInput = (): ProcessAttachmentInput => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  file: null,
});

const createManualProcessForm = (): ManualProcessForm => ({
  paciente: '',
  dataNascimento: '',
  procedimento: '',
  refPreco: null,
  area: '',
  subarea: '',
  dataPedido: '',
  emailAssunto: '',
  emailObservacoes: '',
  emailRemetente: '',
  emailCorpo: '',
});

const formatarMoedaExport = (valor?: number | null) =>
  Number(valor ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function ProcessosPage() {
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const { isReadOnly, profile } = useAccess();
  const ehAdmin = profile.group === 'ADMIN';
  // Excluir = lixeira assinada com a senha (@R 28/08). Reversível na tela Lixeira.
  const excluirLancamento = async (r: any) => {
    const senha = window.prompt(`Mover #${r.id} (${r.paciente}) para a LIXEIRA.\nNada é apagado — volta pela tela Lixeira.\n\nDigite a sua senha para confirmar:`);
    if (!senha) return;
    try {
      await excluirOrder(r.id, senha);
      await carregarDados();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível mover para a lixeira.');
    }
  };
  const readOnly = isReadOnly('processos');
  const [loading, setLoading] = useState(false);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [visibleProcessos, setVisibleProcessos] = useState<ProcessoTableRow[]>([]);
  const [selectedProcessos, setSelectedProcessos] = useState<ProcessoTableRow[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const massActionMenuRef = useRef<TieredMenu>(null);
  const [processoMenuSelecionado, setProcessoMenuSelecionado] = useState<ProcessoTableRow | null>(null);
  const rowActionMenuRef = useRef<TieredMenu>(null);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [processoEditando, setProcessoEditando] = useState<ProcessoTableRow | null>(null);
  const [atualizandoRefPreco, setAtualizandoRefPreco] = useState(false);
  const [medicosOptions, setMedicosOptions] = useState<{label: string, value: number}[]>([]);
  const [medicos, setMedicos] = useState<any[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [uploadingRelatorio, setUploadingRelatorio] = useState(false)

  const handleUploadRelatorio = async (file: File) => {
    if (!processoEditando) return;
    setUploadingRelatorio(true);
    try {
      await uploadAnexoOrder(processoEditando.id, file, 'RELATORIO');
      const res: any = await getAnexosOrder(processoEditando.id, 'RELATORIO');
      setAnexos(res.data.anexos ?? []);
    } catch (err) {
      console.error('Erro ao subir relatório:', err);
      alert('Erro ao subir o anexo. Tente novamente.');
    } finally {
      setUploadingRelatorio(false);
    }
  };
  const [anexosOrcamento, setAnexosOrcamento] = useState<any[]>([]);
  const [loadingAnexosOrcamento, setLoadingAnexosOrcamento] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro')
  const [previewNome, setPreviewNome] = useState<string>('')
  const [anexosProtocolo, setAnexosProtocolo] = useState<any[]>([]);
  const [loadingAnexosProtocolo, setLoadingAnexosProtocolo] = useState(false);
  const [novoProcessoTipoVisible, setNovoProcessoTipoVisible] = useState(false);
  const [novoProcessoVisible, setNovoProcessoVisible] = useState(false);
  const [novoProcessoManualVisible, setNovoProcessoManualVisible] = useState(false);
  const [novoProcessoJsonVisible, setNovoProcessoJsonVisible] = useState(false);
  const [novoProcessoJsonLoteVisible, setNovoProcessoJsonLoteVisible] = useState(false);
  const [novoProcessoJsonLoteAnexosVisible, setNovoProcessoJsonLoteAnexosVisible] = useState(false);
  const [enviandoNovoProcesso, setEnviandoNovoProcesso] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [buscandoPedidos, setBuscandoPedidos] = useState(false);
  const [executandoAcaoMassa, setExecutandoAcaoMassa] = useState(false);
  const [enviarOrcamentoVisible, setEnviarOrcamentoVisible] = useState(false);
  const [manualProcessForm, setManualProcessForm] = useState<ManualProcessForm>(createManualProcessForm);
  const [manualAttachments, setManualAttachments] = useState<ProcessAttachmentInput[]>([createAttachmentInput()]);
  const [novoProcessoForm, setNovoProcessoForm] = useState<ManualProcessForm>(createManualProcessForm);
  const [novoProcessoAttachments, setNovoProcessoAttachments] = useState<ProcessAttachmentInput[]>([createAttachmentInput()]);
  const [novoProcessoCorpoEmail, setNovoProcessoCorpoEmail] = useState('');
  const [processandoEmailIA, setProcessandoEmailIA] = useState(false);
  const [jsonProcessInput, setJsonProcessInput] = useState('');
  const [jsonAttachments, setJsonAttachments] = useState<ProcessAttachmentInput[]>([createAttachmentInput()]);
  const [jsonBatchInput, setJsonBatchInput] = useState('');
  const [jsonBatchItems, setJsonBatchItems] = useState<JsonBatchProcessItem[]>([]);

  // Prefiltro por URL (task #211): as telas de fase mandam o usuário para cá com
  // ?paciente=<nome> pelo botão "Processo" — a tabela abre já filtrada nele.
  const [searchParams] = useSearchParams();
  const colunasCfg = useColunasVisiveis('base-processos');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: searchParams.get('paciente') ?? '', matchMode: FilterMatchMode.CONTAINS },
    idade: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    refPreco: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: null, matchMode: FilterMatchMode.EQUALS },
    area: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dataSolicitacao: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: '', matchMode: FilterMatchMode.CONTAINS },
    status: { value: null, matchMode: FilterMatchMode.EQUALS },
    statusJuridico: { value: null, matchMode: FilterMatchMode.EQUALS },
    statusMedico: { value: null, matchMode: FilterMatchMode.EQUALS }
  });

  const [statusOptions, setStatusOptions] = useState<{
    statusProcesso: string[];
    statusJuridico: string[];
    statusOrcamento: string[];
    statusPerda: string[];
  }>({
    statusProcesso: [],
    statusJuridico: [],
    statusOrcamento: [],
    statusPerda: [],
  });

  

  

  const statusProcessoOpts = (statusOptions.statusProcesso.length ? statusOptions.statusProcesso : STATUS_PROCESSO_FALLBACK)
    .map((s) => ({ label: s, value: s }));
  const statusJuridicoOpts = (statusOptions.statusJuridico.length ? statusOptions.statusJuridico : STATUS_JURIDICO_FALLBACK)
    .map((s) => ({ label: s, value: s }));
  const statusOrcamentoOpts = (statusOptions.statusOrcamento.length ? statusOptions.statusOrcamento : STATUS_ORCAMENTO_FALLBACK)
    .map((s) => ({ label: s, value: s }));
  const medicosFilterOptions = useMemo(
    () => medicos.map((m: any) => ({ label: m.nomeSistema, value: m.nomeSistema })),
    [medicos]
  );

  const mapOrdersToProcessos = (ordersData: any[], medicosData: any[]) => (
    ordersData.map((o: any) => ({
        ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
      id: o.id,
      paciente: o.paciente ?? '',
      idade: o.dataNascimento ? calcularIdade(o.dataNascimento) : 0,
      procedimento: o.procedimento ?? '',
      refPreco: o.refPreco ?? 0,
      medico: medicosData.find((m: any) => m.id === o.idMedico)?.nomeSistema ?? '',
      area: o.area ?? '',
      subarea: o.subarea ?? '',
      dataSolicitacao: o.dataPedido ?? '',
      status: o.statusProcesso ?? '',
      statusJuridico: o.statusJuridico ?? '',
      dataStatusJuridico: o.dataStatusJuridico ?? '',
      statusMedico: o.statusOrcamento ?? '',
      statusOrcamento: o.statusOrcamento ?? '',
      dataStatusOrcamento: o.dataStatusOrcamento ?? '',
      valorOrcamento: o.valorOrcamento,
      justificativaPerda: o.justificativaPerda ?? '',
      situacao: o.situacao ?? '',
      dataSituacao: o.dataSituacao ?? '',
      valorGanho: o.valorGanho,
      nprocesso: o.nprocesso ?? '',
      empresa: medicosData.find((m: any) => m.id === o.idMedico)?.razaoSocial ?? '',
      statusPerda: o.statusPerda ?? '',
      dataStatusPerda: o.dataStatusPerda ?? '',
      idMedico: o.idMedico ?? null,
    }))
  );

  const handleRowAction = async (
    action: string,
    rowData: ProcessoTableRow | null,
    extraValue?: string | number
  ) => {
    if (!rowData) return;

    try {
      if (action === 'juridico' && typeof extraValue === 'string') {
        // Recusa exige o motivo REAL (não frase-carimbo): 100/100 recusas históricas
        // tinham o mesmo texto hardcoded = zero informação. O texto alimenta a análise.
        let obsRecusa: string | null = null;
        if (extraValue === 'Não Cotar') {
          const motivo = window.prompt(
            'Descreva o motivo da recusa jurídica com suas palavras (mínimo 20 caracteres):'
          );
          if (!motivo || motivo.trim().length < 20) {
            alert('Recusa não registrada: o motivo precisa ter pelo menos 20 caracteres.');
            return;
          }
          obsRecusa = motivo.trim();
        }
        await salvarJuridico(rowData.id, {
          nprocesso: rowData.nprocesso || null,
          statusJuridico: extraValue,
          orcamentos: null,
          obs: obsRecusa,
        });
        setProcessoMenuSelecionado(null);
        await carregarDados();
        alert(`Status jurídico atualizado para "${extraValue}".`);
        return;
      }

      if (action === 'medico' && typeof extraValue === 'number') {
        await atualizarOrder(rowData.id, {
          idMedico: extraValue,
        });
        setProcessoMenuSelecionado(null);
        await carregarDados();
        const medicoSelecionado = medicos.find((medico: any) => medico.id === extraValue);
        alert(`Médico definido como "${medicoSelecionado?.nomeSistema ?? 'Selecionado'}".`);
        return;
      }

      if (action === 'sem_profissional') {
        await marcarSemProfissional(rowData.id);
        setProcessoMenuSelecionado(null);
        await carregarDados();
        alert('Perda por falta de profissional registrada com sucesso.');
        return;
      }

      if (action === 'criar_orcamento') {
        setProcessoMenuSelecionado(rowData);
        setEnviarOrcamentoVisible(true);
        return;
      }

      if (action === 'copiar_linha') {
        let linhasAnexos = 'Nenhum anexo';

        try {
          const res: any = await getAnexosOrder(rowData.id, 'RELATORIO');
          const listaAnexos: any[] = res.data.anexos;
          if (listaAnexos.length > 0) {
            linhasAnexos = listaAnexos.map((anexo: any) => anexo.linkImagem).join('\n');
          }
        } catch {
          linhasAnexos = 'Erro ao carregar anexos';
        }

        const hoje = new Date();
        const dataRef = rowData.dataStatusJuridico
          ? new Date(`${rowData.dataStatusJuridico}T00:00:00`)
          : null;
        const diasEmAberto = dataRef
          ? Math.max(0, Math.floor((hoje.getTime() - dataRef.getTime()) / (1000 * 60 * 60 * 24)))
          : rowData.dias;

        const orcamentos = rowData.justificativaPerda?.trim() || 'Nenhum orçamento registrado';

        const texto = `[#] SOLICITAÇÃO DE ORÇAMENTO
----------------------------------------
Paciente: ${rowData.paciente}
Idade: ${rowData.idade}
Procedimento: ${rowData.procedimento}
Área: ${rowData.area}
SubÁrea: ${rowData.subarea}
Data Solicitação: ${formatarData(rowData.dataStatusJuridico)}
Status: ${rowData.statusOrcamento}
Dias em Aberto: ${diasEmAberto} dias
Orçamentos:
${orcamentos}
Anexos:
${linhasAnexos}
----------------------------------------`;

        const copiar = async (conteudo: string) => {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(conteudo);
            return;
          }

          const textarea = document.createElement('textarea');
          textarea.value = conteudo;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        };

        await copiar(texto);
        alert('Copiado! Cole no WhatsApp.');
        return;
      }

      console.log('Ação da linha:', {
        action,
        processo: rowData
      });
    } catch (error) {
      console.error('Erro na ação da linha:', error);
      alert('Erro ao executar a ação da linha.');
    }
  };



  const rowActionItems: MenuItem[] = useMemo(() => [
    {
      label: 'Definir Médico',
      icon: 'pi pi-user-edit',
      items: medicos.map((medico: any) => ({
        label: medico.nomeSistema,
        command: () => handleRowAction('medico', processoMenuSelecionado, medico.id)
      }))
    },
    {
      label: 'Jurídico',
      icon: 'pi pi-briefcase',
      items: [
        {
          label: 'Cotar',
          icon: 'pi pi-check',
          command: () => handleRowAction('juridico', processoMenuSelecionado, 'Cotar')
        },
        {
          label: 'Segredo de Justiça',
          icon: 'pi pi-lock',
          command: () => handleRowAction('juridico', processoMenuSelecionado, 'Segredo de Justiça')
        },
        {
          label: 'Não Cotar',
          icon: 'pi pi-times',
          command: () => handleRowAction('juridico', processoMenuSelecionado, 'Não Cotar')
        }
      ]
    },
    {
      separator: true
    },
    {
      label: 'Criar Orçamento',
      icon: 'pi pi-file-plus',
      command: () => handleRowAction('criar_orcamento', processoMenuSelecionado)
    },
    {
      label: 'Copiar linha',
      icon: 'pi pi-copy',
      command: () => handleRowAction('copiar_linha', processoMenuSelecionado)
    },
    {
      label: 'Buscar Ref. Preço',
      icon: 'pi pi-search',
      command: () => handleRowAction('buscar_ref_preco', processoMenuSelecionado)
    },
    {
      separator: true
    },
    {
      label: 'Enviar SES',
      icon: 'pi pi-send',
      command: () => handleRowAction('enviar_ses', processoMenuSelecionado)
    },
    {
      label: 'Enviar SES/Protocolar',
      icon: 'pi pi-directions-alt',
      command: () => handleRowAction('enviar_ses_protocolar', processoMenuSelecionado)
    },
    {
      label: 'Enviar Perda',
      icon: 'pi pi-times-circle',
      command: () => handleRowAction('enviar_perda', processoMenuSelecionado)
    },
    {
      label: 'Perda por falta de profissional',
      icon: 'pi pi-user-minus',
      command: () => handleRowAction('sem_profissional', processoMenuSelecionado)
    }
  ], [medicos, processoMenuSelecionado]);


  const acoesBodyTemplate = (rowData: ProcessoTableRow) => {
    return (
      <Button
        icon="pi pi-bars"
        rounded
        outlined
        severity="secondary"
        aria-label={`Ações do processo ${rowData.id}`}
        onClick={(event) => {
          setProcessoMenuSelecionado(rowData);
          rowActionMenuRef.current?.toggle(event);
        }}
      />
    );
  };


  

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [ordersRes, statusRes, medicosRes] = await Promise.all([getOrders(), getStatusOrders(), getMedicosCompleto()]);
        console.log('ordersRes', ordersRes.data);
        console.log('statusRes', statusRes.data);
        console.log('medicosRes', medicosRes.data);
        setStatusOptions({
          statusProcesso: statusRes.data?.statusProcesso?.length ? statusRes.data.statusProcesso : STATUS_PROCESSO_FALLBACK,
          statusJuridico: statusRes.data?.statusJuridico?.length ? statusRes.data.statusJuridico : STATUS_JURIDICO_FALLBACK,
          statusOrcamento: statusRes.data?.statusOrcamento?.length ? statusRes.data.statusOrcamento : STATUS_ORCAMENTO_FALLBACK,
          statusPerda: statusRes.data?.statusPerda?.length ? statusRes.data.statusPerda : STATUS_PERDA_FALLBACK,
        });
        setMedicos(medicosRes.data);


        setMedicosOptions(medicosRes.data.map((m: any) => ({
          label: m.nomeSistema,
          value: m.id,
        })));
        console.log('Médicos carregados:', medicosRes.data);
        setProcessos(mapOrdersToProcessos(ordersRes.data, medicosRes.data));
    } catch {
      console.error('Erro ao carregar processos');
    } finally {
      setLoading(false);
    }
  };

  // No useEffect, carregue junto com os processos:
  useEffect(() => {
    carregarDados();
  }, []);


  function calcularIdade(dataNascimento: string): number {
    if (!dataNascimento) return 0;
    const hoje = new Date();
    const nasc = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  }


  const handleMassAction = async (
    tipo: 'juridico' | 'medico' | 'sem_profissional',
    valor?: string | number
  ) => {
    if (!selectedProcessos.length) {
      alert('Selecione ao menos um processo.');
      return;
    }

    setExecutandoAcaoMassa(true);
    try {
      if (tipo === 'juridico') {
        // Recusa em LOTE também exige motivo real (nunca frase-carimbo) — 1 motivo
        // declarado vale para todos os selecionados, e o operador sabe disso.
        let obsRecusaLote: string | null = null;
        if (valor === 'Não Cotar') {
          const motivo = window.prompt(
            `Motivo da recusa jurídica (mínimo 20 caracteres) — será aplicado aos ` +
            `${selectedProcessos.length} processos selecionados:`
          );
          if (!motivo || motivo.trim().length < 20) {
            alert('Recusa não registrada: o motivo precisa ter pelo menos 20 caracteres.');
            setExecutandoAcaoMassa(false);
            return;
          }
          obsRecusaLote = motivo.trim();
        }
        await Promise.all(
          selectedProcessos.map((processo) =>
            salvarJuridico(processo.id, {
              nprocesso: processo.nprocesso || null,
              statusJuridico: valor,
              orcamentos: null,
              obs: obsRecusaLote,
            })
          )
        );
      }

      if (tipo === 'medico') {
        const medicoSelecionado = medicos.find((m: any) => m.id === valor);

        await Promise.all(
          selectedProcessos.map((processo) =>
            atualizarOrder(processo.id, {
              idMedico: valor,
            })
          )
        );

        alert(`${selectedProcessos.length} processo(s) atualizado(s) com o médico ${medicoSelecionado?.nomeSistema ?? ''}.`);
      } else if (tipo === 'juridico') {
        alert(`${selectedProcessos.length} processo(s) atualizado(s) no jurídico.`);
      }

      if (tipo === 'sem_profissional') {
        await Promise.all(
          selectedProcessos.map((processo) => marcarSemProfissional(processo.id))
        );

        alert(`${selectedProcessos.length} processo(s) marcado(s) com perda por falta de profissional.`);
      }

      setSelectedProcessos([]);
      await carregarDados();
    } catch (error) {
      console.error('Erro na ação em massa:', error);
      alert('Erro ao executar a ação em massa.');
    } finally {
      setExecutandoAcaoMassa(false);
    }
  };

  const massActionItems: MenuItem[] = useMemo(() => [
    {
      label: 'Jurídico',
      icon: 'pi pi-briefcase',
      items: [
        {
          label: 'Cotar',
          icon: 'pi pi-check',
          command: () => handleMassAction('juridico', 'Cotar')
        },
        {
          label: 'Segredo de Justiça',
          icon: 'pi pi-lock',
          command: () => handleMassAction('juridico', 'Segredo de Justiça')
        },
        {
          label: 'Não Cotar',
          icon: 'pi pi-times',
          command: () => handleMassAction('juridico', 'Não Cotar')
        }
      ]
    },
    {
      label: 'Definir Médico',
      icon: 'pi pi-user-edit',
      items: medicos.map((medico: any) => ({
        label: medico.nomeSistema,
        command: () => handleMassAction('medico', medico.id)
      }))
    },
    {
      label: 'Perda por falta de profissional',
      icon: 'pi pi-user-minus',
      command: () => handleMassAction('sem_profissional')
    }
  ], [medicos, selectedProcessos]);

  

  const dataComCamposCalculados = useMemo<ProcessoTableRow[]>(() => {
    const hoje = new Date();

    return processos.map((item, index) => {
      const dataSolicitacao = new Date(`${item.dataSolicitacao}T00:00:00`);
      const diferencaMs = hoje.getTime() - dataSolicitacao.getTime();
      const dias = Math.max(0, Math.floor(diferencaMs / (1000 * 60 * 60 * 24)));

      return {
        ...item,
        sequencial: index + 1,
        dias
      };
    });
  }, [processos]);

  useEffect(() => {
    setVisibleProcessos(dataComCamposCalculados);
  }, [dataComCamposCalculados]);

  const calcularKpis = (items: ProcessoTableRow[]) => {
    const totalProcessos = items.length;
    const processosAtivos = items.filter((item) =>
      STATUS_PROCESSOS_ATIVOS.includes(item.status)
    ).length;
    const processosBaixados = items.filter((item) =>
      STATUS_PROCESSOS_BAIXADOS.includes(item.status)
    ).length;
    const qtdeOrcamentoEnviado = items.filter(
      (item) => item.statusOrcamento === 'Orçamento Enviado'
    ).length;
    const percentualRespostas = totalProcessos > 0
      ? (qtdeOrcamentoEnviado / totalProcessos) * 100
      : 0;

    return {
      totalProcessos,
      processosAtivos,
      processosBaixados,
      percentualRespostas,
      aguardandoJuridico: items.filter(
        (item) => item.status === 'Aguardando Juridico'
      ).length,
      aguardandoOrcamento: items.filter(
        (item) => item.status === 'Aguardando Orçamento'
      ).length,
      aguardandoProtocolar: items.filter(
        (item) => item.status === 'Aguardando Protocolar'
      ).length,
      aguardandoRespostas: items.filter(
        (item) =>
          item.status === 'Aguardando Resposta' ||
          item.status === 'Aguardando Resposta - Segredo de Justiça'
      ).length,
    };
  };

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };


  const formatarData = (data?: string | null) => {
    if (!data) return '';

    const partes = data.split('-');
    if (partes.length !== 3) return '';

    const [ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
  };


  const statusBodyTemplate = (rowData: ProcessoTableRow, field: 'status' | 'statusJuridico' | 'statusMedico') => {
    const dono = field === 'status' ? STATUS_DONO[rowData[field]] : undefined;
    return (
      <span className="processos-status-cell">
        <Tag value={rowData[field]} style={getStatusTagStyle(rowData[field])} className="status-tag-custom" />
        {dono && (
          <span
            className="processos-dono-dot"
            style={{ background: DONO_COR[dono] ?? '#94a3b8' }}
            title={`Dono desta fase: ${dono}`}
          />
        )}
      </span>
    );
  };

  const precoBodyTemplate = (rowData: ProcessoTableRow) => {
    return formatarMoeda(rowData.refPreco);
  };

  const diasBodyTemplate = (rowData: ProcessoTableRow) => {
    return <span className="dias-cell">{rowData.dias}</span>;
  };


  const editarBodyTemplate = (rowData: ProcessoTableRow) => {
    return (
      <Button
        icon="pi pi-pencil"
        rounded
        outlined
        severity="secondary"
        aria-label={`Editar processo ${rowData.id}`}
        onClick={() => {
          setProcessoEditando({ ...rowData })
          setEditDialogVisible(true)

          // carrega os anexos do tipo RELATORIO
          setAnexos([])
          setLoadingAnexos(true)
          getAnexosOrder(rowData.id, 'RELATORIO')
            .then((res) => setAnexos(res.data.anexos))
            .catch(() => setAnexos([]))
            .finally(() => setLoadingAnexos(false))

            // Busca anexos ORCAMENTO
            setLoadingAnexosOrcamento(true);
            getAnexosOrder(rowData.id, 'ORCAMENTO')
              .then((res: any) => setAnexosOrcamento(res.data.anexos))
              .catch(() => setAnexosOrcamento([]))
              .finally(() => setLoadingAnexosOrcamento(false));


            // Busca anexos PROTOCOLO
            setLoadingAnexosProtocolo(true);
            getAnexosOrder(rowData.id, 'PROTOCOLO')
              .then((res: any) => setAnexosProtocolo(res.data.anexos))
              .catch(() => setAnexosProtocolo([]))
              .finally(() => setLoadingAnexosProtocolo(false));
        }}
      />
    )
  }

  

  const filterElement = (options: any, placeholder: string) => {
    return (
      <InputText
        value={options.value || ''}
        onChange={(e) => options.filterApplyCallback(e.target.value)}
        placeholder={placeholder}
        className="p-column-filter"
      />
    );
  };

  const dropdownFilterElement = (
    options: any,
    placeholder: string,
    itens: { label: string; value: string }[]
  ) => {
    return (
      <Dropdown
        value={options.value ?? null}
        options={itens}
        onChange={(e) => options.filterApplyCallback(e.value)}
        placeholder={placeholder}
        showClear
        className="processos-filter-dropdown"
      />
    );
  };

  const resetNovoProcessoManual = () => {
    setManualProcessForm(createManualProcessForm());
    setManualAttachments([createAttachmentInput()]);
  };

  const resetNovoProcessoJson = () => {
    setJsonProcessInput('');
    setJsonAttachments([createAttachmentInput()]);
  };

  const resetNovoProcessoJsonLote = () => {
    setJsonBatchInput('');
    setJsonBatchItems([]);
  };

  const resetNovoProcesso = () => {
    setNovoProcessoForm(createManualProcessForm());
    setNovoProcessoAttachments([createAttachmentInput()]);
    setNovoProcessoCorpoEmail('');
  };

  const abrirNovoProcesso = () => {
    setNovoProcessoTipoVisible(false);
    resetNovoProcesso();
    setNovoProcessoVisible(true);
  };

  const updateNovoProcessoForm = (field: keyof ManualProcessForm, value: string | number | null) => {
    setNovoProcessoForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const abrirNovoProcessoManual = () => {
    setNovoProcessoTipoVisible(false);
    resetNovoProcessoManual();
    setNovoProcessoManualVisible(true);
  };

  const abrirNovoProcessoJson = () => {
    setNovoProcessoTipoVisible(false);
    resetNovoProcessoJson();
    setNovoProcessoJsonVisible(true);
  };

  const abrirNovoProcessoJsonLote = () => {
    setNovoProcessoTipoVisible(false);
    resetNovoProcessoJsonLote();
    setNovoProcessoJsonLoteVisible(true);
  };

  const updateManualProcessForm = (field: keyof ManualProcessForm, value: string | number | null) => {
    setManualProcessForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAttachmentAt = (
    setter: Dispatch<SetStateAction<ProcessAttachmentInput[]>>,
    id: number,
    file: File | null
  ) => {
    setter((prev) => prev.map((item) => (item.id === id ? { ...item, file } : item)));
  };

  const addAttachmentField = (
    setter: Dispatch<SetStateAction<ProcessAttachmentInput[]>>
  ) => {
    setter((prev) => [...prev, createAttachmentInput()]);
  };

  const removeAttachmentField = (
    setter: Dispatch<SetStateAction<ProcessAttachmentInput[]>>,
    id: number
  ) => {
    setter((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], file: null }];
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const updateBatchAttachmentAt = (processId: number, attachmentId: number, file: File | null) => {
    setJsonBatchItems((prev) =>
      prev.map((item) =>
        item.id === processId
          ? {
              ...item,
              attachments: item.attachments.map((attachment) =>
                attachment.id === attachmentId ? { ...attachment, file } : attachment
              ),
            }
          : item
      )
    );
  };

  const addBatchAttachmentField = (processId: number) => {
    setJsonBatchItems((prev) =>
      prev.map((item) =>
        item.id === processId
          ? { ...item, attachments: [...item.attachments, createAttachmentInput()] }
          : item
      )
    );
  };

  const removeBatchAttachmentField = (processId: number, attachmentId: number) => {
    setJsonBatchItems((prev) =>
      prev.map((item) => {
        if (item.id !== processId) return item;
        if (item.attachments.length === 1) {
          return {
            ...item,
            attachments: [{ ...item.attachments[0], file: null }],
          };
        }

        return {
          ...item,
          attachments: item.attachments.filter((attachment) => attachment.id !== attachmentId),
        };
      })
    );
  };

  const uploadAttachments = async (attachments: ProcessAttachmentInput[]) => {
    const arquivos = attachments
      .map((item) => item.file)
      .filter((file): file is File => Boolean(file));

    const urls = await Promise.all(
      arquivos.map(async (file) => {
        const { data } = await uploadArquivoIntegracao(file);
        return data.url as string;
      })
    );

    return urls;
  };

  const validateManualForm = (form: ManualProcessForm) => {
    const missingFields: string[] = [];

    if (!form.paciente.trim()) missingFields.push('Paciente');
    if (!form.dataNascimento.trim()) missingFields.push('Data de Nascimento');
    if (!form.procedimento.trim()) missingFields.push('Procedimento');
    if (form.refPreco === null || Number.isNaN(form.refPreco)) missingFields.push('Ref. Preço');
    if (!form.area.trim()) missingFields.push('Área');
    if (!form.subarea.trim()) missingFields.push('SubÁrea');
    if (!form.dataPedido.trim()) missingFields.push('Data do Pedido');
    if (!form.emailRemetente.trim()) missingFields.push('E-mail Remetente');

    return missingFields;
  };

  const isValidEmailPayload = (email: Record<string, any>) => {
    return typeof email?.assunto === 'string'
      && typeof email?.observacoes === 'string'
      && typeof email?.remetente === 'string'
      && typeof email?.origem === 'string'
      && typeof email?.corpo === 'string';
  };

  const decodeEscapedUnicodeString = (value: string) => {
    if (!value.includes('\\u') && !value.includes('\\n') && !value.includes('\\t')) {
      return value;
    }

    try {
      return value
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    } catch {
      return value;
    }
  };

  const normalizeJsonPayloadStrings = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return decodeEscapedUnicodeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonPayloadStrings(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, itemValue]) => [key, normalizeJsonPayloadStrings(itemValue)])
      );
    }

    return value;
  };

  const removeAccentsFromString = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const normalizePayloadForStorage = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return removeAccentsFromString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizePayloadForStorage(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, itemValue]) => [key, normalizePayloadForStorage(itemValue)])
      );
    }

    return value;
  };

  const validateOrderProcessJson = (payload: any) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return 'O JSON precisa ser um objeto.';
    }

    const requiredStringFields: Array<[keyof OrderProcessJson, string]> = [
      ['paciente', 'paciente'],
      ['dataNascimento', 'dataNascimento'],
      ['procedimento', 'procedimento'],
      ['area', 'area'],
      ['subarea', 'subarea'],
      ['dataPedido', 'dataPedido'],
    ];

    for (const [field, label] of requiredStringFields) {
      if (typeof payload[field] !== 'string' || !payload[field].trim()) {
    return `O campo ${label} é obrigatório e deve ser texto.`;
      }
    }

    if (typeof payload.refPreco !== 'number') {
    return 'O campo refPreco é obrigatório e deve ser numérico.';
    }

    if (!isValidEmailPayload(payload.email)) {
      return 'O campo email deve conter assunto, observacoes, remetente, origem e corpo.';
    }

    if (!Array.isArray(payload.anexos)) {
      return 'O campo anexos deve ser uma lista.';
    }

    return null;
  };

  const handleAvancarNovoProcessoJsonLote = () => {
    let parsedPayload: any;

    try {
      parsedPayload = JSON.parse(jsonBatchInput);
    } catch {
      alert('O JSON informado é inválido.');
      return;
    }

    parsedPayload = normalizeJsonPayloadStrings(parsedPayload);

    if (!Array.isArray(parsedPayload)) {
      alert('O JSON em lote precisa ser uma lista de pedidos.');
      return;
    }

    if (parsedPayload.length === 0) {
      alert('Informe pelo menos um pedido no JSON em lote.');
      return;
    }

    for (let index = 0; index < parsedPayload.length; index += 1) {
      const validationError = validateOrderProcessJson(parsedPayload[index]);
      if (validationError) {
        alert(`Pedido ${index + 1}: ${validationError}`);
        return;
      }
    }

    setJsonBatchItems(
      parsedPayload.map((item: OrderProcessJson, index: number) => ({
        id: Date.now() + index,
        payload: item,
        attachments: [createAttachmentInput()],
      }))
    );

    setNovoProcessoJsonLoteVisible(false);
    setNovoProcessoJsonLoteAnexosVisible(true);
  };

  const handleEnviarNovoProcessoManual = async () => {
    const missingFields = validateManualForm(manualProcessForm);
    if (missingFields.length > 0) {
      alert(`Preencha os campos obrigatórios: ${missingFields.join(', ')}`);
      return;
    }

    setEnviandoNovoProcesso(true);
    try {
      const anexos = await uploadAttachments(manualAttachments);
      const payload: OrderProcessJson = {
        paciente: manualProcessForm.paciente.trim(),
        dataNascimento: manualProcessForm.dataNascimento.trim(),
        procedimento: manualProcessForm.procedimento.trim(),
        refPreco: Number(manualProcessForm.refPreco ?? 0),
        area: manualProcessForm.area.trim(),
        subarea: manualProcessForm.subarea.trim(),
        dataPedido: manualProcessForm.dataPedido.trim(),
        email: {
          assunto: manualProcessForm.emailAssunto.trim(),
          observacoes: manualProcessForm.emailObservacoes.trim(),
          remetente: manualProcessForm.emailRemetente.trim(),
          origem: 'manual',
          corpo: manualProcessForm.emailCorpo.trim(),
        },
        anexos,
      };

      await criarOrderProcess({
        json: normalizePayloadForStorage(payload) as Record<string, any>,
        processado: false,
      });

      setNovoProcessoManualVisible(false);
      resetNovoProcessoManual();
      alert('Novo processo enviado para a fila com sucesso.');
    } catch (error) {
      console.error('Erro ao criar order process manual:', error);
      alert('Erro ao enviar o novo processo manual.');
    } finally {
      setEnviandoNovoProcesso(false);
    }
  };

  const handleProcessarEmailIA = async () => {
    const corpo = novoProcessoCorpoEmail.trim();
    if (!corpo) {
      alert('Cole o conteúdo do email antes de processar.');
      return;
    }

    setProcessandoEmailIA(true);
    try {
      const { data } = await extrairEmail(corpo);
      const refPrecoNum = data?.refPreco === null || data?.refPreco === undefined || data?.refPreco === ''
        ? null
        : Number(data.refPreco);
      setNovoProcessoForm({
        paciente: data?.paciente ?? '',
        dataNascimento: data?.dataNascimento ?? '',
        procedimento: data?.procedimento ?? '',
        refPreco: typeof refPrecoNum === 'number' && !Number.isNaN(refPrecoNum) ? refPrecoNum : null,
        area: data?.area ?? '',
        subarea: data?.subarea ?? '',
        dataPedido: data?.dataPedido ?? '',
        emailAssunto: data?.email?.assunto ?? '',
        emailObservacoes: data?.email?.observacoes ?? '',
        emailRemetente: data?.email?.remetente ?? '',
        emailCorpo: data?.email?.corpo ?? corpo,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.mensagem;
      console.error('Erro ao extrair dados do email:', err);
      alert(detail || 'Erro ao processar o email. Tente novamente.');
    } finally {
      setProcessandoEmailIA(false);
    }
  };

  const handleEnviarNovoProcesso = async () => {
    const missingFields = validateManualForm(novoProcessoForm);
    if (missingFields.length > 0) {
      alert(`Preencha os campos obrigatórios: ${missingFields.join(', ')}`);
      return;
    }

    setEnviandoNovoProcesso(true);
    try {
      const anexos = await uploadAttachments(novoProcessoAttachments);
      const payload: OrderProcessJson = {
        paciente: novoProcessoForm.paciente.trim(),
        dataNascimento: novoProcessoForm.dataNascimento.trim(),
        procedimento: novoProcessoForm.procedimento.trim(),
        refPreco: Number(novoProcessoForm.refPreco ?? 0),
        area: novoProcessoForm.area.trim(),
        subarea: novoProcessoForm.subarea.trim(),
        dataPedido: novoProcessoForm.dataPedido.trim(),
        email: {
          assunto: novoProcessoForm.emailAssunto.trim(),
          observacoes: novoProcessoForm.emailObservacoes.trim(),
          remetente: novoProcessoForm.emailRemetente.trim(),
          origem: 'EMAIL AUTOMÁTICO',
          corpo: novoProcessoForm.emailCorpo.trim(),
        },
        anexos,
      };

      await criarOrderProcess({
        json: normalizePayloadForStorage(payload) as Record<string, any>,
        processado: false,
      });

      setNovoProcessoVisible(false);
      resetNovoProcesso();
      alert('Novo processo enviado para a fila com sucesso.');
    } catch (error) {
      console.error('Erro ao criar novo processo (email):', error);
      alert('Erro ao enviar o novo processo.');
    } finally {
      setEnviandoNovoProcesso(false);
    }
  };

  const handleEnviarNovoProcessoJson = async () => {
    let parsedPayload: any;

    try {
      parsedPayload = JSON.parse(jsonProcessInput);
    } catch {
      alert('O JSON informado é inválido.');
      return;
    }

    parsedPayload = normalizeJsonPayloadStrings(parsedPayload);

    const validationError = validateOrderProcessJson(parsedPayload);
    if (validationError) {
      alert(validationError);
      return;
    }

    setEnviandoNovoProcesso(true);
    try {
      const anexos = await uploadAttachments(jsonAttachments);
      const payload: OrderProcessJson = {
        ...parsedPayload,
        anexos: [...parsedPayload.anexos, ...anexos],
      };

      setJsonProcessInput(JSON.stringify(payload, null, 2));

      await criarOrderProcess({
        json: normalizePayloadForStorage(payload) as Record<string, any>,
        processado: false,
      });

      setNovoProcessoJsonVisible(false);
      resetNovoProcessoJson();
      alert('Novo processo JSON enviado para a fila com sucesso.');
    } catch (error) {
      console.error('Erro ao criar order process por JSON:', error);
      alert('Erro ao enviar o novo processo por JSON.');
    } finally {
      setEnviandoNovoProcesso(false);
    }
  };

  const handleEnviarNovoProcessoJsonLote = async () => {
    if (jsonBatchItems.length === 0) {
      alert('Nenhum pedido em lote foi preparado para envio.');
      return;
    }

    setEnviandoNovoProcesso(true);
    try {
      for (const item of jsonBatchItems) {
        const anexos = await uploadAttachments(item.attachments);
        const payload: OrderProcessJson = {
          ...item.payload,
          anexos: [...item.payload.anexos, ...anexos],
        };

        await criarOrderProcess({
          json: normalizePayloadForStorage(payload) as Record<string, any>,
          processado: false,
        });
      }

      setNovoProcessoJsonLoteAnexosVisible(false);
      resetNovoProcessoJsonLote();
      alert(`${jsonBatchItems.length} pedido(s) enviados para a fila com sucesso.`);
    } catch (error) {
      console.error('Erro ao criar order process por JSON em lote:', error);
      alert('Erro ao enviar os pedidos por JSON em lote.');
    } finally {
      setEnviandoNovoProcesso(false);
    }
  };

  const handleBuscarPedidos = async () => {
    setBuscandoPedidos(true);
    try {
      const { data } = await processarOrderProcess();
      await carregarDados();

      if (data?.total_processados) {
        alert(`${data.total_processados} pedido(s) processado(s) com sucesso.`);
      } else {
        alert(data?.message || 'Nenhum pedido pendente para processar.');
      }
    } catch (error) {
      console.error('Erro ao processar pedidos pendentes:', error);
      alert('Erro ao buscar pedidos pendentes.');
    } finally {
      setBuscandoPedidos(false);
    }
  };



  // Os cards devem refletir o que está FILTRADO na tabela, não a base inteira —
  // visibleProcessos é o conjunto pós-filtro que a DataTable já mantém via
  // onValueChange (era usado só na exportação; os cards liam a base crua).
  const kpis = useMemo(() => calcularKpis(visibleProcessos), [visibleProcessos]);
  const kpisExportacao = kpis;




  const updateProcessoEditando = (field: keyof ProcessoTableRow, value: any) => {
    if (!processoEditando) return;

    setProcessoEditando({
      ...processoEditando,
      [field]: value
    });
  };


  const buscarRefPrecoPorProcedimento = async (procedimento: string): Promise<number | null> => {
    const proc = (procedimento ?? '').trim();
    if (!proc) {
      alert('Procedimento não informado.');
      return null;
    }
    setAtualizandoRefPreco(true);
    try {
      const { data } = await analisarEmpenho(proc);
      if (!data?.encontrado) {
        alert(data?.mensagem || 'Nenhum empenho encontrado para o procedimento informado. Valor não foi alterado.');
        return null;
      }
      const valorMedio = data.dados?.compatibilidade_legacy?.valor_medio;
      if (typeof valorMedio !== 'number' || Number.isNaN(valorMedio)) {
        alert('Resposta da análise sem valor médio. Valor não foi alterado.');
        return null;
      }
      return valorMedio;
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.mensagem;
      alert(detail || 'Erro ao consultar análise de empenho. Valor não foi alterado.');
      return null;
    } finally {
      setAtualizandoRefPreco(false);
    }
  };

  const handleAtualizarRefPreco = async () => {
    if (!processoEditando) return;
    const valor = await buscarRefPrecoPorProcedimento(processoEditando.procedimento ?? '');
    if (valor !== null) {
      setProcessoEditando(prev => prev ? { ...prev, refPreco: valor } : prev);
    }
  };

  const handleAtualizarRefPrecoNovoProcesso = async () => {
    const valor = await buscarRefPrecoPorProcedimento(novoProcessoForm.procedimento);
    if (valor !== null) {
      updateNovoProcessoForm('refPreco', valor);
    }
  };

  const handleSalvarEdicao = async () => {
    if (!processoEditando) return;
    try {


    const payload: any = {
      paciente: processoEditando.paciente,
      procedimento: processoEditando.procedimento,
      area: processoEditando.area,
      subarea: processoEditando.subarea,
      refPreco: processoEditando.refPreco,
      statusJuridico: processoEditando.statusJuridico || null,
      statusOrcamento: processoEditando.statusOrcamento || null,
      statusPerda: processoEditando.statusPerda || null,
      justificativaPerda: processoEditando.justificativaPerda || null,
      nprocesso: processoEditando.nprocesso || null,
      valorOrcamento: processoEditando.valorOrcamento,
      valorGanho: processoEditando.valorGanho,
      idMedico: processoEditando.idMedico,
    };

      await atualizarOrder(processoEditando.id, payload);

      await carregarDados();

      setEditDialogVisible(false);
    } catch (err) {
      console.error('Erro ao salvar processo:', err);
      alert('Erro ao salvar. Tente novamente.');
    }
  };

  console.log('processos:', processos.length);
  console.log('dataComCamposCalculados:', dataComCamposCalculados.length);



 const renderAnexos = (
   lista: any[],
   loading: boolean,
   titulo: string,
   opcoesUpload?: { onUpload: (file: File) => Promise<void> | void; uploading: boolean },
 ) => (
  <div className="field field-span-4" style={{ marginTop: '1rem' }}>
    <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>
      <i className="pi pi-paperclip" style={{ marginRight: '6px' }} />
      {titulo}
    </label>

    {loading && (
      <span style={{ fontSize: '0.9rem', color: '#888' }}>
        <i className="pi pi-spin pi-spinner" style={{ marginRight: '6px' }} />
        Carregando arquivos...
      </span>
    )}

    {!loading && lista.length === 0 && (
      <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
        Nenhum arquivo anexado.
      </span>
    )}

    {!loading && lista.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {lista.map((anexo, index) => {
          const nomeArquivo = anexo.linkImagem.split('/').pop() || `Arquivo ${index + 1}`
          const extensao = nomeArquivo.split('.').pop()?.toLowerCase()
          const icone = extensao === 'pdf'
            ? 'pi pi-file-pdf'
            : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
              ? 'pi pi-image'
              : 'pi pi-file'
          const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
            ? 'pdf'
            : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
              ? 'imagem'
              : 'outro'

          return (
            <div
              key={anexo.id}
              onClick={() => {
                setPreviewUrl(anexo.linkImagem)
                setPreviewNome(nomeArquivo)
                setPreviewTipo(tipo)
                setPreviewVisible(true)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                textDecoration: 'none',
                color: '#374151',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
              <span style={{ flex: 1 }}>{nomeArquivo}</span>
              <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
            </div>
          )
        })}
      </div>
    )}

    {opcoesUpload && (
      <div
        style={{
          marginTop: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          border: '1px dashed #d6e0e6',
          borderRadius: '8px',
          background: '#f9fbfc',
        }}
      >
        <i className="pi pi-cloud-upload" style={{ color: '#0a3d62', fontSize: '1.1rem' }} />
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          disabled={opcoesUpload.uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await opcoesUpload.onUpload(file);
            e.target.value = '';
          }}
          style={{ flex: 1, fontSize: '0.85rem' }}
        />
        {opcoesUpload.uploading && (
          <span style={{ fontSize: '0.85rem', color: '#0a3d62', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <i className="pi pi-spin pi-spinner" /> Enviando...
          </span>
        )}
      </div>
    )}
  </div>
)

  const renderAttachmentInputs = (
    attachments: ProcessAttachmentInput[],
    setter: Dispatch<SetStateAction<ProcessAttachmentInput[]>>
  ) => (
    <div className="novo-processo-anexos">
      {attachments.map((attachment, index) => (
        <div key={attachment.id} className="novo-processo-anexo-row">
          <input
            type="file"
            onChange={(e) => updateAttachmentAt(setter, attachment.id, e.target.files?.[0] ?? null)}
            className="novo-processo-anexo-input"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            outlined
            rounded
            onClick={() => removeAttachmentField(setter, attachment.id)}
            disabled={attachments.length === 1 && !attachment.file}
            tooltip={`Remover anexo ${index + 1}`}
          />
        </div>
      ))}

      <Button
        type="button"
        icon="pi pi-plus"
        label="Adicionar anexo"
        outlined
        onClick={() => addAttachmentField(setter)}
      />
    </div>
  )

  const exportRows = visibleProcessos.length ? visibleProcessos : dataComCamposCalculados;

  const baixarArquivo = (blob: Blob, nomeArquivo: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportarExcel = async () => {
    setExportandoExcel(true);
    try {
      const linhasHtml = exportRows.map((row) => `
        <tr>
          <td>${row.sequencial}</td>
          <td>${escapeHtml(row.paciente)}</td>
          <td>${escapeHtml(row.procedimento)}</td>
          <td>${formatarMoedaExport(row.refPreco)}</td>
          <td>${escapeHtml(row.medico)}</td>
          <td>${escapeHtml(row.area)}</td>
          <td>${row.dias}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.statusJuridico)}</td>
          <td>${escapeHtml(row.statusMedico)}</td>
        </tr>
      `).join('');

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
          <head>
            <meta charset="UTF-8" />
            <style>
              table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
              th, td { border: 1px solid #d9e1e7; padding: 8px 10px; font-size: 12px; text-align: left; }
              th { background: #f3f6f8; font-weight: 700; }
            </style>
          </head>
          <body>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Paciente</th>
                  <th>Procedimento</th>
                  <th>Ref. Preço</th>
                  <th>Médico</th>
                  <th>Área</th>
                  <th>Dias</th>
                  <th>Status</th>
                  <th>Status Jurídico</th>
                  <th>Status Médico</th>
                </tr>
              </thead>
              <tbody>${linhasHtml}</tbody>
            </table>
          </body>
        </html>
      `;

      baixarArquivo(
        new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
        'processos-filtrados.xls'
      );
    } finally {
      setExportandoExcel(false);
    }
  };

  const handleExportarPdf = async () => {
    setExportandoPdf(true);
    const exportNode = document.createElement('div');
    exportNode.className = 'processos-export-sheet';

    exportNode.innerHTML = `
      <div class="processos-export-sheet__header">
        <h1>Relatório de Processos</h1>
        <p>Exportação com os dados atualmente filtrados na tela.</p>
      </div>
      <div class="processos-export-kpis">
        <div class="processos-export-kpi"><span>Total de Processos</span><strong>${kpisExportacao.totalProcessos}</strong></div>
        <div class="processos-export-kpi"><span>Processos Ativos</span><strong>${kpisExportacao.processosAtivos}</strong></div>
        <div class="processos-export-kpi"><span>Processos Baixados</span><strong>${kpisExportacao.processosBaixados}</strong></div>
        <div class="processos-export-kpi"><span>% de Respostas</span><strong>${kpisExportacao.percentualRespostas.toFixed(1)}%</strong></div>
        <div class="processos-export-kpi"><span>Aguardando Jurídico</span><strong>${kpisExportacao.aguardandoJuridico}</strong></div>
        <div class="processos-export-kpi"><span>Aguardando Orçamento</span><strong>${kpisExportacao.aguardandoOrcamento}</strong></div>
        <div class="processos-export-kpi"><span>Aguardando Protocolar</span><strong>${kpisExportacao.aguardandoProtocolar}</strong></div>
        <div class="processos-export-kpi"><span>Aguardando Respostas</span><strong>${kpisExportacao.aguardandoRespostas}</strong></div>
      </div>
      <table class="processos-export-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Paciente</th>
            <th>Procedimento</th>
            <th>Ref. Preço</th>
            <th>Médico</th>
            <th>Área</th>
            <th>Dias</th>
            <th>Status</th>
            <th>Status Jurídico</th>
            <th>Status Médico</th>
          </tr>
        </thead>
        <tbody>
          ${exportRows.map((row) => `
            <tr>
              <td>${row.sequencial}</td>
              <td>${escapeHtml(row.paciente)}</td>
              <td>${escapeHtml(row.procedimento)}</td>
              <td>${formatarMoedaExport(row.refPreco)}</td>
              <td>${escapeHtml(row.medico)}</td>
              <td>${escapeHtml(row.area)}</td>
              <td>${row.dias}</td>
              <td>${escapeHtml(row.status)}</td>
              <td>${escapeHtml(row.statusJuridico)}</td>
              <td>${escapeHtml(row.statusMedico)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    document.body.appendChild(exportNode);

    try {
      const canvas = await html2canvas(exportNode, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });

      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pdfWidth - 16;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      let heightLeft = imageHeight;
      let position = 8;

      pdf.addImage(imageData, 'PNG', 8, position, imageWidth, imageHeight);
      heightLeft -= (pdfHeight - 16);

      while (heightLeft > 0) {
        position = heightLeft - imageHeight + 8;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 8, position, imageWidth, imageHeight);
        heightLeft -= (pdfHeight - 16);
      }

      pdf.save('processos-filtrados.pdf');
    } finally {
      document.body.removeChild(exportNode);
      setExportandoPdf(false);
    }
  };
  


  return (

    
    <div className="processos-page">
      <div className="page-header">
        <div>
          <h1>Processos</h1>
          <p>Gestão dos casos de urgência e emergência judicial</p>
        </div>

        <div className="page-actions">
          {!readOnly && (
            <>
              <TieredMenu model={massActionItems} popup ref={massActionMenuRef} id="mass_action_menu" />

              <Button
                label={executandoAcaoMassa ? 'Processando...' : ''}
                tooltip='Ações em massa'
                tooltipOptions={{ position: 'bottom', showDelay: 150 }}                
                icon="pi pi-bars"
                outlined
                onClick={(event) => massActionMenuRef.current?.toggle(event)}
                aria-controls="mass_action_menu"
                aria-haspopup
                loading={executandoAcaoMassa}
                disabled={executandoAcaoMassa}
              />

              <Button
                label={buscandoPedidos ? 'Buscando...' : ''}
                tooltip='Buscar pedidos'
                tooltipOptions={{ position: 'bottom', showDelay: 150 }}
                icon="pi pi-download"
                outlined
                onClick={handleBuscarPedidos}
                loading={buscandoPedidos}
              />

              <Button
                label={exportandoPdf ? 'Exportando PDF...' : ''}
                icon="pi pi-file-pdf"
                tooltip='Exportar PDF'
                tooltipOptions={{ position: 'bottom', showDelay: 150 }}
                outlined
                onClick={handleExportarPdf}
                loading={exportandoPdf}
              />

              <Button
                label={exportandoExcel ? 'Exportando Excel...' : ''}
                icon="pi pi-file-excel"
                tooltip='Exportar Excel'
                tooltipOptions={{ position: 'bottom', showDelay: 150 }}
                outlined
                onClick={handleExportarExcel}
                loading={exportandoExcel}
              />

              <Button
                label=""
                icon="pi pi-plus"
                className="btn-adicionar-processo"
                tooltip='Adicionar Processo'
                tooltipOptions={{ position: 'bottom', showDelay: 150 }}
                onClick={() => setNovoProcessoTipoVisible(true)}
              />
            </>
          )}


        </div>
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total de Processos</span>
            <i className="pi pi-briefcase"></i>
          </div>
          <div className="kpi-value">{kpis.totalProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Processos Ativos</span>
            <i className="pi pi-sync"></i>
          </div>
          <div className="kpi-value">{kpis.processosAtivos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Processos Baixados</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{kpis.processosBaixados}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>% de Respostas</span>
            <i className="pi pi-percentage"></i>
          </div>
          <div className="kpi-value">{`${kpis.percentualRespostas.toFixed(1)}%`}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Qtde Aguardando Jurídico</span>
            <i className="pi pi-hammer"></i>
          </div>
          <div className="kpi-value">{kpis.aguardandoJuridico}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Qtde Aguardando Orçamento</span>
            <i className="pi pi-file-edit"></i>
          </div>
          <div className="kpi-value">{kpis.aguardandoOrcamento}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Qtde Aguardando Protocolar</span>
            <i className="pi pi-inbox"></i>
          </div>
          <div className="kpi-value">{kpis.aguardandoProtocolar}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Qtde Aguardando Respostas</span>
            <i className="pi pi-clock"></i>
          </div>
          <div className="kpi-value">{kpis.aguardandoRespostas}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="processos-dono-legenda">
        <span>quem é dono de cada status:</span>
        {Object.entries(DONO_COR).filter(([nome]) => nome !== 'G4MED').map(([nome, cor]) => (
          <span key={nome} className="processos-dono-legenda__item">
            <span className="processos-dono-dot" style={{ background: cor }} />
            {nome}
          </span>
        ))}
      </div>

      <TieredMenu
        model={rowActionItems}
        popup
        ref={rowActionMenuRef}
        id="row_action_menu"
      />

      <EnviarOrcamentoDialog
        visible={enviarOrcamentoVisible && !readOnly}
        processo={processoMenuSelecionado}
        onHide={() => {
          setEnviarOrcamentoVisible(false);
          setProcessoMenuSelecionado(null);
        }}
        onSuccess={async () => {
          setEnviarOrcamentoVisible(false);
          setProcessoMenuSelecionado(null);
          await carregarDados();
        }}
      />

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Todos os processos — status, valor de referência e responsável por cada etapa</h2>
          <AcoesTabela>
            <BotaoExportarExcel todos={dataComCamposCalculados} visiveis={visibleProcessos} nome="base-processos" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Todos os processos — status, valor de referência e responsável por cada etapa"
          value={dataComCamposCalculados}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          lazy={false}
          rows={rows}
          first={first}
          totalRecords={dataComCamposCalculados.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          onValueChange={(value) => setVisibleProcessos(value as ProcessoTableRow[])}
          filterDisplay="row"
          loading={loading}
          selectionMode="multiple"
          selection={selectedProcessos}
          onSelectionChange={(e) => setSelectedProcessos(e.value as ProcessoTableRow[])}
          tableStyle={{ minWidth: '110rem' }}
          emptyMessage="Nenhum processo encontrado."
          className="processos-table"
        >          {colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column
            field="sequencial"
            header="#"
            style={{ minWidth: '4rem' }}
            body={(rowData: ProcessoTableRow) => rowData.sequencial}
           frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{acoesBodyTemplate(r)}{editarBodyTemplate(r)}{ehAdmin && (((r: any) => (
              <Button icon="pi pi-trash" severity="danger" outlined size="small"
                onClick={() => excluirLancamento(r)}
                tooltip="Excluir lançamento (só Admin — backup automático antes)"
                aria-label={`Excluir processo ${r.id}`} />
            )) as any)(r)}</> })}
          <Column
            field="paciente" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem()}
          {colunaRepedido()}
          {/* <Column
            field="idade"
            header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '7rem' }}
          /> */}
<Column
            field="procedimento"
            header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            className="col-procedimento-upper"
            style={{ minWidth: '18rem' }}
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
            field="medico"
            header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}
            sortable
            filter
            filterElement={(options) => dropdownFilterElement(options, 'Selecione', medicosFilterOptions)}
            style={{ minWidth: '14rem' }}
          />
          <Column field="valorGanho" header={cabecalhoComHint('Ganho', 'Valor do ganho declarado por nós neste pedido.')} sortable style={{ minWidth: '8rem' }}
            body={(r: any) => (r.valorGanho > 0
              ? <span style={{ color: '#16a34a', fontWeight: 600 }}>{r.valorGanho.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              : <span style={{ opacity: 0.4 }}>—</span>)} />
          <Column
            field="refPreco"
            header={cabecalhoComHint('Ref. Preço', 'Preço de referência do procedimento — base de comparação, não é o orçamento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={precoBodyTemplate}
            style={{ minWidth: '10rem' }}
          />
          {/* <Column
            field="dataSolicitacao"
            header="Data da Solicitação"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={dataBodyTemplate}
            style={{ minWidth: '12rem' }}
          /> */}
<Column
            field="dias"
            header={cabecalhoComHint('Dias', 'Dias corridos desde a entrada do pedido nesta fase. Compare com o SLA no cabeçalho.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={diasBodyTemplate}
            style={{ minWidth: '7rem' }}
          />
          <Column
            field="status"
            header={cabecalhoComHint('Status do processo', EXPLICA_STATUS.statusProcesso)}
            sortable
            filter
            filterElement={(options) => dropdownFilterElement(options, 'Selecione', statusProcessoOpts)}
            body={(rowData: ProcessoTableRow) => statusBodyTemplate(rowData, 'status')}
            style={{ minWidth: '12rem' }}
          />
          <Column
            field="statusJuridico"
            header={cabecalhoComHint('Status jurídico', EXPLICA_STATUS.statusJuridico)}
            sortable
            filter
            filterElement={(options) => dropdownFilterElement(options, 'Selecione', statusJuridicoOpts)}
            body={(rowData: ProcessoTableRow) => statusBodyTemplate(rowData, 'statusJuridico')}
            style={{ minWidth: '14rem' }}
          />
          <Column
            field="statusMedico"
            header="Status Médico"
            sortable
            filter
            filterElement={(options) => dropdownFilterElement(options, 'Selecione', statusOrcamentoOpts)}
            body={(rowData: ProcessoTableRow) => statusBodyTemplate(rowData, 'statusMedico')}
            style={{ minWidth: '14rem' }}
          />
          {colunaAnexosSES()}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaSegredo()}
          {colunaInteiroTeor()}
          {colunaSolicitante()}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>

        <Dialog
          header="Novo Processo"
          visible={novoProcessoTipoVisible}
          style={{ width: '60rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoTipoVisible(false)}
        >
          <div className="novo-processo-tipo-dialog">
            <Button
              label="Novo Processo"
              icon="pi pi-plus"
              className="novo-processo-tipo-button"
              onClick={abrirNovoProcesso}
            />
            <Button
              label="Novo Processo Manual"
              icon="pi pi-file-edit"
              outlined
              className="novo-processo-tipo-button"
              onClick={abrirNovoProcessoManual}
            />
            <Button
              label="Novo Processo por Json"
              icon="pi pi-code"
              outlined
              className="novo-processo-tipo-button"
              onClick={abrirNovoProcessoJson}
            />
            <Button
              label="Vários Pedidos por Json"
              icon="pi pi-clone"
              outlined
              className="novo-processo-tipo-button"
              onClick={abrirNovoProcessoJsonLote}
            />
          </div>
        </Dialog>

        <Dialog
          header="Novo Processo"
          visible={novoProcessoVisible}
          style={{ width: '74rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoVisible(false)}
          className="processo-edit-dialog"
        >
          <div className="processo-form-grid-v2">
            <div className="field field-span-4">
              <label>Conteúdo do Email *</label>
              <InputTextarea
                value={novoProcessoCorpoEmail}
                onChange={(e) => setNovoProcessoCorpoEmail(e.target.value)}
                rows={8}
                autoResize
                placeholder="Cole aqui o texto cru do email recebido"
                disabled={processandoEmailIA}
              />
            </div>

            <div className="field field-span-4" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                label={processandoEmailIA ? 'Processando...' : 'Processar Email'}
                icon="pi pi-sparkles"
                onClick={handleProcessarEmailIA}
                loading={processandoEmailIA}
                disabled={processandoEmailIA || !novoProcessoCorpoEmail.trim()}
              />
            </div>

            <div className="field field-span-2">
              <label>Paciente *</label>
              <InputText
                value={novoProcessoForm.paciente}
                onChange={(e) => updateNovoProcessoForm('paciente', e.target.value)}
              />
            </div>

            <div className="field field-span-1">
              <label>Data de Nascimento *</label>
              <InputText
                value={novoProcessoForm.dataNascimento}
                onChange={(e) => updateNovoProcessoForm('dataNascimento', e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="field field-span-1">
              <label>Data do Pedido *</label>
              <InputText
                value={novoProcessoForm.dataPedido}
                onChange={(e) => updateNovoProcessoForm('dataPedido', e.target.value)}
                placeholder="dd/mm/aaaa hh:mm"
              />
            </div>

            <div className="field field-span-4">
              <label>Procedimento *</label>
              <InputTextarea
                value={novoProcessoForm.procedimento}
                onChange={(e) => updateNovoProcessoForm('procedimento', e.target.value)}
                rows={3}
                autoResize
              />
            </div>

            <div className="field field-span-1">
              <label>Ref. Preço *</label>
              <InputNumber
                value={novoProcessoForm.refPreco ?? undefined}
                onValueChange={(e) => updateNovoProcessoForm('refPreco', e.value ?? null)}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
              />
            </div>

            <div className="field field-span-1 field-button">
              <label>&nbsp;</label>
              <Button
                label="Atualizar Ref. Preço"
                icon="pi pi-refresh"
                outlined
                loading={atualizandoRefPreco}
                disabled={atualizandoRefPreco}
                onClick={handleAtualizarRefPrecoNovoProcesso}
              />
            </div>

            <div className="field field-span-1">
              <label>Área *</label>
              <InputText
                value={novoProcessoForm.area}
                onChange={(e) => updateNovoProcessoForm('area', e.target.value)}
              />
            </div>

            <div className="field field-span-1">
              <label>SubÁrea *</label>
              <InputText
                value={novoProcessoForm.subarea}
                onChange={(e) => updateNovoProcessoForm('subarea', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>Email Assunto</label>
              <InputText
                value={novoProcessoForm.emailAssunto}
                onChange={(e) => updateNovoProcessoForm('emailAssunto', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>Email Observações</label>
              <InputText
                value={novoProcessoForm.emailObservacoes}
                onChange={(e) => updateNovoProcessoForm('emailObservacoes', e.target.value)}
              />
            </div>

            <div className="field field-span-4">
              <label>Email Remetente *</label>
              <InputText
                value={novoProcessoForm.emailRemetente}
                onChange={(e) => updateNovoProcessoForm('emailRemetente', e.target.value)}
                placeholder="Nome <email@dominio.com>"
              />
            </div>

            <div className="field field-span-4">
              <label>Email Corpo</label>
              <InputTextarea
                value={novoProcessoForm.emailCorpo}
                onChange={(e) => updateNovoProcessoForm('emailCorpo', e.target.value)}
                rows={6}
                autoResize
              />
            </div>

            <div className="field field-span-4">
              <label>Anexos</label>
              {renderAttachmentInputs(novoProcessoAttachments, setNovoProcessoAttachments)}
            </div>
          </div>

          <div className="dialog-footer-actions">
            <Button
              label="Cancelar"
              outlined
              onClick={() => setNovoProcessoVisible(false)}
            />
            <Button
              label={enviandoNovoProcesso ? 'Enviando...' : 'Enviar'}
              icon="pi pi-check"
              className="btn-salvar"
              onClick={handleEnviarNovoProcesso}
              loading={enviandoNovoProcesso}
            />
          </div>
        </Dialog>

        <Dialog
          header="Novo Processo Manual"
          visible={novoProcessoManualVisible}
          style={{ width: '74rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoManualVisible(false)}
          className="processo-edit-dialog"
        >
          <div className="processo-form-grid-v2">
            <div className="field field-span-2">
              <label>Paciente *</label>
              <InputText
                value={manualProcessForm.paciente}
                onChange={(e) => updateManualProcessForm('paciente', e.target.value)}
              />
            </div>

            <div className="field field-span-1">
              <label>Data de Nascimento *</label>
              <InputText
                value={manualProcessForm.dataNascimento}
                onChange={(e) => updateManualProcessForm('dataNascimento', e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="field field-span-1">
              <label>Data do Pedido *</label>
              <InputText
                value={manualProcessForm.dataPedido}
                onChange={(e) => updateManualProcessForm('dataPedido', e.target.value)}
                placeholder="dd/mm/aaaa hh:mm"
              />
            </div>

            <div className="field field-span-4">
              <label>Procedimento *</label>
              <InputTextarea
                value={manualProcessForm.procedimento}
                onChange={(e) => updateManualProcessForm('procedimento', e.target.value)}
                rows={3}
                autoResize
              />
            </div>

            <div className="field field-span-1">
              <label>Ref. Preço *</label>
              <InputNumber
                value={manualProcessForm.refPreco ?? undefined}
                onValueChange={(e) => updateManualProcessForm('refPreco', e.value ?? null)}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
              />
            </div>

            <div className="field field-span-1">
              <label>Área *</label>
              <InputText
                value={manualProcessForm.area}
                onChange={(e) => updateManualProcessForm('area', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>SubÁrea *</label>
              <InputText
                value={manualProcessForm.subarea}
                onChange={(e) => updateManualProcessForm('subarea', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>Email Assunto</label>
              <InputText
                value={manualProcessForm.emailAssunto}
                onChange={(e) => updateManualProcessForm('emailAssunto', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>Email Observações</label>
              <InputText
                value={manualProcessForm.emailObservacoes}
                onChange={(e) => updateManualProcessForm('emailObservacoes', e.target.value)}
              />
            </div>

            <div className="field field-span-4">
              <label>Email Remetente *</label>
              <InputText
                value={manualProcessForm.emailRemetente}
                onChange={(e) => updateManualProcessForm('emailRemetente', e.target.value)}
                placeholder="Nome <email@dominio.com>"
              />
            </div>

            <div className="field field-span-4">
              <label>Email Corpo</label>
              <InputTextarea
                value={manualProcessForm.emailCorpo}
                onChange={(e) => updateManualProcessForm('emailCorpo', e.target.value)}
                rows={6}
                autoResize
              />
            </div>

            <div className="field field-span-4">
              <label>Anexos</label>
              {renderAttachmentInputs(manualAttachments, setManualAttachments)}
            </div>
          </div>

          <div className="dialog-footer-actions">
            <Button
              label="Cancelar"
              outlined
              onClick={() => setNovoProcessoManualVisible(false)}
            />
            <Button
              label={enviandoNovoProcesso ? 'Enviando...' : 'Enviar'}
              icon="pi pi-check"
              className="btn-salvar"
              onClick={handleEnviarNovoProcessoManual}
              loading={enviandoNovoProcesso}
            />
          </div>
        </Dialog>

        <Dialog
          header="Novo Processo por Json"
          visible={novoProcessoJsonVisible}
          style={{ width: '70rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoJsonVisible(false)}
          className="processo-edit-dialog"
        >
          <div className="processo-form-grid-v2">
            <div className="field field-span-4">
              <label>Json do Processo *</label>
              <InputTextarea
                value={jsonProcessInput}
                onChange={(e) => setJsonProcessInput(e.target.value)}
                rows={14}
                autoResize
                placeholder='Cole aqui o JSON do processo'
              />
            </div>

            <div className="field field-span-4">
              <label>Anexos</label>
              {renderAttachmentInputs(jsonAttachments, setJsonAttachments)}
            </div>
          </div>

          <div className="dialog-footer-actions">
            <Button
              label="Cancelar"
              outlined
              onClick={() => setNovoProcessoJsonVisible(false)}
            />
            <Button
              label={enviandoNovoProcesso ? 'Enviando...' : 'Enviar'}
              icon="pi pi-check"
              className="btn-salvar"
              onClick={handleEnviarNovoProcessoJson}
              loading={enviandoNovoProcesso}
            />
          </div>
        </Dialog>

        <Dialog
          header="Vários Pedidos por Json"
          visible={novoProcessoJsonLoteVisible}
          style={{ width: '70rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoJsonLoteVisible(false)}
          className="processo-edit-dialog"
        >
          <div className="processo-form-grid-v2">
            <div className="field field-span-4">
              <label>Lista JSON de Pedidos *</label>
              <InputTextarea
                value={jsonBatchInput}
                onChange={(e) => setJsonBatchInput(e.target.value)}
                rows={18}
                autoResize
                            placeholder='Cole aqui a lista JSON com vários pedidos'
              />
            </div>
          </div>

          <div className="dialog-footer-actions">
            <Button
              label="Cancelar"
              outlined
              onClick={() => setNovoProcessoJsonLoteVisible(false)}
            />
            <Button
              label="Avançar"
              icon="pi pi-arrow-right"
              className="btn-salvar"
              onClick={handleAvancarNovoProcessoJsonLote}
            />
          </div>
        </Dialog>

        <Dialog
          header="Vincular Anexos aos Pedidos"
          visible={novoProcessoJsonLoteAnexosVisible}
          style={{ width: '76rem', maxWidth: '96vw' }}
          modal
          onHide={() => setNovoProcessoJsonLoteAnexosVisible(false)}
          className="processo-edit-dialog"
        >
          <div className="novo-processo-lote-lista">
            {jsonBatchItems.map((item, index) => (
              <div key={item.id} className="novo-processo-lote-card">
                <div className="novo-processo-lote-card-header">
                  <div>
                    <strong>{index + 1}. {item.payload.paciente}</strong>
                    <p>{item.payload.procedimento}</p>
                  </div>
                  <Tag value={item.payload.area} severity="info" />
                </div>

                <div className="field field-span-4">
                  <label>Anexos deste pedido</label>
                  <div className="novo-processo-anexos">
                    {item.attachments.map((attachment, attachmentIndex) => (
                      <div key={attachment.id} className="novo-processo-anexo-row">
                        <input
                          type="file"
                          onChange={(e) =>
                            updateBatchAttachmentAt(
                              item.id,
                              attachment.id,
                              e.target.files?.[0] ?? null
                            )}
                          className="novo-processo-anexo-input"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          outlined
                          rounded
                          onClick={() => removeBatchAttachmentField(item.id, attachment.id)}
                          disabled={item.attachments.length === 1 && !attachment.file}
                          tooltip={`Remover anexo ${attachmentIndex + 1}`}
                        />
                      </div>
                    ))}

                    <Button
                      type="button"
                      icon="pi pi-plus"
                      label="Adicionar anexo"
                      outlined
                      onClick={() => addBatchAttachmentField(item.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="dialog-footer-actions">
            <Button
              label="Voltar"
              outlined
              onClick={() => {
                setNovoProcessoJsonLoteAnexosVisible(false);
                setNovoProcessoJsonLoteVisible(true);
              }}
            />
            <Button
              label={enviandoNovoProcesso ? 'Enviando...' : 'Enviar'}
              icon="pi pi-check"
              className="btn-salvar"
              onClick={handleEnviarNovoProcessoJsonLote}
              loading={enviandoNovoProcesso}
            />
          </div>
        </Dialog>


        {/* Inicio Dialog para edição de processo */}
        <Dialog
          header="Editar Processo"
          visible={editDialogVisible}
          style={{ width: '78rem', maxWidth: '96vw' }}
          modal
          onHide={() => setEditDialogVisible(false)}
          className="processo-edit-dialog"
        >
          {processoEditando && (
            <fieldset className="processo-form-grid-v2" disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minInlineSize: 0 }}>
              <div className="field field-span-3">
                <label>Paciente</label>
                <InputText
                  value={processoEditando.paciente}
                  onChange={(e) => updateProcessoEditando('paciente', e.target.value)}
                />
              </div>

              <div className="field field-span-1">
                <label>Idade do Paciente</label>
                <InputNumber
                  value={processoEditando.idade}
                  onValueChange={(e) => updateProcessoEditando('idade', e.value)}
                  useGrouping={false}
                />
              </div>

              <div className="field field-span-4">
                <label>Procedimento</label>
                <InputText
                  value={processoEditando.procedimento}
                  onChange={(e) => updateProcessoEditando('procedimento', e.target.value)}
                />
              </div>

              <div className="field field-span-2">
                <label>Área</label>
                <InputText
                  value={processoEditando.area}
                  onChange={(e) => updateProcessoEditando('area', e.target.value)}
                />
              </div>

              <div className="field field-span-2">
                <label>SubÁrea</label>
                <InputText
                  value={processoEditando.subarea}
                  onChange={(e) => updateProcessoEditando('subarea', e.target.value)}
                />
              </div>

              <div className="field field-span-2">
                <label>Médico</label>
                <Dropdown
                  value={processoEditando.idMedico}
                  options={medicosOptions}
                  onChange={(e) => {
                    const medicoSelecionado = medicos.find((m: any) => m.id === e.value);

                    setProcessoEditando(prev => prev ? {
                      ...prev,
                      idMedico: e.value,
                      medico: medicoSelecionado?.nomeSistema ?? '',
                      empresa: medicoSelecionado?.razaoSocial ?? '',
                    } : null);
                  }}
                  placeholder="Selecione"
                  disabled={readOnly || processoEditando.status !== 'Aguardando Orçamento'}
                  tooltip={processoEditando.status !== 'Aguardando Orçamento'
                                                                ? 'Disponível apenas quando status é Aguardando Orçamento'
                    : undefined}
                  tooltipOptions={{ position: 'top' }}
                />
              </div>

              <div className="field field-span-1">
                <label>Ref. Preço</label>
                <InputNumber
                  value={processoEditando.refPreco}
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                  disabled
                />
              </div>

              <div className="field field-span-1 field-button">
                <label>&nbsp;</label>
                <Button
                  label="Atualizar Ref. Preço"
                  icon="pi pi-refresh"
                  outlined
                  loading={atualizandoRefPreco}
                  disabled={readOnly || atualizandoRefPreco}
                  onClick={handleAtualizarRefPreco}
                />
              </div>

              <div className="field field-span-1">
                <label>Data da Solicitação</label>
                <InputText value={formatarData(processoEditando.dataSolicitacao)} disabled />
              </div>

              <div className="field field-span-1">
                <label>Status do Processo</label>
                <div className="tag-readonly tag-box">
                  <Tag
                    value={processoEditando.status}
                    style={getStatusTagStyle(processoEditando.status)}
                    className="status-tag-custom"
                  />
                </div>
              </div>

              <div className="field field-span-1">
                <label>Status Jurídico</label>
                <div className="tag-readonly tag-box">
                  <Tag
                    value={processoEditando.statusJuridico || '-'}
                    style={getStatusTagStyle(processoEditando.statusJuridico || '')}
                    className="status-tag-custom"
                  />
                </div>
              </div>

              <div className="field field-span-1">
                <label>Data Status Jurídico</label>
                <InputText value={formatarData(processoEditando.dataStatusJuridico)} disabled />
              </div>

              <div className="field field-span-1">
                <label>Status Orçamento</label>
                <div className="tag-readonly tag-box">
                  <Tag
                    value={processoEditando.statusOrcamento || '-'}
                    style={getStatusTagStyle(processoEditando.statusOrcamento || '')}
                    className="status-tag-custom"
                  />
                </div>
              </div>

              <div className="field field-span-1">
                <label>Data Status Orçamento</label>
                <InputText value={formatarData(processoEditando.dataStatusOrcamento)} disabled />
              </div>

              <div className="field field-span-2">
                <label>Valor Orçamento</label>
                <InputNumber
                  value={processoEditando.valorOrcamento ?? undefined}
                  onValueChange={(e) => updateProcessoEditando('valorOrcamento', e.value)}
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                />
              </div>


              <div className="field field-span-1">
                <label>Status Perda</label>
                <div className="tag-readonly tag-box">
                  <Tag
                    value={processoEditando.statusPerda || '-'}
                    style={getStatusTagStyle(processoEditando.statusPerda || '')}
                    className="status-tag-custom"
                  />
                </div>
              </div>

              <div className="field field-span-1">
                <label>Data Status Perda</label>
                <InputText
                  value={formatarData(processoEditando.dataStatusPerda)}
                  disabled
                />
              </div>

              <div className="field field-span-2">
                <label>Justificativa Perda</label>
                <InputText
                  value={processoEditando.justificativaPerda}
                  onChange={(e) => updateProcessoEditando('justificativaPerda', e.target.value)}
                />
              </div>



              <div className="field field-span-1">
                <label>Nº Processo</label>
                <InputText
                  value={processoEditando.nprocesso}
                  onChange={(e) => updateProcessoEditando('nprocesso', e.target.value)}
                />
              </div>

              <div className="field field-span-1">
                <label>Valor Ganho</label>
                <InputNumber
                  value={processoEditando.valorGanho ?? undefined}
                  onValueChange={(e) => updateProcessoEditando('valorGanho', e.value)}
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                />
              </div>

              <div className="field field-span-2">
                <label>Empresa</label>
                <InputText value={processoEditando.empresa} disabled />
              </div>
            </fieldset>
          )}


          {/* Inicio Anexos */}
          {/* <div className="field field-span-4" style={{ marginTop: '1rem' }}>
            <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>
              <i className="pi pi-paperclip" style={{ marginRight: '6px' }} />
              Relatórios Anexados
            </label>

            {loadingAnexos && (
              <span style={{ fontSize: '0.9rem', color: '#888' }}>
                <i className="pi pi-spin pi-spinner" style={{ marginRight: '6px' }} />
                Carregando arquivos...
              </span>
            )}

            {!loadingAnexos && anexos.length === 0 && (
              <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
                Nenhum relatório anexado.
              </span>
            )}

            {!loadingAnexos && anexos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {anexos.map((anexo, index) => {
                const nomeArquivo = anexo.linkImagem.split('/').pop() || `Arquivo ${index + 1}`
                const extensao = nomeArquivo.split('.').pop()?.toLowerCase()
                const icone = extensao === 'pdf'
                  ? 'pi pi-file-pdf'
                  : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                    ? 'pi pi-image'
                    : 'pi pi-file'

              return (
                <a
                  key={anexo.id}
                  href={anexo.linkImagem}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    textDecoration: 'none',
                    color: '#374151',
                    fontSize: '0.9rem',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                    <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                    <span style={{ flex: 1 }}>{nomeArquivo}</span>
                    <i className="pi pi-download" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                  </a>
                )
              })}

              </div>
            )}
          </div> */}

          {/* Dialog Preview de Arquivo */}
          <Dialog
            header={previewNome}
            visible={previewVisible}
            style={{ width: '80vw', maxWidth: '1100px', height: '90vh' }}
            modal
            onHide={() => setPreviewVisible(false)}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button label="Baixar" icon="pi pi-download" outlined />
                </a>
                <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
              </div>
            }
          >
            <div style={{ height: 'calc(90vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewTipo === 'pdf' && (
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                  title={previewNome}
                />
              )}

              {previewTipo === 'imagem' && (
                <img
                  src={previewUrl}
                  alt={previewNome}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
                />
              )}

              {previewTipo === 'outro' && (
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                  <i className="pi pi-file" style={{ fontSize: '3rem', marginBottom: '12px', display: 'block' }} />
                  <p>Este tipo de arquivo não pode ser visualizado inline.</p>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" download>
                    <Button label="Baixar arquivo" icon="pi pi-download" />
                  </a>
                </div>
              )}
            </div>
          </Dialog>

          {renderAnexos(anexos, loadingAnexos, 'Relatórios Anexados', {
            onUpload: handleUploadRelatorio,
            uploading: uploadingRelatorio,
          })}
          {/* Fim Anexos */}


          {/* Inicio Orçamentos */}


          {renderAnexos(anexosOrcamento, loadingAnexosOrcamento, 'Orçamentos Anexados')}
          {/* Fim dos Orçamentos */}


          {/* Inicio Protocolos */}
          {renderAnexos(anexosProtocolo, loadingAnexosProtocolo, 'Protocolos Anexados')}
          {/* Fim dos Protocolos */}
          


          <div className="dialog-footer-actions">
            <Button
              label="Cancelar"
              outlined
              onClick={() => setEditDialogVisible(false)}
            />
            {!readOnly && <Button
              label="Salvar"
              icon="pi pi-check"
              className="btn-salvar"
              onClick={handleSalvarEdicao}
            />}
          </div>
        </Dialog>
        {/* Fim Dialog para edição de processo */}


      </div>
    </div>





  );
}
