import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { getParaProtocolar, salvarProtocolar, uploadAnexoOrder, getOrders, getMedicosCompleto, getAnexosOrder, getOrcamentoConsolidado, getEmailRecebimentoPdf } from '../../services/api/orders';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { FilterMatchMode } from 'primereact/api';
import { Dialog } from 'primereact/dialog';
import { RadioButton } from 'primereact/radiobutton';
import { Dropdown } from 'primereact/dropdown';
import { getStatusTagStyle } from '../../utils/statusTag';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { useAccess } from '../../access/AccessContext';
import './ParaProtocolarPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, colunaOrigem } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento } from '../../components/ColunasEmpenho/colunasEmpenho';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';

interface ParaProtocolar {
  id: number;
  paciente: string;
  dataNascimento: string | null;
  procedimento: string;
  area: string;
  subarea: string;
  nprocesso: string;
  refPreco: number;
  valorOrcamento: number;
  dataStatusOrcamento: string | null;
  solicitacao: string;
  cliente: string;
  valor: number;
  dataEnvioOrcamento: string;
  observacoes: string;
  numeroProcesso: string;
  status: string;
  anexoNome: string;
  idMedico?: number | null;
}

interface ParaProtocolarTableRow extends ParaProtocolar {
  sequencial: number;
  dias: number;
}

type NaoProtocolarOpcao = 'perda' | 'segredo' | 'diretoria' | 'sem_protocolo' | '';

