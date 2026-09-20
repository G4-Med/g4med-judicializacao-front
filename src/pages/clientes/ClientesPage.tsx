import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import {
  getMedicosCompleto, createMedico, updateMedico, consultarCnpj,
  createDadosMedico, updateDadosMedico,
  createEmpresaMedico, updateEmpresaMedico,
  createDadosPessoais, updateDadosPessoais,
  createDadosBancarios, updateDadosBancarios,
  getDadosMedico, getEmpresaMedico,
  getDadosPessoais, getDadosBancarios,
  cadastrarUsuarioMedico, verificarUsuarioMedico,
  getBaseOrcamento, salvarBaseOrcamento,
  getEspecialidades, getSubespecialidades, getHospitais, getBancos, uploadArquivoStorage
} from '../../services/api/client';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { FilterMatchMode } from 'primereact/api';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import AreaDoCliente from '../../components/AreaDoCliente/AreaDoCliente';
import { GruposWhatsappCliente } from '../../components/GruposWhatsapp/GruposWhatsappCliente';
import { getGruposWhatsappTodos, type GrupoWhatsappCliente } from '../../services/api/client';
import { MultiSelect } from 'primereact/multiselect';
import { TabView, TabPanel } from 'primereact/tabview';
import { useAccess } from '../../access/AccessContext';
import './ClientesPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';

interface Cliente {
  id: number;
  razaoSocial: string;
  nomeMedico: string;
  nomeSistema: string;
  crm: string;
  rqe: string;
  hospital: string;
  especialidade: string;
  subespecialidade: string;
  /** VÁRIAS especialidades (@R 16/09: "clientes PJ como hospitais têm vários médicos
   *  dentro deles, por especialidade... as especialidades são somente para podermos
   *  escolher a especialidade"). Guarda IDs; `especialidade` (texto) continua para o
   *  cliente pessoa-física de uma especialidade só. */
  especialidades?: number[];
  atendeEm?: number[];
  atendeEmNomes?: string[];
  medicosVinculados?: { id: number; nome: string }[];
  especialidadesNomes?: string[];
  keywords: string;
  /** Escolha do profissional (@R 17/09). DECLARADO pelo cliente — ter atendido uma
   *  criança uma vez não significa que aceite atender; e 'NAO_INFORMADO' é diferente
   *  de 'NAO' (ninguém respondeu ainda ≠ recusou). */
  atendePediatrico: 'SIM' | 'NAO' | 'NAO_INFORMADO';
  telefone: string;
  email: string;
  cnpj: string;
  cnae: string;
  situacaoCadastral: string;
  dataAbertura: string;
  receitaConsultadaEm: string;
  receitaFonte: string;
  grupoWhatsapp: string;
  takeRate: number | null;
  modoValidacao: string;
  origemCliente: string;
  categoria: string;
  status: boolean;
  emailAcesso: string;
  contrato: boolean;
  procuracao: boolean;
  arquivoAdicional: boolean;
  createDate: string;
  updateDate: string;

  nomeCompleto: string;
  cpf: string;
  rg: string;
  estadoCivil: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;

  fantasia: string;
  pjRua: string;
  pjNumero: string;
  pjComplemento: string;
  pjBairro: string;
  pjCidade: string;
  pjEstado: string;
  pjCep: string;

  nomeConta: string;
  numeroBanco: string;
  nomeBanco: string;
  agencia: string;
  tipoConta: string;
  numeroConta: string;
  chavePix: string;

  contratoArquivo?: File | null;
  procuracaoArquivo?: File | null;
  arquivoAdicionalArquivo?: File | null;
  caminhoContrato?: string;
  caminhoProcuracao?: string;
  caminhoArquivoAdicional?: string;

}
interface ClienteTableRow extends Cliente {
  sequencial: number;
}

interface DropdownOption {
  label: string;
  value: string;
}

interface BancoOption extends DropdownOption {
  codigo: string;
}

type CampoArquivoEmpresa =
  | 'contratoArquivo'
  | 'procuracaoArquivo'
  | 'arquivoAdicionalArquivo';

type CampoCaminhoEmpresa =
  | 'caminhoContrato'
  | 'caminhoProcuracao'
  | 'caminhoArquivoAdicional';

const baseOrcamentoInicial = {
  honorariosEquipeMedica: false,
  taxasHospitalares: false,
  materiaisOpme: false,
  medicamentosDiaria: false,
  examesPreOperatorios: false,
  consultaPosOperatoria: false,
  atendimentoEnfermagem: false,
  acompanhanteTaxaAdicional: false,
  fisioterapiaPosOperatoria: false,
  medicamentosPosAlta: false,
  ortesesImobilizadores: false,
  examesComplementares: false,
  custoCtiBemodinamica: false,
  // 2 folhas timbradas (Cotar/Segredo); resto é compartilhado.
  linkBaseOrcamento: '',
  linkBaseOrcamentoSegredo: '',
  linkAssinatura: '',
};

const clienteInicial: ClienteTableRow = {
  id: 0,
  sequencial: 0,
  razaoSocial: '',
  nomeMedico: '',
  nomeSistema: '',
  crm: '',
  rqe: '',
  hospital: '',
  especialidade: '',
  subespecialidade: '',
  especialidades: [],
  atendeEm: [],
  atendeEmNomes: [],
  medicosVinculados: [],
  keywords: '',
  atendePediatrico: 'NAO_INFORMADO',
  telefone: '',
  email: '',
  cnpj: '',
  cnae: '',
  situacaoCadastral: '',
  dataAbertura: '',
  receitaConsultadaEm: '',
  receitaFonte: '',
  grupoWhatsapp: '',
  takeRate: null,
  modoValidacao: '',
  origemCliente: '',
  categoria: '',
  status: true,
  emailAcesso: '',
  contrato: false,
  procuracao: false,
  arquivoAdicional: false,
  createDate: '',
  updateDate: '',

  nomeCompleto: '',
  cpf: '',
  rg: '',
  estadoCivil: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',

  fantasia: '',
  pjRua: '',
  pjNumero: '',
  pjComplemento: '',
  pjBairro: '',
  pjCidade: '',
  pjEstado: '',
  pjCep: '',

  nomeConta: '',
  numeroBanco: '',
  nomeBanco: '',
  agencia: '',
  tipoConta: '',
  numeroConta: '',
  chavePix: '',
  contratoArquivo: null,
  procuracaoArquivo: null,
  arquivoAdicionalArquivo: null,
  caminhoContrato: '',
  caminhoProcuracao: '',
  caminhoArquivoAdicional: ''
};

