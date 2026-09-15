import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type { DataTableFilterMeta, DataTablePageEvent, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { FilterMatchMode } from 'primereact/api';
import html2canvas from 'html2canvas';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getOrcamentoMedico, getOrders, salvarOrcamentoMedico, getAnexosOrder, uploadAnexoOrder, getMedicosCompleto, aplicarStatusOrcamentoManual, trocarMedicoOrcamento } from '../../services/api/orders';
import { getBaseOrcamento, getStatusOrcamentoPersonalizado, criarStatusOrcamentoPersonalizado } from '../../services/api/client';
import { getStatusTagStyle } from '../../utils/statusTag';
import { EnviarOrcamentoDialog } from './EnviarOrcamentoDialog';
import { useAccess } from '../../access/AccessContext';
import './OrcamentoMedicoPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { ContadorRegistros, contarPorCampo } from '../../components/ContadorRegistros/ContadorRegistros';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, tagTipoPaciente, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, colunaOrigem } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';

// Meta desta fase (orçamento) — espelha backend/funil.py FASES['orcamento'].meta_dias.
// "96 horas — é o prazo que sustenta o contrato com o Estado".
const SLA_META_DIAS_ORCAMENTO = 4;

GlobalWorkerOptions.workerSrc = pdfWorker;
void useRef;
void InputNumber;
void html2canvas;
void getDocument;
void uploadAnexoOrder;
void getBaseOrcamento;

interface ProcessoOrcamento {
  id: number;
  paciente: string;
  dataNascimento: string | null;
  idade: number;
  procedimento: string;
  area: string;
  subarea: string;
  refPreco: number;
  dataStatusJuridico: string | null;
  dias: number;
  statusJuridico: string | null;
  statusOrcamento: string;
  solicitacao: string;
  emailRemetente?: string | null;
  emailCopia?: string | null;
  emailData?: string | null;
  orcamentosJuridico: string | null;
  qtdAnexos?: number;
  medicoId?: number;
  idMedico?: number;
  medico_id?: number;
  nomeMedico?: string;
  hospital?: string;
}

interface ProcessoOrcamentoRow extends ProcessoOrcamento { sequencial: number; }
interface OrderLookup extends Record<string, any> { id: number; }

interface Anexo {
  id: number
  linkImagem: string
  tipo: string
  createDate: string
}

function calcularIdade(dataNascimento: string | null): number {
  if (!dataNascimento) return 0;
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}


