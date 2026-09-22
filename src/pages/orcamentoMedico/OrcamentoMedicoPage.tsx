import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { KpisValorEUrgencia } from '../../components/PainelKpis/kpisValorUrgencia';
import { CelulaMedico } from '../../components/TrocarMedico/CelulaMedico';
import { CelulaCotacaoConcorrente, DialogCotacaoConcorrente } from '../../components/CotacaoConcorrente/CotacaoConcorrente';
import { FaixaDaPeca } from '../../components/CotacaoConcorrente/FaixaDaPeca';
import { registrarCotacaoPedida, montarCotacaoMedico, darPerdaNoOrcamento } from '../../services/api/orders';
import { DialogoCopiarPedido, type PedidoParaCopiar } from './DialogoCopiarPedido';
import type { DataTableFilterMeta, DataTablePageEvent, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Dialog } from 'primereact/dialog';
import { PreviaEmailSes } from '../../components/PreviaEmailSes/PreviaEmailSes';
import { Dropdown } from 'primereact/dropdown';
import ListagemPorMedico from './ListagemPorMedico';
import { FilterMatchMode } from 'primereact/api';
import html2canvas from 'html2canvas';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { atualizarOrder, getOrcamentoMedico, salvarOrcamentoMedico, getAnexosOrder, uploadAnexoOrder, getMedicosCompleto, aplicarStatusOrcamentoManual, trocarMedicoOrcamento } from '../../services/api/orders';
import { getBaseOrcamento, getStatusOrcamentoPersonalizado, criarStatusOrcamentoPersonalizado } from '../../services/api/client';
import { getStatusTagStyle } from '../../utils/statusTag';
import { EnviarOrcamentoDialog } from './EnviarOrcamentoDialog';
import { DialogAbrirPendencia, DialogRetornosDoJuridico, usePendenciasParaAgir } from '../../components/PendenciaJuridica/PendenciaJuridica';
import { useAccess } from '../../access/AccessContext';
import './OrcamentoMedicoPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { ContadorRegistros, contarPorCampo } from '../../components/ContadorRegistros/ContadorRegistros';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, tagTipoPaciente, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, colunaProcedimento, colunaOrigem, filtroMaiorQue, casaPeriodo, OPCOES_PERIODO, filtroOpcoes, casaOpcaoDosDados, filtroOpcoesDosDados } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { ModalStatusFase } from '../../components/StatusFase/ModalStatusFase';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { FiltroTexto } from '../../components/Tabela/FiltroTexto';

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
  /** #507/#517: resposta do médico à cotação — a Cobrança só lista quem ACEITOU. */
  respostaCotacao?: 'ACEITOU' | 'RECUSOU' | 'CONDICIONADO' | null;
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
  /** nome do médico, já devolvido pela rota desta fase (_identificacao_por_order) —
   *  antes a tela ia buscá-lo no índice de /orders/listar/, onde ele nunca esteve */
  medico?: string;
}