export function ClientesPage() {
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('clientes');
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientes, setSelectedClientes] = useState<ClienteTableRow[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('createDate');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(-1);
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [novoCliente, setNovoCliente] = useState<ClienteTableRow>(clienteInicial);
  const [usuarioCadastrado, setUsuarioCadastrado] = useState(false);
  const [loadingUsuario, setLoadingUsuario] = useState(false);
  const [baseOrcamento, setBaseOrcamento] = useState(baseOrcamentoInicial);
  const [baseOrcamentoArquivoCotar, setBaseOrcamentoArquivoCotar] = useState<File | null>(null);
  const [baseOrcamentoArquivoSegredo, setBaseOrcamentoArquivoSegredo] = useState<File | null>(null);

  const carregarBaseOrcamentoDoCliente = async (medicoId: number) => {
    setBaseOrcamentoArquivoCotar(null);
    setBaseOrcamentoArquivoSegredo(null);
    try {
      const { data: base } = await getBaseOrcamento(medicoId);
      if (base?.exists) {
        setBaseOrcamento({
          honorariosEquipeMedica: base.honorariosEquipeMedica ?? false,
          taxasHospitalares: base.taxasHospitalares ?? false,
          materiaisOpme: base.materiaisOpme ?? false,
          medicamentosDiaria: base.medicamentosDiaria ?? false,
          examesPreOperatorios: base.examesPreOperatorios ?? false,
          consultaPosOperatoria: base.consultaPosOperatoria ?? false,
          atendimentoEnfermagem: base.atendimentoEnfermagem ?? false,
          acompanhanteTaxaAdicional: base.acompanhanteTaxaAdicional ?? false,
          fisioterapiaPosOperatoria: base.fisioterapiaPosOperatoria ?? false,
          medicamentosPosAlta: base.medicamentosPosAlta ?? false,
          ortesesImobilizadores: base.ortesesImobilizadores ?? false,
          examesComplementares: base.examesComplementares ?? false,
          custoCtiBemodinamica: base.custoCtiBemodinamica ?? false,
          // Backend retorna ambos os links (cotar e segredo).
          linkBaseOrcamento: base.linkBaseOrcamentoCotar ?? base.linkBaseOrcamento ?? '',
          linkBaseOrcamentoSegredo: base.linkBaseOrcamentoSegredo ?? '',
          linkAssinatura: base.linkAssinatura ?? '',
        });
      } else {
        setBaseOrcamento(baseOrcamentoInicial);
      }
    } catch (err) {
      console.error('Erro ao carregar base de orçamento:', err);
      setBaseOrcamento(baseOrcamentoInicial);
    }
  };
  const [assinaturaDialogVisible, setAssinaturaDialogVisible] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewNome, setPreviewNome] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'image' | 'other'>('other');

  const colunasCfg = useColunasVisiveis('clientes');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    razaoSocial: { value: '', matchMode: FilterMatchMode.CONTAINS },
    nomeSistema: { value: '', matchMode: FilterMatchMode.CONTAINS },
    crm: { value: '', matchMode: FilterMatchMode.CONTAINS },
    especialidade: { value: '', matchMode: FilterMatchMode.CONTAINS },
    status: { value: '', matchMode: FilterMatchMode.EQUALS },
    contrato: { value: '', matchMode: FilterMatchMode.EQUALS },
    procuracao: { value: '', matchMode: FilterMatchMode.EQUALS },
    origemCliente: { value: '', matchMode: FilterMatchMode.EQUALS },
    categoria: { value: '', matchMode: FilterMatchMode.EQUALS }
  });



  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<ClienteTableRow | null>(null);
  const [hospitalOptions, setHospitalOptions] = useState<DropdownOption[]>([]);
  const [areaCliente, setAreaCliente] = useState<{ id: number; nome: string } | null>(null);
  const [especialidadeOptions, setEspecialidadeOptions] = useState<DropdownOption[]>([]);
  // COM o id: `normalizarOptions` descarta o identificador e devolve só o nome — serve ao
  // Dropdown de texto, ¬ao M2M, que grava por id. Por isso esta lista existe em separado.
  const [especialidadesM2M, setEspecialidadesM2M] = useState<{ label: string; value: number }[]>([]);
  const [subespecialidadeOptions, setSubespecialidadeOptions] = useState<DropdownOption[]>([]);
  const [bancoOptions, setBancoOptions] = useState<BancoOption[]>([]);

  const estadoCivilOptions = [
    { label: 'Solteiro(a)', value: 'Solteiro(a)' },
    { label: 'Casado(a)', value: 'Casado(a)' },
    { label: 'Divorciado(a)', value: 'Divorciado(a)' },
    { label: 'Viúvo(a)', value: 'Viúvo(a)' }
  ];

  const statusOptions = [
    { label: 'Ativo', value: true },
    { label: 'Inativo', value: false }
  ];

  // Mesmo padrão de cores já usado em Processos/SLA (STATUS_DONO/DONO_COR).
  const ORIGEM_COR: Record<string, string> = {
    INSTITUTO_MATEUS: '#0F766E',
    G4MED: '#7C3AED'
  };

  const origemOptions = [
    { label: 'Instituto Mateus', value: 'INSTITUTO_MATEUS' },
    { label: 'G4MED', value: 'G4MED' }
  ];

  const origemFiltroOpcoes = [
    { label: 'Todos', value: null, icon: 'pi pi-list', cor: '#5b6b7a' },
    { label: 'Instituto Mateus', value: 'INSTITUTO_MATEUS', icon: 'pi pi-circle-fill', cor: '#0F766E' },
    { label: 'G4MED', value: 'G4MED', icon: 'pi pi-circle-fill', cor: '#7C3AED' }
  ];

  // CATEGORIA (@R 17/09): o QUE o cadastro é. Responde outra pergunta que a "Dono"
  // (de qual marca veio) — um hospital pode vir de qualquer origem, e é a categoria que
  // muda a conversa comercial.
  const categoriaOptions = [
    { label: 'Médico', value: 'MEDICO' },
    { label: 'Hospital', value: 'HOSPITAL' },
    { label: 'Clínica', value: 'CLINICA' },
    { label: 'Prestador de serviço', value: 'PRESTADOR' }
  ];

  const CATEGORIA_COR: Record<string, string> = {
    MEDICO: '#2563EB', HOSPITAL: '#B45309', CLINICA: '#0F766E',
    PRESTADOR: '#7C3AED', SEM_PROFISSIONAL: '#6B7280'
  };
  const CATEGORIA_LABEL: Record<string, string> = {
    MEDICO: 'Médico', HOSPITAL: 'Hospital', CLINICA: 'Clínica',
    PRESTADOR: 'Prestador de serviço', SEM_PROFISSIONAL: 'Sem profissional'
  };

  const categoriaFiltroOpcoes = [
    { label: 'Todas', value: null, icon: 'pi pi-list', cor: '#5b6b7a' },
    ...Object.keys(CATEGORIA_LABEL).map((k) => ({
      label: CATEGORIA_LABEL[k], value: k, icon: 'pi pi-circle-fill', cor: CATEGORIA_COR[k]
    }))
  ];

  const getCategoriaTag = (value: string) => {
    if (!value || !CATEGORIA_LABEL[value]) {
      return <span className="mc-origem-vazio">— não definida</span>;
    }
    return (
      <span className="mc-origem-tag">
        <i className="pi pi-circle-fill" style={{ color: CATEGORIA_COR[value] }} />
        {CATEGORIA_LABEL[value]}
      </span>
    );
  };

  const getOrigemTag = (value: string) => {
    if (!value || !ORIGEM_COR[value]) {
      return <span className="mc-origem-vazio">— não definido</span>;
    }
    const label = value === 'INSTITUTO_MATEUS' ? 'Instituto Mateus' : 'G4MED';
    return (
      <span className="mc-origem-tag">
        <i className="pi pi-circle-fill" style={{ color: ORIGEM_COR[value] }} />
        {label}
      </span>
    );
  };

  const tipoContaOptions = [
    { label: 'Conta Corrente', value: 'Conta Corrente' },
    { label: 'Conta Poupança', value: 'Conta Poupança' }
  ];

  const normalizarOptions = (data: any[], campo: string): DropdownOption[] => {
    const lista = Array.isArray(data) ? data : [];
    return lista
      .map((item: any) => String(item?.[campo] ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((valor) => ({ label: valor, value: valor }));
  };

  const normalizarBancos = (data: any[]): BancoOption[] => {
    const lista = Array.isArray(data) ? data : [];
    return lista
      .map((item: any) => ({
        label: String(item?.nomeBanco ?? '').trim(),
        value: String(item?.nomeBanco ?? '').trim(),
        codigo: String(item?.codBanco ?? '').trim(),
      }))
      .filter((item) => item.label && item.codigo)
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  };

  const mapearClientesTabela = (lista: any[]) =>
    (Array.isArray(lista) ? lista : []).map((m: any) => ({
      id: m.id,
      nomeMedico: m.nomeMedico ?? m.nomeCompleto ?? '',
      nomeSistema: m.nomeSistema ?? '',
      especialidade: m.especialidade ?? '',
      subespecialidade: m.subespecialidade ?? '',
      keywords: m.keywords ?? '',
      atendePediatrico: m.atendePediatrico ?? 'NAO_INFORMADO',
      grupoWhatsapp: m.grupoWhatsapp ?? '',
      takeRate: m.takeRate !== null && m.takeRate !== undefined ? Number(m.takeRate) : null,
      origemCliente: m.origemCliente ?? '',
      categoria: m.categoria ?? '',
      atendeEm: m.atendeEm ?? [],
      atendeEmNomes: m.atendeEmNomes ?? [],
      medicosVinculados: m.medicosVinculados ?? [],
      status: m.status,
      createDate: m.createDate?.split('T')[0] ?? '',
      updateDate: m.updateDate?.split('T')[0] ?? '',
      crm: m.crm ?? '',
      razaoSocial: m.razaoSocial ?? '',
      cnpj: m.cnpj ?? '',
      cnae: m.cnae ?? '',
      situacaoCadastral: m.situacaoCadastral ?? '',
      dataAbertura: m.dataAbertura ?? '',
      receitaConsultadaEm: m.receitaConsultadaEm ?? '',
      receitaFonte: m.receitaFonte ?? '',
      contrato: m.contrato ?? false,
      procuracao: m.procuracao ?? false,
      arquivoAdicional: m.arquivoAdicional ?? false,
      rqe: '',
      hospital: '',
      telefone: '',
      email: '',
      modoValidacao: '',
      emailAcesso: '',
      nomeCompleto: '',
      cpf: '',
      rg: '',
      estadoCivil: '',
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: '',
      fantasia: m.fantasia ?? '',
      pjRua: '',
      pjNumero: '',
      pjComplemento: '',
      pjBairro: '',
      pjCidade: '',
      pjEstado: '',
      pjCep: '',
      nomeConta: '',
      numeroBanco: '',
      nomeBanco: '',
      agencia: '',
      tipoConta: '',
      numeroConta: '',
      chavePix: ''
    }));

  /* Coluna "Grupo WhatsApp" na lista (@R 19/09: "adicione o grupo do whatsapp aqui para eu ver a
     coluna de quem tem o grupo"). Lê a tabela 1:N nova, não o campo de texto antigo — é ela que
     diz quem de fato tem grupo vinculado (e com que função). Carregada à parte, fail-soft:
     se a chamada falhar a lista de clientes continua, a coluna mostra "?" em vez de "—". */
  const [gruposPorCliente, setGruposPorCliente] = useState<Record<number, GrupoWhatsappCliente[]> | null>(null);
  const carregarGrupos = async () => {
    try {
      const { data } = await getGruposWhatsappTodos();
      const mapa: Record<number, GrupoWhatsappCliente[]> = {};
      for (const g of data ?? []) (mapa[g.idMedico] ??= []).push(g);
      setGruposPorCliente(mapa);
    } catch {
      setGruposPorCliente(null);
    }
  };
  useEffect(() => { void carregarGrupos(); }, []);

  /** #485 C+E (@R 19/09) — consulta a Receita e preenche a aba Dados Empresa.
   *  modo 'vazios': só completa o que está em branco (nunca apaga o que alguém digitou).
   *  modo 'sobrescrever' ("Atualizar da Receita"): mostra ANTES → DEPOIS e só troca com confirmação. */
  const RECEITA_CAMPOS: Array<[keyof Cliente, string, string]> = [
    ['razaoSocial', 'razaoSocial', 'Razão Social'], ['fantasia', 'fantasia', 'Fantasia'],
    ['pjRua', 'rua', 'Rua'], ['pjNumero', 'numero', 'Número'], ['pjComplemento', 'complemento', 'Complemento'],
    ['pjBairro', 'bairro', 'Bairro'], ['pjCidade', 'cidade', 'Cidade'], ['pjEstado', 'estado', 'Estado'],
    ['pjCep', 'cep', 'CEP'], ['cnae', 'cnae', 'CNAE'], ['situacaoCadastral', 'situacaoCadastral', 'Situação cadastral'],
    ['dataAbertura', 'dataAbertura', 'Data de abertura'],
  ];
  const consultarReceita = async (
    atual: Cliente, aplicar: (patch: Partial<Cliente>) => void, modo: 'vazios' | 'sobrescrever',
  ) => {
    const digitos = (atual.cnpj || '').replace(/\D/g, '');
    if (digitos.length !== 14) { alert('Digite o CNPJ completo (14 dígitos) antes de consultar.'); return; }
    let resp: any;
    try {
      resp = (await consultarCnpj(digitos)).data;
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'A Receita não respondeu agora. Tente de novo em 1 minuto.');
      return;
    }
    const d = resp?.dados ?? {};
    const patch: Partial<Cliente> = { receitaConsultadaEm: resp?.consultadoEm ?? '', receitaFonte: resp?.fonte ?? '' };
    const mudancas: string[] = [];
    for (const [campo, chave, rotulo] of RECEITA_CAMPOS) {
      const novo = (d[chave] ?? '') as string;
      const velho = (atual[campo] ?? '') as string;
      if (!novo || novo === velho) continue;
      if (modo === 'vazios' && velho) continue;
      (patch as any)[campo] = chave === 'cep' ? formatarCep(novo) : novo;
      mudancas.push(velho ? `${rotulo}: "${velho}" → "${novo}"` : `${rotulo}: "${novo}"`);
    }
    if (!mudancas.length) { alert(`Nada a mudar: a ficha já bate com a Receita (${resp?.fonte}).`); return; }
    if (modo === 'vazios') { aplicar(patch); return; }
    confirmDialog({
      header: 'Atualizar da Receita',
      message: `A Receita (${resp?.fonte}) traz ${mudancas.length} diferença(s). Os campos abaixo serão SOBRESCRITOS:\n\n` + mudancas.join('\n') + '\n\nNada é salvo até você clicar em Salvar na ficha.',
      icon: 'pi pi-refresh',
      acceptLabel: 'Sobrescrever',
      rejectLabel: 'Cancelar',
      accept: () => aplicar(patch),
    });
  };

  /** #495 — inativo sai de todas as listagens (a API já esconde por padrão), mas o
   *  cadastro e os pedidos dele ficam intactos; reativar é o mesmo botão ao contrário. */
  const confirmarInativar = (r: ClienteTableRow) => {
    const inativo = r.status === false;
    confirmDialog({
      header: inativo ? 'Reativar cliente' : 'Inativar cliente',
      message: inativo
        ? `Reativar "${r.nomeSistema ?? r.nomeMedico ?? r.id}"? Ele volta a aparecer na seleção de médicos e nas cotações.`
        : `Inativar "${r.nomeSistema ?? r.nomeMedico ?? r.id}"? Ele some da seleção de médicos, das cotações e das listagens. Os pedidos e o histórico dele continuam como estão. Dá para reativar depois nesta tela (filtro Inativos).`,
      icon: inativo ? 'pi pi-replay' : 'pi pi-ban',
      acceptLabel: inativo ? 'Reativar' : 'Inativar',
      rejectLabel: 'Cancelar',
      acceptClassName: inativo ? 'p-button-success' : 'p-button-danger',
      accept: async () => {
        try {
          // @R 20/09 15:24: ele inativou alguém e o filtro Inativos veio vazio — no servidor
          // NENHUM PATCH chegou (nginx 18-20/09, 0 linhas). O clique morreu no caminho sem
          // dizer nada. Agora o resultado é lido de volta do servidor e mostrado.
          const resp = await updateMedico(r.id, { status: inativo });
          const gravado = resp?.data?.status;
          if (gravado !== inativo) throw new Error(`O servidor devolveu status=${String(gravado)}; nada mudou.`);
          alert(inativo
            ? `"${r.nomeSistema ?? r.nomeMedico ?? r.id}" reativado.`
            : `"${r.nomeSistema ?? r.nomeMedico ?? r.id}" inativado — aparece só no filtro Inativos.`);
          await carregarClientes();
        } catch (e: any) {
          alert(e?.response?.data?.error ?? e?.response?.data?.detail ?? e?.message ?? 'Não foi possível alterar o status.');
        }
      },
    });
  };

  const carregarClientes = async () => {
    const { data } = await getMedicosCompleto({ incluirInativos: true });
    setClientes(mapearClientesTabela(data));
    void carregarGrupos();
  };

  /* Reunião 20/09 (00:55:34): o Fabrício criou "Cirurgia de cabeça e pescoço" em Configurações e
     ela "não apareceu" — o cadastro de cliente tinha carregado as especialidades ao abrir a página
     e nunca mais. Ao abrir a ficha (criar/editar), a lista é relida: o que foi criado em outra
     aba entra sem recarregar a página. */
  const recarregarEspecialidades = () => {
    Promise.all([getEspecialidades(), getSubespecialidades()])
      .then(([e, s]) => {
        setEspecialidadeOptions(normalizarOptions(e.data, 'especialidade'));
        setSubespecialidadeOptions(normalizarOptions(s.data, 'subespecialidade'));
      })
      .catch(() => { /* lista antiga continua valendo; nada a quebrar */ });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getMedicosCompleto({ incluirInativos: true }),
      getEspecialidades(),
      getSubespecialidades(),
      getHospitais(),
      getBancos()
    ])
      .then(([medicosRes, especialidadesRes, subespecialidadesRes, hospitaisRes, bancosRes]) => {
        setClientes(mapearClientesTabela(medicosRes.data));

        setEspecialidadeOptions(normalizarOptions(especialidadesRes.data, 'especialidade'));
        setEspecialidadesM2M(
          (Array.isArray(especialidadesRes.data) ? especialidadesRes.data : [])
            .filter((e: any) => e?.id && e?.especialidade)
            .map((e: any) => ({ label: String(e.especialidade), value: Number(e.id) }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label, 'pt-BR')));
        setSubespecialidadeOptions(normalizarOptions(subespecialidadesRes.data, 'subespecialidade'));
        setHospitalOptions(normalizarOptions(hospitaisRes.data, 'hospital'));
        setBancoOptions(normalizarBancos(bancosRes.data));
      })
      .catch(() => console.error('Erro ao carregar médicos'))
      .finally(() => setLoading(false));
  }, []);

  const dataComSequencial = useMemo<ClienteTableRow[]>(() => {
    return clientes.map((item, index) => ({
      ...item,
      sequencial: index + 1
    }));
  }, [clientes]);

  const kpis = useMemo(() => {
    return {
      totalClientes: dataComSequencial.length,
      clientesAtivos: dataComSequencial.filter((item) => item.status).length,
      cadastrosCompletos: dataComSequencial.filter(
        (item) => item.contrato && item.procuracao && item.arquivoAdicional
      ).length,
      faltaDocumentacao: dataComSequencial.filter(
        (item) => !item.contrato || !item.procuracao || !item.arquivoAdicional
      ).length
    };
  }, [dataComSequencial]);

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const getBooleanTag = (value: boolean) => {
    return (
      <Tag
        value={value ? 'Ativo' : 'Inativo'}
        icon={value ? 'pi pi-check-circle' : 'pi pi-times-circle'}
        severity={value ? 'success' : 'danger'}
        className="mc-status-tag"
      />
    );
  };

  const BOOLEAN_FILTRO_OPCOES = [
    { label: 'Todos', value: null, icon: 'pi pi-list', cor: '#5b6b7a' },
    { label: 'Ativo', value: true, icon: 'pi pi-check-circle', cor: '#16a34a' },
    { label: 'Inativo', value: false, icon: 'pi pi-times-circle', cor: '#dc2626' }
  ];

  const booleanFilterElement = (
    options: any,
    opcoes: { label: string; value: string | boolean | null; icon: string; cor: string }[]
  ) => {
    return (
      <Dropdown
        value={options.value ?? null}
        options={opcoes}
        optionLabel="label"
        optionValue="value"
        placeholder="Todos"
        showClear={false}
        className="mc-status-filtro"
        onChange={(e) => options.filterApplyCallback(e.value === null ? '' : e.value)}
        itemTemplate={(opt) => (
          <span className="mc-status-filtro__item" style={{ color: opt.cor }}>
            <i className={opt.icon} /> {opt.label}
          </span>
        )}
        valueTemplate={(opt) => (
          <span className="mc-status-filtro__item" style={{ color: opt ? opt.cor : '#5b6b7a' }}>
            <i className={opt ? opt.icon : 'pi pi-list'} /> {opt ? opt.label : 'Todos'}
          </span>
        )}
      />
    );
  };

