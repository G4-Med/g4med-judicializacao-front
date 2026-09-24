import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { KpisValorEUrgencia } from '../../components/PainelKpis/kpisValorUrgencia';
import type { DataTablePageEvent, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { FaixaDaPeca, type FaixaOrcamentoPeca } from '../../components/CotacaoConcorrente/FaixaDaPeca';
import { Checkbox } from 'primereact/checkbox';
import { FilterMatchMode } from 'primereact/api';
import type { DataTableFilterMeta } from 'primereact/datatable';
import {
  atualizarOrder,
  getMedicosCompleto,
  getProcessosResumo,
  marcarSemProfissional,
  sugerirMedicoIA,
  aplicarSugestaoIA,
  convidarCandidatoCotacao,
  type SugestaoIAResposta,
} from '../../services/api/orders';
import { getPrecosDoMedico } from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { tagTipoPaciente, colunaOrigem, filtroMaiorQue, filtroOpcoes, casaOpcaoDosDados, filtroOpcoesDosDados } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { colunaOportunidade, colunaPagoEstado, colunaQuemPrecisamos } from '../../components/QuemPrecisamos/colunasMatch';
import { ModalMedico } from '../../components/TrocarMedico/CelulaMedico';
import { DialogoCopiarPedido, prepararCopiaPedido, type PedidoParaCopiar } from '../orcamentoMedico/DialogoCopiarPedido';
import './SelecionarMedicoPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor, colunaEmailOrgao , cabecalhoComHint} from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { FiltroTexto } from '../../components/Tabela/FiltroTexto';

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
  /** faixa de preço lida das peças deste processo (@R 18/09) */
  orcamentosDaPeca?: FaixaOrcamentoPeca | null;
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
  // A tabela recarrega quando a FICHA muda a situação de um pedido (@R 17/09:
  // "to mudando e a linha continua na tabela com os status incorretos"). O contexto
  // incrementa este número; ele entra nas dependências do efeito de carga abaixo.
  const { versaoDados, abrir: abrirFicha, disponivel: fichaDisponivel } = useFichaPedido();
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const { isReadOnly, filterMedicosByAccess } = useAccess();
  const readOnly = isReadOnly('selecionarMedico');
  const [loading, setLoading] = useState(false);
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [selectedProcessos, setSelectedProcessos] = useState<ProcessoResumoTableRow[]>([]);
  const [medicosOptions, setMedicosOptions] = useState<MedicoOption[]>([]);
  // lista CRUA (com especialidades) — o ModalMedico ordena por quem atende a área do pedido
  const [medicosCrus, setMedicosCrus] = useState<any[]>([]);
  /* ═══ MAIS DE UM MÉDICO NO MESMO PEDIDO (@R 18/09) ═══
     ⟦"precisamos poder selecionar mais de um médico para mandar os orçamentos, tem
     orçamentos que temos que mandar para mais de um médico"⟧

     POR QUE DOIS CAMPOS SEPARADOS, e não uma lista só: são perguntas diferentes.
     `iaMedicoEscolhido` responde QUEM FICA COM O CASO — é o `Order.idMedico`, campo
     único, o que a tabela mostra e o que o resto do sistema lê. `iaTambemPedir` responde
     A QUEM MAIS VAMOS PEDIR ORÇAMENTO — relação de muitos, que vive na tabela de
     candidatos de cotação. Fundir os dois numa lista só obrigaria a inventar uma regra
     de "quem é o primeiro da lista vira o responsável", e essa regra seria invisível na
     tela: a pessoa marcaria três nomes sem saber qual deles ficou gravado no pedido.

     O QUE ISTO NÃO DECIDE: quando dois responderem, qual orçamento vale. Essa é decisão
     comercial do @R, ainda em aberto (procurador 3d7aa97d74). Aqui só registramos o FATO
     — quem foi convidado —, que é exatamente o que hoje acontece pelo WhatsApp sem o
     sistema saber de nada. */
  const [iaTambemPedir, setIaTambemPedir] = useState<number[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMassaVisible, setDialogMassaVisible] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoResumoTableRow | null>(null);
  const [medicoSelecionadoMassa, setMedicoSelecionadoMassa] = useState<number | null>(null);
  const [executandoAcaoMassa, setExecutandoAcaoMassa] = useState(false);
  const [iaLoadingId, setIaLoadingId] = useState<number | null>(null);
  const [iaDialogVisible, setIaDialogVisible] = useState(false);
  const [iaSugestao, setIaSugestao] = useState<SugestaoIAResposta | null>(null);
  const [iaOrderId, setIaOrderId] = useState<number | null>(null);
  const [iaAplicando, setIaAplicando] = useState(false);
  // CICLO selecionar → copiar → marcar → mandar (@R 23/09 12:18): confirmado o médico, o Copiar da
  // fase 3 abre na hora, com os mesmos itens (link seguro, pagamentos, relatório IA) e as mesmas travas.
  const [copiaPedido, setCopiaPedido] = useState<PedidoParaCopiar | null>(null);
  const abrirCopiar = (row: any, idMedico: number, nomeMedico?: string | null) => {
    void prepararCopiaPedido({ ...row, idMedico, nomeMedico: nomeMedico ?? row?.nomeMedico ?? null },
      (p) => setCopiaPedido(p), () => { void carregarDados(); });
  };
  // O PEDIDO que gerou a sugestão (@R 17/09: "mostrar na tela qual é o procedimento").
  // Sem ele, o modal pede para confirmar um médico sem dizer PARA QUÊ — e quem confirma
  // às cegas confirma errado. A linha já está na mão de quem clicou; guardá-la custa nada.
  const [iaPedido, setIaPedido] = useState<ProcessoResumoTableRow | null>(null);
  // PREÇOS DO MÉDICO ESCOLHIDO (@R 17/09: "os preços dos últimos empenhos dele... e se
  // trocarmos ali no box ele recalcula"). Depende de `iaMedicoEscolhido`, ¬do sugerido:
  // o número tem que acompanhar a decisão que está sendo tomada, senão vira o preço de
  // um médico com o nome de outro — o pior tipo de erro, porque parece certo.
  const [precosMedico, setPrecosMedico] = useState<any | null>(null);
  const [carregandoPrecos, setCarregandoPrecos] = useState(false);
  // Escolha MANUAL dentro do modal: a sugestão é conselho, não trava. Antes era preciso
  // cancelar e procurar o médico na tabela — duas telas para uma decisão só.
  const [iaMedicoEscolhido, setIaMedicoEscolhido] = useState<number | null>(null);

  useEffect(() => {
    if (!iaDialogVisible || !iaPedido || !iaMedicoEscolhido) { setPrecosMedico(null); return; }
    let vivo = true;
    setCarregandoPrecos(true);
    getPrecosDoMedico(iaPedido.id, iaMedicoEscolhido)
      .then((r: any) => { if (vivo) setPrecosMedico(r.data); })
      .catch(() => { if (vivo) setPrecosMedico(null); })
      .finally(() => { if (vivo) setCarregandoPrecos(false); });
    return () => { vivo = false; };
  }, [iaDialogVisible, iaPedido, iaMedicoEscolhido]);

  const colunasCfg = useColunasVisiveis('selecionar-medico');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    slaFaseHorasRestantes: { value: '', matchMode: FilterMatchMode.EQUALS },
    // mesma classe: coluna com filter sem entrada no objeto = campo aceita e tabela ignora.
    idade: { value: '', matchMode: FilterMatchMode.EQUALS },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    tipoPaciente: { value: null, matchMode: 'custom' },
    ...FILTRO_PAGAMENTO,   // @R 28/08: pedir cotação para caso JÁ PAGO é trabalho perdido
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    area: { value: '', matchMode: 'custom' },
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
      setMedicosCrus(medicos.filter((item: any) => item.id !== 1));
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
  }, [versaoDados]);

  // @R 20/09 16:20: "o pedido com recusa temos que ter como filtrar — sem médico e quem recusou,
  // para voltarmos a procurar". #510 já põe os recusados no topo com o aviso; este filtro isola.
  const [soRecusados, setSoRecusados] = useState(false);
  const totalRecusados = useMemo(() => processos.filter((p: any) => p.cotacaoRecusadaPor).length, [processos]);
  const dataComCamposCalculados = useMemo<ProcessoResumoTableRow[]>(() => {
    const base = soRecusados ? processos.filter((p: any) => p.cotacaoRecusadaPor) : processos;
    return base.map((item, index) => {
      return {
        ...item,
        sequencial: index + 1,
        dias: Number(item.diasSolicitados ?? 0),
      };
    });
  }, [processos, soRecusados]);

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
    <FiltroTexto
      options={options}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  const abrirDialog = (rowData: ProcessoResumoTableRow) => {
    setProcessoSelecionado(rowData);
    setDialogVisible(true);
  };

  // handleSalvarMedico/salvandoMedico removidos 19/09: o salvar vive no ModalMedico (peça única).

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
      setIaPedido(rowData);
      setIaMedicoEscolhido(sug?.idMedico ?? null);
      setIaTambemPedir([]);
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
    setIaPedido(null);
    setIaMedicoEscolhido(null);
    setIaTambemPedir([]);
  };

  const handleAplicarSugestaoIA = async () => {
    if (!iaSugestao || !iaOrderId) return;
    // Aplica quem está NO DROPDOWN, ¬quem a IA sugeriu: desde 17/09 o jurídico pode trocar
    // dentro do próprio modal. Continuar mandando `iaSugestao.idMedico` faria a tela
    // mostrar um médico e gravar outro — o pior erro possível aqui, porque é silencioso.
    const escolhido = iaMedicoEscolhido ?? iaSugestao.idMedico;
    if (!escolhido) {
      alert('Escolha um médico antes de confirmar.');
      return;
    }
    setIaAplicando(true);
    try {
      await aplicarSugestaoIA(iaSugestao.sugestaoId, escolhido);
      /* Os CONVIDADOS A COTAR. O responsável entra também: quem ficou com o caso é o
         primeiro a quem pedimos orçamento, e deixá-lo fora faria a lista de convidados
         mentir por omissão — mostraria os concorrentes e esconderia o principal.
         Falha aqui NÃO derruba a escolha do médico, que é o ato principal e já foi
         gravado: o convite é registro auxiliar, e perder o registro é menos grave que
         desfazer uma decisão que a pessoa acabou de tomar. O que não pode é silêncio —
         por isso avisa. */
      const convidados = Array.from(new Set<number>([escolhido, ...iaTambemPedir]));
      const falhas: number[] = [];
      for (const idm of convidados) {
        try {
          await convidarCandidatoCotacao(iaOrderId, idm);
        } catch {
          falhas.push(idm);
        }
      }
      if (falhas.length) {
        const nomes = falhas
          .map((id) => medicosOptions.find((m) => m.value === id)?.label ?? `#${id}`)
          .join(', ');
        alert(
          `O médico foi definido normalmente, mas não consegui registrar o convite de ` +
          `cotação de: ${nomes}. Peça o orçamento assim mesmo — só o registro falhou.`,
        );
      }
      const linhaIa = iaPedido;
      const nomeEscolhido = medicosOptions.find((m) => m.value === escolhido)?.label ?? null;
      fecharIaDialog();
      await carregarDados();
      if (linhaIa) abrirCopiar(linhaIa, escolhido, nomeEscolhido);
    } catch (error: any) {
      console.error('Erro ao aplicar sugestão IA:', error);
      alert(error?.response?.data?.detail ?? 'Erro ao aplicar a sugestão.');
    } finally {
      setIaAplicando(false);
    }
  };

  return (
    <div className="selecionar-medico-page">
      <DialogoCopiarPedido pedido={copiaPedido} onClose={() => setCopiaPedido(null)}
        onCopiado={() => { void carregarDados(); }} />
      <PrimeiraVisitaInfo etapaId="selecionar-medico" />
      <div className="page-header">
        <CabecalhoFase nome="Selecionar Médico" screen="selecionarMedico"
          subtitulo="Defina o médico responsável para os processos pendentes." />
        {totalRecusados > 0 && (
          <Button
            label={soRecusados ? `Só recusados (${totalRecusados}) — ver todos` : `Recusados por médico (${totalRecusados})`}
            icon="pi pi-user-minus" size="small" outlined={!soRecusados} severity="danger"
            tooltip="Pedidos que um médico recusou cotar e voltaram para a busca — mostra quem recusou"
            onClick={() => setSoRecusados((v) => !v)} />
        )}
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
        <KpisValorEUrgencia linhas={visibleProcessos} todas={dataComCamposCalculados} valorDe={(p:any)=>p.refPreco ?? 0} />
        {/* @R 17/09: "colocar o total possível de processos aqui na fase". O número
            sozinho era o da PÁGINA — quem via "15" com 47 na fase concluía que a fila
            tinha acabado. Agora o total da fase é o número grande (é ele que diz o
            tamanho do trabalho) e o visível aparece ao lado, só quando os dois diferem. */}
        <div className="kpi-card" title="Pedidos nesta fase · e quantos estão visíveis com os filtros atuais">
          <div className="kpi-header">
            <span>Total de Processos</span>
            <i className="pi pi-list" />
          </div>
          <div className="kpi-value">
            {dataComCamposCalculados.length}
            {dataComCamposCalculados.length !== kpis.total && (
              <span className="kpi-sub"> · {kpis.total} visíve{kpis.total === 1 ? 'l' : 'is'}</span>
            )}
          </div>
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
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
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
          <Column field="id" header="#" headerTooltip="Número do pedido (o mesmo da Ficha, dos e-mails e da API)" style={{ minWidth: '4rem' }} frozen alignFrozen="left" />
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
            field="paciente" className="col-paciente-upper"
            body={(r: any) => (
              <>
                {nomeComCopiar(r.paciente, r.id)}
                {/* #510 (@R 20/09): o médico recusou cotar e o pedido voltou para cá — é o mais urgente
                    da fila (já perdeu um cotador). O aviso some quando outro médico é escolhido. */}
                {r.cotacaoRecusadaPor && (
                  <div style={{ marginTop: 2 }}>
                    <Tag severity="danger" icon="pi pi-user-minus"
                      value={`recusado por ${r.cotacaoRecusadaPor}${r.cotacaoRecusadaEm ? ` em ${new Date(r.cotacaoRecusadaEm).toLocaleDateString('pt-BR')}` : ''} — trocar médico`}
                      title="Este médico respondeu que NÃO quer cotar. Escolha outro médico da mesma área." />
                  </div>
                )}
              </>
            )}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
            frozen alignFrozen="left"
          />
          {/* @R 24/09 (tasks #7/#8): oportunidade e o que o Estado já pagou, logo no começo da linha */}
          {colunaOportunidade()}{colunaPagoEstado()}{colunaQuemPrecisamos()}
          {colunaOrigem(dataComCamposCalculados)}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo(undefined, dataComCamposCalculados)}
          {colunaRepedido(dataComCamposCalculados)}
          <Column field="idade" header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento. Criança/recém-nascido recebe o e-mail pediátrico de exames.')}
            sortable filter filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '6rem' }}
            body={(r: any) => r.idade ?? <span className="sm-sla-vazio">—</span>} />
          <Column field="tipoPaciente"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(dataComCamposCalculados, (l: any) => l?.tipoPaciente, 'Todos')} header={cabecalhoComHint('Grupo etário', 'Recém-nascido (≤28 dias) · Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')}
            sortable style={{ minWidth: '9rem' }} body={(r: any) => tagTipoPaciente(r.tipoPaciente)} />
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
            filterMatchMode="custom" showFilterMenu={false}
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(dataComCamposCalculados, (l: any) => l?.area, 'Todas as áreas')}
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
          {/* O PREÇO QUE A PEÇA JÁ REVELOU (@R 18/09: "não vi aqui em um pedido na fase 2
              ele agora com os orçamentos separados"). Fica ANTES da coluna do médico de
              propósito: esta é a tela onde se ESCOLHE quem vai cotar, e a escolha muda
              quando se sabe por quanto o procedimento costuma ser cotado neste processo.
              Mesmo dado da fase 3, mesmo componente — cópia diverge no 1º ajuste. */}
          <Column
            key="col-orc-peca"
            field="orcamentosDaPeca"
            header={cabecalhoComHint('Orçamento na peça',
              'Valores encontrados na decisão de inteiro teor deste processo. Leitura automática (proposta), não valor conferido — o detalhe (prestador, página, link) está na ficha do pedido.')}
            style={{ minWidth: '11rem' }}
            body={(r: any) => <FaixaDaPeca faixa={r.orcamentosDaPeca} />}
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
            filter
            showFilterMenu={false}
            filterMatchMode="custom"
            /* As faixas do filtro são AS MESMAS que pintam a célula (vencido · <6h · no
               prazo). Se o filtro cortasse em outro ponto, a pessoa filtraria "vencido" e
               veria linhas verdes — e passaria a desconfiar da cor, que é o sinal que ela
               usa o dia inteiro. `null` (sem prazo definido) fica fora de todas: não ter
               prazo não é estar no prazo. */
            filterFunction={(horas: any, escolha: any) => {
              if (!escolha) return true;
              if (horas === null || horas === undefined) return escolha === 'sem';
              if (escolha === 'vencido') return horas < 0;
              if (escolha === 'perto') return horas >= 0 && horas < 6;
              if (escolha === 'ok') return horas >= 6;
              return false;
            }}
            filterElement={filtroOpcoes([
              { label: 'Vencido', value: 'vencido' },
              { label: 'Menos de 6 h', value: 'perto' },
              { label: 'No prazo', value: 'ok' },
              { label: 'Sem prazo', value: 'sem' },
            ], 'Todos')}
            body={(r: ProcessoResumoTableRow) => <CelulaSlaFase r={r} />}
            style={{ minWidth: '11rem' }}
          />
          <Column
            field="dias"
            header={cabecalhoComHint('Desde a chegada', 'Dias corridos desde que o pedido CHEGOU no sistema (não desde a entrada nesta fase). Compare com o SLA no cabeçalho.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '7rem' }}
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

      {/* 19/09: o Dialog próprio desta tela foi substituído pelo ModalMedico — a MESMA peça
          das telas de Orçamento e Processos. Ganha "Adicionar ao orçamento" e a ordenação
          por quem atende a área do pedido (o @R viu HOME CARE oferecido para cirurgia
          cerebral aqui). Uma peça, todas as telas. */}
      {processoSelecionado && (
        <ModalMedico
          row={processoSelecionado}
          medicos={medicosCrus}
          aberto={dialogVisible}
          aoFechar={() => setDialogVisible(false)}
          aoTrocar={async (info) => {
            const linha = processoSelecionado;
            await carregarDados(); setProcessoSelecionado(null);
            if (linha && info?.idMedico) abrirCopiar(linha, info.idMedico, info.nomeMedico);
          }}
        />
      )}

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
            {/* PARA QUE pedido é esta escolha (@R 17/09: "mostrar na tela qual é o
                procedimento"). Antes o modal pedia para confirmar um médico sem dizer
                para quê — e quem confirma às cegas confirma errado. O procedimento é o
                dado que torna a sugestão julgável: é dele que vem a especialidade. */}
            {iaPedido && (
              <div className="ia-sugestao-dialog__pedido">
                <div>
                  <span className="ia-sugestao-dialog__label">Procedimento</span>
                  <strong>{iaPedido.procedimento || '— não informado'}</strong>
                </div>
                <div className="ia-sugestao-dialog__pedido-meta">
                  {iaPedido.paciente && <span>{iaPedido.paciente}</span>}
                  {iaPedido.area && <span>{iaPedido.area}</span>}
                  {iaPedido.subarea && <span>{iaPedido.subarea}</span>}
                  <span>pedido #{iaPedido.id}</span>
                  {/* @R 17/09: "adicionar aqui também para abrir a ficha completa se
                      precisar". O modal traz o que a IA usou para decidir; quando isso
                      não basta (anexos, histórico jurídico, e-mails), a saída era fechar
                      tudo e caçar o pedido na tabela — e voltar sem a justificativa que
                      se acabou de ler. */}
                  {fichaDisponivel && (
                    <button
                      type="button"
                      className="ia-sugestao-dialog__ficha"
                      onClick={() => abrirFicha(iaPedido.id)}
                    >
                      <i className="pi pi-id-card" /> abrir ficha completa
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* O QUE É E QUEM FAZ (@R 23/09 12:21): antes dos nomes, uma explicação curta do
                procedimento — quem opera a tela nem sempre sabe o que é "pilão tibial". É texto
                GERAL da IA (sem números, sem o paciente) e vem marcado como tal. */}
            {iaSugestao.sobreProcedimento && (
              <div className="ia-sugestao-dialog__bloco ia-sobre-proc">
                <div className="ia-sugestao-dialog__label">Sobre o procedimento</div>
                <p><strong>O que é:</strong> {iaSugestao.sobreProcedimento.oQueE}</p>
                <p><strong>Quem costuma fazer:</strong> {iaSugestao.sobreProcedimento.quemFaz}</p>
                <span className="ia-sobre-proc__nota">descrição geral gerada pela IA — não substitui a avaliação do médico</span>
              </div>
            )}
            {/* A ORDEM, ¬um nome (@R 17/09: "central inteligente para atuar na escolha
                do profissional" · SPEC 3.1). Um nome só escondia a pergunta que ele fazia:
                "e quando tem mais de um da mesma especialidade?". Cada linha traz o número
                que a sustenta — a ordem é CONSELHO, nunca trava: o jurídico escolhe
                qualquer um, inclusive fora da lista, pela tela de sempre. */}
            {(iaSugestao.candidatos && iaSugestao.candidatos.length > 1) ? (
              <div className="ia-sugestao-dialog__bloco">
                <div className="ia-sugestao-dialog__label">
                  Candidatos em ordem ({iaSugestao.candidatos.length})
                </div>
                <ol className="ia-candidatos">
                  {iaSugestao.candidatos.map((c, i) => (
                    <li key={c.idMedico} className={i === 0 ? 'ia-candidato ia-candidato--topo' : 'ia-candidato'}>
                      <div className="ia-candidato__nome">
                        {/* MARCAR AQUI, no card que a pessoa está lendo (@R 18/09). O campo
                            de baixo aceita qualquer médico do cadastro; este atalho serve o
                            caso comum — a decisão de pedir a dois nasce COMPARANDO os cards,
                            e obrigar a rolar até um campo e reencontrar o nome pela busca
                            perde o contexto que acabou de sustentar a escolha. */}
                        {c.idMedico !== iaMedicoEscolhido && (
                          <Checkbox
                            inputId={`tambem-${c.idMedico}`}
                            checked={iaTambemPedir.includes(c.idMedico)}
                            onChange={(e) =>
                              setIaTambemPedir((atual) =>
                                e.checked
                                  ? [...atual, c.idMedico]
                                  : atual.filter((id) => id !== c.idMedico),
                              )
                            }
                            disabled={iaAplicando}
                            className="ia-candidato__check"
                          />
                        )}
                        {c.nomeMedico}
                        {i === 0 && <span className="ia-candidato__selo">recomendado</span>}
                        {c.idMedico === iaMedicoEscolhido && (
                          <span className="ia-candidato__selo ia-candidato__selo--resp">fica com o caso</span>
                        )}
                      </div>
                      <div className="ia-candidato__porque">{c.porque}</div>
                      <div className="ia-candidato__numeros">
                        {c.jaFezDestaSubarea != null && <span>{c.jaFezDestaSubarea}× nesta subárea</span>}
                        {c.respondeOrcamento && <span>responde {c.respondeOrcamento}</span>}
                        {c.diasParaResponder != null && <span>{c.diasParaResponder}d para responder</span>}
                        {c.cargaAtual && <span>{c.cargaAtual} na mão</span>}
                        {c.atendePediatrico === 'SIM' && <span>atende pediátrico</span>}
                        {c.atendePediatrico === 'NAO_INFORMADO' && <span className="ia-candidato__lacuna">pediátrico não informado</span>}
                        {c.cidade && <span>{c.cidade}</span>}
                      </div>
                      {/* O QUE ELE JÁ COTOU (@R 17/09, caso #629): a prova de que o
                          candidato opera aquilo. O cadastro é pobre — keywords quase
                          sempre vazia —, então quem lê precisa ver o histórico para
                          discordar da ordem com base em algo. */}
                      {c.jaCotou && (
                        <div className="ia-candidato__jacotou">já cotou: {c.jaCotou}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="ia-sugestao-dialog__bloco">
                <div className="ia-sugestao-dialog__label">Médico sugerido</div>
                <div className="ia-sugestao-dialog__valor">
                  {iaSugestao.nomeMedico ?? '(nenhum)'}
                </div>
                {iaSugestao.candidatos && iaSugestao.candidatos.length === 1 && (
                  <div className="ia-candidato__unico">
                    Só um da lista serve tecnicamente — a ordem não foi omitida, não há
                    segundo candidato adequado.
                  </div>
                )}
              </div>
            )}

            <div className="ia-sugestao-dialog__bloco">
              <div className="ia-sugestao-dialog__label">Justificativa</div>
              <div className="ia-sugestao-dialog__texto">
                {iaSugestao.justificativa || '-'}
              </div>
            </div>

            {/* O QUE SUSTENTA A ESCOLHA (@R 17/09: "tínhamos criado para verificar se a
                cirurgia já tinha sido feita antes, se já mandamos orçamentos") — estes
                números JÁ entravam na decisão da IA; o que faltava era saírem dela.
                Veredito sem evidência não é auditável: ou se confia por fé, ou se ignora. */}
            {iaSugestao.dossieMedico && (
              <div className="ia-sugestao-dialog__bloco">
                <div className="ia-sugestao-dialog__label">O que sustenta esta escolha</div>
                <ul className="ia-sugestao-dossie">
                  {iaSugestao.dossieMedico.respondeOrcamento && (
                    <li>Responde orçamento: <strong>{iaSugestao.dossieMedico.respondeOrcamento}</strong></li>
                  )}
                  {iaSugestao.dossieMedico.diasParaResponder != null && (
                    <li>Costuma responder em <strong>{iaSugestao.dossieMedico.diasParaResponder} dias</strong> (mediana)</li>
                  )}
                  {iaSugestao.dossieMedico.jaFezDestaSubarea != null && (
                    <li>Já cotou esta subárea: <strong>{iaSugestao.dossieMedico.jaFezDestaSubarea}×</strong></li>
                  )}
                  {iaSugestao.dossieMedico.atendePediatrico && (
                    <li>Atende pediátrico: <strong>{iaSugestao.dossieMedico.atendePediatrico === 'NAO_INFORMADO'
                      ? 'não informado' : iaSugestao.dossieMedico.atendePediatrico.toLowerCase()}</strong>
                      {iaSugestao.dossieMedico.pediatricosJaAtendidos
                        ? ` (já atendeu ${iaSugestao.dossieMedico.pediatricosJaAtendidos})` : ''}</li>
                  )}
                  {iaSugestao.dossieMedico.cidade && <li>Cidade: <strong>{iaSugestao.dossieMedico.cidade}</strong></li>}
                </ul>
              </div>
            )}

            {/* ESTE PACIENTE JÁ PASSOU POR AQUI? Um repetido pode ser cobrança de algo
                que já andou — e aí a decisão muda. Casado pelo NOME, que é o que temos:
                homônimo existe, então a tela mostra os pedidos para o operador CONFERIR
                em vez de afirmar "já foi operado" sem ele poder auditar. */}
            {iaSugestao.historicoPaciente && iaSugestao.historicoPaciente.pedidosAnteriores > 0 && (
              <div className="ia-sugestao-dialog__bloco">
                <div className="ia-sugestao-dialog__label">
                  Este paciente já apareceu antes ({iaSugestao.historicoPaciente.pedidosAnteriores})
                  {iaSugestao.historicoPaciente.mesmoProcedimentoAntes && ' — com o MESMO procedimento'}
                </div>
                <ul className="ia-sugestao-dossie">
                  {iaSugestao.historicoPaciente.itens.map((i) => (
                    <li key={i.id}>
                      #{i.id} · {i.dataPedido ? new Date(i.dataPedido).toLocaleDateString('pt-BR') : 's/ data'}
                      {' · '}{i.procedimento || '—'}
                      {i.statusProcesso ? ` · ${i.statusProcesso}` : ''}
                      {i.teveOrcamento ? ' · teve orçamento' : ' · sem orçamento'}
                      {i.mesmoProcedimento ? ' · mesmo procedimento' : ''}
                    </li>
                  ))}
                </ul>
                <div className="ia-sugestao-dialog__texto" style={{ opacity: 0.75, fontSize: '0.85em' }}>
                  Casado pelo nome do paciente — confira antes de concluir que é a mesma pessoa.
                </div>
              </div>
            )}

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

            {/* TROCAR SEM SAIR (@R 17/09: "ter um dropdown para trocarmos o médico caso
                a gente queira escolher outro ali"). A sugestão é conselho: antes, discordar
                custava cancelar o modal e procurar o médico na tabela — duas telas para uma
                decisão só, e a justificativa que acabou de ser lida sumia da frente. */}
            <div className="ia-sugestao-dialog__bloco ia-sugestao-dialog__troca">
              <div className="ia-sugestao-dialog__label">Médico que vai ser confirmado</div>
              <Dropdown
                value={iaMedicoEscolhido}
                options={medicosOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setIaMedicoEscolhido(e.value)}
                placeholder="Escolha o médico"
                filter
                disabled={iaAplicando}
                className="ia-sugestao-dialog__drop"
              />
              {iaSugestao.idMedico != null && iaMedicoEscolhido !== iaSugestao.idMedico && (
                <small className="ia-sugestao-dialog__aviso">
                  Você escolheu um médico diferente do sugerido — a escolha é sua, e é ela
                  que será aplicada.
                </small>
              )}
            </div>

            {/* PEDIR AO MESMO TEMPO A MAIS DE UM (@R 18/09). Um procedimento que um médico
                demora a cotar — ou nem cota — hoje espera na fila até alguém lembrar de
                cobrar outro. Pedir a dois em paralelo troca espera por escolha.
                O campo aceita QUALQUER médico do cadastro, não só os candidatos da IA: a
                lista da IA é conselho, e quem opera às vezes sabe de um nome que o
                cadastro pobre não revela. */}
            <div className="ia-sugestao-dialog__bloco ia-sugestao-dialog__troca">
              <div className="ia-sugestao-dialog__label">
                Também pedir orçamento a (opcional)
              </div>
              <MultiSelect
                value={iaTambemPedir}
                options={medicosOptions.filter((m) => m.value !== iaMedicoEscolhido)}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setIaTambemPedir(e.value ?? [])}
                placeholder="Nenhum outro — só o médico acima"
                display="chip"
                filter
                disabled={iaAplicando}
                className="ia-sugestao-dialog__drop"
              />
              <small className="ia-sugestao-dialog__aviso">
                {iaTambemPedir.length === 0
                  ? 'O pedido fica com o médico acima e o orçamento é pedido só a ele.'
                  : `Vamos pedir orçamento a ${iaTambemPedir.length + 1} médicos. O caso continua ` +
                    'com o médico escolhido acima; os demais ficam registrados como cotação ' +
                    'concorrente — a mensagem do pedido é a mesma, você copia em Orçamento ' +
                    'Médico e envia a cada um.'}
              </small>
            </div>

            {/* QUANTO ELE COBRA (@R 17/09: "os preços dos últimos empenhos dele para a
                cirurgia, para sabermos a competitividade"). O modal dizia se o médico
                responde e em quantos dias; não dizia por quanto — e entre dois médicos
                adequados, escolhe-se por preço. A comparação é contra a REFERÊNCIA DO
                PEDIDO (razão orçado÷ref), nunca contra o valor bruto de outro médico:
                valor bruto compara procedimentos, ¬preços (coluna custa mais que catarata
                sem ser mais cara). O bloco segue o médico do box, não o sugerido. */}
            <div className="ia-sugestao-dialog__bloco">
              <div className="ia-sugestao-dialog__label">
                Quanto este médico costuma cobrar
                {precosMedico?.camada && precosMedico.n > 0 && (
                  <span className="ia-precos__camada"> · {precosMedico.n} orçamento{precosMedico.n > 1 ? 's' : ''} na {precosMedico.camada}</span>
                )}
              </div>
              {carregandoPrecos ? (
                <div className="ia-sugestao-dialog__texto">medindo…</div>
              ) : !precosMedico || !precosMedico.n ? (
                <div className="ia-sugestao-dialog__texto">
                  Nenhum orçamento registrado para este médico — não há como medir preço ainda.
                  <strong> Isto não é "barato": é não medido.</strong>
                </div>
              ) : (
                <>
                  <div className="ia-precos__resumo">
                    {precosMedico.medianaRazao != null && (
                      <span className={precosMedico.medianaRazao > 1 ? 'ia-precos__acima' : 'ia-precos__abaixo'}>
                        {precosMedico.medianaRazao > 1 ? '↑' : '↓'}{' '}
                        {Math.abs(Math.round((precosMedico.medianaRazao - 1) * 100))}%{' '}
                        {precosMedico.medianaRazao > 1 ? 'acima' : 'abaixo'} da referência
                      </span>
                    )}
                    {precosMedico.estimativaNestePedido != null && (
                      <span className="ia-precos__estimativa">
                        neste pedido, provavelmente{' '}
                        <strong>{precosMedico.estimativaNestePedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        {precosMedico.refPrecoDestePedido != null && (
                          <> · referência {Number(precosMedico.refPrecoDestePedido).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</>
                        )}
                      </span>
                    )}
                  </div>
                  <ul className="ia-sugestao-dossie ia-precos__lista">
                    {precosMedico.ultimos.map((u: any) => (
                      <li key={u.id}>
                        {u.data ? new Date(u.data).toLocaleDateString('pt-BR') : 's/ data'} ·{' '}
                        <strong>{Number(u.valorOrcamento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        {u.razao != null && <> ({u.razao > 1 ? '+' : ''}{Math.round((u.razao - 1) * 100)}% vs ref)</>}
                        {' · '}{u.subarea || u.procedimento || '—'}
                        {u.ganhou && <span className="ia-precos__ganho"> · ganhou</span>}
                      </li>
                    ))}
                  </ul>
                </>
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
                label={
                  iaAplicando
                    ? 'Aplicando...'
                    : iaTambemPedir.length
                      ? `Confirmar e pedir a ${iaTambemPedir.length + 1} médicos`
                      : 'Confirmar Médico'
                }
                icon="pi pi-check"
                severity="success"
                onClick={handleAplicarSugestaoIA}
                loading={iaAplicando}
                disabled={!iaMedicoEscolhido}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}


