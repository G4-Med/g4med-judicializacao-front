import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { KpisValorEUrgencia } from '../../components/PainelKpis/kpisValorUrgencia';
import type { DataTableFilterMeta, DataTablePageEvent, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { FilterMatchMode } from 'primereact/api';
import { getJuridico, salvarJuridico, getStatusOrders, getAnexosOrder, getCnjCandidatos, confirmarCnj, uploadAnexoOrder, getInteligenciaPedido } from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import './JuridicoPage.css';
import { colunaSolicitante, tagTipoPaciente , cabecalhoComHint, colunaSegredo, colunaProcedimento, colunaOrigem, colunaCadastro, colunaInteiroTeor, colunaCnj, colunaSei, colunaComarca, filtroMaiorQue, casaPeriodo, OPCOES_PERIODO, filtroOpcoes, casaOpcaoDosDados, filtroOpcoesDosDados } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { PainelPrecos } from '../../components/PainelPrecos/PainelPrecos';
import { ContadorRegistros } from '../../components/ContadorRegistros/ContadorRegistros';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { BotaoCopiar } from '../../components/BotaoCopiar/BotaoCopiar';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { NovoPedidoManual } from '../../components/NovoPedidoManual/novoPedidoManual';
import { TempoDecorrido } from '../../components/Tempo/tempo';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { AbaPendenciasJuridicas, usePendenciasAbertas, usePendenciasParaAgir } from '../../components/PendenciaJuridica/PendenciaJuridica';

// Meta desta fase (triagem jurídica) — espelha backend/funil.py FASES['triagem'].meta_dias.
// "a análise sai no dia seguinte — libera para mim até meio-dia" (fala do @R na reunião).
// @R 28/08: "tempo máximo no funil 5 dias... passou de 5 dias tá errado" (era 1 = ideal).
// Mesmo teto declarado em funil.py fase 'triagem' (meta_dias) — mudou lá, muda aqui.
const SLA_META_DIAS_TRIAGEM = 5;

interface ProcessoJuridico {
  id: number;
  paciente: string;
  dataNascimento: string | null;
  idade: number;
  procedimento: string;
  refPreco: number;
  dataPedido: string;
  dias: number;
  chegouEm?: string | null;   // instante em que ENTROU no sistema (com hora)
  // tempos: duas medidas, cada uma com a precisão que o dado sustenta (backend _tempos)
  chegadaEm?: string | null;
  chegadaComHora?: boolean;
  minutosDesdeChegada?: number | null;
  diasDesdeChegada?: number | null;
  faseDesde?: string | null;
  faseComHora?: boolean;
  minutosNaFase?: number | null;
  diasNaFase?: number | null;
  statusJuridico: string;
  nprocesso: string;
  numeroSei: string | null;
  familiaSei: string | null;
  solicitacao: string;
  emailSolicitante: string;
  possivelMenorIdade?: boolean;
  qtdAnexos?: number;
  // Geografia do processo, derivada do CNJ no backend (task #212): federal não tem comarca.
  comarca?: string | null;
  distanciaKm?: number | null;
  esfera?: 'estadual' | 'federal' | 'trabalhista' | 'stf' | 'stj' | 'outra' | null;
  geoMotivo?: string | null;
}

interface ProcessoJuridicoRow extends ProcessoJuridico {
  sequencial: number;
}

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



// Consultas públicas para achar o processo PELO NOME DO PACIENTE quando o pedido chega sem CNJ.
// @R 15/09: "pedidos na fase 1 sem cnj podem ser processos válidos, e aí o nome do paciente tem que
// ser buscado em eproc, pje e federal para localizar o processo; se não localizar, marcar como
// segredo de justiça". Endereços conferidos em 15/09/2026 (HTTP 200): PJe TJMG, eproc TJMG (o
// endereço antigo eproc1g redireciona para eproc-consulta-publica-1g) e eproc TRF6 (Justiça Federal em MG).
const CONSULTAS_PROCESSO = [
  { rotulo: 'PJe (TJMG)', url: 'https://pje-consulta-publica.tjmg.jus.br/pje/ConsultaPublica/listView.seam' },
  { rotulo: 'eproc (TJMG)', url: 'https://eproc-consulta-publica-1g.tjmg.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica' },
  { rotulo: 'eproc da Justiça Federal (TRF6)', url: 'https://eproc1g.trf6.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica' },
];

export function JuridicoPage() {
  // Recarrega a tabela quando a ficha muda a situação de um pedido (@R 17/09).
  const { versaoDados, abrir: abrirFicha } = useFichaPedido();
  // Reunião 20/09 (Fabrício): aba das pendências que voltaram da fase 3 para o jurídico resolver.
  // A aba mora na URL (?aba=pendencias): o menu tem entrada própria para o 1.1 (@R 21/09: "cadê a parte do 1.1?" —
  // com o menu aberto a aba ficava escondida atrás dele). Estado local faria menu e botões discordarem.
  const [parametros, setParametros] = useSearchParams();
  const aba: 'analise' | 'pendencias' = parametros.get('aba') === 'pendencias' ? 'pendencias' : 'analise';
  const setAba = (a: 'analise' | 'pendencias') => setParametros(a === 'pendencias' ? { aba: 'pendencias' } : {}, { replace: true });
  const pendenciasAbertas = usePendenciasAbertas();
  const { paradas: pendenciasParadas } = usePendenciasParaAgir();   // o menu abre fechado: o número tem de estar na tela de trabalho
  const { isReadOnly, profile } = useAccess();
  const readOnly = isReadOnly('juridico');
  // Gerente só consulta esta tela, mas também recebe pedidos fora do e-mail: pode cadastrar à mão.
  const podeCadastrarPedido = !readOnly || profile.group === 'GERENTE';
  const [loading, setLoading] = useState(false);
  const [processos, setProcessos] = useState<ProcessoJuridico[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [processoEditando, setProcessoEditando] = useState<ProcessoJuridicoRow | null>(null);
  const [obsObrigatorio, setObsObrigatorio] = useState(false);
  const [nprocesso, setNprocesso] = useState('');
  // SEI (reunião 22/08): o pedido ganha DOIS números — o do processo e o do SEI.
  // O SEI é o que permite achar o pagamento do lado do Estado.
  const [numeroSei, setNumeroSei] = useState('');
  const [familiaSei, setFamiliaSei] = useState<string | null>(null);
  const [statusJuridico, setStatusJuridico] = useState('');
  const [orcamentos, setOrcamentos] = useState('');
  const [obs, setObs] = useState('');
  const [statusJuridicoOpts, setStatusJuridicoOpts] = useState<{label: string, value: string}[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro')
  const [previewNome, setPreviewNome] = useState<string>('')
  // Candidatos a CNJ (task #217 peça 3): o batch noturno extrai dos anexos e PROPÕE;
  // o humano confirma aqui vendo a origem — o sistema nunca grava CNJ sozinho (F1/G4).
  const [candidatosCnj, setCandidatosCnj] = useState<{ cnj: string; origem?: string; documento?: string | null;
                                            pagina?: number | null; sugeridoId?: number }[]>([])
  const [confirmandoCnj, setConfirmandoCnj] = useState(false)
  // Inteligência do pedido NA CHEGADA (/sc:desenho 28/08: "como estamos produzindo
  // inteligência para cada pedido que chega novo") — a memória de casos anteriores
  // aparece ANTES da decisão de cotar, não só na hora de orçar (fase 3).
  const [intel, setIntel] = useState<any | null>(null)
  // Peça de inteiro teor (@R 27/08): obrigatória ao decidir Cotar OU Não Cotar.
  const [inteiroTeorFile, setInteiroTeorFile] = useState<File | null>(null)
  const [inteiroTeorJaAnexado, setInteiroTeorJaAnexado] = useState(false)
  // @R 15/09: a fase 1 NÃO trava mais por falta de peça nem de CNJ — abre um aviso do que se perde e
  // a pessoa decide. O que falta NESTA decisão; null = aviso fechado.
  const [avisoAvanco, setAvisoAvanco] = useState<{ semCnj: boolean; semPeca: boolean; cnjInvalido?: boolean; motivoBackend?: string } | null>(null)
  // Seguir sem o CNJ exige marcar que está ciente (@R 15/09 12:17).
  const [cienteSemCnj, setCienteSemCnj] = useState(false)

  // Mesma conta do backend (validators.py, Res. CNJ 65/2008, mod 97-10): DV = 98 - (NNNNNNN+AAAAJTROOOO+'00') % 97.
  // Resto calculado dígito a dígito para não depender de BigInt.
  const cnjDigitoValido = (valor: string) => {
    const d = valor.replace(/\D/g, '');
    if (d.length !== 20) return false;
    let resto = 0;
    for (const c of d.slice(0, 7) + d.slice(9) + '00') resto = (resto * 10 + Number(c)) % 97;
    return 98 - resto === Number(d.slice(7, 9));
  };

  const colunasCfg = useColunasVisiveis('analise-juridica');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    tipoPaciente: { value: null, matchMode: 'custom' },
    chegouEm: { value: null, matchMode: FilterMatchMode.CUSTOM },
    ...FILTRO_PAGAMENTO,   // já pago no CNJ? decide se vale cotar
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    idade: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    nprocesso: { value: '', matchMode: FilterMatchMode.CONTAINS },
    numeroSei: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
  });

  const [visibleProcessos, setVisibleProcessos] = useState<ProcessoJuridicoRow[]>([]);

  // Preços do procedimento (task #207): UMA linha aberta por vez. A consulta é pesada
  // (~5s na 1ª vez, cache de 6h no backend) — deixar N linhas abertas dispararia N
  // consultas simultâneas e travaria a tela que o painel deveria ajudar.
  // Formato OBJETO {id: true}, não array: com dataKey, o PrimeReact emite e consome o
  // mapa por id (datatable.cjs L3139). A v1 assumia array — e clique nenhum abria
  // (bug relatado pelo @R com captura 27/08 11:33).
  const [linhaExpandida, setLinhaExpandida] = useState<Record<number, boolean>>({});

  const carregarDados = () => {
    setLoading(true);
    getJuridico()
      .then(({ data }) => {
        setProcessos(data.map((o: any) => ({
          ...o,
          idade: calcularIdade(o.dataNascimento),
        })));
      })
      .catch(() => console.error('Erro ao carregar jurídico'))
      .finally(() => setLoading(false));
  };

    useEffect(() => {
    setLoading(true);
    Promise.all([getJuridico(), getStatusOrders()])
        .then(([juridicRes, statusRes]) => {
        setStatusJuridicoOpts(
            statusRes.data.statusJuridico.map((s: string) => ({ label: s, value: s }))
        );
        setProcessos(juridicRes.data.map((o: any) => ({
            ...o,
            idade: calcularIdade(o.dataNascimento),
        })));
        })
        .catch(() => console.error('Erro ao carregar jurídico'))
        .finally(() => setLoading(false));
    }, [versaoDados]);

  const dataComSequencial = useMemo<ProcessoJuridicoRow[]>(() => {
    return processos.map((item, index) => ({ ...item, sequencial: index + 1 }));
  }, [processos]);

  useEffect(() => { setVisibleProcessos(dataComSequencial); }, [dataComSequencial]);

  const kpis = useMemo(() => {
    const total = visibleProcessos.length;
    const somaRefPreco = visibleProcessos.reduce((acc, p) => acc + (p.refPreco ?? 0), 0);
    const valorMedio = total > 0 ? somaRefPreco / total : 0;
    const maisAntigo = total > 0 ? Math.max(...visibleProcessos.map(p => p.dias)) : 0;
    return { total, valorMedio, maisAntigo };
  }, [visibleProcessos]);

const abrirEdicao = (rowData: ProcessoJuridicoRow) => {
  setProcessoEditando(rowData);
  setNprocesso(rowData.nprocesso ?? '');
  setNumeroSei(rowData.numeroSei ?? '');
  setFamiliaSei(rowData.familiaSei ?? null);
  setStatusJuridico('');
  setOrcamentos('');
  setObs('');
  setObsObrigatorio(false);
  setAvisoAvanco(null);
  setEditDialogVisible(true);

  // adiciona isso
  setAnexos([])
  setLoadingAnexos(true)
  getAnexosOrder(rowData.id, 'RELATORIO')
    .then((res: any) => setAnexos(res.data.anexos))
    .catch(() => setAnexos([]))
    .finally(() => setLoadingAnexos(false))

  // memória de casos anteriores — fail-soft: erro nunca trava a triagem
  setIntel(null)
  getInteligenciaPedido(rowData.id)
    .then((res: any) => setIntel(res.data))
    .catch(() => setIntel(null))

  // inteiro teor: se o pedido JÁ tem a peça, não avisar de novo
  setInteiroTeorFile(null)
  setInteiroTeorJaAnexado(false)
  getAnexosOrder(rowData.id, 'DECISAO_INTEIRO_TEOR')
    .then((res: any) => setInteiroTeorJaAnexado((res.data.anexos ?? []).length > 0))
    .catch(() => setInteiroTeorJaAnexado(false))

  // só busca candidato quando o pedido ainda não tem CNJ (senão o endpoint devolve 409)
  setCandidatosCnj([])
  if (!rowData.nprocesso) {
    getCnjCandidatos(rowData.id)
      .then((res: any) => setCandidatosCnj(res.data.candidatos ?? []))
      .catch(() => setCandidatosCnj([]))
  }
};

  const usarCandidatoCnj = async (cnj: string) => {
    if (!processoEditando) return;
    setConfirmandoCnj(true);
    try {
      await confirmarCnj(processoEditando.id, cnj, 'confirmar');
      setNprocesso(cnj);
      setCandidatosCnj([]);
      carregarDados();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Não foi possível confirmar este CNJ.');
    } finally {
      setConfirmandoCnj(false);
    }
  };

  // @R 15/09 verbatim: "vamos deixar a pessoa avançar de fase sem enviar a peça inteira e na fase 1, se
  // ela tentar fazer isso vai aparecer um aviso dizendo que sem a peça de inteiro teor não é possível
  // extrair exames e demais informações como orçamentos já presentes na peça, e o número do cnj é
  // obrigatório para cotar, o usuário tem a opção de passar sem o número do cnj também e ele deve saber
  // que sem ele não é possível protocolar; se ele confirmar ele pode avançar".
  // ANTES: Cotar sem CNJ travava aqui, e a peça travava o escritório (a caixa "não teve peça", de 29/08,
  // teve 0 usos em produção em 15/09). AGORA: falta de CNJ ou de peça abre o aviso; só confirmar grava.
  // `confirmado` vem SÓ do botão do aviso — o Salvar chama handleSalvar() sem argumento.
  const handleSalvar = async (confirmado = false) => {
    if (!processoEditando) return;

    // Recusa exige o motivo com as palavras da pessoa (mín. 20 chars) — é este texto
    // que alimenta a análise de padrões de recusa (regra também aplicada no backend).
    if (statusJuridico === 'Não Cotar' && obs.trim().length < 20) {
      setObsObrigatorio(true);
      return;
    }
    // Reunião Fabrício 20/09 (Fase 4): para COTAR, os orçamentos citados nos autos e a observação
    // são obrigatórios (mesma regra no servidor). Pendência jurídica (1.1) exige dizer o que falta.
    if (statusJuridico === 'Cotar' && orcamentos.trim().length < 3) {
      alert('Registre os orçamentos citados nos autos antes de marcar Cotar (se não houver nenhum, escreva "nenhum").');
      return;
    }
    if ((statusJuridico === 'Cotar' || statusJuridico === 'Pendência jurídica') && obs.trim().length < 10) {
      setObsObrigatorio(true);
      return;
    }

    const decidindo = statusJuridico === 'Cotar' || statusJuridico === 'Não Cotar';
    // @R 15/09 12:17: número digitado com dígito errado travava num alerta sem saída (3 tentativas no
    // mesmo pedido às 11:38). Agora vira o mesmo aviso: corrigir, ou seguir SEM o número (nunca gravar
    // o número errado — ele quebra o cruzamento com o pagamento). Mesma regra do backend: só confere se mudou.
    const cnjDigitado = nprocesso.trim();
    const cnjInvalido = cnjDigitado !== '' && cnjDigitado !== (processoEditando.nprocesso ?? '') && !cnjDigitoValido(cnjDigitado);
    const semCnj = statusJuridico === 'Cotar' && (!cnjDigitado || cnjInvalido);
    const semPeca = decidindo && !inteiroTeorJaAnexado && !inteiroTeorFile;
    if (!confirmado && (semCnj || semPeca || cnjInvalido)) {
      setCienteSemCnj(false);
      setAvisoAvanco({ semCnj, semPeca, cnjInvalido });
      return;
    }
    setAvisoAvanco(null);
    if (cnjInvalido) setNprocesso('');

      const payload = {
        nprocesso: cnjInvalido ? null : (cnjDigitado || null),
        numeroSei: numeroSei || null,
        statusJuridico: statusJuridico || null,
        // Confirmou seguir sem a peça → o backend registra quem declarou e quando (semPecaDeclaracao).
        semPecaInteiroTeor: semPeca,
        orcamentos: orcamentos || null,
        obs: obs || null,
    };

      console.log('PAYLOAD ENVIADO PARA salvarJuridico:', payload);
      console.log('PROCESSO EDITANDO:', processoEditando);

    try {
        // upload da peça ANTES do salvar — o backend confere a existência dela
        if (decidindo && !inteiroTeorJaAnexado && inteiroTeorFile) {
          await uploadAnexoOrder(processoEditando.id, inteiroTeorFile, 'DECISAO_INTEIRO_TEOR');
          setInteiroTeorJaAnexado(true);
        }
        await salvarJuridico(processoEditando.id, payload);
        carregarDados();
        setEditDialogVisible(false);
    } catch (err: any) {
      console.error('ERRO AO SALVAR JURÍDICO:', err);
      const msg: string = err?.response?.data?.error ?? '';
      // Rede de segurança: se o backend recusar o CNJ por outra regra, abre o aviso em vez de travar.
      if (/Número CNJ|Número de processo inválido/i.test(msg)) {
        setCienteSemCnj(false);
        setAvisoAvanco({ semCnj: statusJuridico === 'Cotar', semPeca: false, cnjInvalido: true, motivoBackend: msg });
        return;
      }
        alert(msg || 'Erro ao salvar. Tente novamente.');
    }
  };

  const formatarData = (data: string) => {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  const editarBodyTemplate = (rowData: ProcessoJuridicoRow) => (
    <span className="juridico-acoes">
      <Button
        icon="pi pi-pencil"
        rounded outlined severity="secondary"
        onClick={() => abrirEdicao(rowData)}
        aria-label="Analisar este pedido"
      />
      {/* O botão "ir para o processo" saiu daqui (@R 28/08: "na tela 1 temos um
          botão de ação que é abrir processos, não precisamos") — o CabecalhoFase
          já leva à tela Processos. */}
    </span>
  );

  return (
    <div className="juridico-page">
      <PrimeiraVisitaInfo etapaId="juridico" />
      {/* task #211: número da fase + quem opera + SLA ativo, derivados do SSOT (ETAPAS/permissions) */}
      <div className="page-header">
        <CabecalhoFase nome="Análise Jurídica" screen="juridico" slaDias={SLA_META_DIAS_TRIAGEM}
          subtitulo="Processos aguardando análise jurídica" />
      </div>

      {readOnly && <ReadOnlyBanner />}

      <div className="mc-pend-abas" role="tablist" aria-label="Análise Jurídica">
        <button type="button" role="tab" id="aba-analise" aria-controls="painel-analise" aria-selected={aba === 'analise'} className={aba === 'analise' ? 'ativa' : ''} onClick={() => setAba('analise')}>1. Análise</button>
        <button type="button" role="tab" id="aba-pendencias" aria-controls="painel-pendencias" aria-selected={aba === 'pendencias'} className={aba === 'pendencias' ? 'ativa' : ''} onClick={() => setAba('pendencias')}>1.1 Pendências ({pendenciasAbertas}{pendenciasParadas ? ` · ${pendenciasParadas} parada(s)` : ''})</button>
      </div>
      {aba === 'pendencias' && <div role="tabpanel" id="painel-pendencias" aria-labelledby="aba-pendencias"><AbaPendenciasJuridicas onAbrirFicha={abrirFicha} readOnly={readOnly} /></div>}
      <div role="tabpanel" id="painel-analise" aria-labelledby="aba-analise" style={{ display: aba === 'analise' ? undefined : 'none' }}>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <KpisValorEUrgencia linhas={visibleProcessos} todas={dataComSequencial} valorDe={(p:any)=>p.refPreco ?? 0} />
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
          <i className="pi pi-table" />Pedidos aguardando triagem jurídica
          {/* Quantos são e quantos estão fora do prazo (task #208) */}
          <ContadorRegistros
            total={dataComSequencial.length}
            visiveis={visibleProcessos.length}
            substantivo="pedidos"
            fases={[
              {
                rotulo: 'no prazo',
                quantidade: visibleProcessos.filter((p) => p.dias <= SLA_META_DIAS_TRIAGEM).length,
                tom: 'ok',
              },
              {
                rotulo: 'fora do prazo',
                quantidade: visibleProcessos.filter((p) => p.dias > SLA_META_DIAS_TRIAGEM).length,
                tom: 'alerta',
              },
            ]}
          />
        </h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            {podeCadastrarPedido && <NovoPedidoManual aoCriar={() => carregarDados()} />}
            <BotaoExportarExcel todos={dataComSequencial} visiveis={visibleProcessos} nome="analise-juridica" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable
          aria-label="Pedidos aguardando triagem jurídica"
          value={dataComSequencial}
          onValueChange={(value) => setVisibleProcessos(value as ProcessoJuridicoRow[])}
          rowClassName={(r: any) => [((rowData: ProcessoJuridicoRow) =>
            rowData.dias > SLA_META_DIAS_TRIAGEM ? 'linha-fora-sla' : ''
          )(r), rowClassRepedido(r)].filter(Boolean).join(' ')}
          dataKey="id"
          expandedRows={linhaExpandida}
          onRowToggle={(e) => {
            // Só a última aberta permanece: 1 consulta por vez (ver comentário no estado).
            const mapa = (e.data ?? {}) as Record<number, boolean>;
            const nova = Object.keys(mapa).find((id) => !linhaExpandida[Number(id)]);
            setLinhaExpandida(nova ? { [Number(nova)]: true } : {});
          }}
          rowExpansionTemplate={(rowData: ProcessoJuridicoRow) => (
            <PainelPrecos
              orderId={rowData.id}
              procedimento={rowData.procedimento}
              nossoPreco={rowData.refPreco || null}
            />
          )}
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          onPage={(e: DataTablePageEvent) => { setFirst(e.first); setRows(e.rows); }}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={(e: DataTableSortEvent) => { setSortField(e.sortField); setSortOrder(e.sortOrder); }}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          emptyMessage="Nenhum processo aguardando jurídico."
          className="juridico-table"
        >{colunasCfg.filtrar(<>

          {/* Abre o painel de preços do procedimento dentro da própria linha (task #207) */}
<Column expander style={{ width: '3.5rem' }} headerStyle={{ width: '3.5rem' }}
            headerClassName="col-expander" bodyClassName="col-expander" frozen alignFrozen="left" />
          <Column field="id" header="#" headerTooltip="Número do pedido (o mesmo da Ficha, dos e-mails e da API)" style={{ minWidth: '4rem' }}  frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{editarBodyTemplate(r)}</>, excluir: carregarDados })}
          <Column field="paciente" header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')} sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '16rem' }}
            body={(r: ProcessoJuridicoRow) => (
              <span className="juridico-paciente-cel col-paciente-upper">
                {r.paciente}
                <BotaoCopiar valor={r.paciente} rotulo="nome do paciente" />
                {r.possivelMenorIdade && (
                  <Tag value="Menor de idade — avaliar Segredo de Justiça" severity="warning"
                    className="juridico-tag-menor-idade"
                    title="Paciente com menos de 18 anos. Confirme se este pedido deve ser marcado Segredo de Justiça." />
                )}
              </span>
            )}  frozen alignFrozen="left" />
          {colunaOrigem(dataComSequencial)}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo(undefined, dataComSequencial)}
          {colunaRepedido(dataComSequencial)}
          <Column
            field="idade"
            header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')}
            sortable
            filter
            dataType="numeric"
            filterElement={(o) => filterElement(o, 'Buscar')}
            style={{ minWidth: '7rem' }}
          />
          <Column field="tipoPaciente"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(dataComSequencial, (l: any) => l?.tipoPaciente, 'Todos')} header={cabecalhoComHint('Grupo etário', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')} sortable style={{ minWidth: '7rem' }}
            body={(r: any) => tagTipoPaciente(r.tipoPaciente)} />
          {colunaProcedimento()}
          {/* @R 28/08: "a data que o pedido chegou e o horário e o tempo atual no funil" */}
<Column field="chegouEm"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaPeriodo}
            filterElement={filtroOpcoes(OPCOES_PERIODO, 'Todas')} header={cabecalhoComHint('Chegou em',
              'Quando o pedido ENTROU no sistema (o monitor lê o e-mail a cada 10 min). Data e hora.')}
            sortable style={{ minWidth: '10rem' }}
            body={(r: ProcessoJuridicoRow) => {
              if (!r.chegouEm) return <span className="juridico-geo-vazio">—</span>;
              const d = new Date(r.chegouEm);
              return <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {d.toLocaleDateString('pt-BR')} <small style={{ opacity: 0.7 }}>{d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
              </span>;
            }} />
          {/* Duas colunas, ¬uma: "desde a chegada" e "nesta fase" respondem perguntas
              diferentes e antes dividiam o mesmo rótulo. Ver src/components/Tempo. */}
          <Column field="dias" header={cabecalhoComHint('Desde a chegada',
              `Há quanto tempo o pedido ENTROU no sistema. Teto: ${SLA_META_DIAS_TRIAGEM} dias — acima disso está errado (fica vermelho). Onde a chegada tem hora registrada, mostra minutos/horas; onde só há a data, mostra dias.`)}
            sortable filter dataType="numeric" filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '9rem' }}
            body={(r: ProcessoJuridicoRow) => (
              <TempoDecorrido minutos={r.minutosDesdeChegada} dias={r.diasDesdeChegada ?? r.dias}
                comHora={r.chegadaComHora} teto={SLA_META_DIAS_TRIAGEM}
                oQueConta="Tempo desde a chegada do pedido" />
            )} />
          <Column field="diasNaFase" header={cabecalhoComHint('Nesta fase',
              'Há quanto tempo o pedido está parado NESTA etapa. É outra conta: um pedido pode ter chegado há 60 dias e estar nesta fase há 2.')}
            sortable style={{ minWidth: '8rem' }}
            body={(r: ProcessoJuridicoRow) => (
              <TempoDecorrido minutos={r.minutosNaFase} dias={r.diasNaFase}
                comHora={r.faseComHora} oQueConta="Tempo parado nesta fase" />
            )} />
          {colunaAnexosSES(dataComSequencial)}
          {/* CNJ e SEI nas colunas (@R 27/08 12:59): os dois números do pedido, buscáveis e copiáveis */}
            {/* 17/09/2026: esta tela tinha a SUA PRÓPRIA coluna de CNJ, cópia da compartilhada.
                Resultado: quando o seletor de números lidos do documento entrou em `colunaCnj`,
                ele apareceu em todas as listagens MENOS nesta — justamente a que o jurídico usa.
                Consumir a compartilhada faz a melhoria chegar aqui e evita que a próxima mudança
                precise ser feita em dois lugares (e seja esquecida num deles). */}
            {colunaCnj('14rem', () => carregarDados())}
            {colunaSei('12rem', () => carregarDados())}
            {colunaComarca()}
          {colunaCadastro()}
          {/* Selo Segredo em toda tabela (@R 27/08 16:52) — na fase 1 é onde a decisão
              COTAR/NÃO COTAR acontece já sabendo que o processo é sigiloso. */}
<Column field="segredo" header="Segredo" sortable style={{ minWidth: '9rem' }}
            body={(r: any) => {
              if (r.segredo === 'sim') return <Tag value="Segredo de Justiça" severity="danger" icon="pi pi-lock" title={r.segredoFonte ?? 'Marcado no sistema'} />;
              if (r.segredo === 'possivel') return <Tag value="Possível segredo" severity="warning" icon="pi pi-question-circle" title={`Sinal da consulta ao CNJ. ${r.segredoFonte ?? ''}`} />;
              if (r.segredo === 'nao') return <Tag value="Sem segredo" severity="secondary" />;
              return <span className="juridico-geo-vazio">—</span>;
            }} />
          {colunaInteiroTeor()}
          {colunaSolicitante('13rem', dataComSequencial)}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>
      </div>

      <Dialog
        header="Análise Jurídica"
        visible={editDialogVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={() => setEditDialogVisible(false)}
        className="juridico-edit-dialog"
      >
        {processoEditando && (
          <div className="juridico-form-grid">

            {/* Campos somente leitura (readOnly permite selecionar/copiar) */}
            <div className="field field-span-3">
              <label>Paciente</label>
              <InputText value={processoEditando.paciente} readOnly />
            </div>
            <div className="field field-span-1">
              <label>Idade</label>
              <InputText value={String(processoEditando.idade)} readOnly />
            </div>
            <div className="field field-span-4">
              <label>Procedimento</label>
              <InputText value={processoEditando.procedimento} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Data da Solicitação</label>
              <InputText value={formatarData(processoEditando.dataPedido)} readOnly />
            </div>
            <div className="field field-span-2">
              <label>Dias da Solicitação</label>
              <InputText value={String(processoEditando.dias)} readOnly />
            </div>

            {/* Anexos */}
            {processoEditando.solicitacao && (
              <div className="field field-span-4">
                <label>Solicitação (corpo do e-mail)</label>
                <InputTextarea value={processoEditando.solicitacao} rows={5} readOnly autoResize />
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


            {/* Campos editáveis */}
            {candidatosCnj.length > 0 && !nprocesso && (
              <div className="field field-span-4 candidato-cnj" role="region" aria-label="Candidato a número do processo">
                <label>
                  {candidatosCnj.length > 1
                    // @R 17/09: com mais de um número o sistema não escolhe — quem decide é
                    // o jurídico. Dizer QUANTOS são muda a leitura: não é "o número", é uma
                    // escolha entre candidatos (uma cópia integral cita outros processos).
                    ? `${candidatosCnj.length} números de processo encontrados nos anexos — escolha o correto`
                    : 'Nº do processo encontrado nos anexos — confirme antes de usar'}
                </label>
                {candidatosCnj.map((c) => (
                  <div key={c.cnj} className="candidato-cnj__linha">
                    <code className="juridico-numero">{c.cnj}</code>
                    <small>
                      {/* documento + página só existem na fonte nova (CnjSugerido); o batch
                          antigo só sabia dizer a origem. Mostrar o que houver, sem prometer. */}
                      {c.documento
                        ? <>em <strong>{c.documento}</strong>{c.pagina ? `, página ${c.pagina}` : ''}</>
                        : <>origem: {c.origem === 'ocr' ? 'OCR do anexo escaneado' : 'texto do anexo'}</>}
                      {' · dígito verificador válido'}
                    </small>
                    <Button label="Confirmar este CNJ" size="small" icon="pi pi-check"
                      loading={confirmandoCnj} onClick={() => usarCandidatoCnj(c.cnj)} disabled={readOnly} />
                  </div>
                ))}
              </div>
            )}
            <div className="field field-span-2">
              <label>Número do Processo</label>
              <InputText
                value={nprocesso}
                onChange={(e) => setNprocesso(e.target.value)}
                placeholder="Ex: 0012345-67.2026.8.13.0000"
                disabled={readOnly}
              />
              {!nprocesso.trim() && (
                <small style={{ color: '#b45309', display: 'block', lineHeight: 1.45 }}>
                  Sem CNJ o pedido ainda pode ser um processo válido: busque o nome do paciente em{' '}
                  {CONSULTAS_PROCESSO.map((c, i) => (
                    <span key={c.url}>
                      {i > 0 && (i === CONSULTAS_PROCESSO.length - 1 ? ' e ' : ', ')}
                      <a href={c.url} target="_blank" rel="noopener noreferrer">{c.rotulo}</a>
                    </span>
                  ))}
                  . Achou → preencha o CNJ. Não achou → marque Segredo de Justiça. Sem CNJ não é possível protocolar.
                </small>
              )}
            </div>

            {/* SEI — o par do número do processo (reunião 22/08). É por ele que se
                acha o pagamento do lado do Estado; por isso vive ao lado, ¬escondido. */}
            <div className="field field-span-2">
              <label>Número do SEI</label>
              <InputText
                value={numeroSei}
                onChange={(e) => setNumeroSei(e.target.value)}
                placeholder="Ex: 1080.01.0012345/2026-45"
                disabled={readOnly}
              />
              {familiaSei && (
                <small style={{ color: familiaSei === 'PAGADOR' ? '#16a34a' : '#64748b' }}>
                  {familiaSei === 'PAGADOR'
                    ? 'Família PAGADOR — este SEI casa com o empenho do depósito judicial'
                    : familiaSei === 'ADMINISTRATIVO'
                      ? 'Família ADMINISTRATIVO — SEI do pedido'
                      : `Família ${familiaSei}`}
                </small>
              )}
            </div>

            {/* Memória de casos anteriores NA TRIAGEM (/sc:desenho 28/08): o jurídico
                decide cotar VENDO se já respondemos este caso — não só na fase 3. */}
            {intel && (intel.duplicata?.length > 0) && (
              <div className="field field-span-4" style={{
                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
                padding: '10px 14px', fontSize: '0.875rem', color: '#991b1b',
              }}>
                <strong>⚠ Já respondemos este caso antes</strong>
                {intel.duplicata.map((d: any) => (
                  <div key={d.order_id} style={{ marginTop: '4px' }}>
                    Pedido #{d.order_id}{d.mesmo_cnj ? ' (mesmo processo/CNJ)' : ' (mesmo paciente)'}
                    {d.medico_nome ? <> · {d.medico_nome}</> : null}
                    {d.valor_respondido
                      ? <> · enviamos <strong>{d.valor_respondido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</strong></>
                      : null}
                    {d.desfecho ? <> · {d.desfecho.rotulo}</> : null}
                  </div>
                ))}
              </div>
            )}

            {/* @R 28/08 03:2x: "os últimos valores PAGOS para a mesma cirurgia, o valor
                que nossos médicos enviam... com base nos envios nossos e nos resultados
                com quem competimos, e a relação dos médicos que respondem". */}
            {intel && (intel.precos_similares?.pagos_estado?.length > 0 || intel.precos_similares?.n_enviados > 0) && (
              <div className="field field-span-4" style={{
                background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px',
                padding: '10px 14px', fontSize: '0.875rem', color: '#1e3a8a',
              }}>
                <strong>💰 Preços para cirurgia similar</strong>
                {intel.precos_similares.pagos_estado?.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <em>O Estado pagou (resultado da competição):</em>{' '}
                    {intel.precos_similares.pagos_estado.map((pg: any, i: number) => (
                      <span key={i} title={pg.procedimento}>
                        {i > 0 && ' · '}
                        <strong>{pg.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</strong>
                        {pg.data && <small> ({pg.data.split('-').reverse().slice(0, 2).join('/')})</small>}
                      </span>
                    ))}
                  </div>
                )}
                {intel.precos_similares.n_enviados > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <em>Nossos médicos enviaram ({intel.precos_similares.n_enviados}×):</em>{' '}
                    mediana <strong>{intel.precos_similares.mediana_enviados?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</strong>
                    {intel.precos_similares.enviados?.length > 0 && (
                      <small> · últimos: {intel.precos_similares.enviados.map((v: number) =>
                        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })).join(' · ')}</small>
                    )}
                  </div>
                )}
                {intel.experiencia?.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <em>Médicos que respondem:</em>{' '}
                    {[...new Set(intel.experiencia.filter((e: any) => e.medico_nome).map((e: any) => e.medico_nome))]
                      .slice(0, 4).join(' · ') || '—'}
                  </div>
                )}
              </div>
            )}

            <div className="field field-span-2">
              <label>Status Jurídico</label>
              <Dropdown
                value={statusJuridico}
                options={statusJuridicoOpts}
                onChange={(e) => {
                  setStatusJuridico(e.value);
                  if (e.value !== 'Não Cotar') setObsObrigatorio(false);
                }}
                placeholder="Selecione"
              />
              <div className="status-significados">
                <div className="status-significados__titulo">
                  <i className="pi pi-info-circle" /> Significado de cada decisão
                </div>
                <ul>
                  <li><strong>Cotar</strong> — o jurídico aprovou o caso: segue para cotação de orçamento com os médicos (exige o nº do processo).</li>
                  <li><strong>Não Cotar</strong> — o jurídico recusou o caso (inviável ou fora do escopo): não segue para orçamento (exige o motivo em Observações).</li>
                  <li><strong>Segredo de Justiça</strong> — processo sob sigilo judicial: tratamento diferenciado, com fluxo próprio de resposta.</li>
                  <li><strong>Pendência jurídica (1.1)</strong> — falta algo para decidir (documento, número, esclarecimento): o pedido fica na fase 1, marcado com o que falta, e volta para o escritório resolver. Escreva o que falta em Observações.</li>
                </ul>
              </div>
            </div>

            {/* Peça de inteiro teor — obrigatória ao decidir (Cotar OU Não Cotar),
                porque a peça serve a uso posterior independente do rumo (@R 27/08). */}
            <div className="field field-span-4">
              <label>
                Peça de inteiro teor (PDF)
                {(statusJuridico === 'Cotar' || statusJuridico === 'Não Cotar') && !inteiroTeorJaAnexado && (
                  <span style={{ color: '#b45309', marginLeft: '4px' }}>recomendada — sem ela não dá para extrair os exames</span>
                )}
              </label>
              {inteiroTeorJaAnexado ? (
                <small style={{ color: '#16a34a' }}>
                  <i className="pi pi-check-circle" /> Este pedido já tem a peça de inteiro teor anexada.
                </small>
              ) : (
                <>
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={readOnly}
                    onChange={(e) => setInteiroTeorFile(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
            </div>

            <div className="field field-span-4">
              <label>
                Orçamentos citados nos autos
                {statusJuridico === 'Cotar' && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*obrigatório — se não houver, escreva "nenhum"</span>}
              </label>
              <InputTextarea
                value={orcamentos}
                onChange={(e) => setOrcamentos(e.target.value)}
                rows={4}
                autoResize
                placeholder="Nome completo do local e valor de cada orçamento que já está nos autos — ou 'nenhum'"
              />
            </div>

            <div className="field field-span-4">
              <label>
                Observações
                {(statusJuridico === 'Não Cotar' || statusJuridico === 'Cotar') && (
                  <span style={{ color: '#ef4444', marginLeft: '4px' }}>*obrigatório</span>
                )}
                {statusJuridico === 'Pendência jurídica' && (
                  <span style={{ color: '#ef4444', marginLeft: '4px' }}>*obrigatório — diga o que falta</span>
                )}
              </label>
              <InputTextarea
                value={obs}
                onChange={(e) => {
                  setObs(e.target.value);
                  if (e.target.value.trim().length >= 20) setObsObrigatorio(false);
                }}
                rows={3}
                autoResize
                placeholder="Observações sobre o processo..."
                className={obsObrigatorio ? 'p-invalid' : ''}
                disabled={readOnly}
              />
              {obsObrigatorio && (
                <small style={{ color: '#ef4444' }}>
                  Para "Não Cotar", descreva o motivo com suas palavras (mínimo 20 caracteres)
                </small>
              )}
            </div>
          </div>
        )}

        <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setEditDialogVisible(false)} />
          {!readOnly && <Button label="Salvar" icon="pi pi-check" onClick={() => void handleSalvar()} />}
        </div>
      </Dialog>

      {/* Aviso de avanço sem CNJ / sem peça (@R 15/09): diz o que se perde e deixa a pessoa decidir. */}
      <Dialog header="Seguir sem todas as informações?" visible={avisoAvanco !== null}
        style={{ width: '40rem', maxWidth: '96vw' }} modal onHide={() => setAvisoAvanco(null)}>
        {avisoAvanco && (
          <div className="aviso-avanco">
            {avisoAvanco.semPeca && (
              <p style={{ lineHeight: 1.5, margin: '0 0 .9rem' }}>
                <i className="pi pi-exclamation-triangle" style={{ color: '#b45309', marginRight: '.4rem' }} />
                <strong>Sem a peça de inteiro teor</strong> não é possível extrair os exames e as demais
                informações que vêm dentro dela, como orçamentos já presentes na peça. Fica registrado quem
                decidiu seguir sem ela, e a peça pode ser anexada depois em qualquer fase.
              </p>
            )}
            {avisoAvanco.cnjInvalido && (
              <p style={{ lineHeight: 1.5, margin: '0 0 .9rem' }}>
                <i className="pi pi-times-circle" style={{ color: '#b91c1c', marginRight: '.4rem' }} />
                <strong>O número digitado não é um CNJ válido</strong>
                {avisoAvanco.motivoBackend ? ` (${avisoAvanco.motivoBackend})` : ' — a conta do dígito verificador não fecha'}.
                Confira se houve troca ou falta de dígito. Se não tiver o número certo, siga <strong>sem o número</strong>:
                ele não será gravado.
              </p>
            )}
            {avisoAvanco.semCnj && (
              <div style={{ lineHeight: 1.5, margin: '0 0 .9rem' }}>
                <p style={{ margin: '0 0 .5rem' }}>
                  <i className="pi pi-exclamation-triangle" style={{ color: '#b45309', marginRight: '.4rem' }} />
                  <strong>Sem o número do CNJ</strong> não é possível protocolar. Mas o pedido ainda pode ser um
                  processo válido: antes de seguir, busque o nome do paciente nas consultas públicas.
                </p>
                <ul style={{ margin: '0 0 .5rem 1.2rem' }}>
                  {CONSULTAS_PROCESSO.map((c) => (
                    <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer">{c.rotulo}</a></li>
                  ))}
                </ul>
                <p style={{ margin: 0 }}>
                  Achou o processo → volte e preencha o CNJ. Não achou → provavelmente é segredo de justiça:
                  marque <strong>Segredo de Justiça</strong>.
                </p>
              </div>
            )}
            {(avisoAvanco.semCnj || avisoAvanco.cnjInvalido) && (
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', margin: '0 0 .9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={cienteSemCnj} onChange={(e) => setCienteSemCnj(e.target.checked)}
                  style={{ marginTop: '.25rem' }} />
                <span>Estou ciente de que vou seguir <strong>sem o número do processo (CNJ)</strong> e que, sem ele,
                  este pedido não poderá ser protocolado até o número ser preenchido.</span>
              </label>
            )}
            <div className="dialog-footer-actions">
              <Button label="Voltar e completar" outlined onClick={() => setAvisoAvanco(null)} />
              {avisoAvanco.semCnj && (
                <Button label="Não localizei — marcar Segredo de Justiça" outlined severity="secondary"
                  onClick={() => { if (avisoAvanco.cnjInvalido) setNprocesso(''); setStatusJuridico('Segredo de Justiça'); setAvisoAvanco(null); }} />
              )}
              <Button label={avisoAvanco.semCnj || avisoAvanco.cnjInvalido ? 'Seguir sem o CNJ' : 'Confirmar e avançar'}
                icon="pi pi-check" severity="warning"
                disabled={(avisoAvanco.semCnj || avisoAvanco.cnjInvalido) && !cienteSemCnj}
                onClick={() => void handleSalvar(true)} />
            </div>
          </div>
        )}
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
      </div>
    </div>
  );
}