/** Abre a ÁREA do cliente: o que ele FEZ com os pedidos que recebeu (@R 17/09).
 *  Fica ao lado do lápis porque é a mesma pergunta em dois tempos — o lápis é o que ele
 *  É (cadastro), este é o que ele FEZ (desempenho). */
const areaBodyTemplate = (rowData: ClienteTableRow) => (
  <Button
    icon="pi pi-chart-bar"
    rounded
    outlined
    severity="info"
    aria-label={`Ver desempenho do cliente ${rowData.id}`}
    tooltip="Desempenho: resposta, perdas, SLA, experiência"
    onClick={() => setAreaCliente({ id: rowData.id, nome: rowData.nomeMedico ?? '' })}
  />
);

const editarBodyTemplate = (rowData: ClienteTableRow) => {
  return (
    <Button
      icon="pi pi-pencil"
      rounded
      outlined
      severity="secondary"
      aria-label={`Editar cliente ${rowData.id}`}
      onClick={async () => {
        setUsuarioCadastrado(false);
        setBaseOrcamento(baseOrcamentoInicial);
        setBaseOrcamentoArquivoCotar(null);
        setBaseOrcamentoArquivoSegredo(null);
        setClienteEditando({
          ...clienteInicial,
          ...rowData,
          nomeMedico: rowData.nomeMedico ?? '',
          nomeSistema: rowData.nomeSistema ?? '',
          crm: rowData.crm ?? '',
          especialidade: rowData.especialidade ?? '',
          subespecialidade: rowData.subespecialidade ?? '',
          status: rowData.status ?? true,
        });
        setEditDialogVisible(true);

        try {
          const [dadosMedResult, empresaResult, pessoaisResult, bancariosResult, usuarioResult] = await Promise.allSettled([
            getDadosMedico(rowData.id),
            getEmpresaMedico(rowData.id),
            getDadosPessoais(rowData.id),
            getDadosBancarios(rowData.id),
            verificarUsuarioMedico(rowData.id),
          ]);

          if (usuarioResult.status === 'fulfilled') {
            setUsuarioCadastrado(!!usuarioResult.value.data?.cadastrado);
          }

          const dm = dadosMedResult.status === 'fulfilled' ? (dadosMedResult.value.data[0] ?? {}) : {};
          const em = empresaResult.status === 'fulfilled' ? (empresaResult.value.data[0] ?? {}) : {};
          const dp = pessoaisResult.status === 'fulfilled' ? (pessoaisResult.value.data[0] ?? {}) : {};
          const db = bancariosResult.status === 'fulfilled' ? (bancariosResult.value.data[0] ?? {}) : {};

          setClienteEditando({
            ...clienteInicial,
            ...rowData,
            crm: dm.CRM ?? '',
            rqe: dm.RQE ?? '',
            hospital: dm.hospital ?? '',
            telefone: dm.telefone ?? '',
            email: dm.email ?? '',
            emailAcesso: dm.emailAcesso ?? '',
            cnpj: em.CNPJ ?? '',
            cnae: em.cnae ?? '',
            situacaoCadastral: em.situacaoCadastral ?? '',
            dataAbertura: em.dataAbertura ?? '',
            receitaConsultadaEm: em.receitaConsultadaEm ?? '',
            receitaFonte: em.receitaFonte ?? '',
            razaoSocial: em.razaoSocial ?? '',
            fantasia: em.fantasia ?? '',
            pjRua: em.rua ?? '',
            pjNumero: em.numero ?? '',
            pjComplemento: em.complemento ?? '',
            pjBairro: em.bairro ?? '',
            pjCidade: em.cidade ?? '',
            pjEstado: em.estado ?? '',
            pjCep: em.cep ?? '',
            contrato: em.contrato ?? false,
            procuracao: em.procuracao ?? false,
            arquivoAdicional: em.arquivoAdicional ?? false,
            caminhoContrato: em.caminhoContrato ?? '',
            caminhoProcuracao: em.caminhoProcuracao ?? '',
            caminhoArquivoAdicional: em.caminhoArquivoAdicional ?? '',
            nomeCompleto: dp.nomeCompleto ?? '',
            cpf: dp.CPF ?? '',
            rg: dp.RG ?? '',
            estadoCivil: dp.estadoCivil ?? '',
            rua: dp.rua ?? '',
            numero: dp.numero ?? '',
            complemento: dp.complemento ?? '',
            bairro: dp.bairro ?? '',
            cidade: dp.cidade ?? '',
            estado: dp.estado ?? '',
            cep: dp.cep ?? '',
            nomeConta: db.nomeConta ?? '',
            numeroBanco: db.numeroBanco ?? '',
            nomeBanco: db.nomeBanco ?? '',
            agencia: db.agencia ?? '',
            tipoConta: db.tipoConta ?? '',
            numeroConta: db.numeroConta ?? '',
            chavePix: db.chavePix ?? '',
          });

          await carregarBaseOrcamentoDoCliente(rowData.id);
        } catch (err) {
          console.error('Erro ao carregar dados do cliente:', err);
        }
      }}
    />
  );
};

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

  const updateClienteEditando = (field: keyof ClienteTableRow, value: any) => {
    if (!clienteEditando) return;

    setClienteEditando({
      ...clienteEditando,
      [field]: value
    });
  };


const formatarData = (data: string) => {
  if (!data || data.includes('T')) {
    data = data?.split('T')[0] ?? '';
  }
  if (!data || data.length < 10) return '-';
  const [ano, mes, dia] = data.split('-');
  if (!ano || !mes || !dia) return '-';
  return `${dia}/${mes}/${ano}`;
};

const formatarTelefone = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 13);

  if (!digits) return '';

  if (digits.startsWith('55')) {
    const rest = digits.slice(2);
    if (!rest) return '+55';
    if (rest.length <= 2) return `+55 (${rest}`;
    if (rest.length <= 6) return `+55 (${rest.slice(0, 2)}) ${rest.slice(2)}`;
    if (rest.length <= 10) return `+55 (${rest.slice(0, 2)}) ${rest.slice(2, rest.length - 4)}-${rest.slice(-4)}`;
    return `+55 (${rest.slice(0, 2)}) ${rest.slice(2, 7)}-${rest.slice(7, 11)}`;
  }

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const formatarCpf = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatarCnpj = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const formatarCep = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const formatarAgencia = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 5);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