export function ParaProtocolarPage() {
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('paraProtocolar');
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<ParaProtocolar[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [dataProtocolo, setDataProtocolo] = useState('');
  const [arquivoPeticao, setArquivoPeticao] = useState<File | null>(null)
  const [arquivoExtra1, setArquivoExtra1] = useState<File | null>(null)
  const [arquivoExtra2, setArquivoExtra2] = useState<File | null>(null)
  const [enviandoProtocolo, setEnviandoProtocolo] = useState(false)
  const [, setMedicos] = useState<any[]>([]);
  const [anexosOrcamento, setAnexosOrcamento] = useState<any[]>([]);
  const [loadingAnexosOrcamento, setLoadingAnexosOrcamento] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
  const [previewNome, setPreviewNome] = useState('');
  const [copiandoId, setCopiandoId] = useState<number | null>(null);

  const colunasCfg = useColunasVisiveis('protocolar');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    cliente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dataEnvioOrcamento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: '', matchMode: FilterMatchMode.CONTAINS },
    status: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

  const [visibleProcessos, setVisibleProcessos] = useState<ParaProtocolarTableRow[]>([]);

  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [protocolarDialogVisible, setProtocolarDialogVisible] = useState(false);
  const [naoProtocolarDialogVisible, setNaoProtocolarDialogVisible] = useState(false);

  const [registroEditando, setRegistroEditando] = useState<ParaProtocolarTableRow | null>(null);
  const [registroProtocolando, setRegistroProtocolando] = useState<ParaProtocolarTableRow | null>(null);
  // O pedido chegou a esta fase SEM CNJ? Só nesse caso o campo do número fica editável no modal.
  const [registroOriginalSemCnj, setRegistroOriginalSemCnj] = useState(false);
  const [registroNaoProtocolar, setRegistroNaoProtocolar] = useState<ParaProtocolarTableRow | null>(null);

  const [naoProtocolarOpcao, setNaoProtocolarOpcao] = useState<NaoProtocolarOpcao>('');
  const [naoProtocolarObs, setNaoProtocolarObs] = useState('');
  const [motivoPerdaCat, setMotivoPerdaCat] = useState<string | null>(null);  // task #223
  // Ligação Amanda/Instituto 28/08 (@R): "na hora que você vai descartar, ele vai
  // pedir pra você colocar a peça inteira e o motivo" — a peça de inteiro teor
  // vira obrigatória em toda saída que não é protocolar, e o motivo deixa de ser opcional.
  const [pecaDescarte, setPecaDescarte] = useState<File | null>(null);
  const [pecaJaAnexada, setPecaJaAnexada] = useState(false);
  const [enviandoDescarte, setEnviandoDescarte] = useState(false);

  const carregarDados = () => {
    setLoading(true);
    Promise.all([getParaProtocolar(), getOrders(), getMedicosCompleto()])
      .then(([paraProtocolarRes, ordersRes, medicosRes]) => {
        const ordersLookup = (ordersRes.data as any[]).reduce<Record<number, any>>((acc, order) => {
          acc[order.id] = order;
          return acc;
        }, {});
        setMedicos(medicosRes.data);
        setRegistros(
          paraProtocolarRes.data.map((o: any) => {
            const orderCompleta = ordersLookup[o.id];
            const medicoId = o.idMedico ?? orderCompleta?.idMedico ?? null;
            const medico = medicosRes.data.find((item: any) => item.id === medicoId);

            return {
          ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
              id: o.id,
              paciente: o.paciente ?? '',
              dataNascimento: o.dataNascimento,
              procedimento: o.procedimento ?? '',
              area: o.area ?? '',
              subarea: o.subarea ?? '',
              nprocesso: o.nprocesso ?? '',
              refPreco: o.refPreco ?? 0,
              valorOrcamento: o.valorOrcamento ?? 0,
              dataStatusOrcamento: o.dataStatusOrcamento,
              solicitacao: o.solicitacao ?? '',
              cliente: medico?.razaoSocial ?? '',
              valor: o.valorOrcamento ?? o.refPreco ?? 0,
              dataEnvioOrcamento: o.dataStatusOrcamento ?? '',
              observacoes: o.solicitacao ?? '',
              numeroProcesso: o.nprocesso ?? '',
              status: o.statusProcesso ?? '',
              anexoNome: '',
              idMedico: medicoId,
            };
          })
        );
      })
      .catch(() => console.error('Erro ao carregar para protocolar'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const dataComCamposCalculados = useMemo<ParaProtocolarTableRow[]>(() => {
    const hoje = new Date();

    return registros.map((item, index) => {
      const dataBase = item.dataEnvioOrcamento
        ? new Date(`${item.dataEnvioOrcamento}T00:00:00`)
        : hoje;

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
    const quantidade = visibleProcessos.length;
    const valor = visibleProcessos.reduce((acc, item) => acc + item.valor, 0);
    const processoMaisAntigo = visibleProcessos.length
      ? Math.max(...visibleProcessos.map((item) => item.dias))
      : 0;

    return {
      quantidade,
      valor,
      processoMaisAntigo
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
    if (!data) return '';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  // O corpo do e-mail extraído traz "[cid:xxxx]" — referência à imagem embutida
  // (ex: assinatura) que não existe fora do e-mail. Não é conteúdo pra ler; suja
  // a leitura de quem só quer o texto da solicitação.
  const formatarObservacoes = (texto: string) =>
    (texto || '')
      .replace(/\[cid:[^\]]+\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || '(sem observações)';

  const precoBodyTemplate = (rowData: ParaProtocolarTableRow) => formatarMoeda(rowData.valor);
  const dataBodyTemplate = (rowData: ParaProtocolarTableRow) => formatarData(rowData.dataEnvioOrcamento);
  const diasBodyTemplate = (rowData: ParaProtocolarTableRow) => <span className="dias-cell">{rowData.dias}</span>;

  const statusBodyTemplate = (rowData: ParaProtocolarTableRow) => (
    <Tag value={rowData.status} style={getStatusTagStyle(rowData.status)} className="status-tag-custom" />
  );

  const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

  const baixarArquivo = async (url: string, nomeArquivo: string) => {
    void nomeArquivo;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Baixa o orçamento JÁ CONSOLIDADO pelo backend (N arquivos → 1 PDF).
  // Vai por fetch autenticado porque a rota exige token — window.open não carrega
  // o cabeçalho de autorização e cairia em 401.
  const baixarOrcamentoConsolidado = async (orderId: number, nprocesso?: string) => {
    try {
      const resp = await getOrcamentoConsolidado(orderId);

      // O backend declara no cabeçalho o que entrou e o que ficou de fora.
      // Arquivo que não desceu é AVISADO — silêncio aqui seria um orçamento
      // incompleto entrando nos autos sem ninguém saber.
      try {
        const relatorio = JSON.parse(resp.headers['x-consolidacao'] ?? '{}');
        const fora = [...(relatorio.ignorados ?? []), ...(relatorio.nao_baixados ?? [])];
        if (fora.length > 0) {
          alert(
            `Atenção: o PDF foi gerado com ${relatorio.paginas} página(s), mas ` +
            `${fora.length} arquivo(s) ficaram de fora:\n\n` +
            fora.map((f: any) => `• ${f.arquivo} — ${f.motivo}`).join('\n') +
            `\n\nConfira antes de protocolar.`
          );
        }
      } catch { /* cabeçalho ausente não impede o download */ }

      const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `orcamento-${(nprocesso || orderId).toString().replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) alert('Este pedido ainda não tem orçamento anexado.');
      else if (status === 502) alert('Os arquivos do orçamento não puderam ser baixados do storage. Tente de novo em instantes.');
      else alert('Erro ao gerar o orçamento consolidado.');
    }
  };

  const abrirOrcamentoAnexo = async (rowData: ParaProtocolarTableRow, modo: 'preview' | 'download') => {
    try {
      const res: any = await getAnexosOrder(rowData.id, 'ORCAMENTO');
      const listaAnexos: any[] = res.data.anexos ?? [];

      if (listaAnexos.length === 0) {
        alert('Nenhum orçamento anexado para este pedido.');
        return;
      }

      // DOWNLOAD = sempre o PDF CONSOLIDADO (todos os arquivos num só).
      // Antes baixava `listaAnexos[0]` — só o PRIMEIRO. Quando o médico mandava
      // honorário + hospital + OPME em arquivos separados, quem protocolava levava
      // UM e não sabia dos outros dois. É a promessa da reunião de 24/08:
      // "mesmo que eu receba três arquivos dele, você vai baixar um PDF com tudo junto".
      if (modo === 'download') {
        await baixarOrcamentoConsolidado(rowData.id, rowData.nprocesso);
        return;
      }

      // PREVIEW segue mostrando o primeiro arquivo (é espiada rápida, ¬a entrega).
      // Quando há mais de um, o rótulo do botão avisa quantos são.
      const anexo = listaAnexos[0];
      const nomeArquivo = anexo.linkImagem.split('/').pop() || 'orcamento';
      const extensao = nomeArquivo.split('.').pop()?.toLowerCase();
      const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
        ? 'pdf'
        : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
          ? 'imagem'
          : 'outro';

      abrirPreview(anexo.linkImagem, nomeArquivo, tipo);
    } catch {
      alert('Erro ao carregar o orçamento do pedido.');
    }
  };

  const anexoBodyTemplate = (rowData: ParaProtocolarTableRow) => {
    return (
      <Button
        icon="pi pi-download"
        rounded
        outlined
        severity="secondary"
        aria-label={`Baixar orçamento do pedido ${rowData.id}`}
        onClick={() => abrirOrcamentoAnexo(rowData, 'download')}
      />
    );
  };

  // Comprovante do recebimento: o .eml original (data/hora + anexos embutidos)
  // que o email_monitor arquiva desde 25/08. Pedido anterior a essa data não tem.
  const [baixandoEmailId, setBaixandoEmailId] = useState<number | null>(null);

  const baixarEmailRecebimento = async (rowData: ParaProtocolarTableRow) => {
    setBaixandoEmailId(rowData.id);
    try {
      const resp = await getEmailRecebimentoPdf(rowData.id);
      const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-recebimento-${(rowData.nprocesso || rowData.id).toString().replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar o PDF do e-mail de recebimento deste pedido.');
    } finally {
      setBaixandoEmailId(null);
    }
  };

  const emailRecebimentoBodyTemplate = (rowData: ParaProtocolarTableRow) => (
    <Button
      icon="pi pi-envelope"
      rounded
      outlined
      severity="help"
      loading={baixandoEmailId === rowData.id}
      aria-label={`Baixar e-mail de recebimento do pedido ${rowData.id}`}
      onClick={() => baixarEmailRecebimento(rowData)}
    />
  );

  const handleCopiar = async (rowData: ParaProtocolarTableRow) => {
    setCopiandoId(rowData.id);
    try {
      let linkAnexo = '';
      try {
        const res: any = await getAnexosOrder(rowData.id, 'ORCAMENTO');
        const anexos = res.data?.anexos ?? [];
        linkAnexo = anexos[0]?.linkImagem ?? '';
      } catch {
        linkAnexo = '';
      }

      const valorFormatado = (rowData.valorOrcamento || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const dataEnvio = rowData.dataEnvioOrcamento
        ? new Date(`${rowData.dataEnvioOrcamento}T00:00:00`).toLocaleDateString('pt-BR')
        : '';

      const texto = [
        'Segue orcamento acima para protocolar:',
        `Paciente: ${rowData.paciente}`,
        `Numero do processo: ${rowData.nprocesso || '-'}`,
        `Valor do orcamento: R$ ${valorFormatado}`,
        `Cliente: ${rowData.cliente}`,
        'Orcamento ja enviado ao estado e pronto para protocolacao.',
        `Data do envio: ${dataEnvio}`,
        `Anexo: ${linkAnexo}`,
      ].join('\n');

      await navigator.clipboard.writeText(texto);
      alert('Texto copiado para a área de transferência.');
    } catch (err) {
      console.error('Erro ao copiar:', err);
      alert('Erro ao copiar o texto.');
    } finally {
      setCopiandoId(null);
    }
  };

  const copiarBodyTemplate = (rowData: ParaProtocolarTableRow) => (
    <Button
      icon="pi pi-copy"
      rounded
      outlined
      severity="info"
      loading={copiandoId === rowData.id}
      aria-label={`Copiar texto do pedido ${rowData.id}`}
      onClick={() => handleCopiar(rowData)}
    />
  );

  const editarBodyTemplate = (rowData: ParaProtocolarTableRow) => {
    return (
      <Button
        icon="pi pi-pencil"
        rounded
        outlined
        severity="secondary"
        aria-label={`Editar ${rowData.id}`}
        onClick={() => {
          setRegistroEditando({ ...rowData });
          setAnexosOrcamento([]);
          setLoadingAnexosOrcamento(true);
          getAnexosOrder(rowData.id, 'ORCAMENTO')
            .then((res: any) => setAnexosOrcamento(res.data.anexos ?? []))
            .catch(() => setAnexosOrcamento([]))
            .finally(() => setLoadingAnexosOrcamento(false));
          setEditDialogVisible(true);
        }}
      />
    );
  };

  const protocolarBodyTemplate = (rowData: ParaProtocolarTableRow) => {
    return (
      <Button
        label="Protocolar"
        icon="pi pi-send"
        severity="success"
        outlined
        tooltip="Protocolar: anexar a petição e registrar a data do protocolo"
        tooltipOptions={{ position: 'top' }}
        onClick={() => {
          setRegistroOriginalSemCnj(!(rowData.numeroProcesso || '').trim());
          setRegistroProtocolando({ ...rowData });
          setDataProtocolo('');
          setAnexosOrcamento([]);
          setLoadingAnexosOrcamento(true);
          getAnexosOrder(rowData.id, 'ORCAMENTO')
            .then((res: any) => setAnexosOrcamento(res.data.anexos ?? []))
            .catch(() => setAnexosOrcamento([]))
            .finally(() => setLoadingAnexosOrcamento(false));
          setProtocolarDialogVisible(true);
        }}
      />
    );
  };

  const excluirBodyTemplate = (rowData: ParaProtocolarTableRow) => {
    return (
      <Button
        label="Não protocolar"
        icon="pi pi-times"
        severity="danger"
        outlined
        tooltip="Não protocolar: perda, orientação da diretoria, sem protocolo ou segredo de justiça"
        tooltipOptions={{ position: 'top' }}
        onClick={() => {
          setRegistroNaoProtocolar({ ...rowData });
          setNaoProtocolarOpcao('');
          setNaoProtocolarObs('');
          setMotivoPerdaCat(null);
          setPecaDescarte(null);
          setPecaJaAnexada(false);
          getAnexosOrder(rowData.id, 'DECISAO_INTEIRO_TEOR')
            .then((res: any) => setPecaJaAnexada((res.data.anexos ?? []).length > 0))
            .catch(() => setPecaJaAnexada(false));
          setAnexosOrcamento([]);
          setLoadingAnexosOrcamento(true);
          getAnexosOrder(rowData.id, 'ORCAMENTO')
            .then((res: any) => setAnexosOrcamento(res.data.anexos ?? []))
            .catch(() => setAnexosOrcamento([]))
            .finally(() => setLoadingAnexosOrcamento(false));
          setNaoProtocolarDialogVisible(true);
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

  const updateRegistroEditando = (field: keyof ParaProtocolarTableRow, value: any) => {
    if (!registroEditando) return;

    setRegistroEditando({
      ...registroEditando,
      [field]: value
    });
  };

  const handleSalvarEdicao = () => {
    if (!registroEditando) return;
    console.log('Salvar edição:', registroEditando);
    setEditDialogVisible(false);
  };

const handleConfirmarProtocolacao = async () => {
  if (!registroProtocolando) return

  // Validações obrigatórias
  // CNJ ANTES de qualquer upload (@R 15/09 "sem ele não é possível protocolar"): o backend recusa
  // protocolar sem CNJ, e se a checagem viesse depois do upload a petição ficaria órfã no storage.
  if (!(registroProtocolando.numeroProcesso || '').trim()) {
    alert('Preencha o número do processo (CNJ) antes de protocolar — sem ele não é possível protocolar.')
    return
  }
  if (!dataProtocolo) {
    alert('A data de protocolação é obrigatória.')
    return
  }
  if (!arquivoPeticao) {
    alert('O arquivo de petição é obrigatório.')
    return
  }

  setEnviandoProtocolo(true)
  try {
    // 1 â€” Upload dos arquivos para R2
    const uploads = []

    uploads.push(uploadAnexoOrder(registroProtocolando.id, arquivoPeticao, 'PROTOCOLO'))

    if (arquivoExtra1) {
      uploads.push(uploadAnexoOrder(registroProtocolando.id, arquivoExtra1, 'PROTOCOLO'))
    }
    if (arquivoExtra2) {
      uploads.push(uploadAnexoOrder(registroProtocolando.id, arquivoExtra2, 'PROTOCOLO'))
    }

    await Promise.all(uploads)

    // 2 â€” Salva o protocolo
    await salvarProtocolar(registroProtocolando.id, {
      acao: 'protocolar',
      obs: registroProtocolando.observacoes || '',
      dataProtocolo,
      nprocesso: (registroProtocolando.numeroProcesso || '').trim(),
    })

    setProtocolarDialogVisible(false)
    setArquivoPeticao(null)
    setArquivoExtra1(null)
    setArquivoExtra2(null)
    // Teste local 15/09: protocolado (201) mas o pedido continuava na lista — carregarDados passa por
    // getOrders (/orders/listar/, medido 23 s). Tira o pedido protocolado da tabela NA HORA.
    const idProtocolado = registroProtocolando.id
    setRegistros((atual) => atual.filter((r) => r.id !== idProtocolado))
    carregarDados()
  } catch (err: any) {
    // o backend explica o motivo (CNJ ausente ou inválido) — mostrar em vez da mensagem genérica
    alert(err?.response?.data?.error ?? 'Erro ao confirmar protocolação.')
  } finally {
    setEnviandoProtocolo(false)
  }
}


  const handleConfirmarNaoProtocolar = async () => {
    if (!registroNaoProtocolar || !naoProtocolarOpcao) return;

    if (!naoProtocolarObs.trim()) {
      alert('Observação é obrigatória.');
      return;
    }

    const acao = naoProtocolarOpcao === 'segredo' ? 'segredo'
      : naoProtocolarOpcao === 'sem_protocolo' ? 'recusar_protocolo' : 'perda';
    const descarte = naoProtocolarOpcao !== 'segredo';
    // "Diretoria falou para não protocolar" É o motivo — não pede outro.
    const motivo = naoProtocolarOpcao === 'diretoria' ? 'DIRETORIA_ORIENTOU'
      : naoProtocolarOpcao === 'sem_protocolo' ? 'PRAZO_PROTOCOLACAO' : motivoPerdaCat;

    if (descarte && !pecaJaAnexada && !pecaDescarte) {
      alert('Anexe a peça de inteiro teor (PDF) — ela guarda a prova do desfecho do processo.');
      return;
    }
    if (descarte && !motivo) {
      alert('Escolha o motivo da perda.');
      return;
    }

    setEnviandoDescarte(true);
    try {
      if (descarte && !pecaJaAnexada && pecaDescarte) {
        await uploadAnexoOrder(registroNaoProtocolar.id, pecaDescarte, 'DECISAO_INTEIRO_TEOR');
      }
      await salvarProtocolar(registroNaoProtocolar.id, {
        acao,
        obs: naoProtocolarObs,
        motivoPerdaCategoria: motivo ?? undefined,
      });
      carregarDados();
      setNaoProtocolarDialogVisible(false);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao processar.');
    } finally {
      setEnviandoDescarte(false);
    }
  };

  return (
    <div className="para-protocolar-page">
      <PrimeiraVisitaInfo etapaId="para-protocolar" />
      <div className="page-header">
        <CabecalhoFase nome="Protocolar" slaDias={1} screen="paraProtocolar"
          subtitulo="Gestão dos processos prontos para protocolação" />


      </div>

      {readOnly && <ReadOnlyBanner />}

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de Processos</span>
            <i className="pi pi-list"></i>
          </div>
          <div className="kpi-value">{kpis.quantidade}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor</span>
            <i className="pi pi-dollar"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valor)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Processo mais antigo em dias</span>
            <i className="pi pi-clock"></i>
          </div>
          <div className="kpi-value">{kpis.processoMaisAntigo}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Pedidos para protocolar</h2>
          <AcoesTabela>
            <BotaoExportarExcel todos={dataComCamposCalculados} visiveis={visibleProcessos} nome="protocolar" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable rowClassName={rowClassRepedido}
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Pedidos para protocolar"
          value={dataComCamposCalculados}
          onValueChange={(value) => setVisibleProcessos(value as ParaProtocolarTableRow[])}
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
          className="para-protocolar-table"
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          {!readOnly && (
            <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />
          )}
          <Column
            field="sequencial"
            header="#"
            style={{ minWidth: '4rem' }}
            body={(rowData: ParaProtocolarTableRow) => rowData.sequencial}
           frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{editarBodyTemplate(r)}{protocolarBodyTemplate(r)}{excluirBodyTemplate(r)}{copiarBodyTemplate(r)}</>, excluir: carregarDados })}
          <Column
            field="paciente" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem()}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo()}
          {colunaRepedido()}
          <Column
            field="cliente"
            header={cabecalhoComHint('Cliente', 'Empresa/prestador que responde pelo orçamento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
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
            field="dataEnvioOrcamento"
            header={cabecalhoComHint('Data Envio Orçamento', 'Data em que o orçamento foi enviado ao Estado.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={dataBodyTemplate}
            style={{ minWidth: '12rem' }}
          />
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
            header={cabecalhoComHint('Orçamento', 'Verde = PDF do orçamento anexado (clique para baixar). "Não enviado" = nunca cotamos.')}
            body={anexoBodyTemplate}
            style={{ minWidth: '7rem' }}
            bodyStyle={{ textAlign: 'center' }}
          />
          <Column
            header="Baixar Email Recebimento"
            body={emailRecebimentoBodyTemplate}
            style={{ minWidth: '9rem' }}
            bodyStyle={{ textAlign: 'center' }}
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
        header="Editar Processo"
        visible={editDialogVisible}
        style={{ width: '60rem', maxWidth: '95vw' }}
        modal
        onHide={() => setEditDialogVisible(false)}
        className="pp-dialog"
      >
        {registroEditando && (
          <div className="pp-form-grid">
            <div className="field field-span-2">
              <label>Paciente</label>
              <InputText
                value={registroEditando.paciente}
                onChange={(e) => updateRegistroEditando('paciente', e.target.value)}
              />
            </div>

            <div className="field field-span-2">
              <label>Cliente</label>
              <InputText
                value={registroEditando.cliente}
                onChange={(e) => updateRegistroEditando('cliente', e.target.value)}
              />
            </div>

            <div className="field">
              <label>Valor</label>
              <InputNumber
                value={registroEditando.valor}
                onValueChange={(e) => updateRegistroEditando('valor', e.value)}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
              />
            </div>

            <div className="field">
              <label>Número do Processo</label>
              <InputText
                value={registroEditando.numeroProcesso}
                onChange={(e) => updateRegistroEditando('numeroProcesso', e.target.value)}
              />
            </div>

            <div className="field">
              <label>Data Envio Orçamento</label>
              <InputText value={formatarData(registroEditando.dataEnvioOrcamento)} disabled />
            </div>

            <div className="field">
              <label>Status</label>
              <div className="tag-box">
                <Tag value={registroEditando.status} style={getStatusTagStyle(registroEditando.status)} className="status-tag-custom" />
              </div>
            </div>

            <div className="field field-span-4">
              <label>Orçamento do Pedido</label>

              {loadingAnexosOrcamento && (
                <span style={{ fontSize: '0.9rem', color: '#888' }}>
                  <i className="pi pi-spin pi-spinner" style={{ marginRight: '6px' }} />
                  Carregando orçamento...
                </span>
              )}

              {!loadingAnexosOrcamento && anexosOrcamento.length === 0 && (
                <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
                  Nenhum orçamento anexado.
                </span>
              )}

              {!loadingAnexosOrcamento && anexosOrcamento.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {anexosOrcamento.map((anexo, index) => {
                    const nomeArquivo = anexo.linkImagem.split('/').pop() || `Orçamento ${index + 1}`;
                    const extensao = nomeArquivo.split('.').pop()?.toLowerCase();
                    const icone = extensao === 'pdf'
                      ? 'pi pi-file-pdf'
                      : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                        ? 'pi pi-image'
                        : 'pi pi-file';
                    const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
                      ? 'pdf'
                      : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                        ? 'imagem'
                        : 'outro';

                    return (
                      <button
                        key={anexo.id ?? index}
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
                        onClick={() => abrirPreview(anexo.linkImagem, nomeArquivo, tipo)}
                      >
                        <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{nomeArquivo}</span>
                        <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="field field-span-4">
              <label>Observações</label>
              <InputTextarea
                value={registroEditando.observacoes}
                onChange={(e) => updateRegistroEditando('observacoes', e.target.value)}
                rows={14}
                style={{ width: '100%', fontSize: '0.95rem', lineHeight: 1.5 }}
              />
            </div>

            <div className="field field-span-2 field-button">
              <label>&nbsp;</label>
              <Button
                label="Atualizar Anexo"
                icon="pi pi-upload"
                outlined
                onClick={() => console.log('Atualizar anexo', registroEditando)}
              />
            </div>
          </div>
        )}

        {!readOnly && <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setEditDialogVisible(false)} />
          <Button label="Salvar" icon="pi pi-check" onClick={handleSalvarEdicao} />
        </div>}
      </Dialog>

      <Dialog
        header="Protocolar Processo"
        visible={protocolarDialogVisible}
        style={{ width: '64rem', maxWidth: '95vw' }}
        modal
        onHide={() => setProtocolarDialogVisible(false)}
        className="pp-dialog"
      >
        {registroProtocolando && (
          <div className="pp-form-grid">
            <div className="field field-span-2">
              <label>Paciente</label>
              <InputText value={registroProtocolando.paciente} disabled />
            </div>

            <div className="field field-span-2">
              <label>Cliente</label>
              <InputText value={registroProtocolando.cliente} disabled />
            </div>

            <div className="field">
              <label>Valor</label>
              <InputNumber
                value={registroProtocolando.valor}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
                disabled
              />
            </div>

            <div className="field">
              <label>Dias</label>
              <InputText value={String(registroProtocolando.dias)} disabled />
            </div>

            <div className="field">
              <label>Número do Processo {!(registroProtocolando.numeroProcesso || '').trim() && <span style={{ color: '#ef4444' }}>*obrigatório para protocolar</span>}</label>
              {/* Editável só quando está vazio: pedido que chegou sem CNJ pode ter o número
                  completado aqui, na hora do protocolo (@R 15/09). Com CNJ já gravado, continua travado. */}
              <InputText
                value={registroProtocolando.numeroProcesso}
                disabled={!!(registroOriginalSemCnj === false)}
                placeholder="Ex: 0012345-67.2026.8.13.0000"
                onChange={(e) => setRegistroProtocolando((atual) => atual ? { ...atual, numeroProcesso: e.target.value } : atual)}
              />
            </div>

            <div className="field">
              <label>Procedimento</label>
              <InputText value={registroProtocolando.procedimento} disabled />
            </div>

            <div className="field field-span-4">
              <label>Observações</label>
              <div
                style={{
                  width: '100%',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid var(--mc-border, #e5e7eb)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  background: 'var(--mc-surface-2, #fafafa)',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  color: 'var(--mc-ink, #1f2937)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatarObservacoes(registroProtocolando.observacoes)}
              </div>
            </div>

<div className="field field-span-4">
  <label>Orçamento do Pedido</label>

  {loadingAnexosOrcamento && (
    <span style={{ fontSize: '0.9rem', color: '#888' }}>
      <i className="pi pi-spin pi-spinner" style={{ marginRight: '6px' }} />
      Carregando orçamento...
    </span>
  )}

  {!loadingAnexosOrcamento && anexosOrcamento.length === 0 && (
    <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
      Nenhum orçamento anexado.
    </span>
  )}

  {!loadingAnexosOrcamento && anexosOrcamento.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {anexosOrcamento.map((anexo, index) => {
        const nomeArquivo = anexo.linkImagem.split('/').pop() || `Orçamento ${index + 1}`;
        const extensao = nomeArquivo.split('.').pop()?.toLowerCase();
        const icone = extensao === 'pdf'
          ? 'pi pi-file-pdf'
          : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
            ? 'pi pi-image'
            : 'pi pi-file';
        const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
          ? 'pdf'
          : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
            ? 'imagem'
            : 'outro';

        return (
          <button
            key={anexo.id ?? index}
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
            onClick={() => abrirPreview(anexo.linkImagem, nomeArquivo, tipo)}
          >
            <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{nomeArquivo}</span>
            <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
          </button>
        );
      })}
    </div>
  )}
</div>

<div className="field field-span-2">
  <label>
    Data Protocolação
    <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
  </label>
  <Calendar
    value={dataProtocolo ? new Date(dataProtocolo) : null}
    onChange={(e) =>
      setDataProtocolo(
        e.value instanceof Date ? e.value.toISOString().split('T')[0] : ''
      )
    }
    dateFormat="dd/mm/yy"
    showIcon
  />
</div>

<div className="field field-span-2">
  <label>
    Petição
    <span style={{ color: '#ef4444', marginLeft: '4px' }}>*obrigatório</span>
  </label>
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 14px',
      borderRadius: '8px',
      border: `2px dashed ${arquivoPeticao ? '#f97316' : '#d1d5db'}`,
      background: arquivoPeticao ? '#fff7ed' : '#f9fafb',
      cursor: 'pointer',
      fontSize: '0.9rem',
      color: arquivoPeticao ? '#f97316' : '#6b7280',
    }}
  >
    <i className={arquivoPeticao ? 'pi pi-file-check' : 'pi pi-upload'} />
    <span>{arquivoPeticao ? arquivoPeticao.name : 'Selecionar petição...'}</span>
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png"
      style={{ display: 'none' }}
      onChange={(e) => setArquivoPeticao(e.target.files?.[0] ?? null)}
    />
  </label>
</div>

<div className="field field-span-2">
  <label>Arquivo Extra 1 <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 14px',
      borderRadius: '8px',
      border: `2px dashed ${arquivoExtra1 ? '#f97316' : '#d1d5db'}`,
      background: arquivoExtra1 ? '#fff7ed' : '#f9fafb',
      cursor: 'pointer',
      fontSize: '0.9rem',
      color: arquivoExtra1 ? '#f97316' : '#6b7280',
    }}
  >
    <i className={arquivoExtra1 ? 'pi pi-file-check' : 'pi pi-upload'} />
    <span>{arquivoExtra1 ? arquivoExtra1.name : 'Selecionar arquivo...'}</span>
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png"
      style={{ display: 'none' }}
      onChange={(e) => setArquivoExtra1(e.target.files?.[0] ?? null)}
    />
  </label>
</div>

<div className="field field-span-2">
  <label>Arquivo Extra 2 <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 14px',
      borderRadius: '8px',
      border: `2px dashed ${arquivoExtra2 ? '#f97316' : '#d1d5db'}`,
      background: arquivoExtra2 ? '#fff7ed' : '#f9fafb',
      cursor: 'pointer',
      fontSize: '0.9rem',
      color: arquivoExtra2 ? '#f97316' : '#6b7280',
    }}
  >
    <i className={arquivoExtra2 ? 'pi pi-file-check' : 'pi pi-upload'} />
    <span>{arquivoExtra2 ? arquivoExtra2.name : 'Selecionar arquivo...'}</span>
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png"
      style={{ display: 'none' }}
      onChange={(e) => setArquivoExtra2(e.target.files?.[0] ?? null)}
    />
  </label>
</div>




          </div>
        )}

        {!readOnly && <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setProtocolarDialogVisible(false)} />
<Button
  label={enviandoProtocolo ? 'Enviando...' : 'Confirmar Protocolação'}
  icon="pi pi-check"
  onClick={handleConfirmarProtocolacao}
  loading={enviandoProtocolo}
  disabled={enviandoProtocolo}
/>
        </div>}
      </Dialog>

      <Dialog
        header="Não Protocolar"
        visible={naoProtocolarDialogVisible}
        style={{ width: '64rem', maxWidth: '95vw' }}
        modal
        onHide={() => setNaoProtocolarDialogVisible(false)}
        className="pp-dialog"
      >
        {registroNaoProtocolar && (
          <div className="pp-form-grid">
            <div className="field field-span-2">
              <label>Paciente</label>
              <InputText value={registroNaoProtocolar.paciente} disabled />
            </div>

            <div className="field field-span-2">
              <label>Cliente</label>
              <InputText value={registroNaoProtocolar.cliente} disabled />
            </div>

            <div className="field">
              <label>Valor</label>
              <InputNumber
                value={registroNaoProtocolar.valor}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
                disabled
              />
            </div>

            <div className="field">
              <label>Dias</label>
              <InputText value={String(registroNaoProtocolar.dias)} disabled />
            </div>

            <div className="field">
              <label>Número do Processo</label>
              <InputText value={registroNaoProtocolar.numeroProcesso} disabled />
            </div>

            <div className="field">
              <label>Procedimento</label>
              <InputText value={registroNaoProtocolar.procedimento} disabled />
            </div>

            <div className="field field-span-4">
              <label>Observações</label>
              <div
                style={{
                  width: '100%',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid var(--mc-border, #e5e7eb)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  background: 'var(--mc-surface-2, #fafafa)',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  color: 'var(--mc-ink, #1f2937)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatarObservacoes(registroNaoProtocolar.observacoes)}
              </div>
            </div>

            <div className="field field-span-4">
              <label>Orçamento do Pedido</label>

              {loadingAnexosOrcamento && (
                <span style={{ fontSize: '0.9rem', color: '#888' }}>
                  <i className="pi pi-spin pi-spinner" style={{ marginRight: '6px' }} />
                  Carregando orçamento...
                </span>
              )}

              {!loadingAnexosOrcamento && anexosOrcamento.length === 0 && (
                <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
                  Nenhum orçamento anexado.
                </span>
              )}

              {!loadingAnexosOrcamento && anexosOrcamento.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {anexosOrcamento.map((anexo, index) => {
                    const nomeArquivo = anexo.linkImagem.split('/').pop() || `Orçamento ${index + 1}`;
                    const extensao = nomeArquivo.split('.').pop()?.toLowerCase();
                    const icone = extensao === 'pdf'
                      ? 'pi pi-file-pdf'
                      : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                        ? 'pi pi-image'
                        : 'pi pi-file';
                    const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
                      ? 'pdf'
                      : ['jpg', 'jpeg', 'png'].includes(extensao ?? '')
                        ? 'imagem'
                        : 'outro';

                    return (
                      <button
                        key={anexo.id ?? index}
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
                        onClick={() => abrirPreview(anexo.linkImagem, nomeArquivo, tipo)}
                      >
                        <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{nomeArquivo}</span>
                        <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="field field-span-4">
              <label>Escolha uma opção</label>

              <div className="radio-group">
                <div className="radio-item">
                  <RadioButton
                    inputId="opcaoPerda"
                    name="naoProtocolarOpcao"
                    value="perda"
                    onChange={(e) => setNaoProtocolarOpcao(e.value)}
                    checked={naoProtocolarOpcao === 'perda'}
                  />
                  <label htmlFor="opcaoPerda">Desistir e marcar Perda</label>
                </div>

                <div className="radio-item">
                  <RadioButton
                    inputId="opcaoSegredo"
                    name="naoProtocolarOpcao"
                    value="segredo"
                    onChange={(e) => setNaoProtocolarOpcao(e.value)}
                    checked={naoProtocolarOpcao === 'segredo'}
                  />
                  <label htmlFor="opcaoSegredo">Não Protocolar e marcar como Segredo de Justiça</label>
                </div>

                <div className="radio-item">
                  <RadioButton
                    inputId="opcaoSemProtocolo"
                    name="naoProtocolarOpcao"
                    value="sem_protocolo"
                    onChange={(e) => setNaoProtocolarOpcao(e.value)}
                    checked={naoProtocolarOpcao === 'sem_protocolo'}
                  />
                  <label htmlFor="opcaoSemProtocolo">Já enviado à SES — recusar protocolo (perda de prazo de protocolação)</label>
                </div>

                <div className="radio-item">
                  <RadioButton
                    inputId="opcaoDiretoria"
                    name="naoProtocolarOpcao"
                    value="diretoria"
                    onChange={(e) => setNaoProtocolarOpcao(e.value)}
                    checked={naoProtocolarOpcao === 'diretoria'}
                  />
                  <label htmlFor="opcaoDiretoria">Diretoria falou para não protocolar</label>
                </div>
              </div>
            </div>

            {(naoProtocolarOpcao === 'perda') && (
              <div className="field field-span-4">
                <label>Motivo da perda <span style={{ color: '#ef4444' }}>*obrigatório</span> — é o que entra no indicador</label>
                <Dropdown value={motivoPerdaCat} onChange={(e) => setMotivoPerdaCat(e.value)}
                  options={[
                    { label: 'Paciente já foi operado — nada a fazer', value: 'JA_OPERADO' },
                    { label: 'Diretoria orientou não protocolar', value: 'DIRETORIA_ORIENTOU' },
                    { label: 'Decidimos não cotar', value: 'NAO_COTAR' },
                    { label: 'Não localizamos o médico', value: 'MEDICO_NAO_LOCALIZADO' },
                    { label: 'Não conseguimos o orçamento', value: 'ORCAMENTO_NAO_OBTIDO' },
                    { label: 'O médico recusou o pedido', value: 'MEDICO_RECUSOU' },
                    { label: 'Orçamento não chegou em tempo hábil', value: 'ORCAMENTO_FORA_DO_PRAZO' },
                    { label: 'Sem exames — médico não quis cotar', value: 'SEM_EXAMES' },
                    { label: 'Perda por segredo de justiça', value: 'SEGREDO_DE_JUSTICA' },
                    { label: 'Outro (ver justificativa)', value: 'OUTRO' },
                  ]}
                  placeholder="Escolha o motivo" showClear />
              </div>
            )}

            {naoProtocolarOpcao && naoProtocolarOpcao !== 'segredo' && (
              <div className="field field-span-4">
                <label>
                  Peça de inteiro teor (PDF){' '}
                  {!pecaJaAnexada && <span style={{ color: '#ef4444' }}>*obrigatória para descartar</span>}
                </label>
                {pecaJaAnexada ? (
                  <small style={{ color: '#16a34a' }}>
                    <i className="pi pi-check-circle" /> Este pedido já tem a peça de inteiro teor anexada.
                  </small>
                ) : (
                  <>
                    <input type="file" accept="application/pdf" disabled={readOnly}
                      onChange={(e) => setPecaDescarte(e.target.files?.[0] ?? null)} />
                    <small style={{ color: '#6b7280' }}>
                      A peça guarda a prova do desfecho (desistência, ganho de outro ou cirurgia já feita). Sem ela o descarte não fecha.
                    </small>
                  </>
                )}
              </div>
            )}

            <div className="field field-span-4">
              <label>
                Obs <span style={{ color: '#ef4444' }}>*obrigatório</span>
              </label>
              <InputTextarea
                value={naoProtocolarObs}
                onChange={(e) => setNaoProtocolarObs(e.target.value)}
                rows={4}
                placeholder="Descreva o motivo..."
              />
            </div>
          </div>
        )}

        {!readOnly && <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setNaoProtocolarDialogVisible(false)} />
          <Button
            label="Confirmar"
            icon="pi pi-check"
            severity="danger"
            disabled={!naoProtocolarOpcao || enviandoDescarte}
            loading={enviandoDescarte}
            onClick={handleConfirmarNaoProtocolar}
          />
        </div>}
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
                onClick={() => baixarArquivo(previewUrl, previewNome || 'arquivo')}
              />
            </div>
          )}
        </div>

        <div className="dialog-footer-actions">
          <Button
            label="Baixar"
            icon="pi pi-download"
            outlined
            onClick={() => baixarArquivo(previewUrl, previewNome || 'arquivo')}
          />
          <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
        </div>
      </Dialog>
    </div>
  );
}