export function OrcamentoMedicoPage() {
  // @R 28/08 03:37: painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('orcamentoMedico');
  const [loading, setLoading] = useState(false);
  const [processos, setProcessos] = useState<ProcessoOrcamento[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [anexosEmail, setAnexosEmail] = useState<Anexo[]>([])
  const [escolhaVisible, setEscolhaVisible] = useState(false)
  const [medicos, setMedicos] = useState<any[]>([])

  // dialogs
  const [detalheVisible, setDetalheVisible] = useState(false);
  const [examesVisible, setExamesVisible] = useState(false);
  // Perda desta fase (task #233 — "toda fase tem que ter como darmos perda e
  // escolhermos e confirmarmos"): antes era um confirm() nativo sem motivo.
  const [naoFacoVisible, setNaoFacoVisible] = useState(false);
  const [motivoNaoFaco, setMotivoNaoFaco] = useState<string | null>('MEDICO_RECUSOU');
  const [parecerNaoFaco, setParecerNaoFaco] = useState('');
  const [salvandoNaoFaco, setSalvandoNaoFaco] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoOrcamentoRow | null>(null);
  const [ordersLookup, setOrdersLookup] = useState<Record<number, OrderLookup>>({});
  const [exames, setExames] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
  const [previewNome, setPreviewNome] = useState('');
  const [cobrancaVisible, setCobrancaVisible] = useState(false);

  // status manual (etiqueta livre) + troca de médico — 26/08
  const [statusPersonalizados, setStatusPersonalizados] = useState<{ id: number; nome: string }[]>([]);
  const [novoStatusVisible, setNovoStatusVisible] = useState(false);
  const [novoStatusNome, setNovoStatusNome] = useState('');
  const [statusManualSelecionado, setStatusManualSelecionado] = useState<string | null>(null);
  const [aplicandoStatusManual, setAplicandoStatusManual] = useState(false);
  const [trocarMedicoVisible, setTrocarMedicoVisible] = useState(false);
  const [novoMedicoId, setNovoMedicoId] = useState<number | null>(null);
  const [trocandoMedico, setTrocandoMedico] = useState(false);

  const carregarStatusPersonalizados = () => {
    getStatusOrcamentoPersonalizado()
      .then((res: any) => setStatusPersonalizados(res.data))
      .catch(() => setStatusPersonalizados([]));
  };
  useEffect(() => { carregarStatusPersonalizados(); }, []);


  const colunasCfg = useColunasVisiveis('orcamento-medico');


  const [filters, setFilters] = useState<DataTableFilterMeta>({
    ...FILTRO_PAGAMENTO,   // @R 28/08: pedir cotação para caso JÁ PAGO é trabalho perdido
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    idade: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: null, matchMode: FilterMatchMode.EQUALS },
    area: { value: '', matchMode: FilterMatchMode.CONTAINS },
    subarea: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dataStatusJuridico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: '', matchMode: FilterMatchMode.CONTAINS },
    statusOrcamento: { value: null, matchMode: FilterMatchMode.EQUALS },
  });

  const [visibleProcessos, setVisibleProcessos] = useState<typeof dataComMedico>([]);

  const carregarDados = () => {
    setLoading(true);
    Promise.all([getOrcamentoMedico(), getOrders(), getMedicosCompleto()])
      .then(([orcamentoResponse, ordersResponse, medicosResponse]) => {
        const ordersIndex = (ordersResponse.data as OrderLookup[]).reduce<Record<number, OrderLookup>>((acc, order) => {
          acc[order.id] = order;
          return acc;
        }, {});

        setOrdersLookup(ordersIndex);
        setMedicos(medicosResponse.data);
        console.log('[OrcamentoMedicoPage] orders lookup carregado', ordersIndex);

        setProcessos(orcamentoResponse.data.map((o: any) => ({
          ...o,
          idade: calcularIdade(o.dataNascimento),
        })));
      })
      .catch((err) => console.error('[OrcamentoMedicoPage] erro ao carregar orçamentos/orders', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregarDados(); }, []);

  const dataComSequencial = useMemo<ProcessoOrcamentoRow[]>(() => {
    return processos.map((item, index) => ({ ...item, sequencial: index + 1 }));
  }, [processos]);

  const dataComMedico = useMemo(() => {
    return dataComSequencial.map((item) => {
      const orderLookup = ordersLookup[item.id];
      const medicoId = item.idMedico ?? item.medicoId ?? item.medico_id ?? orderLookup?.idMedico ?? orderLookup?.medicoId ?? null;
      const medicoSelecionado = medicos.find((medico: any) => medico.id === medicoId);
      const medicoNome = medicoSelecionado?.nomeSistema ?? '';
      return {
        ...item,
        medico: item.nomeMedico ?? orderLookup?.nomeMedico ?? orderLookup?.medico ?? medicoNome,
        hospital: item.hospital ?? orderLookup?.hospital ?? medicoSelecionado?.hospital ?? '',
        nomeHospital: orderLookup?.nomeHospital ?? medicoSelecionado?.hospital ?? '',
      };
    });
  }, [dataComSequencial, ordersLookup, medicos]);

  useEffect(() => { setVisibleProcessos(dataComMedico); }, [dataComMedico]);

  const statusOrcamentoOptions = useMemo(() => {
    const doDado = processos.map((item) => item.statusOrcamento).filter(Boolean) as string[];
    const cadastrados = statusPersonalizados.map((s) => s.nome);
    return Array.from(new Set([...doDado, ...cadastrados]))
      .map((status) => ({ label: status, value: status }));
  }, [processos, statusPersonalizados]);

  const medicosOptions = useMemo(() => {
    return Array.from(new Set(dataComMedico.map((item) => item.medico).filter(Boolean)))
      .map((medico) => ({ label: medico, value: medico }));
  }, [dataComMedico]);

  const cobrancasPorMedico = useMemo(() => {
    const lookup = new Map<string, ProcessoOrcamentoRow[]>();

    dataComMedico.forEach((item) => {
      const medicoNome = (item.medico ?? '').trim();
      if (!medicoNome || medicoNome.toUpperCase() === 'SEM PROFISSIONAL') {
        return;
      }

      const atual = lookup.get(medicoNome) ?? [];
      atual.push(item);
      lookup.set(medicoNome, atual);
    });

    return Array.from(lookup.entries())
      .map(([medico, itens]) => ({
        medico,
        total: itens.length,
        especialidades: new Set(itens.map((item) => item.area).filter(Boolean)).size,
        itens: [...itens].sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0)),
      }))
      .sort((a, b) => a.medico.localeCompare(b.medico, 'pt-BR'));
  }, [dataComMedico]);

  const kpis = useMemo(() => {
    const total = visibleProcessos.length;
    const soma = visibleProcessos.reduce((acc, p) => acc + (p.refPreco ?? 0), 0);
    const valorMedio = total > 0 ? soma / total : 0;
    const maisAntigo = total > 0 ? Math.max(...visibleProcessos.map(p => p.dias)) : 0;
    return { total, valorMedio, maisAntigo };
  }, [visibleProcessos]);

  const formatarData = (data: string | null) => {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const formatarDataHora = (isoStr?: string | null) => {
    if (!isoStr) return 'Não capturado (pedido anterior a esta funcionalidade)';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return 'Não capturado (pedido anterior a esta funcionalidade)';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

const abrirDetalhe = (rowData: ProcessoOrcamentoRow) => {
  setProcessoSelecionado(rowData);
  setDetalheVisible(true);

  setAnexos([])
  setLoadingAnexos(true)
  getAnexosOrder(rowData.id, 'RELATORIO')
    .then((res: any) => setAnexos(res.data.anexos))
    .catch(() => setAnexos([]))
    .finally(() => setLoadingAnexos(false))

  setAnexosEmail([])
  getAnexosOrder(rowData.id, 'EMAIL_ORIGINAL')
    .then((res: any) => setAnexosEmail(res.data.anexos))
    .catch(() => setAnexosEmail([]))
};

  const handleSolicitarExames = async () => {
    if (!processoSelecionado) return;
    try {
      await salvarOrcamentoMedico(processoSelecionado.id, {
        acao: 'solicitar_exames',
        exames,
      });
      setExamesVisible(false);
      setDetalheVisible(false);
      carregarDados();
    } catch (err) {
      alert('Erro ao solicitar exames.');
    }
  };

  const handleNaoFaco = async () => {
    if (!processoSelecionado) return;
    if (!parecerNaoFaco.trim()) {
      alert('Escreva o motivo da perda (obrigatório).');
      return;
    }
    setSalvandoNaoFaco(true);
    try {
      await salvarOrcamentoMedico(processoSelecionado.id, {
        acao: 'nao_faco',
        motivoPerdaCategoria: motivoNaoFaco,
        parecer: parecerNaoFaco,
      });
      setNaoFacoVisible(false);
      setDetalheVisible(false);
      setParecerNaoFaco('');
      carregarDados();
    } catch (err) {
      alert('Erro ao registrar perda.');
    } finally {
      setSalvandoNaoFaco(false);
    }
  };

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder} className="p-column-filter"
    />
  );

  const dropdownFilterElement = (options: any, filterOptions: { label: string; value: string }[], placeholder = 'Selecione') => (
    <Dropdown
      value={options.value ?? null}
      options={filterOptions}
      onChange={(e: any) => options.filterApplyCallback(e.value)}
      placeholder={placeholder}
      showClear
      className="p-column-filter"
    />
  );

  // Status: mesmo dropdown + "+" pra cadastrar etiqueta nova sem sair da tabela
  // (mandato @R 26/08 "cadastro rápido de novos status aqui para a fase").
  const statusFilterElement = (options: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {dropdownFilterElement(options, statusOrcamentoOptions)}
      <Button
        type="button" icon="pi pi-plus" text rounded severity="secondary"
        aria-label="Cadastrar novo status"
        tooltip="Cadastrar novo status" tooltipOptions={{ position: 'top' }}
        onClick={() => { setNovoStatusNome(''); setNovoStatusVisible(true); }}
        style={{ width: '2.1rem', height: '2.1rem', flexShrink: 0 }}
      />
    </div>
  );

  const handleCriarStatusPersonalizado = async () => {
    const nome = novoStatusNome.trim();
    if (!nome) return;
    try {
      await criarStatusOrcamentoPersonalizado(nome);
      setNovoStatusVisible(false);
      carregarStatusPersonalizados();
    } catch (err: any) {
      alert(err?.response?.data?.nome?.[0] || err?.response?.data?.error || 'Erro ao cadastrar status.');
    }
  };

  const handleAplicarStatusManual = async () => {
    if (!processoSelecionado || !statusManualSelecionado) return;
    setAplicandoStatusManual(true);
    try {
      await aplicarStatusOrcamentoManual(processoSelecionado.id, statusManualSelecionado);
      setDetalheVisible(false);
      await carregarDados();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao aplicar status.');
    } finally {
      setAplicandoStatusManual(false);
    }
  };

  const handleTrocarMedico = async () => {
    if (!processoSelecionado || !novoMedicoId) return;
    setTrocandoMedico(true);
    try {
      await trocarMedicoOrcamento(processoSelecionado.id, novoMedicoId);
      setTrocarMedicoVisible(false);
      setDetalheVisible(false);
      await carregarDados();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao trocar o médico.');
    } finally {
      setTrocandoMedico(false);
    }
  };