const formatarConta = (valor: string) => {
  const digits = valor.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 1) return digits;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
};


  const updateNovoCliente = (field: keyof ClienteTableRow, value: any) => {
    setNovoCliente((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSelecionarBancoNovo = (nomeBanco: string) => {
    const bancoSelecionado = bancoOptions.find((item) => item.value === nomeBanco);
    setNovoCliente((prev) => ({
      ...prev,
      nomeBanco,
      numeroBanco: bancoSelecionado?.codigo ?? ''
    }));
  };

  const handleSelecionarBancoEdicao = (nomeBanco: string) => {
    if (!clienteEditando) return;
    const bancoSelecionado = bancoOptions.find((item) => item.value === nomeBanco);
    setClienteEditando({
      ...clienteEditando,
      nomeBanco,
      numeroBanco: bancoSelecionado?.codigo ?? ''
    });
  };

  const UF_PARA_NOME: Record<string, string> = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
    CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
    MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
    PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
    RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
    RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
    SE: 'Sergipe', TO: 'Tocantins'
  };

  const buscarCepViaCep = async (cep: string) => {
    const limpo = (cep || '').replace(/\D/g, '');
    if (limpo.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data?.erro) return null;
      return {
        rua: data.logradouro ?? '',
        bairro: data.bairro ?? '',
        cidade: data.localidade ?? '',
        estado: UF_PARA_NOME[data.uf] ?? data.uf ?? '',
        complemento: data.complemento ?? ''
      };
    } catch {
      return null;
    }
  };

  const handleBuscarCepEmpresaNovo = async () => {
    const dados = await buscarCepViaCep(novoCliente.pjCep);
    if (!dados) {
      alert('CEP não encontrado.');
      return;
    }
    setNovoCliente((prev) => ({
      ...prev,
      pjRua: dados.rua || prev.pjRua,
      pjBairro: dados.bairro || prev.pjBairro,
      pjCidade: dados.cidade || prev.pjCidade,
      pjEstado: dados.estado || prev.pjEstado,
      pjComplemento: dados.complemento || prev.pjComplemento
    }));
  };

  const handleBuscarCepPessoalNovo = async () => {
    const dados = await buscarCepViaCep(novoCliente.cep);
    if (!dados) {
      alert('CEP não encontrado.');
      return;
    }
    setNovoCliente((prev) => ({
      ...prev,
      rua: dados.rua || prev.rua,
      bairro: dados.bairro || prev.bairro,
      cidade: dados.cidade || prev.cidade,
      estado: dados.estado || prev.estado,
      complemento: dados.complemento || prev.complemento
    }));
  };

  const handleBuscarCepPessoalEdicao = async () => {
    if (!clienteEditando) return;
    const dados = await buscarCepViaCep(clienteEditando.cep);
    if (!dados) {
      alert('CEP não encontrado.');
      return;
    }
    setClienteEditando({
      ...clienteEditando,
      rua: dados.rua || clienteEditando.rua,
      bairro: dados.bairro || clienteEditando.bairro,
      cidade: dados.cidade || clienteEditando.cidade,
      estado: dados.estado || clienteEditando.estado,
      complemento: dados.complemento || clienteEditando.complemento
    });
  };

  const handleBuscarCepEmpresaEdicao = async () => {
    if (!clienteEditando) return;
    const dados = await buscarCepViaCep(clienteEditando.pjCep);
    if (!dados) {
      alert('CEP não encontrado.');
      return;
    }
    setClienteEditando({
      ...clienteEditando,
      pjRua: dados.rua || clienteEditando.pjRua,
      pjBairro: dados.bairro || clienteEditando.pjBairro,
      pjCidade: dados.cidade || clienteEditando.pjCidade,
      pjEstado: dados.estado || clienteEditando.pjEstado,
      pjComplemento: dados.complemento || clienteEditando.pjComplemento
    });
  };


  const statusTemplate = (option: any) => {
    if (!option) return null;

    return (
      <Tag
        value={option.label}
        severity={option.value ? 'success' : 'danger'}
      />
    );
  };




  const handleAbrirCadastro = () => {
    const agora = new Date().toISOString().split('T')[0];

    setNovoCliente({
      ...clienteInicial,
      createDate: agora,
      updateDate: agora
    });
    setBaseOrcamento(baseOrcamentoInicial);
    setBaseOrcamentoArquivoCotar(null);
    setBaseOrcamentoArquivoSegredo(null);

    setCreateDialogVisible(true);
  };


const handleSalvarCadastro = async () => {
  try {
    const nomeCompletoMedico = (novoCliente.nomeMedico || novoCliente.nomeCompleto || '').trim();

    if (!nomeCompletoMedico) {
      alert('Preencha o Nome Médico.');
      return;
    }

    if (!novoCliente.nomeSistema?.trim()) {
      alert('Preencha o Nome Sistema.');
      return;
    }

    if (!novoCliente.origemCliente) {
      alert('Selecione o Dono do cliente (G4MED ou Instituto Mateus).');
      return;
    }

    const { data: medico } = await createMedico({
      nomeCompleto: nomeCompletoMedico,
      nomeSistema: novoCliente.nomeSistema,
      especialidade: novoCliente.especialidade,
      subespecialidade: novoCliente.subespecialidade,
      keywords: novoCliente.keywords,
      atendePediatrico: novoCliente.atendePediatrico,
      grupoWhatsapp: novoCliente.grupoWhatsapp,
      takeRate: novoCliente.takeRate,
      status: novoCliente.status,
      origemCliente: novoCliente.origemCliente || null,
      categoria: novoCliente.categoria || null,
    });

    const idMedico = medico.id;

    const caminhoContrato = novoCliente.contratoArquivo
      ? (await uploadArquivoStorage(novoCliente.contratoArquivo)).data?.url ?? ''
      : '';
    const caminhoProcuracao = novoCliente.procuracaoArquivo
      ? (await uploadArquivoStorage(novoCliente.procuracaoArquivo)).data?.url ?? ''
      : '';
    const caminhoArquivoAdicional = novoCliente.arquivoAdicionalArquivo
      ? (await uploadArquivoStorage(novoCliente.arquivoAdicionalArquivo)).data?.url ?? ''
      : '';

    await createDadosMedico({
      idMedico,
      CRM: novoCliente.crm,
      RQE: novoCliente.rqe,
      hospital: novoCliente.hospital,
      telefone: novoCliente.telefone,
      email: novoCliente.email,
      emailAcesso: novoCliente.emailAcesso,
    });


    await createEmpresaMedico({
      idMedico,
      CNPJ: novoCliente.cnpj,
      cnae: novoCliente.cnae || null,
      situacaoCadastral: novoCliente.situacaoCadastral || null,
      dataAbertura: novoCliente.dataAbertura || null,
      receitaConsultadaEm: novoCliente.receitaConsultadaEm || null,
      receitaFonte: novoCliente.receitaFonte || null,
      razaoSocial: novoCliente.razaoSocial,
      fantasia: novoCliente.fantasia,
      rua: novoCliente.pjRua,
      numero: novoCliente.pjNumero,
      complemento: novoCliente.pjComplemento,
      bairro: novoCliente.pjBairro,
      cidade: novoCliente.pjCidade,
      estado: novoCliente.pjEstado,
      cep: novoCliente.pjCep,
      contrato: novoCliente.contrato,
      procuracao: novoCliente.procuracao,
      arquivoAdicional: novoCliente.arquivoAdicional,
      caminhoContrato,
      caminhoProcuracao,
      caminhoArquivoAdicional,
    });


    await createDadosPessoais({
      idMedico,
      nomeCompleto: nomeCompletoMedico,
      CPF: novoCliente.cpf,
      RG: novoCliente.rg,
      estadoCivil: novoCliente.estadoCivil,
      rua: novoCliente.rua,
      numero: novoCliente.numero,
      complemento: novoCliente.complemento,
      bairro: novoCliente.bairro,
      cidade: novoCliente.cidade,
      estado: novoCliente.estado,
      cep: novoCliente.cep,
    });

    await createDadosBancarios({
      idMedico,
      nomeConta: novoCliente.nomeConta,
      numeroBanco: novoCliente.numeroBanco,
      nomeBanco: novoCliente.nomeBanco,
      agencia: novoCliente.agencia,
      tipoConta: novoCliente.tipoConta,
      numeroConta: novoCliente.numeroConta,
      chavePix: novoCliente.chavePix,
    });

    await carregarClientes();
    setCreateDialogVisible(false);

  } catch (err) {
    console.error('Erro ao salvar cliente:', err);
    const detalheErro =
      (err as any)?.response?.data?.detail ??
      JSON.stringify((err as any)?.response?.data ?? {});
    alert(detalheErro && detalheErro !== '{}' ? detalheErro : 'Erro ao salvar. Verifique os dados e tente novamente.');
  }
};


const handleSalvarEdicao = async () => {
  if (!clienteEditando) return;
  try {
    const caminhoContrato = clienteEditando.contratoArquivo
      ? (await uploadArquivoStorage(clienteEditando.contratoArquivo)).data?.url ?? clienteEditando.caminhoContrato ?? ''
      : clienteEditando.caminhoContrato ?? '';
    const caminhoProcuracao = clienteEditando.procuracaoArquivo
      ? (await uploadArquivoStorage(clienteEditando.procuracaoArquivo)).data?.url ?? clienteEditando.caminhoProcuracao ?? ''
      : clienteEditando.caminhoProcuracao ?? '';
    const caminhoArquivoAdicional = clienteEditando.arquivoAdicionalArquivo
      ? (await uploadArquivoStorage(clienteEditando.arquivoAdicionalArquivo)).data?.url ?? clienteEditando.caminhoArquivoAdicional ?? ''
      : clienteEditando.caminhoArquivoAdicional ?? '';

    await updateMedico(clienteEditando.id, {
      nomeCompleto: clienteEditando.nomeMedico,
      nomeSistema: clienteEditando.nomeSistema,
      especialidade: clienteEditando.especialidade,
      subespecialidade: clienteEditando.subespecialidade,
      keywords: clienteEditando.keywords,
      atendePediatrico: clienteEditando.atendePediatrico,
      grupoWhatsapp: clienteEditando.grupoWhatsapp,
      takeRate: clienteEditando.takeRate,
      status: clienteEditando.status,
      origemCliente: clienteEditando.origemCliente || null,
      categoria: clienteEditando.categoria || null,
      // #485 B: médico → hospitais/clínicas em que atende (hospital não aponta para ninguém)
      atendeEm: ['HOSPITAL', 'CLINICA'].includes(clienteEditando.categoria) ? [] : (clienteEditando.atendeEm ?? []),
    });

    const [dadosMed, empresa, pessoais, bancarios] = await Promise.all([
      getDadosMedico(clienteEditando.id),
      getEmpresaMedico(clienteEditando.id),
      getDadosPessoais(clienteEditando.id),
      getDadosBancarios(clienteEditando.id),
    ]);

    if (dadosMed.data[0]) {
      await updateDadosMedico(dadosMed.data[0].id, {
        CRM: clienteEditando.crm,
        RQE: clienteEditando.rqe,
        hospital: clienteEditando.hospital,
        telefone: clienteEditando.telefone,
        email: clienteEditando.email,
        emailAcesso: clienteEditando.emailAcesso,
      });
    }

    if (empresa.data[0]) {
      await updateEmpresaMedico(empresa.data[0].id, {
        CNPJ: clienteEditando.cnpj,
        cnae: clienteEditando.cnae || null,
        situacaoCadastral: clienteEditando.situacaoCadastral || null,
        dataAbertura: clienteEditando.dataAbertura || null,
        receitaConsultadaEm: clienteEditando.receitaConsultadaEm || null,
        receitaFonte: clienteEditando.receitaFonte || null,
        razaoSocial: clienteEditando.razaoSocial,
        fantasia: clienteEditando.fantasia,
        rua: clienteEditando.pjRua,
        numero: clienteEditando.pjNumero,
        complemento: clienteEditando.pjComplemento,
        bairro: clienteEditando.pjBairro,
        cidade: clienteEditando.pjCidade,
        estado: clienteEditando.pjEstado,
        cep: clienteEditando.pjCep,
        contrato: clienteEditando.contrato,
        procuracao: clienteEditando.procuracao,
        arquivoAdicional: clienteEditando.arquivoAdicional,
        caminhoContrato,
        caminhoProcuracao,
        caminhoArquivoAdicional,
      });
    }

    if (pessoais.data[0]) {
      await updateDadosPessoais(pessoais.data[0].id, {
        nomeCompleto: clienteEditando.nomeCompleto,
        CPF: clienteEditando.cpf,
        RG: clienteEditando.rg,
        estadoCivil: clienteEditando.estadoCivil,
        rua: clienteEditando.rua,
        numero: clienteEditando.numero,
        complemento: clienteEditando.complemento,
        bairro: clienteEditando.bairro,
        cidade: clienteEditando.cidade,
        estado: clienteEditando.estado,
        cep: clienteEditando.cep,
      });
    }

    if (bancarios.data[0]) {
      await updateDadosBancarios(bancarios.data[0].id, {
        nomeConta: clienteEditando.nomeConta,
        numeroBanco: clienteEditando.numeroBanco,
        nomeBanco: clienteEditando.nomeBanco,
        agencia: clienteEditando.agencia,
        tipoConta: clienteEditando.tipoConta,
        numeroConta: clienteEditando.numeroConta,
        chavePix: clienteEditando.chavePix,
      });
    }

    await carregarClientes();

    setEditDialogVisible(false);
  } catch (err) {
    console.error('Erro ao editar cliente:', err);
    alert('Erro ao salvar edição.');
  }
};

  const getArquivoTag = (arquivo?: File | null, caminho?: string) => {
    const enviado = !!arquivo || !!caminho;
    return (
      <Tag
        value={enviado ? 'Documento enviado' : 'Documento não enviado'}
        severity={enviado ? 'success' : 'danger'}
      />
    );
  };

  const handleNovoClienteArquivo = (field: CampoArquivoEmpresa, file: File | null) => {
    const caminhoField: Record<CampoArquivoEmpresa, CampoCaminhoEmpresa> = {
      contratoArquivo: 'caminhoContrato',
      procuracaoArquivo: 'caminhoProcuracao',
      arquivoAdicionalArquivo: 'caminhoArquivoAdicional'
    };

    setNovoCliente((prev) => ({
      ...prev,
      [field]: file,
      [caminhoField[field]]: file ? '' : prev[caminhoField[field]],
      contrato: field === 'contratoArquivo' ? !!file : prev.contrato,
      procuracao: field === 'procuracaoArquivo' ? !!file : prev.procuracao,
      arquivoAdicional: field === 'arquivoAdicionalArquivo' ? !!file : prev.arquivoAdicional
    }));
  };

  const handleClienteEditandoArquivo = (field: CampoArquivoEmpresa, file: File | null) => {
    if (!clienteEditando) return;

    const caminhoField: Record<CampoArquivoEmpresa, CampoCaminhoEmpresa> = {
      contratoArquivo: 'caminhoContrato',
      procuracaoArquivo: 'caminhoProcuracao',
      arquivoAdicionalArquivo: 'caminhoArquivoAdicional'
    };

    setClienteEditando({
      ...clienteEditando,
      [field]: file,
      [caminhoField[field]]: file ? '' : clienteEditando[caminhoField[field]],
      contrato: field === 'contratoArquivo' ? !!file : clienteEditando.contrato,
      procuracao: field === 'procuracaoArquivo' ? !!file : clienteEditando.procuracao,
      arquivoAdicional: field === 'arquivoAdicionalArquivo' ? !!file : clienteEditando.arquivoAdicional
    });
  };

  const abrirPreviewArquivo = (url: string, nome: string) => {
    const lower = url.toLowerCase();
    const tipo = lower.endsWith('.pdf')
      ? 'pdf'
      : /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(lower)
        ? 'image'
        : 'other';

    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

  const renderUploadSimples = (
    id: string,
    label: string,
    arquivo: File | null | undefined,
    caminho: string | undefined,
    onChangeArquivo: (file: File | null) => void
  ) => {
    const urlLocal = arquivo ? URL.createObjectURL(arquivo) : '';
    const nomeArquivo = arquivo?.name || caminho?.split('/').pop() || label;
    const urlPreview = arquivo ? urlLocal : (caminho || '');

    return (
      <div className="field field-span-2 upload-simple-field">
        <label>{label}</label>

        <div className="upload-simple-actions">
          {getArquivoTag(arquivo, caminho)}

          <input
            id={id}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => onChangeArquivo(e.target.files?.[0] || null)}
          />

          <Button
            type="button"
            label="Upload"
            icon="pi pi-upload"
            outlined
            onClick={() => document.getElementById(id)?.click()}
          />

          {urlPreview && (
            <Button
              type="button"
              label="Visualizar"
              icon="pi pi-eye"
              text
              onClick={() => abrirPreviewArquivo(urlPreview, nomeArquivo)}
            />
          )}
        </div>
      </div>
    );
  };


  const handleSalvarBaseOrcamento = async () => {
    if (!clienteEditando) return;
    setSavingBase(true);
    try {
      const form = new FormData();
      if (baseOrcamentoArquivoCotar) form.append('baseOrcamento', baseOrcamentoArquivoCotar);
      if (baseOrcamentoArquivoSegredo) form.append('baseOrcamentoSegredo', baseOrcamentoArquivoSegredo);
      Object.entries(baseOrcamento).forEach(([key, value]) => {
        if (typeof value === 'boolean') form.append(key, String(value));
      });
      await salvarBaseOrcamento(clienteEditando.id, form);
      alert('Base de orçamento salva!');
    } catch {
      alert('Erro ao salvar base de orçamento.');
    } finally {
      setSavingBase(false);
    }
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const iniciarDesenho = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const desenhar = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const pararDesenho = () => setIsDrawing(false);

  const limparAssinatura = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const salvarAssinatura = async () => {
    if (!clienteEditando || !canvasRef.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'assinatura.png', { type: 'image/png' });
      const form = new FormData();
      form.append('assinatura', file);
      try {
        await salvarBaseOrcamento(clienteEditando.id, form);
        const url = URL.createObjectURL(blob);
        setBaseOrcamento((prev) => ({ ...prev, linkAssinatura: url }));
        setAssinaturaDialogVisible(false);
        alert('Assinatura salva!');
      } catch {
        alert('Erro ao salvar assinatura.');
      }
    }, 'image/png');
  };

  // ============================================================
  // Helper: tab "Base Orçamento" — 2 PDFs (Cotar/Segredo) + 1 assinatura + 1 checklist.
  // Reutilizada nos dois dialogs (criar e editar).
  // ============================================================
  const inclusosCheckList: { key: keyof typeof baseOrcamentoInicial; label: string }[] = [
    { key: 'honorariosEquipeMedica', label: 'Honorários da equipe médica' },
    { key: 'taxasHospitalares', label: 'Taxas hospitalares' },
    { key: 'materiaisOpme', label: 'Materiais e OPME' },
    { key: 'medicamentosDiaria', label: 'Medicamentos durante a diária do pós-operatório' },
    { key: 'examesPreOperatorios', label: 'Exames pré-operatórios básicos' },
    { key: 'consultaPosOperatoria', label: '1 Consulta pós-operatória' },
    { key: 'atendimentoEnfermagem', label: 'Atendimento de enfermagem 24h' },
  ];
  const naoInclusosCheckList: { key: keyof typeof baseOrcamentoInicial; label: string }[] = [
    { key: 'acompanhanteTaxaAdicional', label: 'Acompanhante (taxa adicional)' },
    { key: 'fisioterapiaPosOperatoria', label: 'Fisioterapia pós-operatória' },
    { key: 'medicamentosPosAlta', label: 'Medicamentos pós-alta' },
    { key: 'ortesesImobilizadores', label: 'Órteses e imobilizadores' },
    { key: 'examesComplementares', label: 'Exames complementares extras' },
    { key: 'custoCtiBemodinamica', label: 'Custo com CTI e hemodinâmica' },
  ];

  const handleRemoverFolhaTimbrada = async (accent: 'cotar' | 'segredo') => {
    if (!clienteEditando) return;
    const ok = window.confirm(
      `Tem certeza que deseja remover a folha timbrada (${accent === 'cotar' ? 'Cotar' : 'Segredo de Justiça'})?`,
    );
    if (!ok) return;

    try {
      const form = new FormData();
      if (accent === 'cotar') form.append('removerBaseOrcamento', 'true');
      else form.append('removerBaseOrcamentoSegredo', 'true');
      await salvarBaseOrcamento(clienteEditando.id, form);
      setBaseOrcamento((prev) => ({
        ...prev,
        ...(accent === 'cotar'
          ? { linkBaseOrcamento: '' }
          : { linkBaseOrcamentoSegredo: '' }),
      }));
      if (accent === 'cotar') setBaseOrcamentoArquivoCotar(null);
      else setBaseOrcamentoArquivoSegredo(null);
    } catch (err) {
      console.error('Erro ao remover folha timbrada:', err);
      alert('Erro ao remover folha timbrada.');
    }
  };

  const renderUploadPdf = (
    titulo: string,
    linkAtual: string,
    arquivo: File | null,
    setArquivo: (f: File | null) => void,
    accent: 'cotar' | 'segredo',
  ) => {
    const inputId = `base-pdf-${accent}`;
    return (
      <div className={`base-orcamento-pdf base-orcamento-pdf--${accent}`}>
        <div className="base-orcamento-pdf__header">
          <i className={accent === 'cotar' ? 'pi pi-file-edit' : 'pi pi-lock'} />
          <span>{titulo}</span>
        </div>

        {linkAtual && !arquivo && (
          <div className="base-orcamento-pdf__atual">
            <a
              href={linkAtual}
              target="_blank"
              rel="noopener noreferrer"
              className="base-orcamento-pdf__link"
            >
              <i className="pi pi-file-pdf" />
              <span>Ver PDF atual</span>
            </a>
            <button
              type="button"
              className="base-orcamento-pdf__remove"
              aria-label="Remover folha timbrada"
              title="Remover"
              onClick={() => handleRemoverFolhaTimbrada(accent)}
            >
              <i className="pi pi-times" />
            </button>
          </div>
        )}

        {arquivo && (
          <div className="base-orcamento-pdf__pendente">
            <i className="pi pi-upload" />
            <span className="base-orcamento-pdf__pendente-nome">{arquivo.name}</span>
            <button
              type="button"
              className="base-orcamento-pdf__remove"
              aria-label="Cancelar arquivo selecionado"
              title="Cancelar"
              onClick={() => setArquivo(null)}
            >
              <i className="pi pi-times" />
            </button>
          </div>
        )}

        <input
          id={inputId}
          type="file"
          accept=".pdf"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="base-orcamento-pdf__input-hidden"
        />
        <label htmlFor={inputId} className="base-orcamento-pdf__upload-btn">
          <i className="pi pi-cloud-upload" />
          <span>
            {linkAtual || arquivo ? 'Trocar arquivo' : 'Selecionar arquivo PDF'}
          </span>
        </label>
      </div>
    );
  };

  const renderBaseOrcamentoTabContent = () => (
    <div className="cliente-form-grid">
      <small className="field field-span-4 base-orcamento-help">
        A assinatura e os checklists abaixo são compartilhados entre os dois tipos. Só a folha
        timbrada (PDF) é diferente — o sistema escolhe a folha certa em "Orçamento Médico"
        conforme o status jurídico do pedido.
      </small>

      <div className="field field-span-2 base-orcamento-section">
        <label>Folhas Timbradas (PDF)</label>
        {renderUploadPdf(
          'Cotar',
          baseOrcamento.linkBaseOrcamento,
          baseOrcamentoArquivoCotar,
          setBaseOrcamentoArquivoCotar,
          'cotar',
        )}
      </div>

      <div className="field field-span-2 base-orcamento-section">
        <label>&nbsp;</label>
        {renderUploadPdf(
          'Segredo de Justiça',
          baseOrcamento.linkBaseOrcamentoSegredo,
          baseOrcamentoArquivoSegredo,
          setBaseOrcamentoArquivoSegredo,
          'segredo',
        )}
      </div>

      <div className="field field-span-4 base-orcamento-section">
        <label>Assinatura</label>
        <div className="base-orcamento-row">
          {baseOrcamento.linkAssinatura ? (
            <img src={baseOrcamento.linkAssinatura} alt="Assinatura" className="assinatura-img" />
          ) : (
            <span className="assinatura-vazia">Nenhuma assinatura cadastrada</span>
          )}
          <Button
            label="Criar Assinatura"
            icon="pi pi-pencil"
            outlined
            onClick={() => setAssinaturaDialogVisible(true)}
          />
        </div>
      </div>

      <div className="field field-span-4 base-orcamento-checks">
        <div className="checks-grid">
          <div>
            <p className="checks-title">INCLUSOS (marque o que está incluso)</p>
            {inclusosCheckList.map(({ key, label }) => (
              <div key={key} className="check-item">
                <input
                  type="checkbox"
                  checked={baseOrcamento[key] as boolean}
                  onChange={(e) =>
                    setBaseOrcamento((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
                <label>{label}</label>
              </div>
            ))}
          </div>
          <div>
            <p className="checks-title">NÃO INCLUSOS (marque o que NÃO está incluso)</p>
            {naoInclusosCheckList.map(({ key, label }) => (
              <div key={key} className="check-item">
                <input
                  type="checkbox"
                  checked={baseOrcamento[key] as boolean}
                  onChange={(e) =>
                    setBaseOrcamento((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
                <label>{label}</label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="field field-span-4 base-orcamento-actions">
        <Button
          label="Salvar Base de Orçamento"
          icon="pi pi-check"
          loading={savingBase}
          onClick={handleSalvarBaseOrcamento}
        />
      </div>
    </div>
  );



  return (
    <div className="clientes-page">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>Gestão dos clientes cadastrados</p>
        </div>

        {!readOnly && <div className="page-actions">
          <Button
            label="Cadastrar Cliente"
            icon="pi pi-plus"
            onClick={handleAbrirCadastro}
          />
        </div>}
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Clientes</span>
            <i className="pi pi-users"></i>
          </div>
          <div className="kpi-value">{kpis.totalClientes}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Clientes Ativos</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{kpis.clientesAtivos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Cadastros Completos</span>
            <i className="pi pi-id-card"></i>
          </div>
          <div className="kpi-value">{kpis.cadastrosCompletos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Falta Documentação</span>
            <i className="pi pi-file-excel"></i>
          </div>
          <div className="kpi-value">{kpis.faltaDocumentacao}</div>
        </div>
      </div>
      </PainelKpis>

      <ConfirmDialog />
      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Médicos cadastrados como cliente — dados, contrato e procuração</h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            {/* #495 (@R 19/09): inativo some de TODAS as listagens do sistema; aqui é o único
                lugar que o vê — para conferir e reativar. Os pills só mexem no filtro da
                coluna Status (mesmo filtro que já existia). */}
            <span className="mc-pills-status" role="group" aria-label="Ativos, inativos ou todos">
              {([['ativos', 'Ativos', true], ['inativos', 'Inativos', false], ['todos', 'Todos', '']] as const).map(([k, rotulo, v]) => {
                const atual = (filters.status as any)?.value;
                const ativo = atual === v || (k === 'todos' && (atual === '' || atual === null || atual === undefined));
                return (
                  <Button key={k} label={rotulo} size="small" text={!ativo} outlined={ativo}
                    severity={k === 'inativos' ? 'danger' : 'secondary'}
                    onClick={() => setFilters((f) => ({ ...f, status: { value: v, matchMode: FilterMatchMode.EQUALS } }))} />
                );
              })}
            </span>
            <BotaoExportarExcel todos={dataComSequencial} nome="clientes" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable
          aria-label="Médicos cadastrados como cliente — dados, contrato e procuração"
          value={dataComSequencial}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          totalRecords={dataComSequencial.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          selectionMode="multiple"
          selection={selectedClientes}
          onSelectionChange={(e) => setSelectedClientes(e.value as ClienteTableRow[])}
          tableStyle={{ width: '100%' }}
          emptyMessage="Nenhum cliente encontrado."
          className="clientes-table"
        >
          {colunasCfg.filtrar(<>
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

          <Column
            field="sequencial"
            header="#"
            sortable
            style={{ minWidth: '4rem' }}
            body={(rowData: ClienteTableRow) => rowData.sequencial}
          />

          <Column
            /* NOME, ¬razão social (@R 18/09/2026: "tirar a razão social de aparecer ali, o que
               precisamos é do nome"). A razão social é o nome do CNPJ — "HOSPITAL X LTDA",
               "CLINICA Y SERVICOS MEDICOS EIRELI" — e não é assim que ninguém aqui chama o
               cliente. Ela continua na ficha, na aba Dados Empresa, que é onde faz falta
               (contrato, nota, dados bancários). Na lista fica o nome pelo qual se procura. */
            field="nomeMedico"
            header="Nome"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '18rem' }}
          />

          <Column
            field="nomeSistema"
            header="Nome Sistema"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
          />

          {/* CRM saiu da exibição a pedido do @R (19/09) — o dado continua na ficha (aba Dados Médico). */}
          <Column
            header={cabecalhoComHint('Grupo WhatsApp', 'Grupos de WhatsApp vinculados a este cliente na ficha (vários por cliente, com função). "—" = nenhum vinculado ainda.')}
            body={(r: { id: number }) => {
              if (gruposPorCliente === null) return <span title="Não consegui ler os grupos agora">?</span>;
              const gs = gruposPorCliente[r.id] ?? [];
              if (!gs.length) return <span style={{ opacity: .5 }}>—</span>;
              const nomes = gs.map((g) => g.grupoNome.replace(/^Grupo \d+( e \d+)?[:\s-]*/i, '').replace(/^\d+-\d+\.\s*/, ''));
              return (
                <span title={gs.map((g) => `${g.grupoNome} (${g.funcao}${g.envioAtivo ? ', envio LIGADO' : ''})`).join('\n')}>
                  <Tag value={String(gs.length)} severity={gs.some((g) => g.envioAtivo) ? 'success' : undefined} style={{ marginRight: 6 }} />
                  {nomes.join(' · ')}
                </span>
              );
            }}
            style={{ minWidth: '16rem', maxWidth: '22rem', whiteSpace: 'normal' }}
          />

          <Column
            field="especialidade"
            header="Especialidade"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
          />

          <Column
            field="categoria"
            header="Categoria"
            sortable
            filter
            showFilterMenu={false}
            filterElement={(options) => booleanFilterElement(options, categoriaFiltroOpcoes)}
            body={(rowData: ClienteTableRow) => getCategoriaTag(rowData.categoria)}
            style={{ minWidth: '12rem' }}
          />

          <Column
            field="origemCliente"
            header="Dono"
            sortable
            filter
            showFilterMenu={false}
            filterElement={(options) => booleanFilterElement(options, origemFiltroOpcoes)}
            body={(rowData: ClienteTableRow) => getOrigemTag(rowData.origemCliente)}
            style={{ minWidth: '11rem' }}
          />

          <Column
            field="status"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            filter
            showFilterMenu={false}
            filterElement={(options) => booleanFilterElement(options, BOOLEAN_FILTRO_OPCOES)}
            body={(rowData: ClienteTableRow) => getBooleanTag(rowData.status)}
            style={{ minWidth: '9rem' }}
          />

          {/* Contrato e Procuração saíram da TABELA (@R 18/09/2026: "tirarmos o contrato - e
              procuração"). O DADO CONTINUA: 14 contratos e 16 procurações estão preenchidos, com
              caminho de arquivo gravado — apagá-los seria destruir registro jurídico por causa de
              um pedido sobre a TELA. Os dois campos seguem editáveis na aba "Dados Empresa" da
              ficha do cliente, que é onde se preenche. O que sai daqui é a coluna: numa lista de
              29 clientes, duas colunas de sim/não empurram para fora da vista o que se usa todo
              dia (Categoria, Dono, Status). */}

          <Column
            header="Editar"
            body={(r: ClienteTableRow) => (
              <span style={{ display: 'inline-flex', gap: '.35rem' }}>
                {editarBodyTemplate(r)}
                {areaBodyTemplate(r)}
                {!readOnly && (
                  <Button
                    icon={r.status === false ? 'pi pi-replay' : 'pi pi-ban'}
                    rounded outlined
                    severity={r.status === false ? 'success' : 'danger'}
                    aria-label={r.status === false ? `Reativar ${r.nomeSistema ?? r.id}` : `Inativar ${r.nomeSistema ?? r.id}`}
                    tooltip={r.status === false ? 'Reativar: volta a aparecer nas listagens' : 'Inativar: some das listagens (seleção de médico, cotação); o histórico dos pedidos fica'}
                    onClick={() => confirmarInativar(r)}
                  />
                )}
              </span>
            )}
            style={{ minWidth: '4rem' }}
            bodyStyle={{ textAlign: 'center' }}
          />
        </>)}
        </DataTable>

      </div>

      {/* Modal cadastrar */}
      <Dialog
        header="Cadastrar Cliente"
        onShow={recarregarEspecialidades}
        visible={createDialogVisible}
        style={{ width: '82rem', maxWidth: '96vw' }}
        modal
        onHide={() => setCreateDialogVisible(false)}
        className="cliente-edit-dialog"
      >
        <TabView>
          <TabPanel header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}>
            <div className="cliente-form-grid">
              <div className="field field-span-2">
                <label>Nome Médico</label>
                <InputText value={novoCliente.nomeMedico} onChange={(e) => updateNovoCliente('nomeMedico', e.target.value)} />
              </div>
              <div className="field field-span-2">
                <label>Nome Sistema</label>
                <InputText value={novoCliente.nomeSistema} onChange={(e) => updateNovoCliente('nomeSistema', e.target.value)} />
              </div>
              <div className="field">
                <label>Especialidade</label>
                <Dropdown value={novoCliente.especialidade} options={especialidadeOptions} onChange={(e) => updateNovoCliente('especialidade', e.value)} placeholder="Selecione" />
              </div>
              <div className="field">
                <label>Subespecialidade</label>
                <Dropdown value={novoCliente.subespecialidade} options={subespecialidadeOptions} onChange={(e) => updateNovoCliente('subespecialidade', e.value)} placeholder="Selecione" />
              </div>
              <div className="field">
                {/* @R 16/09: "é importante para Hospitais termos Especialidades e termos
                    médicos e podermos cadastrar internamente" — o hospital atende VÁRIAS,
                    e a de cima (texto) não comporta mais de uma. */}
                <label>Especialidades atendidas (hospital/clínica)</label>
                <MultiSelect value={novoCliente.especialidades ?? []} options={especialidadesM2M}
                  onChange={(e) => updateNovoCliente('especialidades', e.value)}
                  display="chip" filter placeholder="Marque uma ou mais"
                  emptyFilterMessage="Nenhuma especialidade com esse nome" />
                <small className="ajuda-campo">Para hospital: marque TODAS as especialidades que ele atende. É por elas que o jurídico escolhe na hora de cotar.</small>
              </div>
              <div className="field field-span-2">
                <label>Keywords</label>
                <InputText value={novoCliente.keywords} onChange={(e) => updateNovoCliente('keywords', e.target.value)} />
              </div>
              <div className="field">
                <label>Atende pediátrico?</label>
                <Dropdown
                  value={novoCliente.atendePediatrico}
                  options={[
                    { label: 'Não informado', value: 'NAO_INFORMADO' },
                    { label: 'Sim, atende', value: 'SIM' },
                    { label: 'Não atende', value: 'NAO' },
                  ]}
                  onChange={(e) => updateNovoCliente('atendePediatrico', e.value)}
                  placeholder="Não informado"
                />
              </div>
              <div className="field field-span-2">
                <label>Grupo WhatsApp</label>
                <InputText value={novoCliente.grupoWhatsapp} onChange={(e) => updateNovoCliente('grupoWhatsapp', e.target.value)} />
              </div>
              <div className="field">
                <label>Take Rate (%)</label>
                <InputNumber
                  value={novoCliente.takeRate ?? undefined}
                  onValueChange={(e) => updateNovoCliente('takeRate', e.value ?? null)}
                  mode="decimal"
                  minFractionDigits={0}
                  maxFractionDigits={2}
                  min={0}
                  max={100}
                  suffix=" %"
                  placeholder="Ex.: 20"
                />
              </div>
              <div className="field">
                <label>Status</label>
                <Dropdown value={novoCliente.status} options={statusOptions} optionLabel="label" onChange={(e) => updateNovoCliente('status', e.value)} itemTemplate={statusTemplate} valueTemplate={statusTemplate} placeholder="Selecione" />
              </div>
              <div className="field">
                <label>Dono do cliente</label>
                <Dropdown value={novoCliente.origemCliente} options={origemOptions} optionLabel="label" onChange={(e) => updateNovoCliente('origemCliente', e.value)} placeholder="Selecione" />
              </div>
              <div className="field">
                <label>Categoria</label>
                <Dropdown value={novoCliente.categoria} options={categoriaOptions} optionLabel="label" onChange={(e) => updateNovoCliente('categoria', e.value)} placeholder="Médico, hospital, clínica…" />
              </div>

              <div className="field field-span-4 cadastrar-usuario-row">
                <Button
                  label="Cadastrar Usuário"
                  icon="pi pi-user-plus"
                  disabled={
                    usuarioCadastrado ||
                    !clienteEditando?.nomeMedico ||
                    !clienteEditando?.nomeSistema ||
                    !clienteEditando?.especialidade
                  }
                  loading={loadingUsuario}
                  onClick={async () => {
                    if (!clienteEditando) return;
                    setLoadingUsuario(true);
                    try {
                      await cadastrarUsuarioMedico(clienteEditando.id);
                      setUsuarioCadastrado(true);
                      alert('Usuário cadastrado com sucesso!');
                    } catch (err: any) {
                      alert(err?.response?.data?.error ?? 'Erro ao cadastrar usuário.');
                    } finally {
                      setLoadingUsuario(false);
                    }
                  }}
                />
                <Tag value={usuarioCadastrado ? 'Cadastrado' : 'Não cadastrado'} severity={usuarioCadastrado ? 'success' : 'danger'} />
              </div>

              <div className="field">
                <label>CreateDate</label>
                <InputText value={formatarData(novoCliente.createDate)} disabled />
              </div>
              <div className="field">
                <label>UpdateDate</label>
                <InputText value={formatarData(novoCliente.updateDate)} disabled />
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Dados Médico">
            <div className="cliente-form-grid">
              <div className="field field-span-2"><label>Nome Médico</label><InputText value={novoCliente.nomeMedico} onChange={(e) => updateNovoCliente('nomeMedico', e.target.value)} /></div>
              <div className="field field-span-2"><label>Nome Sistema</label><InputText value={novoCliente.nomeSistema} onChange={(e) => updateNovoCliente('nomeSistema', e.target.value)} /></div>
              <div className="field"><label>CRM</label><InputText value={novoCliente.crm} onChange={(e) => updateNovoCliente('crm', e.target.value)} /></div>
              <div className="field"><label>RQE</label><InputText value={novoCliente.rqe} onChange={(e) => updateNovoCliente('rqe', e.target.value)} /></div>
              <div className="field"><label>Hospital</label><Dropdown value={novoCliente.hospital} options={hospitalOptions} onChange={(e) => updateNovoCliente('hospital', e.value)} placeholder="Selecione" /></div>
              <div className="field"><label>Telefone</label><InputText value={novoCliente.telefone} onChange={(e) => updateNovoCliente('telefone', formatarTelefone(e.target.value))} /></div>
              <div className="field field-span-2"><label>Email</label><InputText value={novoCliente.email} onChange={(e) => updateNovoCliente('email', e.target.value)} /></div>
              <div className="field field-span-2"><label>Email de Acesso</label><InputText value={novoCliente.emailAcesso} onChange={(e) => updateNovoCliente('emailAcesso', e.target.value)} /></div>
              <div className="field"><label>CreateDate</label><InputText value={formatarData(novoCliente.createDate)} disabled /></div>
              <div className="field"><label>UpdateDate</label><InputText value={formatarData(novoCliente.updateDate)} disabled /></div>
            </div>
          </TabPanel>

          <TabPanel header="Dados Empresa">
            <div className="cliente-form-grid">
              <div className="field field-span-2">
                <label>CNPJ</label>
                <div className="p-inputgroup">
                  <InputText value={novoCliente.cnpj} onChange={(e) => updateNovoCliente('cnpj', formatarCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                  <Button type="button" icon="pi pi-search" label="Consultar" tooltip="Busca na Receita e preenche só o que estiver vazio"
                    onClick={() => void consultarReceita(novoCliente, (patch) => setNovoCliente((c) => ({ ...c, ...patch })), 'vazios')} />
                </div>
              </div>
              <div className="field field-span-2"><label>Razão Social</label><InputText value={novoCliente.razaoSocial} onChange={(e) => updateNovoCliente('razaoSocial', e.target.value)} /></div>
              <div className="field field-span-2"><label>Fantasia</label><InputText value={novoCliente.fantasia} onChange={(e) => updateNovoCliente('fantasia', e.target.value)} /></div>
              <div className="field field-span-2"><label>Rua</label><InputText value={novoCliente.pjRua} onChange={(e) => updateNovoCliente('pjRua', e.target.value)} /></div>
              <div className="field"><label>Número</label><InputText value={novoCliente.pjNumero} onChange={(e) => updateNovoCliente('pjNumero', e.target.value)} /></div>
              <div className="field"><label>Complemento</label><InputText value={novoCliente.pjComplemento} onChange={(e) => updateNovoCliente('pjComplemento', e.target.value)} /></div>
              <div className="field"><label>Bairro</label><InputText value={novoCliente.pjBairro} onChange={(e) => updateNovoCliente('pjBairro', e.target.value)} /></div>
              <div className="field field-span-2"><label>Cidade</label><InputText value={novoCliente.pjCidade} onChange={(e) => updateNovoCliente('pjCidade', e.target.value)} /></div>
              <div className="field"><label>Estado</label><InputText value={novoCliente.pjEstado} onChange={(e) => updateNovoCliente('pjEstado', e.target.value)} /></div>
              <div className="field">
                <label>CEP</label>
                <div className="p-inputgroup">
                  <InputText value={novoCliente.pjCep} onChange={(e) => updateNovoCliente('pjCep', formatarCep(e.target.value))} onBlur={() => void handleBuscarCepEmpresaNovo()} placeholder="00000-000" />
                  <Button type="button" icon="pi pi-search" onClick={() => void handleBuscarCepEmpresaNovo()} />
                </div>
              </div>
              <div className="field"><label>CreateDate</label><InputText value={formatarData(novoCliente.createDate)} disabled /></div>
              <div className="field"><label>UpdateDate</label><InputText value={formatarData(novoCliente.updateDate)} disabled /></div>
              <div className="upload-row">
                {renderUploadSimples('novo-contrato-arquivo', 'Contrato', novoCliente.contratoArquivo, novoCliente.caminhoContrato, (file) => handleNovoClienteArquivo('contratoArquivo', file))}
                {renderUploadSimples('novo-procuracao-arquivo', 'Procuração', novoCliente.procuracaoArquivo, novoCliente.caminhoProcuracao, (file) => handleNovoClienteArquivo('procuracaoArquivo', file))}
                {renderUploadSimples('novo-arquivo-adicional-arquivo', 'Cartão CNPJ', novoCliente.arquivoAdicionalArquivo, novoCliente.caminhoArquivoAdicional, (file) => handleNovoClienteArquivo('arquivoAdicionalArquivo', file))}
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Dados do responsável">
            <div className="cliente-form-grid">
              <div className="field field-span-2"><label>Nome Completo</label><InputText value={novoCliente.nomeCompleto} onChange={(e) => updateNovoCliente('nomeCompleto', e.target.value)} /></div>
              <div className="field"><label>CPF</label><InputText value={novoCliente.cpf} onChange={(e) => updateNovoCliente('cpf', formatarCpf(e.target.value))} /></div>
              <div className="field"><label>RG</label><InputText value={novoCliente.rg} onChange={(e) => updateNovoCliente('rg', e.target.value)} /></div>
              <div className="field"><label>Estado Civil</label><Dropdown value={novoCliente.estadoCivil} options={estadoCivilOptions} onChange={(e) => updateNovoCliente('estadoCivil', e.value)} /></div>
              <div className="field field-span-2"><label>Rua</label><InputText value={novoCliente.rua} onChange={(e) => updateNovoCliente('rua', e.target.value)} /></div>
              <div className="field"><label>Número</label><InputText value={novoCliente.numero} onChange={(e) => updateNovoCliente('numero', e.target.value)} /></div>
              <div className="field"><label>Complemento</label><InputText value={novoCliente.complemento} onChange={(e) => updateNovoCliente('complemento', e.target.value)} /></div>
              <div className="field"><label>Bairro</label><InputText value={novoCliente.bairro} onChange={(e) => updateNovoCliente('bairro', e.target.value)} /></div>
              <div className="field"><label>Cidade</label><InputText value={novoCliente.cidade} onChange={(e) => updateNovoCliente('cidade', e.target.value)} /></div>
              <div className="field"><label>Estado</label><InputText value={novoCliente.estado} onChange={(e) => updateNovoCliente('estado', e.target.value)} /></div>
              <div className="field">
                <label>CEP</label>
                <div className="p-inputgroup">
                  <InputText value={novoCliente.cep} onChange={(e) => updateNovoCliente('cep', formatarCep(e.target.value))} onBlur={() => void handleBuscarCepPessoalNovo()} placeholder="00000-000" />
                  <Button type="button" icon="pi pi-search" onClick={() => void handleBuscarCepPessoalNovo()} />
                </div>
              </div>
              <div className="field"><label>CreateDate</label><InputText value={formatarData(novoCliente.createDate)} disabled /></div>
              <div className="field"><label>UpdateDate</label><InputText value={formatarData(novoCliente.updateDate)} disabled /></div>
            </div>
          </TabPanel>

          <TabPanel header="Dados Bancários">
            <div className="cliente-form-grid">
              <div className="field field-span-2"><label>Nome Conta</label><InputText value={novoCliente.nomeConta} onChange={(e) => updateNovoCliente('nomeConta', e.target.value)} /></div>
              <div className="field"><label>Número Banco</label><InputText value={novoCliente.numeroBanco} onChange={(e) => updateNovoCliente('numeroBanco', e.target.value)} disabled /></div>
              <div className="field"><label>Nome Banco</label><Dropdown value={novoCliente.nomeBanco} options={bancoOptions} onChange={(e) => handleSelecionarBancoNovo(e.value)} /></div>
              <div className="field"><label>Agência</label><InputText value={novoCliente.agencia} onChange={(e) => updateNovoCliente('agencia', formatarAgencia(e.target.value))} /></div>
              <div className="field"><label>Tipo da Conta</label><Dropdown value={novoCliente.tipoConta} options={tipoContaOptions} onChange={(e) => updateNovoCliente('tipoConta', e.value)} /></div>
              <div className="field"><label>Número da Conta</label><InputText value={novoCliente.numeroConta} onChange={(e) => updateNovoCliente('numeroConta', formatarConta(e.target.value))} /></div>
              <div className="field"><label>Chave Pix</label><InputText value={novoCliente.chavePix} onChange={(e) => updateNovoCliente('chavePix', e.target.value)} /></div>
              <div className="field"><label>CreateDate</label><InputText value={formatarData(novoCliente.createDate)} disabled /></div>
              <div className="field"><label>UpdateDate</label><InputText value={formatarData(novoCliente.updateDate)} disabled /></div>
            </div>
          </TabPanel>

          <TabPanel header="Base Orçamento">
            {renderBaseOrcamentoTabContent()}
          </TabPanel>
        </TabView>

        <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setCreateDialogVisible(false)} />
          <Button label="Salvar" icon="pi pi-check" onClick={handleSalvarCadastro} />
        </div>
      </Dialog>

      {/* Modal editar */}
      <Dialog
        header="Editar Cliente"
        onShow={recarregarEspecialidades}
        visible={editDialogVisible}
        style={{ width: '82rem', maxWidth: '96vw' }}
        modal
        onHide={() => setEditDialogVisible(false)}
        className="cliente-edit-dialog"
      >
        {clienteEditando && (
          <fieldset disabled={readOnly} className="cliente-edit-fieldset">
            <TabView>
              <TabPanel header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}>
                <div className="cliente-form-grid">
                  <div className="field field-span-2"><label>Nome Médico</label><InputText value={clienteEditando.nomeMedico} onChange={(e) => updateClienteEditando('nomeMedico', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Nome Sistema</label><InputText value={clienteEditando.nomeSistema} onChange={(e) => updateClienteEditando('nomeSistema', e.target.value)} /></div>
                  <div className="field"><label>Especialidade</label><Dropdown value={clienteEditando.especialidade} options={especialidadeOptions} onChange={(e) => updateClienteEditando('especialidade', e.value)} placeholder="Selecione" /></div>
                  <div className="field"><label>Subespecialidade</label><Dropdown value={clienteEditando.subespecialidade} options={subespecialidadeOptions} onChange={(e) => updateClienteEditando('subespecialidade', e.value)} placeholder="Selecione" /></div>
                  <div className="field">
                    <label>Especialidades atendidas (hospital/clínica)</label>
                    <MultiSelect value={clienteEditando.especialidades ?? []} options={especialidadesM2M}
                      onChange={(e) => updateClienteEditando('especialidades', e.value)}
                      display="chip" filter placeholder="Marque uma ou mais"
                      emptyFilterMessage="Nenhuma especialidade com esse nome" />
                    <small className="ajuda-campo">Para hospital: marque TODAS as especialidades que ele atende. É por elas que o jurídico escolhe na hora de cotar.</small>
                  </div>
                  <div className="field field-span-2"><label>Keywords</label><InputText value={clienteEditando.keywords} onChange={(e) => updateClienteEditando('keywords', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Grupo WhatsApp (campo antigo, texto livre)</label><InputText value={clienteEditando.grupoWhatsapp} onChange={(e) => updateClienteEditando('grupoWhatsapp', e.target.value)} /></div>
                  {/* 1:N com função e JID do catálogo — ver GruposWhatsappCliente (@R 19/09/2026) */}
                  <GruposWhatsappCliente idMedico={clienteEditando.id} />
                  <div className="field">
                    <label>Take Rate (%)</label>
                    <InputNumber
                      value={clienteEditando.takeRate ?? undefined}
                      onValueChange={(e) => updateClienteEditando('takeRate', e.value ?? null)}
                      mode="decimal"
                      minFractionDigits={0}
                      maxFractionDigits={2}
                      min={0}
                      max={100}
                      suffix=" %"
                      placeholder="Ex.: 20"
                    />
                  </div>
                  <div className="field"><label>Status</label><Dropdown value={clienteEditando.status} options={statusOptions} optionLabel="label" onChange={(e) => updateClienteEditando('status', e.value)} itemTemplate={statusTemplate} valueTemplate={statusTemplate} placeholder="Selecione" /></div>
                  <div className="field"><label>Dono do cliente</label><Dropdown value={clienteEditando.origemCliente} options={origemOptions} optionLabel="label" onChange={(e) => updateClienteEditando('origemCliente', e.value)} placeholder="Selecione" /></div>
                  <div className="field"><label>Categoria</label><Dropdown value={clienteEditando.categoria} options={categoriaOptions} optionLabel="label" onChange={(e) => updateClienteEditando('categoria', e.value)} placeholder="Médico, hospital, clínica…" /></div>

                  <div className="field field-span-4 cadastrar-usuario-row">
                    <Button
                      label="Cadastrar Usuário"
                      icon="pi pi-user-plus"
                      disabled={
                        usuarioCadastrado ||
                        !clienteEditando?.nomeMedico ||
                        !clienteEditando?.nomeSistema ||
                        !clienteEditando?.especialidade
                      }
                      loading={loadingUsuario}
                      onClick={async () => {
                        if (!clienteEditando) return;
                        setLoadingUsuario(true);
                        try {
                          await cadastrarUsuarioMedico(clienteEditando.id);
                          setUsuarioCadastrado(true);
                          alert('Usuário cadastrado com sucesso!');
                        } catch (err: any) {
                          alert(err?.response?.data?.error ?? 'Erro ao cadastrar usuário.');
                        } finally {
                          setLoadingUsuario(false);
                        }
                      }}
                    />
                    <Tag value={usuarioCadastrado ? 'Cadastrado' : 'Não cadastrado'} severity={usuarioCadastrado ? 'success' : 'danger'} />
                  </div>

                  <div className="field"><label>CreateDate</label><InputText value={formatarData(clienteEditando.createDate)} disabled /></div>
                  <div className="field"><label>UpdateDate</label><InputText value={formatarData(clienteEditando.updateDate)} disabled /></div>
                </div>
              </TabPanel>

              <TabPanel header="Dados Médico">
                <div className="cliente-form-grid">
                  <div className="field field-span-2"><label>Nome Médico</label><InputText value={clienteEditando.nomeMedico} onChange={(e) => updateClienteEditando('nomeMedico', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Nome Sistema</label><InputText value={clienteEditando.nomeSistema} onChange={(e) => updateClienteEditando('nomeSistema', e.target.value)} /></div>
                  {/* #485 B (@R 19/09): hospital/clínica só tem "especialidades atendidas" (aba
                      Dados Empresa) e a lista de médicos vinculados; o médico tem CRM/RQE e diz em
                      quais hospitais/clínicas atende — o vínculo é este, não o texto antigo. */}
                  {!['HOSPITAL', 'CLINICA'].includes(clienteEditando.categoria) ? (
                    <>
                      <div className="field"><label>CRM</label><InputText value={clienteEditando.crm} onChange={(e) => updateClienteEditando('crm', e.target.value)} /></div>
                      <div className="field"><label>RQE</label><InputText value={clienteEditando.rqe} onChange={(e) => updateClienteEditando('rqe', e.target.value)} /></div>
                      <div className="field"><label>Hospital</label><Dropdown value={clienteEditando.hospital} options={hospitalOptions} onChange={(e) => updateClienteEditando('hospital', e.value)} placeholder="Selecione" /></div>
                      <div className="field field-span-2">
                        <label>Atende em (hospitais / clínicas cadastrados como cliente)</label>
                        <MultiSelect value={clienteEditando.atendeEm ?? []} display="chip" placeholder="Nenhum vínculo"
                          options={clientes.filter((c) => ['HOSPITAL', 'CLINICA'].includes(c.categoria) && c.id !== clienteEditando.id)
                            .map((c) => ({ label: c.nomeSistema || c.nomeMedico || `#${c.id}`, value: c.id }))}
                          onChange={(e) => updateClienteEditando('atendeEm', e.value)} />
                      </div>
                    </>
                  ) : (
                    <div className="field field-span-2">
                      <label>Médicos que atendem por este {clienteEditando.categoria === 'CLINICA' ? 'clínica' : 'hospital'}</label>
                      {(clienteEditando.medicosVinculados ?? []).length === 0
                        ? <small style={{ color: '#6b7280' }}>Nenhum médico vinculado ainda — o vínculo é feito na ficha do médico, campo "Atende em".</small>
                        : <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                            {(clienteEditando.medicosVinculados ?? []).map((m) => <Tag key={m.id} value={m.nome} severity="info" />)}
                          </div>}
                    </div>
                  )}
                  <div className="field"><label>Telefone</label><InputText value={clienteEditando.telefone} onChange={(e) => updateClienteEditando('telefone', formatarTelefone(e.target.value))} /></div>
                  <div className="field field-span-2"><label>Email</label><InputText value={clienteEditando.email} onChange={(e) => updateClienteEditando('email', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Email de Acesso</label><InputText value={clienteEditando.emailAcesso} onChange={(e) => updateClienteEditando('emailAcesso', e.target.value)} /></div>
                  <div className="field"><label>CreateDate</label><InputText value={formatarData(clienteEditando.createDate)} disabled /></div>
                  <div className="field"><label>UpdateDate</label><InputText value={formatarData(clienteEditando.updateDate)} disabled /></div>
                </div>
              </TabPanel>

              <TabPanel header="Dados Empresa">
                <div className="cliente-form-grid">
                  <div className="field field-span-2">
                    <label>CNPJ</label>
                    <div className="p-inputgroup">
                      <InputText value={clienteEditando.cnpj} onChange={(e) => updateClienteEditando('cnpj', formatarCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                      <Button type="button" icon="pi pi-search" label="Consultar" tooltip="Busca na Receita e preenche só o que estiver vazio"
                        onClick={() => void consultarReceita(clienteEditando, (patch) => setClienteEditando((c) => (c ? { ...c, ...patch } : c)), 'vazios')} />
                      <Button type="button" icon="pi pi-refresh" label="Atualizar da Receita" severity="warning" outlined tooltip="Sobrescreve os dados da empresa com a Receita — mostra antes/depois e pede confirmação"
                        onClick={() => void consultarReceita(clienteEditando, (patch) => setClienteEditando((c) => (c ? { ...c, ...patch } : c)), 'sobrescrever')} />
                    </div>
                    {clienteEditando.receitaConsultadaEm && (
                      <small style={{ color: '#6b7280' }}>Receita consultada em {formatarData(clienteEditando.receitaConsultadaEm)} ({clienteEditando.receitaFonte})</small>
                    )}
                  </div>
                  <div className="field field-span-2"><label>Razão Social</label><InputText value={clienteEditando.razaoSocial} onChange={(e) => updateClienteEditando('razaoSocial', e.target.value)} /></div>
                  <div className="field field-span-2"><label>CNAE principal</label><InputText value={clienteEditando.cnae} onChange={(e) => updateClienteEditando('cnae', e.target.value)} /></div>
                  <div className="field"><label>Situação cadastral</label><InputText value={clienteEditando.situacaoCadastral} onChange={(e) => updateClienteEditando('situacaoCadastral', e.target.value)} /></div>
                  <div className="field"><label>Data de abertura</label><InputText value={clienteEditando.dataAbertura} onChange={(e) => updateClienteEditando('dataAbertura', e.target.value)} placeholder="AAAA-MM-DD" /></div>
                  <div className="field field-span-2"><label>Fantasia</label><InputText value={clienteEditando.fantasia} onChange={(e) => updateClienteEditando('fantasia', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Rua</label><InputText value={clienteEditando.pjRua} onChange={(e) => updateClienteEditando('pjRua', e.target.value)} /></div>
                  <div className="field"><label>Número</label><InputText value={clienteEditando.pjNumero} onChange={(e) => updateClienteEditando('pjNumero', e.target.value)} /></div>
                  <div className="field"><label>Complemento</label><InputText value={clienteEditando.pjComplemento} onChange={(e) => updateClienteEditando('pjComplemento', e.target.value)} /></div>
                  <div className="field"><label>Bairro</label><InputText value={clienteEditando.pjBairro} onChange={(e) => updateClienteEditando('pjBairro', e.target.value)} /></div>
                  <div className="field field-span-2"><label>Cidade</label><InputText value={clienteEditando.pjCidade} onChange={(e) => updateClienteEditando('pjCidade', e.target.value)} /></div>
                  <div className="field"><label>Estado</label><InputText value={clienteEditando.pjEstado} onChange={(e) => updateClienteEditando('pjEstado', e.target.value)} /></div>
                  <div className="field">
                    <label>CEP</label>
                    <div className="p-inputgroup">
                      <InputText value={clienteEditando.pjCep} onChange={(e) => updateClienteEditando('pjCep', formatarCep(e.target.value))} onBlur={() => void handleBuscarCepEmpresaEdicao()} placeholder="00000-000" />
                      <Button type="button" icon="pi pi-search" onClick={() => void handleBuscarCepEmpresaEdicao()} />
                    </div>
                  </div>
                  <div className="field"><label>CreateDate</label><InputText value={formatarData(clienteEditando.createDate)} disabled /></div>
                  <div className="field"><label>UpdateDate</label><InputText value={formatarData(clienteEditando.updateDate)} disabled /></div>
                  <div className="upload-row">
                    {renderUploadSimples('editar-contrato-arquivo', 'Contrato', clienteEditando.contratoArquivo, clienteEditando.caminhoContrato, (file) => handleClienteEditandoArquivo('contratoArquivo', file))}
                    {renderUploadSimples('editar-procuracao-arquivo', 'Procuração', clienteEditando.procuracaoArquivo, clienteEditando.caminhoProcuracao, (file) => handleClienteEditandoArquivo('procuracaoArquivo', file))}
                    {renderUploadSimples('editar-arquivo-adicional-arquivo', 'Cartão CNPJ', clienteEditando.arquivoAdicionalArquivo, clienteEditando.caminhoArquivoAdicional, (file) => handleClienteEditandoArquivo('arquivoAdicionalArquivo', file))}
                  </div>
                </div>
              </TabPanel>

              <TabPanel header="Dados do responsável">
                <div className="cliente-form-grid">
                  <div className="field field-span-2"><label>Nome Completo</label><InputText value={clienteEditando.nomeCompleto} onChange={(e) => updateClienteEditando('nomeCompleto', e.target.value)} /></div>
                  <div className="field"><label>CPF</label><InputText value={clienteEditando.cpf} onChange={(e) => updateClienteEditando('cpf', formatarCpf(e.target.value))} /></div>
                  <div className="field"><label>RG</label><InputText value={clienteEditando.rg} onChange={(e) => updateClienteEditando('rg', e.target.value)} /></div>
                  <div className="field"><label>Estado Civil</label><Dropdown value={clienteEditando.estadoCivil} options={estadoCivilOptions} onChange={(e) => updateClienteEditando('estadoCivil', e.value)} /></div>
                  <div className="field field-span-2"><label>Rua</label><InputText value={clienteEditando.rua} onChange={(e) => updateClienteEditando('rua', e.target.value)} /></div>
                  <div className="field"><label>Número</label><InputText value={clienteEditando.numero} onChange={(e) => updateClienteEditando('numero', e.target.value)} /></div>
                  <div className="field"><label>Complemento</label><InputText value={clienteEditando.complemento} onChange={(e) => updateClienteEditando('complemento', e.target.value)} /></div>
                  <div className="field"><label>Bairro</label><InputText value={clienteEditando.bairro} onChange={(e) => updateClienteEditando('bairro', e.target.value)} /></div>
                  <div className="field"><label>Cidade</label><InputText value={clienteEditando.cidade} onChange={(e) => updateClienteEditando('cidade', e.target.value)} /></div>
                  <div className="field"><label>Estado</label><InputText value={clienteEditando.estado} onChange={(e) => updateClienteEditando('estado', e.target.value)} /></div>
                  <div className="field">
                    <label>CEP</label>
                    <div className="p-inputgroup">
                      <InputText value={clienteEditando.cep} onChange={(e) => updateClienteEditando('cep', formatarCep(e.target.value))} onBlur={() => void handleBuscarCepPessoalEdicao()} placeholder="00000-000" />
                      <Button type="button" icon="pi pi-search" onClick={() => void handleBuscarCepPessoalEdicao()} />
                    </div>
                  </div>
                  <div className="field"><label>CreateDate</label><InputText value={formatarData(clienteEditando.createDate)} disabled /></div>
                  <div className="field"><label>UpdateDate</label><InputText value={formatarData(clienteEditando.updateDate)} disabled /></div>
                </div>
              </TabPanel>

              <TabPanel header="Dados Bancários">
                <div className="cliente-form-grid">
                  <div className="field field-span-2"><label>Nome Conta</label><InputText value={clienteEditando.nomeConta} onChange={(e) => updateClienteEditando('nomeConta', e.target.value)} /></div>
                  <div className="field"><label>Número Banco</label><InputText value={clienteEditando.numeroBanco} onChange={(e) => updateClienteEditando('numeroBanco', e.target.value)} disabled /></div>
                  <div className="field"><label>Nome Banco</label><Dropdown value={clienteEditando.nomeBanco} options={bancoOptions} onChange={(e) => handleSelecionarBancoEdicao(e.value)} /></div>
                  <div className="field"><label>Agência</label><InputText value={clienteEditando.agencia} onChange={(e) => updateClienteEditando('agencia', formatarAgencia(e.target.value))} /></div>
                  <div className="field"><label>Tipo da Conta</label><Dropdown value={clienteEditando.tipoConta} options={tipoContaOptions} onChange={(e) => updateClienteEditando('tipoConta', e.value)} /></div>
                  <div className="field"><label>Número da Conta</label><InputText value={clienteEditando.numeroConta} onChange={(e) => updateClienteEditando('numeroConta', formatarConta(e.target.value))} /></div>
                  <div className="field"><label>Chave Pix</label><InputText value={clienteEditando.chavePix} onChange={(e) => updateClienteEditando('chavePix', e.target.value)} /></div>
                  <div className="field"><label>CreateDate</label><InputText value={formatarData(clienteEditando.createDate)} disabled /></div>
                  <div className="field"><label>UpdateDate</label><InputText value={formatarData(clienteEditando.updateDate)} disabled /></div>
                </div>
              </TabPanel>

              <TabPanel header="Base Orçamento">
                {renderBaseOrcamentoTabContent()}
              </TabPanel>
            </TabView>
          </fieldset>
        )}

        {/* Dialog Assinatura */}
        <Dialog
          header="Criar Assinatura"
          visible={assinaturaDialogVisible}
          style={{ width: '500px' }}
          modal
          onHide={() => setAssinaturaDialogVisible(false)}
        >
          <div className="assinatura-dialog-body">
            <p>Assine no campo abaixo usando o mouse ou touchscreen.</p>
            <canvas
              ref={canvasRef}
              width={460}
              height={200}
              className="assinatura-canvas"
              onMouseDown={iniciarDesenho}
              onMouseMove={desenhar}
              onMouseUp={pararDesenho}
              onMouseLeave={pararDesenho}
            />
            <div className="assinatura-dialog-actions">
              <Button label="Limpar" icon="pi pi-trash" outlined severity="danger" onClick={limparAssinatura} />
              <Button label="Salvar Assinatura" icon="pi pi-check" onClick={salvarAssinatura} />
            </div>
          </div>
        </Dialog>

        <Dialog
          header={previewNome || 'Visualizar arquivo'}
          visible={previewVisible}
          style={{ width: '85vw', maxWidth: '1100px' }}
          modal
          onHide={() => setPreviewVisible(false)}
        >
          {previewTipo === 'pdf' && (
            <iframe src={previewUrl} title={previewNome} className="preview-iframe" />
          )}

          {previewTipo === 'image' && (
            <img src={previewUrl} alt={previewNome} className="preview-image" />
          )}

          {previewTipo === 'other' && (
            <div className="preview-other">
              <Button type="button" label="Abrir arquivo" icon="pi pi-external-link" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')} />
            </div>
          )}
        </Dialog>

        <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setEditDialogVisible(false)} />
          {!readOnly && <Button label="Salvar" icon="pi pi-check" onClick={handleSalvarEdicao} />}
        </div>
      </Dialog>

      <AreaDoCliente
        medicoId={areaCliente?.id ?? null}
        nome={areaCliente?.nome}
        aberto={!!areaCliente}
        aoFechar={() => setAreaCliente(null)}
      />
    </div>
  );
}