interface ProcessoOrcamentoRow extends ProcessoOrcamento { sequencial: number; }

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
  // @R 19/09: lápis na coluna Status → modal com o leque da FASE (ver, trocar, criar)
  const [pedidoStatus, setPedidoStatus] = useState<{ id: number; status: string } | null>(null);
  // A tabela recarrega quando a FICHA muda a situação de um pedido (@R 17/09:
  // "to mudando e a linha continua na tabela com os status incorretos"). O contexto
  // incrementa este número; ele entra nas dependências do efeito de carga abaixo.
  const { versaoDados, abrir: abrirFichaPedido } = useFichaPedido();
  // diálogo do link seguro (Copiar): `copiarParaWhatsapp` vive FORA do componente (chamada de
  // 2 lugares) e recebe este setter DIRETO como parâmetro — achado @R 21/09 23:52: antes a
  // ponte era uma variável `let` de módulo escrita por este useEffect e ZERADA no cleanup do
  // unmount; se o clique acontecesse depois de um unmount (navegação, remount por erro/HMR/
  // Suspense) a chamada virava `null?.(...)` — SEM erro, SEM aviso, SEM nada. "Clico em Copiar
  // e não acontece nada" é exatamente essa assinatura: nem confirm(), nem rede, nem modal.
  const [copiaComLink, setCopiaComLink] = useState<{ p: PedidoParaCopiar; recarregar?: () => void } | null>(null);
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
  const [pendenciaVisible, setPendenciaVisible] = useState(false);   // bilhete 1.1 (Fabrício, 20/09)
  const [retornosVisible, setRetornosVisible] = useState(false);
  const agirPendencias = usePendenciasParaAgir();
  const nRetornos = agirPendencias.meusRetornos + agirPendencias.semLerAntigas;
  const [exames, setExames] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
  const [previewNome, setPreviewNome] = useState('');
  const [cobrancaVisible, setCobrancaVisible] = useState(false);
  const [porMedicoVisible, setPorMedicoVisible] = useState(false); // #507 listagem por médico

  // status manual (etiqueta livre) + troca de médico — 26/08
  const [statusPersonalizados, setStatusPersonalizados] = useState<{ id: number; nome: string }[]>([]);
  const [novoStatusVisible, setNovoStatusVisible] = useState(false);
  const [novoStatusNome, setNovoStatusNome] = useState('');
  const [statusManualSelecionado, setStatusManualSelecionado] = useState<string | null>(null);
  const [aplicandoStatusManual, setAplicandoStatusManual] = useState(false);
  /* Qual pedido está com o painel de cotação concorrente aberto. Guardo o ID e releio a
     linha da lista a cada render — guardar a linha inteira congelaria o que foi visto na
     hora da abertura, e depois de registrar uma resposta o painel mostraria o estado
     velho como se fosse o atual. */
  const [ccOrderId, setCcOrderId] = useState<number | null>(null);
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
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    tipoPaciente: { value: null, matchMode: 'custom' },
    ...FILTRO_PAGAMENTO,   // @R 28/08: pedir cotação para caso JÁ PAGO é trabalho perdido
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    idade: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: null, matchMode: FilterMatchMode.EQUALS },
    area: { value: '', matchMode: 'custom' },
    subarea: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dataStatusJuridico: { value: '', matchMode: 'custom' },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    statusOrcamento: { value: null, matchMode: FilterMatchMode.EQUALS },
  });

  const [visibleProcessos, setVisibleProcessos] = useState<typeof dataComMedico>([]);

  // Esta tela baixava /orders/listar/ INTEIRO (~3 MB, ~10 s) para montar um índice de
  // pedidos. MEDIDO 16/09: daquele índice só `idMedico` existia de fato — `nomeMedico`,
  // `hospital` e `nomeHospital` nunca estiveram na resposta, então as linhas que os liam
  // caíam sempre no fallback. A rota desta tela passou a devolver `idMedico` (e já
  // devolvia `medico`, o nome, por `_identificacao_por_order`), e a chamada pesada saiu.
  // devolve a Promise: quem troca o médico pela tabela precisa saber QUANDO a linha
  // já reflete a troca — sem isso o "await" de quem chama retorna antes do dado chegar.
  const carregarDados = () => {
    setLoading(true);
    return Promise.all([getOrcamentoMedico(), getMedicosCompleto()])
      .then(([orcamentoResponse, medicosResponse]) => {
        setMedicos(medicosResponse.data);

        setProcessos(orcamentoResponse.data.map((o: any) => ({
          ...o,
          idade: calcularIdade(o.dataNascimento),
        })));
      })
      .catch((err) => console.error('[OrcamentoMedicoPage] erro ao carregar orçamentos', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregarDados(); }, [versaoDados]);

  const dataComSequencial = useMemo<ProcessoOrcamentoRow[]>(() => {
    return processos.map((item, index) => ({ ...item, sequencial: index + 1 }));
  }, [processos]);

  const dataComMedico = useMemo(() => {
    return dataComSequencial.map((item) => {
      const medicoId = item.idMedico ?? item.medicoId ?? item.medico_id ?? null;

      const medicoSelecionado = medicos.find((medico: any) => medico.id === medicoId);
      const medicoNome = medicoSelecionado?.nomeSistema ?? '';
      return {
        ...item,
        // `item.medico` vem da própria rota desta tela (_identificacao_por_order);
        // antes a cadeia passava pelo índice de /orders/listar/, que não tinha
        // nenhum destes campos — o valor exibido sempre saiu do `medicos`.
        medico: item.nomeMedico ?? item.medico ?? medicoNome,
        hospital: item.hospital ?? medicoSelecionado?.hospital ?? '',
        nomeHospital: medicoSelecionado?.hospital ?? '',
      };
    });
  }, [dataComSequencial, medicos]);
  // Há pelo menos 1 envio confirmado na fila = a confirmação pela Eliza está viva (ver coluna Pedido ao médico).
  const confirmacaoEnvioAtiva = dataComMedico.some((r: any) => !!r?.ultimaCotacaoEnviadaEm);

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
      // @R 20/09 16:20: "em cobrança só pode existir o que foi aceito pelo médico — se não foi
      // aceito, não marcamos". Quem ainda não respondeu vai pelo "Por médico" (listagem em 48 h);
      // aqui só entra quem disse SIM e ainda não mandou o orçamento.
      if (item.respostaCotacao !== 'ACEITOU') {
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
      const feito = await darPerdaNoOrcamento(processoSelecionado.id, { motivoPerdaCategoria: motivoNaoFaco, parecer: parecerNaoFaco });
      if (!feito) return;   // havia outro médico cotando e a pessoa desistiu da perda do pedido inteiro
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
    <FiltroTexto
      options={options}
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


// `recarregar` vem de fora porque esta função vive FORA do componente e não enxerga o
// carregarDados dele — sem isso, a marca de "pedido" gravaria no banco e a linha só
// mostraria na próxima abertura da tela (a cicatriz de 17/09: peça provada, ¬instalada).
// `abrirDialogo` TAMBÉM vem por parâmetro agora (achado @R 21/09 23:52): antes era uma
// variável `let` de módulo escrita por um useEffect e ZERADA no cleanup do unmount — se o
// clique acontecesse depois de um unmount (navegação/HMR/remount) virava `null?.(...)`,
// sem erro nem aviso. "Clico em Copiar e não acontece nada" era exatamente essa assinatura.
const copiarParaWhatsapp = async (
  rowData: ProcessoOrcamentoRow,
  abrirDialogo: (p: PedidoParaCopiar, recarregar?: () => void) => void,
  recarregar?: () => void,
) => {
  /* SEGREDO DE JUSTIÇA NÃO VAI A PRESTADOR (mandato @R via eliza-urgencia, 20/09 02:08): 7 pedidos em
     segredo foram disparados a canais de prestador nesta madrugada. O servidor também recusa
     (409 segredo_de_justica em cotacao-pedida e solicitar-cotacao-medico); aqui barramos ANTES de
     copiar, porque o texto copiado já é o vazamento. */
  if ((rowData.statusJuridico || '').trim().toLowerCase() === 'segredo de justiça') {
    alert('Este processo está em SEGREDO DE JUSTIÇA e não pode ser enviado a prestador.\n\nNada foi copiado. Se o segredo caiu, desmarque em "Segredo de Justiça" antes.');
    return;
  }
  const cnjDaLinha = ((rowData as any).cnj ?? (rowData as any).nprocesso ?? '').toString().trim();
  if (!cnjDaLinha && !window.confirm('Este pedido está SEM número de processo (CNJ).\n\nEnviar ao prestador mesmo assim?')) return;
  /* #505 (20/09): a especialidade do pedido bate com o cadastro do prestador? O servidor
     compara (especialidade, subespecialidade, lista e grupos de WhatsApp) e devolve o aviso.
     Caso fundador: #1238, cabeça e pescoço enviado ao Santa Rita, que não opera isso — a
     recusa só apareceu depois. É AVISO com confirmação, não bloqueio: o cadastro é texto
     livre e incompleto; quem opera decide. Se a API falhar, o Copiar segue (ajuda ≠ gate). */
  try {
    const av: any = await montarCotacaoMedico(rowData.id)
    const avisosEsp: string[] = (av?.data?.avisos || []).filter((a: string) => a.startsWith('Especialidade'))
    if (avisosEsp.length && !window.confirm(avisosEsp.join('\n\n') + '\n\nCopiar mesmo assim?')) return
  } catch { /* aviso é ajuda, não gate */ }
  /* O TEXTO E OS DOCUMENTOS AGORA SAEM PELO DIÁLOGO DO LINK SEGURO (@R 21/09 18:27): em vez de N
     links públicos do R2, 1 link da G4MED que registra cada abertura e não deixa baixar — e quem
     copia vê antes os valores (real × deflacionado) e escolhe se vão. A lista branca de tipos, a
     ordem clínica e a frase da SES moraram aqui até hoje e foram para DialogoCopiarPedido.tsx
     (texto) e backend/link_documentos.py (lista branca, servidor). */
  const m = rowData as any
  abrirDialogo({
    id: rowData.id, paciente: rowData.paciente, idade: rowData.idade, procedimento: rowData.procedimento,
    area: rowData.area, subarea: rowData.subarea,
    idMedico: m.idMedico ?? m.medicoId ?? m.medico_id ?? null, medico: m.nomeMedico ?? m.medico ?? null,
  }, recarregar)
}

// mesma classe de bug do DialogoCopiarPedido.tsx (achado @R 21/09 23:27): execCommand('copy')
// tem retorno booleano de sucesso e estava sendo IGNORADO — a função "dava certo" mesmo
// quando não copiava nada, e quem chama nunca sabia diferenciar os dois casos.
const copiarTexto = async (texto: string): Promise<boolean> => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch { /* cai no fallback abaixo */ }
  }
  const textarea = document.createElement('textarea')
  textarea.value = texto
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
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

  const copiou = await copiarTexto(texto)
  if (!copiou) {
    window.prompt('Não deu para copiar automaticamente — selecione e copie (Ctrl+C):', texto)
    return
  }
  alert('Cobrança copiada! Cole no WhatsApp.')
}

  return (
    <div className="orcamento-medico-page">
      <DialogoCopiarPedido pedido={copiaComLink?.p ?? null} onClose={() => setCopiaComLink(null)}
        onCopiado={() => copiaComLink?.recarregar?.()} />
      <PrimeiraVisitaInfo etapaId="orcamento-medico" />
      <div className="page-header">
        <CabecalhoFase nome="Orçamento Médico" screen="orcamentoMedico" slaDias={SLA_META_DIAS_ORCAMENTO}
          subtitulo="Processos aguardando orçamento do médico" />
        <div className="page-actions">
          <Button label={`Retornos do jurídico${nRetornos ? ` (${nRetornos})` : ''}`} icon="pi pi-reply" outlined
            severity={nRetornos ? 'success' : 'secondary'} title="Respostas do jurídico aos pedidos que você devolveu (1.1), esperando o seu Li"
            onClick={() => setRetornosVisible(true)} />
          {agirPendencias.paradas > 0 && (
            <span role="status" title="Pedidos devolvidos ao jurídico que estão sem resposta há 2 dias ou mais — eles estão fora desta fila enquanto isso"
              style={{ alignSelf: 'center', fontWeight: 700, color: '#b91c1c' }}>{agirPendencias.paradas} parada(s) no jurídico</span>
          )}
          <Button
            label="Por médico"
            icon="pi pi-users"
            outlined
            title="Lista o que está com cada médico (dia de envio) e copia a listagem para pedir a confirmação em 48 h"
            onClick={() => setPorMedicoVisible(true)}
          />
          <Button
            label="Cobrança"
            icon="pi pi-whatsapp"
            outlined
            onClick={() => setCobrancaVisible(true)}
          />
        </div>
      </div>

      <ListagemPorMedico visible={porMedicoVisible} onHide={() => setPorMedicoVisible(false)} onMudou={carregarDados} />
      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <KpisValorEUrgencia linhas={visibleProcessos} todas={dataComMedico} valorDe={(p:any)=>p.refPreco ?? 0} />
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
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
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
          )(r), rowClassRepedido(r),
            // @R 17/09: "a marcação da cor da linha diferente, e se estiver sem profissional
            // diferente... pois cada um precisa de um MOLDE para pedir o orçamento".
            // Nesta fase a cor não é enfeite: ela diz qual pedido vai ser escrito.
            (!r?.idMedico || r.idMedico === 1) ? 'linha-sem-medico' : '',
            (r?.segredo === 'sim') ? 'linha-segredo' : '',
          ].filter(Boolean).join(' ')}
          onPage={(e: DataTablePageEvent) => { setFirst(e.first); setRows(e.rows); }}
          sortField={sortField} sortOrder={sortOrder}
          onSort={(e: DataTableSortEvent) => { setSortField(e.sortField); setSortOrder(e.sortOrder); }}
          filters={filters} onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row" loading={loading}
          emptyMessage="Nenhum processo aguardando orçamento."
          className="orcamento-table"
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column field="id" header="#" headerTooltip="Número do pedido (o mesmo da Ficha, dos e-mails e da API)" style={{ minWidth: '4rem' }}  frozen alignFrozen="left" />
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
                  onClick={() => copiarParaWhatsapp(rowData, (p, r) => setCopiaComLink({ p, recarregar: r }), carregarDados)}
                />
              )) as any)(r)}</>, excluir: carregarDados })}
          <Column field="paciente" header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')} filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '16rem' }}
            body={(r: ProcessoOrcamentoRow) => (
              <span className="orcamento-paciente-cel col-paciente-upper">
                {nomeComCopiar(r.paciente, r.id)}
              </span>
            )}  frozen alignFrozen="left" />
          {colunaOrigem(dataComMedico)}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo(undefined, dataComMedico)}
          {/* @R 19/09: Inteiro teor e Cadastro vêm para a frente, ao lado de Segredo — é o que
              se olha primeiro para saber se dá para agir no pedido. */}
          {colunaInteiroTeor()}
          {colunaCadastro()}
          {/* @R 17/09: segredo ao lado de origem — "para sabermos". Nesta fase a
              informação decide O MOLDE do pedido de orçamento, então precisa estar
              no campo de visão de quem vai pedir, ¬no fim da tabela. */}
          {/* PEDIMOS A ESTE MÉDICO? (@R 18/09) — as duas colunas que respondem "quem
              pedimos, quem não pedimos, quando e há quantos dias". Antes disso, a fila
              inteira parecia igual: 37 dos 45 estavam como "Solicitado ao Medico", um
              ESTADO que não diz se foi ontem ou há 40 dias. */}
          <Column key="col-pedido-medico" field="cotacoesPedidas" sortable
            header={cabecalhoComHint('Pedido ao médico',
              'Copiado = alguém copiou a mensagem para o WhatsApp. Enviado (verde) = a mensagem foi vista no grupo do médico (confirmado pela Eliza, pelo rodapé Pedido #N). Copiou e não mandou? Use o ✕ para desfazer.')}
            filter filterMatchMode="custom" filterFunction={casaOpcaoDosDados} showFilterMenu={false}
            filterElement={filtroOpcoesDosDados(
              dataComMedico,
              (r: any) => (r?.cotacoesPedidas > 0 ? 'sim' : 'nao'),
              'Todos',
              (v) => (v === 'sim' ? 'Já pedimos' : 'Ainda não pedimos'))}
            style={{ minWidth: '13rem' }}
            body={(r: any) => {
              if (!r.cotacoesPedidas) {
                return <Tag value="Não pedimos" severity="warning" icon="pi pi-clock"
                  title="Ninguém copiou a mensagem para este médico ainda." />;
              }
              /* PEDIDO SEM DATA — os 37 marcados pelo backfill (@R 18/09: "já tínhamos
                 pedidos"). Sabemos QUE foi pedido (o status dizia), não QUANDO: esse
                 registro nunca existiu. Mostrar uma data inventada aqui faria a coluna
                 de dias exibir número que ninguém mediu, e alguém cobraria um médico com
                 base nele. "data não registrada" é feio e é verdade. */
              if (!r.ultimaCotacaoPedidaEm) {
                return (
                  <span className="om-pedido">
                    <Tag value="Pedido · sem data" severity="secondary" icon="pi pi-check"
                      title="Já foi pedido antes de o sistema registrar a data (marcação em lote, 18/09). A partir do próximo copiar, a data passa a ser gravada." />
                    {!readOnly && (
                      <button type="button" className="om-pedido__cancelar"
                        title="Cancelar: volta para 'não pedimos'"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm('Cancelar o pedido ao médico? Volta a contar como "não pedimos".')) return;
                          try { await registrarCotacaoPedida(r.id, true); await carregarDados(); }
                          catch { alert('Não foi possível cancelar.'); }
                        }}>✕</button>
                    )}
                  </span>
                );
              }
              /* COPIADO × ENVIADO (@R 21/09, urgência + comercial): o clique de copiar é só
                 proxy. ENVIADO vem de prova de fora — a Eliza vê "_Pedido #N · G4MED_" saindo
                 no grupo e registra (cotacao-enviada). O alerta "copiou e não enviou" só liga
                 quando a confirmação JÁ está funcionando (há pelo menos 1 pedido confirmado na
                 fila); antes disso ele acusaria todos os pedidos, e alarme em massa é ignorado. */
              const copiadoEm = new Date(r.ultimaCotacaoPedidaEm).getTime();
              const enviadoEm = r.ultimaCotacaoEnviadaEm ? new Date(r.ultimaCotacaoEnviadaEm).getTime() : 0;
              const enviadoDepois = enviadoEm && enviadoEm >= copiadoEm - 10 * 60 * 1000;
              const semConfirmacao4h = confirmacaoEnvioAtiva && !enviadoDepois && Date.now() - copiadoEm > 4 * 3600 * 1000;
              return (
                <span className="om-pedido">
                  {enviadoDepois ? (
                    <Tag value={`Enviado ${formatarData((r.ultimaCotacaoEnviadaEm || '').slice(0, 10))}`}
                      severity="success" icon="pi pi-check-circle"
                      title={`Mensagem vista no grupo ${r.ultimaCotacaoEnviadaGrupo || ''} em ${formatarDataHora(r.ultimaCotacaoEnviadaEm)} (confirmado pela Eliza). Copiado ${r.cotacoesPedidas}×, último em ${formatarDataHora(r.ultimaCotacaoPedidaEm)}.`} />
                  ) : (
                    <Tag value={`Copiado ${formatarData((r.ultimaCotacaoPedidaEm || '').slice(0, 10))}`}
                      severity={semConfirmacao4h ? 'danger' : 'info'} icon={semConfirmacao4h ? 'pi pi-exclamation-triangle' : 'pi pi-copy'}
                      title={semConfirmacao4h
                        ? `Copiado em ${formatarDataHora(r.ultimaCotacaoPedidaEm)} e, há mais de 4 h, a mensagem não apareceu em nenhum grupo. Confira se foi enviada.`
                        : `Mensagem copiada ${r.cotacoesPedidas}× — último em ${formatarDataHora(r.ultimaCotacaoPedidaEm)}. Copiar não é enviar: o "Enviado" aparece quando a mensagem é vista no grupo.`} />
                  )}
                  {r.cotacoesPedidas > 1 && (
                    <span className="om-pedido__n" title={`Pedimos ${r.cotacoesPedidas} vezes`}>
                      {r.cotacoesPedidas}×
                    </span>
                  )}
                  {!readOnly && (
                    <button type="button" className="om-pedido__cancelar"
                      title="Cancelar: apaga a data e a contagem (use quando copiou e não enviou)"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm(
                          `Cancelar o pedido ao médico?\n\nApaga a data e as ${r.cotacoesPedidas} vez(es) registradas — este pedido volta a contar como "não pedimos".`)) return;
                        try {
                          await registrarCotacaoPedida(r.id, true);
                          await carregarDados();
                        } catch {
                          alert('Não foi possível cancelar.');
                        }
                      }}>✕</button>
                  )}
                </span>
              );
            }} />

          {/* O PREÇO QUE A PEÇA JÁ REVELOU (@R 18/09). A extração das decisões de inteiro
              teor grava os orçamentos que constam nos autos — 683 na base, e até hoje
              invisíveis em tela. Aqui vira a resposta de "temos referência de preço para
              este procedimento?" ANTES de pedir a cotação. O detalhe (prestador, página,
              link para conferir) fica na ficha do pedido; na lista, a faixa basta. */}
          <Column key="col-orc-peca" field="orcamentosDaPeca"
            header={cabecalhoComHint('Orçamento na peça',
              'Valores de orçamento encontrados na decisão de inteiro teor deste processo. É leitura automática (proposta), não valor conferido — e não vai na mensagem ao médico, porque ancoraria o preço dele.')}
            style={{ minWidth: '11rem' }}
            body={(r: any) => <FaixaDaPeca faixa={r.orcamentosDaPeca} />} />

          {/* COTAÇÃO CONCORRENTE (@R 18/09) — quem mais foi convidado a cotar este mesmo
              pedido, o que cada um respondeu, e qual orçamento valeu. */}
          <Column key="col-cotacao-concorrente" field="cotacaoConcorrente"
            header={cabecalhoComHint('Cotação concorrente',
              'Outros médicos convidados a cotar o MESMO pedido. Clique para ver o que cada um respondeu e marcar qual orçamento vale.')}
            style={{ minWidth: '12rem' }}
            body={(r: any) => (
              <CelulaCotacaoConcorrente candidatos={r.cotacaoConcorrente}
                onAbrir={() => setCcOrderId(r.id)} />
            )} />

          <Column key="col-dias-pedido" field="diasDesdeCotacaoPedida" header={cabecalhoComHint(
              'Dias desde o pedido', 'Quantos dias desde a última vez que pedimos ao médico. Contado no servidor — o relógio é um só para todo mundo.')}
            sortable dataType="numeric" filter showFilterMenu={false}
            filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '10rem' }}
            body={(r: any) => (r.diasDesdeCotacaoPedida == null
              ? <span className="ident-vazio">—</span>
              : <span className={r.diasDesdeCotacaoPedida >= 7 ? 'om-dias om-dias--tarde' : 'om-dias'}>
                  {r.diasDesdeCotacaoPedida}
                </span>)} />

          {colunaRepedido(dataComMedico)}
          <Column field="idade" header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')} sortable filter
            dataType="numeric" filterElement={filtroMaiorQue('a partir de…')} style={{ minWidth: '7rem' }} />
          <Column field="tipoPaciente"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(dataComMedico, (l: any) => l?.tipoPaciente, 'Todos')} header={cabecalhoComHint('Grupo etário', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')} sortable style={{ minWidth: '7rem' }}
            body={(r: any) => tagTipoPaciente(r.tipoPaciente)} />
          {colunaProcedimento()}
          <Column field="area" header="Área" sortable filter
            filterMatchMode="custom" showFilterMenu={false}
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(dataComMedico, (l: any) => l?.area, 'Todas as áreas')} style={{ minWidth: '10rem' }} />
          <Column field="medico" header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento. O lápis troca o médico sem abrir o pedido.')} sortable filter
            body={(r) => (
              <CelulaMedico row={r} medicos={medicos} somenteLeitura={readOnly}
                aoTrocar={async () => { await carregarDados(); }} />
            )}
            filterElement={(o) => dropdownFilterElement(o, medicosOptions)} style={{ minWidth: '14rem' }} />
          <Column field="dataStatusJuridico"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaPeriodo}
            filterElement={filtroOpcoes(OPCOES_PERIODO, 'Todas')} header="Data Solicitação"
            body={(r) => formatarData(r.dataStatusJuridico)} sortable
            style={{ minWidth: '12rem' }} />
          <Column field="dias" header="Dias em Aberto" sortable filter
            dataType="numeric" filterElement={filtroMaiorQue('mais de…')} style={{ minWidth: '10rem' }} />
          <Column field="statusOrcamento" header={cabecalhoComHint('Status', 'O que está acontecendo dentro da fase (statusOrcamento). O lápis abre o leque desta fase e permite criar um status novo nela.')}
            body={(r) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                <Tag value={r.statusOrcamento} style={getStatusTagStyle(r.statusOrcamento)} className="status-tag-custom" />
                <i className="pi pi-pencil" title="Mudar o status nesta fase"
                   style={{ cursor: 'pointer', opacity: .55, fontSize: '.8rem' }}
                   onClick={(e) => { e.stopPropagation(); setPedidoStatus({ id: r.id, status: r.statusOrcamento }); }} />
              </span>
            )}
            filter
            showFilterMenu={false}
            filterElement={statusFilterElement}
            style={{ minWidth: '15rem' }} />
          {colunaAnexosSES(dataComMedico)}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaSolicitante('13rem', dataComMedico)}
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
              {!readOnly && <Button label="Devolver ao jurídico (1.1)" icon="pi pi-reply"
                severity="help" outlined title="Pedir algo ao jurídico: o pedido vai para a 1.1 e volta sozinho para cá"
                onClick={() => setPendenciaVisible(true)} />}
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
      {(() => {
        const linha: any = dataComMedico.find((x: any) => x.id === ccOrderId) || null;
        return (
          <DialogCotacaoConcorrente
            visible={ccOrderId != null}
            onHide={() => setCcOrderId(null)}
            orderId={ccOrderId}
            paciente={linha?.paciente}
            refPreco={linha?.refPreco}
            candidatos={linha?.cotacaoConcorrente ?? []}
            readOnly={readOnly}
            onMudou={carregarDados}
            onCopiarPedido={linha ? () => copiarParaWhatsapp(linha, (p, r) => setCopiaComLink({ p, recarregar: r }), carregarDados) : undefined}
          />
        );
      })()}

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

      <DialogRetornosDoJuridico visible={retornosVisible} onHide={() => { setRetornosVisible(false); carregarDados(); }} onAbrirFicha={abrirFichaPedido} />
      <DialogAbrirPendencia orderId={processoSelecionado?.id ?? null} visible={pendenciaVisible}
        onHide={() => setPendenciaVisible(false)} onFeito={() => { setDetalheVisible(false); carregarDados(); }} />

      <EnviarOrcamentoDialog
        visible={escolhaVisible && !readOnly}
        processo={processoSelecionado}
        onHide={() => setEscolhaVisible(false)}
        onSuccess={async () => {
          // Teste local 15/09: o orçamento era gravado (201) mas o pedido continuava na lista — o
          // recarregamento recarrega a lista desta fase. O pedido que
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
              { label: 'Paciente já foi operado (o e-mail à SES sai com este motivo)', value: 'JA_OPERADO' },
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
        {processoSelecionado && naoFacoVisible && (
          <PreviaEmailSes orderId={processoSelecionado.id} motivo={motivoNaoFaco as string | null} />
        )}
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
              Nenhum médico ACEITOU cotar e ainda está devendo o orçamento. (Quem ainda não respondeu está em "Por médico".)
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

      {/* @R 19/09: o lápis da coluna Status. O modal descobre a fase e edita o campo
          que O SERVIDOR disser ser o operacional dela — nunca um campo fixo daqui. */}
      {pedidoStatus && (
        <ModalStatusFase
          visivel={!!pedidoStatus}
          pedidoId={pedidoStatus.id}
          statusAtual={pedidoStatus.status}
          aoFechar={() => setPedidoStatus(null)}
          aoSalvar={async (campo, valor) => {
            await atualizarOrder(pedidoStatus.id, { [campo]: valor });
            await carregarDados();
          }}
        />
      )}
    </div>
  );
}