const copiarParaWhatsapp = async (rowData: ProcessoOrcamentoRow) => {
  let linhasAnexos = 'Nenhum anexo'
  try {
    const res: any = await getAnexosOrder(rowData.id, 'RELATORIO')
    const listaAnexos: any[] = res.data.anexos
    if (listaAnexos.length > 0) {
      linhasAnexos = listaAnexos
        .map((a: any, index: number) => `Anexo ${index + 1}\n${a.linkImagem}`)
        .join('\n')
    }
  } catch {
    linhasAnexos = 'Erro ao carregar anexos'
  }

  const hoje = new Date()
  const dataRef = rowData.dataStatusJuridico
    ? new Date(rowData.dataStatusJuridico + 'T00:00:00')
    : null
  const diasEmAberto = dataRef
    ? Math.max(0, Math.floor((hoje.getTime() - dataRef.getTime()) / (1000 * 60 * 60 * 24)))
    : rowData.dias

  const orcamentos = rowData.orcamentosJuridico?.trim() || 'Nenhum orçamento registrado'

  const texto = `[#] SOLICITAÇÃO DE ORÇAMENTO
----------------------------------------
Paciente: ${rowData.paciente}
Idade: ${rowData.idade}
Procedimento: ${rowData.procedimento}
Área: ${rowData.area}
Subárea: ${rowData.subarea}
Data Solicitação: ${formatarData(rowData.dataStatusJuridico)}
Status: ${rowData.statusOrcamento}
Dias em Aberto: ${diasEmAberto} dias
Orçamentos:
${orcamentos}
Anexos:
${linhasAnexos}
----------------------------------------`

  const copiar = async (texto: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = texto
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  try {
    await copiar(texto)
    alert('Copiado! Cole no WhatsApp.')
  } catch {
    alert('Não foi possível copiar.')
  }
}

const copiarTexto = async (texto: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto)
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = texto
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

const gerarTextoCobranca = async (medico: string, itens: ProcessoOrcamentoRow[]) => {
  const totalEspecialidades = new Set(itens.map((item) => item.area).filter(Boolean)).size
  const agrupado = itens.reduce<Record<string, Record<string, ProcessoOrcamentoRow[]>>>((acc, item) => {
    const area = item.area?.trim() || 'SEM ÁREA'
    const subarea = item.subarea?.trim() || 'Sem subárea'
    acc[area] = acc[area] || {}
    acc[area][subarea] = acc[area][subarea] || []
    acc[area][subarea].push(item)
    return acc
  }, {})

  let contador = 1
  const blocos = Object.entries(agrupado).map(([area, subareas]) => {
    const subareaTexto = Object.entries(subareas).map(([subarea, registros]) => {
      const linhas = registros.map((registro) => {
        const linha = `     ${contador}. *${registro.paciente}* [~]1
        [D] ${formatarData(registro.dataStatusJuridico)} - ${registro.dias} dias
        [P] ${registro.procedimento}`
        contador += 1
        return linha
      }).join('\n')

      return `  └ _${subarea}_ (${registros.length} orçamento${registros.length > 1 ? 's' : ''})
${linhas}`
    }).join('\n')

    return `[${area.toUpperCase()}] *${area}*
${subareaTexto}`
  }).join('\n\n')

  const texto = `[#] *COBRANCA - ORCAMENTOS PENDENTES*

[MED] *Medico: ${medico}*

[G] Total: *${itens.length} orcamento${itens.length > 1 ? 's' : ''}* em ${totalEspecialidades} especialidade${totalEspecialidades > 1 ? 's' : ''}

--------------------

${blocos}

--------------------
[!] *Por favor, providenciar envio dos orcamentos!*
[TEL] Qualquer duvida, entrar em contato com a equipe G4Med.`

  try {
    await copiarTexto(texto)
    alert('Cobrança copiada! Cole no WhatsApp.')
  } catch {
    alert('Não foi possível copiar a cobrança.')
  }
}

  return (
    <div className="orcamento-medico-page">
      <PrimeiraVisitaInfo etapaId="orcamento-medico" />
      <div className="page-header">
        <CabecalhoFase nome="Orçamento Médico" screen="orcamentoMedico" slaDias={SLA_META_DIAS_ORCAMENTO}
          subtitulo="Processos aguardando orçamento do médico" />
        <div className="page-actions">
          <Button
            label="Cobrança"
            icon="pi pi-whatsapp"
            outlined
            onClick={() => setCobrancaVisible(true)}
          />
        </div>
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header"><span>Quantidade de Processos</span><i className="pi pi-list" /></div>
          <div className="kpi-value">{kpis.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header"><span>Valor Médio dos Processos</span><i className="pi pi-dollar" /></div>
          <div className="kpi-value">{formatarMoeda(kpis.valorMedio)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header"><span>Processo mais antigo em dias</span><i className="pi pi-clock" /></div>
          <div className="kpi-value">{kpis.maisAntigo}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo">
          <i className="pi pi-table" />Pedidos aguardando orçamento médico
          {/* Diz quantos são e em que fase estão (task #208): a tela mostrar 16 estava
              CERTO, mas sem o contador o número virava dúvida ("cadê os outros?"). */}
          <ContadorRegistros
            total={dataComMedico.length}
            visiveis={visibleProcessos.length}
            substantivo="pedidos"
            fases={contarPorCampo(
              visibleProcessos,
              (p) => p.statusOrcamento,
              { 'Solicitado ao Medico': 'ok', 'Solicitar Exames': 'atencao' },
            )}
          />
        </h2>
          <AcoesTabela>
            <BotaoExportarExcel todos={dataComMedico} visiveis={visibleProcessos} nome="orcamento-medico" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Pedidos aguardando orçamento médico"
          value={dataComMedico} dataKey="id" paginator rowsPerPageOptions={[10, 20, 50, 100, 200]} rows={rows} first={first}
          onValueChange={(value) => setVisibleProcessos(value as typeof dataComMedico)}
          rowClassName={(r: any) => [((rowData: { dias: number }) =>
            rowData.dias > SLA_META_DIAS_ORCAMENTO ? 'linha-fora-sla' : ''
          )(r), rowClassRepedido(r)].filter(Boolean).join(' ')}
          onPage={(e: DataTablePageEvent) => { setFirst(e.first); setRows(e.rows); }}
          sortField={sortField} sortOrder={sortOrder}
          onSort={(e: DataTableSortEvent) => { setSortField(e.sortField); setSortOrder(e.sortOrder); }}
          filters={filters} onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row" loading={loading}
          emptyMessage="Nenhum processo aguardando orçamento."
          className="orcamento-table"
        >          {colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column field="sequencial" header="#" style={{ minWidth: '4rem' }}  frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{(((rowData: any) => (
              <Button label="Abrir" icon="pi pi-folder-open" outlined severity="secondary"
                onClick={() => abrirDetalhe(rowData)} />
            )) as any)(r)}{(((rowData: any) => (
                <Button
                  label="Copiar"
                  icon="pi pi-copy"
                  outlined
                  severity="secondary"
                  onClick={() => copiarParaWhatsapp(rowData)}
                />
              )) as any)(r)}</>, excluir: carregarDados })}
          <Column field="paciente" header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')} filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '16rem' }}
            body={(r: ProcessoOrcamentoRow) => (
              <span className="orcamento-paciente-cel">
                {nomeComCopiar(r.paciente)}
              </span>
            )}  frozen alignFrozen="left" />
          {colunaOrigem()}
          {colunaRepedido()}
          <Column field="idade" header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')} sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '7rem' }} />
          <Column field="tipoPaciente" header={cabecalhoComHint('Tipo', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')} sortable style={{ minWidth: '7rem' }}
            body={(r: any) => tagTipoPaciente(r.tipoPaciente)} />
          <Column field="procedimento" className="col-procedimento-upper" header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')} sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '18rem' }} />
          <Column field="area" header="Área" sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '10rem' }} />
          <Column field="medico" header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')} sortable filter
            filterElement={(o) => dropdownFilterElement(o, medicosOptions)} style={{ minWidth: '14rem' }} />
          <Column field="dataStatusJuridico" header="Data Solicitação"
            body={(r) => formatarData(r.dataStatusJuridico)} sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '12rem' }} />
          <Column field="dias" header="Dias em Aberto" sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '10rem' }} />
          <Column field="statusOrcamento" header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            body={(r) => <Tag value={r.statusOrcamento} style={getStatusTagStyle(r.statusOrcamento)} className="status-tag-custom" />}
            filter
            showFilterMenu={false}
            filterElement={statusFilterElement}
            style={{ minWidth: '15rem' }} />
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
      </div>

      {/* Dialog Detalhe */}
      <Dialog header="Detalhes do Processo" visible={detalheVisible}
        style={{ width: '70rem', maxWidth: '96vw' }} modal
        onHide={() => setDetalheVisible(false)} className="orcamento-edit-dialog">
        {processoSelecionado && (
          <div className="orcamento-form-grid">
            <div className="field field-span-3">
              <label>Paciente</label>
              <InputText value={processoSelecionado.paciente} readOnly />
            </div>
            <div className="field field-span-1">
              <label>Idade</label>
              <InputText value={String(processoSelecionado.idade)} readOnly />
            </div>
            <div className="field field-span-4">
              <label>Procedimento</label>
              <InputText value={processoSelecionado.procedimento} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Área</label>
              <InputText value={processoSelecionado.area} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Subárea</label>
              <InputText value={processoSelecionado.subarea} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Data da Solicitação</label>
              <InputText value={formatarData(processoSelecionado.dataStatusJuridico)} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Dias em Aberto</label>
              <InputText value={String(processoSelecionado.dias)} readOnly />
            </div>

            {processoSelecionado.solicitacao && (
              <div className="field field-span-4">
                <label>Solicitação (corpo do e-mail)</label>
                <InputTextarea value={processoSelecionado.solicitacao} rows={4} readOnly autoResize />
              </div>
            )}

            {(processoSelecionado.emailRemetente || processoSelecionado.emailCopia || processoSelecionado.emailData) && (
              <>
                <div className="field field-span-2">
                  <label>Remetente</label>
                  <InputText value={processoSelecionado.emailRemetente || '-'} readOnly />
                </div>
                <div className="field field-span-2">
                  <label>Recebido em</label>
                  <InputText value={formatarDataHora(processoSelecionado.emailData)} readOnly />
                </div>
                {processoSelecionado.emailCopia && (
                  <div className="field field-span-4">
                    <label>Com cópia (CC)</label>
                    <InputText value={processoSelecionado.emailCopia} readOnly />
                  </div>
                )}
              </>
            )}

            {anexosEmail.length > 0 && (
              <div className="field field-span-4">
                <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                  <i className="pi pi-envelope" style={{ marginRight: '6px' }} />
                  E-mail original (com assinatura/imagens) — para anexar ao processo
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {anexosEmail.map((anexo) => {
                    const ehHtml = anexo.linkImagem.toLowerCase().endsWith('.html');
                    return (
                      <button
                        key={anexo.id}
                        type="button"
                        onClick={() => window.open(anexo.linkImagem, '_blank', 'noopener,noreferrer')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 12px', borderRadius: '8px',
                          border: '1px solid var(--mc-border, #e5e7eb)', background: 'transparent',
                          color: 'var(--mc-ink, #374151)', fontSize: '0.9rem', width: '100%', cursor: 'pointer',
                        }}
                      >
                        <i className={ehHtml ? 'pi pi-eye' : 'pi pi-download'} style={{ fontSize: '1.1rem', color: 'var(--mc-navy-700, #0a3d62)' }} />
                        <span style={{ flex: 1 }}>{ehHtml ? 'Ver e-mail completo (com imagens)' : 'Baixar e-mail original (.eml)'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {processoSelecionado.orcamentosJuridico && (
              <div className="field field-span-4">
                <label>Orçamentos (Jurídico)</label>
                <InputTextarea value={processoSelecionado.orcamentosJuridico} rows={3} readOnly autoResize />
              </div>
            )}

            {/* Anexos */}
            <div className="field field-span-4">
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
                    const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
                      ? 'pdf'
                      : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                        ? 'imagem'
                        : 'outro'

                    return (
                        <button
                        key={anexo.id}
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
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        onClick={() => abrirPreview(anexo.linkImagem, nomeArquivo, tipo)}
                      >
                        <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                        <span style={{ flex: 1 }}>{nomeArquivo}</span>
                        <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="field field-span-4 action-buttons">
              {!readOnly && <Button
                label="Enviar Orçamento"
                icon="pi pi-send"
                onClick={() => setEscolhaVisible(true)}
              />}
              {!readOnly && <Button label="Solicitar Exames" icon="pi pi-search"
                severity="warning" outlined
                onClick={() => { setExames(''); setExamesVisible(true); }} />}
              {!readOnly && <Button label="Não faço esse procedimento" icon="pi pi-times"
                severity="danger" outlined
                onClick={() => { setMotivoNaoFaco('MEDICO_RECUSOU'); setParecerNaoFaco(''); setNaoFacoVisible(true); }} />
              }
              {!readOnly && <Button label="Trocar médico" icon="pi pi-user-edit"
                severity="secondary" outlined
                onClick={() => { setNovoMedicoId(null); setTrocarMedicoVisible(true); }} />
              }
            </div>

            {!readOnly && (
              <div className="field field-span-4" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label>Marcar status manual (etiqueta — não dispara ação)</label>
                  <Dropdown
                    value={statusManualSelecionado}
                    options={statusOrcamentoOptions}
                    onChange={(e) => setStatusManualSelecionado(e.value)}
                    placeholder="Selecione um status cadastrado"
                    showClear
                    style={{ width: '100%' }}
                  />
                </div>
                <Button
                  label="Aplicar" icon="pi pi-tag" outlined
                  disabled={!statusManualSelecionado} loading={aplicandoStatusManual}
                  onClick={handleAplicarStatusManual}
                />
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Cadastro rápido de status personalizado */}
      <Dialog header="Novo status" visible={novoStatusVisible} style={{ width: '28rem', maxWidth: '96vw' }} onHide={() => setNovoStatusVisible(false)} modal>
        <div className="field">
          <label>Nome do status</label>
          <InputText
            value={novoStatusNome}
            onChange={(e) => setNovoStatusNome(e.target.value)}
            placeholder="Ex.: Aguardando retorno do médico"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCriarStatusPersonalizado(); }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button label="Cancelar" text onClick={() => setNovoStatusVisible(false)} />
          <Button label="Cadastrar" icon="pi pi-check" disabled={!novoStatusNome.trim()} onClick={handleCriarStatusPersonalizado} />
        </div>
      </Dialog>

      {/* Trocar médico do pedido */}
      <Dialog header="Trocar médico" visible={trocarMedicoVisible} style={{ width: '28rem', maxWidth: '96vw' }} onHide={() => setTrocarMedicoVisible(false)} modal>
        <div className="field">
          <label>Novo médico</label>
          <Dropdown
            value={novoMedicoId}
            options={medicos.map((m: any) => ({ label: m.nomeSistema || m.nomeCompleto, value: m.id }))}
            onChange={(e) => setNovoMedicoId(e.value)}
            placeholder="Selecione o médico"
            filter
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button label="Cancelar" text onClick={() => setTrocarMedicoVisible(false)} />
          <Button label="Confirmar" icon="pi pi-check" disabled={!novoMedicoId} loading={trocandoMedico} onClick={handleTrocarMedico} />
        </div>
      </Dialog>

      <EnviarOrcamentoDialog
        visible={escolhaVisible && !readOnly}
        processo={processoSelecionado}
        orderLookup={processoSelecionado ? ordersLookup[processoSelecionado.id] : null}
        onHide={() => setEscolhaVisible(false)}
        onSuccess={async () => {
          // Teste local 15/09: o orçamento era gravado (201) mas o pedido continuava na lista — o
          // recarregamento passa por getOrders (/orders/listar/, medido 23 s e 2,9 MB). O pedido que
          // saiu desta fase some da tabela NA HORA; o recarregamento completo segue em segundo plano.
          const idEnviado = processoSelecionado?.id;
          setDetalheVisible(false);
          if (idEnviado) setProcessos((atual) => atual.filter((p) => p.id !== idEnviado));
          void carregarDados();
        }}
      />

      {/* Dialog Exames */}
      <Dialog header="Solicitar Exames" visible={examesVisible}
        style={{ width: '60rem', maxWidth: '96vw' }} modal
        onHide={() => setExamesVisible(false)}>
        <div className="field">
          <label>Descreva os exames necessários</label>
          <InputTextarea
            value={exames}
            onChange={(e) => setExames(e.target.value)}
            rows={6} autoResize
            placeholder="Liste os exames necessários..."
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>
        {!readOnly && <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setExamesVisible(false)} />
          <Button label="Solicitar" icon="pi pi-check" onClick={handleSolicitarExames} />
        </div>}
      </Dialog>

      {/* Dialog Não faço (perda desta fase, task #233) — motivo + parecer, mesmo
          padrão exigido em toda outra tela (¬mais confirm() nativo cego). */}
      <Dialog header="Não faço esse procedimento" visible={naoFacoVisible}
        style={{ width: '60rem', maxWidth: '96vw' }} modal
        onHide={() => setNaoFacoVisible(false)}>
        <div className="field">
          <label>Motivo (opcional — o parecer continua obrigatório)</label>
          <Dropdown value={motivoNaoFaco} onChange={(e) => setMotivoNaoFaco(e.value)}
            options={[
              { label: 'O médico recusou o pedido', value: 'MEDICO_RECUSOU' },
              { label: 'Não conseguimos o orçamento', value: 'ORCAMENTO_NAO_OBTIDO' },
              { label: 'Orçamento não chegou em tempo hábil', value: 'ORCAMENTO_FORA_DO_PRAZO' },
              { label: 'Sem exames — médico não quis cotar', value: 'SEM_EXAMES' },
              { label: 'Perda por segredo de justiça', value: 'SEGREDO_DE_JUSTICA' },
              { label: 'Outro (ver justificativa)', value: 'OUTRO' },
            ]}
            placeholder="Escolha, se algum se aplicar" showClear style={{ width: '100%', marginTop: '8px' }} />
        </div>
        <div className="field" style={{ marginTop: '12px' }}>
          <label>Motivo da perda <span style={{ color: '#ef4444' }}>*obrigatório</span></label>
          <InputTextarea
            value={parecerNaoFaco}
            onChange={(e) => setParecerNaoFaco(e.target.value)}
            rows={4} autoResize
            placeholder="Descreva com suas palavras por que este pedido não segue..."
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>
        <div className="dialog-footer-actions" style={{ marginTop: '16px' }}>
          <Button label="Cancelar" outlined onClick={() => setNaoFacoVisible(false)} />
          <Button label="Confirmar perda" icon="pi pi-check" severity="danger"
            loading={salvandoNaoFaco} disabled={salvandoNaoFaco || !parecerNaoFaco.trim()}
            onClick={handleNaoFaco} />
        </div>
      </Dialog>

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
              style={{ textDecoration: 'none' }}
            >
              <Button label="Baixar" icon="pi pi-download" outlined />
            </a>
            <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
          </div>
        }
      >
        <div style={{ height: 'calc(90vh - 160px)' }}>
          {previewTipo === 'pdf' && (
            <iframe
              src={previewUrl}
              title={previewNome}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
            />
          )}

          {previewTipo === 'imagem' && (
            <div style={{ width: '100%', height: '100%', overflow: 'auto', textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt={previewNome}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          )}

          {previewTipo === 'outro' && (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <i className="pi pi-file" style={{ fontSize: '2rem', color: '#9ca3af', marginBottom: '12px' }} />
                <p style={{ marginBottom: '12px' }}>Visualização não disponível para este tipo de arquivo.</p>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" download>
                  Baixar arquivo
                </a>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        header="Cobrança de Orçamentos Pendentes"
        visible={cobrancaVisible}
        style={{ width: '52rem', maxWidth: '96vw' }}
        modal
        onHide={() => setCobrancaVisible(false)}
        className="orcamento-cobranca-dialog"
      >
        <div className="orcamento-cobranca-list">
          {cobrancasPorMedico.length === 0 && (
            <div className="orcamento-cobranca-empty">
              Nenhum médico com orçamento pendente para cobrança.
            </div>
          )}

          {cobrancasPorMedico.map((grupo) => (
            <div key={grupo.medico} className="orcamento-cobranca-card">
              <div className="orcamento-cobranca-card__info">
                <strong>{grupo.medico}</strong>
                <span>
                  {grupo.total} orçamento{grupo.total > 1 ? 's' : ''} pendente{grupo.total > 1 ? 's' : ''} em {grupo.especialidades} especialidade{grupo.especialidades > 1 ? 's' : ''}
                </span>
              </div>
              <Button
                label="Gerar cobrança"
                icon="pi pi-copy"
                onClick={() => void gerarTextoCobranca(grupo.medico, grupo.itens)}
              />
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}


