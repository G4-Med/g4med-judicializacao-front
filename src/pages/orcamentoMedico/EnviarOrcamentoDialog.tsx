import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { baixarArquivoR2 } from '../../services/api/orders';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getBaseOrcamento, getDadosMedico, type TipoBaseOrcamento } from '../../services/api/client';
import { salvarOrcamentoMedico, uploadAnexoOrder, getInteligenciaPedido, lerOrcamentoDoArquivo, unificarOrcamento } from '../../services/api/orders';
import './OrcamentoMedicoPage.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

interface ItemOrcamento {
  descricao: string;
  valor: number;
}

interface BaseOrcamento {
  exists: boolean;
  linkBaseOrcamento: string;
  linkAssinatura: string;
  honorariosEquipeMedica: boolean;
  taxasHospitalares: boolean;
  materiaisOpme: boolean;
  medicamentosDiaria: boolean;
  examesPreOperatorios: boolean;
  consultaPosOperatoria: boolean;
  atendimentoEnfermagem: boolean;
  acompanhanteTaxaAdicional: boolean;
  fisioterapiaPosOperatoria: boolean;
  medicamentosPosAlta: boolean;
  ortesesImobilizadores: boolean;
  examesComplementares: boolean;
  custoCtiBemodinamica: boolean;
}

export interface OrcamentoProcessoBase {
  id: number;
  paciente: string;
  procedimento: string;
  area?: string;
  subarea?: string;
  nomeMedico?: string;
  medico?: string;
  hospital?: string;
  nomeHospital?: string;
  medicoId?: number | null;
  idMedico?: number | null;
  medico_id?: number | null;
  nprocesso?: string;
  statusJuridico?: string | null;
}

interface EnviarOrcamentoDialogProps {
  visible: boolean;
  processo: OrcamentoProcessoBase | null;
  onHide: () => void;
  onSuccess: () => void | Promise<void>;
}

const baseOrcamentoInicial: BaseOrcamento = {
  exists: false,
  linkBaseOrcamento: '',
  linkAssinatura: '',
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
};

const itemVazio = (): ItemOrcamento => ({ descricao: '', valor: 0 });

function calcularTotal(
  equipe: ItemOrcamento[],
  taxas: ItemOrcamento[],
  opme: ItemOrcamento[],
  anatomia: ItemOrcamento[],
  medic: ItemOrcamento[]
): number {
  const soma = (arr: ItemOrcamento[]) => arr.reduce((s, i) => s + (i.valor || 0), 0);
  return soma(equipe) + soma(taxas) + soma(opme) + soma(anatomia) + soma(medic);
}

function filtrarItensPreenchidos(arr: ItemOrcamento[]): ItemOrcamento[] {
  return arr.filter((item) => item.descricao.trim() || item.valor > 0);
}

function extrairMedicoId(dados: Record<string, unknown>): number | null {
  const candidatosDiretos = [
    dados.medicoId,
    dados.idMedico,
    dados.medico_id,
    dados.id_medico,
    dados.medicoResponsavelId,
    dados.medico_responsavel_id,
    dados.clienteMedicoId,
    dados.cliente_medico_id,
  ];

  for (const valor of candidatosDiretos) {
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string' && valor.trim() && !Number.isNaN(Number(valor))) {
      return Number(valor);
    }
  }

  const candidatosObjetos = [
    dados.medico,
    dados.medicoResponsavel,
    dados.medico_responsavel,
    dados.clienteMedico,
    dados.cliente_medico,
  ];

  for (const valor of candidatosObjetos) {
    if (typeof valor === 'number') return valor;
    if (valor && typeof valor === 'object') {
      const nested = valor as Record<string, unknown>;
      const nestedId = nested.id ?? nested.medicoId ?? nested.idMedico ?? nested.medico_id ?? nested.id_medico;
      if (typeof nestedId === 'number') return nestedId;
      if (typeof nestedId === 'string' && nestedId.trim() && !Number.isNaN(Number(nestedId))) {
        return Number(nestedId);
      }
    }
  }

  return null;
}

type AlertaOrcamento = { nivel: 'grave' | 'aviso'; campo: string; texto: string };
type LeituraOrcamento = {
  ok: boolean;
  paginasLidas?: number;
  paginasTotal?: number;
  motivo: string;
  valorTotal: number | null;
  paciente: string | null;
  medicoOuPrestador: string | null;
  dataDocumento: string | null;
  validadeDias: number | null;
  procedimento: string | null;
  itens: { descricao: string; valor: number }[];
  confianca: string;
  observacao: string | null;
  alertas: AlertaOrcamento[];
};

export function EnviarOrcamentoDialog({
  visible,
  processo,
  onHide,
  onSuccess,
}: EnviarOrcamentoDialogProps) {
  const [modo, setModo] = useState<'escolha' | 'arquivo' | 'manual'>('escolha');
  const [valorArquivo, setValorArquivo] = useState<number | null>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  // Vários arquivos viram 1 PDF ANTES da leitura: o que é lido é o que sobe e vai à SES (@R 21/09).
  const [partesUnidas, setPartesUnidas] = useState<{ nome: string; paginas: number }[]>([]);
  const [erroUnificar, setErroUnificar] = useState('');
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);

  /** LEITURA DO ORÇAMENTO (@R 17/09): ao escolher o arquivo, a visão computacional lê o
   *  documento e devolve valor, paciente, médico, data e os alertas de conferência.
   *  PROPÕE — o valor entra no campo mas quem confirma é a pessoa; o contrato é o mesmo
   *  do CNJ ("nada é gravado sozinho"). Medido: 94%+ de acerto, ou seja ~6% de erro, e
   *  um número plausível que ninguém confere é pior que um campo vazio. */
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [leitura, setLeitura] = useState<LeituraOrcamento | null>(null);
  const [enviandoManual, setEnviandoManual] = useState(false);
  const [equipeMedica, setEquipeMedica] = useState<ItemOrcamento[]>([itemVazio()]);
  const [taxasHospitalar, setTaxasHospitalar] = useState<ItemOrcamento[]>([itemVazio()]);
  const [opmeMateriais, setOpmeMateriais] = useState<ItemOrcamento[]>([itemVazio()]);
  const [anatomiaPatologica, setAnatomiaPatologica] = useState<ItemOrcamento[]>([itemVazio()]);
  const [medicamentos, setMedicamentos] = useState<ItemOrcamento[]>([itemVazio()]);
  const [baseOrcamento, setBaseOrcamento] = useState<BaseOrcamento>(baseOrcamentoInicial);
  const [loadingBaseOrcamento, setLoadingBaseOrcamento] = useState(false);
  const [basePdfCaptureReady, setBasePdfCaptureReady] = useState(false);
  const [erroBasePdf, setErroBasePdf] = useState('');
  const [hospitalMedico, setHospitalMedico] = useState('');

  const previewDocumentoRef = useRef<HTMLDivElement>(null);
  const basePdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // Loop de inteligência do pedido (task #203, 27/08): antes de orçar, o sistema abre a
  // "pasta" — já respondemos ESTE pedido (duplicata)? o que já cobramos por ESTA cirurgia
  // (experiência, com data)? Fail-soft: erro na dica NUNCA impede o envio do orçamento.
  interface IntelDesfecho { tipo: 'ganho' | 'perda' | 'andamento'; rotulo: string; valor_ganho: number | null }
  interface IntelAnexo { tipo: string; url: string }
  interface IntelItem {
    order_id: number; score: number; exato: boolean; procedimento: string;
    mesmo_medico: boolean; medico_nome?: string | null; data_pedido: string | null;
    valor_respondido: number | null; data_resposta: string | null;
    desfecho?: IntelDesfecho; mesmo_cnj?: boolean; anexos?: IntelAnexo[];
  }
  interface Inteligencia {
    duplicata: IntelItem[]; experiencia: IntelItem[]; media_18m?: number | null;
    n_similares: number; piso_estado?: number | null; referencia_mercado?: number | null;
  }
  const [inteligencia, setInteligencia] = useState<Inteligencia | null>(null);

  useEffect(() => {
    if (!visible || !processo?.id) { setInteligencia(null); return; }
    let cancelado = false;
    getInteligenciaPedido(processo.id)
      .then((resp) => { if (!cancelado) setInteligencia(resp.data); })
      .catch(() => { if (!cancelado) setInteligencia(null); });
    return () => { cancelado = true; };
  }, [visible, processo?.id]);

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmtData = (iso: string | null) => {
    if (!iso) return '';
    const [y, m] = iso.split('-');
    return `${m}/${y?.slice(2)}`;
  };

  // Juiz virgem 28/08 (furo MEMORIA-SEM-MEDIDOR): consulta quebrada era
  // indistinguível de "caso inédito" — agora a falha se declara na tela.
  const cardIntelErro = inteligencia && (inteligencia as any).erro ? (
    <div style={{
      marginBottom: '12px', padding: '8px 12px', borderRadius: '8px',
      background: '#fffbeb', border: '1px solid #fcd34d', fontSize: '0.8rem', color: '#92400e',
    }}>
      ⚠ A memória de casos anteriores está indisponível agora ({(inteligencia as any).erro}) —
      isto NÃO significa que o caso é inédito. Confira manualmente se já respondemos.
    </div>
  ) : null;

  const cardInteligencia = inteligencia
    && (inteligencia.duplicata.length > 0 || inteligencia.experiencia.length > 0) ? (
      <div style={{ marginBottom: '12px' }}>
        {inteligencia.duplicata.length > 0 && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
            padding: '10px 14px', marginBottom: '8px', fontSize: '0.875rem', color: '#991b1b',
          }}>
            {/* @R 28/08: "sabermos se já respondemos o caso antes e quais médicos
                responderam e os respectivos valores... e vermos os anexos do pedido
                anterior" — cada caso anterior vira uma linha completa: médico, valor,
                desfecho (a cirurgia aconteceu?) e os arquivos clicáveis. */}
            <strong>⚠ Já respondemos este caso antes</strong>
            {inteligencia.duplicata.map((d) => (
              <div key={d.order_id} style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #fecaca' }}>
                <div>
                  Pedido <strong>#{d.order_id}</strong>
                  {d.mesmo_cnj ? ' (mesmo processo/CNJ)' : ' (mesmo paciente + cirurgia)'}
                  {d.medico_nome ? <> · médico: <strong>{d.medico_nome}</strong></> : null}
                  {d.valor_respondido
                    ? <> · enviamos <strong>{fmtBRL(d.valor_respondido)}</strong> em {fmtData(d.data_resposta)}</>
                    : ' · sem orçamento registrado'}
                </div>
                {d.desfecho && (
                  <div style={{ marginTop: '2px' }}>
                    Situação: <strong>{d.desfecho.rotulo}</strong>
                    {d.desfecho.tipo === 'ganho' && d.desfecho.valor_ganho
                      ? <> — valor ganho {fmtBRL(d.desfecho.valor_ganho)}</> : null}
                  </div>
                )}
                {(d.anexos?.length ?? 0) > 0 && (
                  <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(d.anexos ?? []).map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', borderRadius: '6px', border: '1px solid #fca5a5',
                          background: '#fff', color: '#991b1b', fontSize: '0.8rem', textDecoration: 'none',
                        }}>
                        <i className="pi pi-paperclip" style={{ fontSize: '0.75rem' }} />
                        {a.tipo.toLowerCase().replace(/_/g, ' ')} {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: '6px' }}>Confira antes de enviar um valor diferente.</div>
          </div>
        )}
        {inteligencia.experiencia.length > 0 && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
            padding: '10px 14px', fontSize: '0.875rem', color: '#1e3a5f',
          }}>
            <strong>🧠 Já orçamos esta cirurgia:</strong>{' '}
            {inteligencia.experiencia
              .filter((e) => e.valor_respondido)
              .slice(0, 3)
              .map((e) => (
                <span key={e.order_id} title={e.procedimento}>
                  {fmtBRL(e.valor_respondido as number)} ({fmtData(e.data_resposta)}
                  {e.mesmo_medico ? ', mesmo médico' : ''}){' · '}
                </span>
              ))}
            {inteligencia.media_18m ? (
              <span>média 18m: <strong>{fmtBRL(inteligencia.media_18m)}</strong></span>
            ) : null}
          </div>
        )}
      </div>
    ) : null;

  useEffect(() => {
    if (!visible) return;
    setModo('escolha');
    setValorArquivo(null);
    setArquivoSelecionado(null);
    setEquipeMedica([itemVazio()]);
    setTaxasHospitalar([itemVazio()]);
    setOpmeMateriais([itemVazio()]);
    setAnatomiaPatologica([itemVazio()]);
    setMedicamentos([itemVazio()]);
    setBaseOrcamento(baseOrcamentoInicial);
    setBasePdfCaptureReady(false);
    setHospitalMedico('');
  }, [visible, processo?.id]);

  useEffect(() => {
    let cancelado = false;

    const renderizarBasePdf = async () => {
      const canvas = basePdfCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setBasePdfCaptureReady(false);
      setErroBasePdf('');

      if (!baseOrcamento.linkBaseOrcamento) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      try {
        /* PELO NOSSO DOMÍNIO, ¬direto no R2 (@R/Yago 18/09 — produção parada).
           O `fetch` direto era bloqueado pelo browser desde 17/09: o front saiu do
           Netlify e o CORS do bucket só conhece a origem antiga. Medido com controle:
           Origin novo → sem Access-Control-Allow-Origin; Origin antigo → com.
           O sintoma não parecia CORS: o preview aparecia (`<object>` não passa por
           CORS) e só o botão de enviar ficava morto. */
        const resposta = await baixarArquivoR2(baseOrcamento.linkBaseOrcamento);
        const buffer = resposta.data as ArrayBuffer;
        const loadingTask = getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.2 });

        if (cancelado) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        setBasePdfCaptureReady(true);
      } catch (error) {
        console.error('[EnviarOrcamentoDialog] erro ao renderizar PDF base', error);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setBasePdfCaptureReady(false);
        /* O SILÊNCIO ERA O PIOR DO BUG (18/09). Sem esta linha, a falha só existia no
           console: a tela mostrava o preview e o botão desabilitado, e quem estava
           operando não tinha como saber que faltava algo nem o que fazer. Botão que
           não funciona PRECISA dizer por quê — senão a pessoa clica, não acontece
           nada, e ela conclui que o sistema está quebrado (e está, mas de um jeito
           que ninguém consegue reportar). */
        setErroBasePdf(
          'Não consegui carregar o papel timbrado deste médico, então não dá para gerar '
          + 'o PDF final. Tente de novo em alguns segundos; se continuar, avise que o '
          + 'arquivo-base do médico não está abrindo.',
        );
      }
    };

    renderizarBasePdf();

    return () => {
      cancelado = true;
    };
  }, [baseOrcamento.linkBaseOrcamento]);

  const valorTotal = useMemo(
    () => calcularTotal(equipeMedica, taxasHospitalar, opmeMateriais, anatomiaPatologica, medicamentos),
    [equipeMedica, taxasHospitalar, opmeMateriais, anatomiaPatologica, medicamentos]
  );
  const equipePreview = useMemo(() => filtrarItensPreenchidos(equipeMedica), [equipeMedica]);
  const taxasPreview = useMemo(() => filtrarItensPreenchidos(taxasHospitalar), [taxasHospitalar]);
  const opmePreview = useMemo(() => filtrarItensPreenchidos(opmeMateriais), [opmeMateriais]);
  const anatomiaPreview = useMemo(() => filtrarItensPreenchidos(anatomiaPatologica), [anatomiaPatologica]);
  const medicamentosPreview = useMemo(() => filtrarItensPreenchidos(medicamentos), [medicamentos]);
  const totalEquipe = useMemo(() => equipePreview.reduce((acc, item) => acc + item.valor, 0), [equipePreview]);
  const totalTaxas = useMemo(() => taxasPreview.reduce((acc, item) => acc + item.valor, 0), [taxasPreview]);
  const totalOpme = useMemo(() => opmePreview.reduce((acc, item) => acc + item.valor, 0), [opmePreview]);
  const totalAnatomia = useMemo(() => anatomiaPreview.reduce((acc, item) => acc + item.valor, 0), [anatomiaPreview]);
  const totalMedicamentos = useMemo(() => medicamentosPreview.reduce((acc, item) => acc + item.valor, 0), [medicamentosPreview]);
  const dataHoje = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );
  const nomeMedicoPreview = (processo?.nomeMedico ?? processo?.medico ?? 'Médico responsável') as string;
  const hospitalPreview = (hospitalMedico || processo?.hospital || processo?.nomeHospital || 'Hospital a definir') as string;
  const assinaturaSrc = useMemo(() => {
    if (!baseOrcamento.linkAssinatura) return '';
    const separador = baseOrcamento.linkAssinatura.includes('?') ? '&' : '?';
    return `${baseOrcamento.linkAssinatura}${separador}v=${encodeURIComponent(baseOrcamento.linkAssinatura)}`;
  }, [baseOrcamento.linkAssinatura]);

  const itensInclusos = useMemo(() => {
    const itens = [
      { ativo: baseOrcamento.honorariosEquipeMedica, label: 'Honorários da equipe médica' },
      { ativo: baseOrcamento.taxasHospitalares, label: 'Taxas hospitalares' },
      { ativo: baseOrcamento.materiaisOpme, label: 'Materiais e OPME' },
      { ativo: baseOrcamento.medicamentosDiaria, label: 'Medicamentos durante a diária do pós-operatório' },
      { ativo: baseOrcamento.examesPreOperatorios, label: 'Exames pré-operatórios básicos' },
      { ativo: baseOrcamento.consultaPosOperatoria, label: '1 consulta pós-operatória' },
      { ativo: baseOrcamento.atendimentoEnfermagem, label: 'Atendimento de enfermagem 24h' },
    ];
    return itens.filter((item) => item.ativo);
  }, [baseOrcamento]);

  const itensNaoInclusos = useMemo(() => {
    const itens = [
      { ativo: baseOrcamento.acompanhanteTaxaAdicional, label: 'Acompanhante (taxa adicional)' },
      { ativo: baseOrcamento.fisioterapiaPosOperatoria, label: 'Fisioterapia pós-operatória' },
      { ativo: baseOrcamento.medicamentosPosAlta, label: 'Medicamentos pós-alta' },
      { ativo: baseOrcamento.ortesesImobilizadores, label: 'Órteses e imobilizadores' },
      { ativo: baseOrcamento.examesComplementares, label: 'Exames complementares extras' },
      { ativo: baseOrcamento.custoCtiBemodinamica, label: 'Custos com CTI e hemodinâmica' },
    ];
    return itens.filter((item) => item.ativo);
  }, [baseOrcamento]);

  const abrirOrcamentoManual = async () => {
    if (!processo) return;
    setModo('manual');
    setEquipeMedica([itemVazio()]);
    setTaxasHospitalar([itemVazio()]);
    setOpmeMateriais([itemVazio()]);
    setAnatomiaPatologica([itemVazio()]);
    setMedicamentos([itemVazio()]);
    setBaseOrcamento(baseOrcamentoInicial);

    // O fallback era um índice montado a partir de /orders/listar/ (~3 MB por abertura
    // da tela). O pedido já traz `idMedico` da própria rota desta fase, então o
    // primeiro extrairMedicoId basta — e é a mesma fonte que o fallback lia.
    const medicoId = extrairMedicoId(processo as unknown as Record<string, unknown>);
    if (!medicoId) {
      console.warn('[EnviarOrcamentoDialog] nenhum medicoId encontrado para o processo', processo.id);
      return;
    }

    // Tipo da base é decidido pelo statusJuridico do processo:
    //  - "Segredo de Justiça"  → base SEGREDO
    //  - qualquer outro (Cotar, etc) → base COTAR
    const tipoBase: TipoBaseOrcamento =
      (processo?.statusJuridico ?? '').trim().toLowerCase() === 'segredo de justiça'
        ? 'SEGREDO'
        : 'COTAR';

    setLoadingBaseOrcamento(true);
    try {
      const [{ data }, { data: dadosMedico }] = await Promise.all([
        getBaseOrcamento(medicoId, tipoBase),
        getDadosMedico(medicoId),
      ]);
      const dadosMedicoItem = Array.isArray(dadosMedico) ? dadosMedico[0] : dadosMedico;
      setBaseOrcamento({
        ...baseOrcamentoInicial,
        ...data,
        exists: Boolean(data?.exists),
      });
      setHospitalMedico(dadosMedicoItem?.hospital ?? '');
    } catch (error) {
      console.error('[EnviarOrcamentoDialog] erro ao carregar base de orçamento', error);
      setBaseOrcamento(baseOrcamentoInicial);
      setHospitalMedico('');
    } finally {
      setLoadingBaseOrcamento(false);
    }
  };

  const handleClose = () => {
    if (enviandoArquivo || enviandoManual) return;
    onHide();
  };

  const handleSuccess = async () => {
    onHide();
    await onSuccess();
  };

  const handleEnviarArquivo = async () => {
    if (!processo || !valorArquivo) {
      alert('Informe o valor total do orçamento.');
      return;
    }

    setEnviandoArquivo(true);
    try {
      // ORDEM INVERTIDA (21/09): o PDF sobe ANTES. O e-mail à SES agora sai no próprio salvar e anexa
      // "o último PDF de orçamento" — subindo depois, ele iria sem anexo, ou com o PDF antigo.
      if (arquivoSelecionado) {
        await uploadAnexoOrder(processo.id, arquivoSelecionado, 'ORCAMENTO');
      }
      // alerta GRAVE da leitura (paciente diferente, página não lida) segura o envio: fica na fila com o motivo
      const grave = (leitura?.alertas ?? []).find((x) => x.nivel === 'grave');
      const r = await salvarOrcamentoMedico(processo.id, {
        acao: 'enviar_orcamento',
        equipeMedica: [],
        taxasHospitalar: [],
        opmeMateriais: [],
        anatomiaPatologica: [],
        medicamentos: [],
        valorTotal: valorArquivo,
        enviarAgora: !!arquivoSelecionado,
        segurarEnvioMotivo: grave ? `a leitura do PDF apontou: ${grave.texto}` : '',
      });
      const ses = (r?.data as { emailSes?: { enviado: boolean; naFila: boolean; para?: string; motivo?: string; faseBaterValores?: boolean } | null })?.emailSes;

      setArquivoSelecionado(null);
      setValorArquivo(null);
      await handleSuccess();
      // o desfecho REAL do e-mail, nunca "sucesso" genérico: quem anexou precisa saber se a SES recebeu
      if (ses?.enviado) alert(`Orçamento salvo e e-mail ENVIADO à SES (${ses.para ?? 'solicitante'}), com o PDF em anexo.`);
      // fase 3.1 (@R 22/09): retido para a conferência de valor — ¬é erro, é a parada antes de sair
      else if (ses?.faseBaterValores) alert(`Orçamento salvo e RETIDO na fase 3,1 Bater valores: ${ses.motivo}. Abra "3,1 Bater valores" no menu para confirmar (o e-mail sai na hora) ou registrar a revisão do médico.`);
      else if (ses) alert(`Orçamento salvo, mas o e-mail à SES NÃO saiu: ${ses.motivo}.${ses.naFila ? ' Ele está na fila da Central de E-mails — confira e envie por lá.' : ''}`);
    } catch (error) {
      console.error('[EnviarOrcamentoDialog] erro ao enviar orçamento por arquivo', error);
      alert('Erro ao enviar orçamento.');
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const handleEnviarOrcamentoManual = async () => {
    if (!processo) return;

    if (baseOrcamento.linkBaseOrcamento && !basePdfCaptureReady) {
      alert('A base do orçamento ainda está carregando. Aguarde um instante e tente novamente.');
      return;
    }

    setEnviandoManual(true);
    try {
      await salvarOrcamentoMedico(processo.id, {
        acao: 'enviar_orcamento',
        equipeMedica,
        taxasHospitalar,
        opmeMateriais,
        anatomiaPatologica,
        medicamentos,
        valorTotal,
      });

      const previewNode = previewDocumentoRef.current;
      if (previewNode) {
        const cloneWrapper = document.createElement('div');
        const clone = previewNode.cloneNode(true) as HTMLDivElement;
        const larguraPreview = previewNode.getBoundingClientRect().width || previewNode.offsetWidth;
        const alturaPreview = previewNode.getBoundingClientRect().height || previewNode.offsetHeight;
        const basePdfCanvas = basePdfCanvasRef.current;

        cloneWrapper.style.position = 'fixed';
        cloneWrapper.style.left = '-10000px';
        cloneWrapper.style.top = '0';
        cloneWrapper.style.width = `${larguraPreview}px`;
        cloneWrapper.style.height = `${alturaPreview}px`;
        cloneWrapper.style.pointerEvents = 'none';
        cloneWrapper.style.opacity = '1';
        cloneWrapper.style.zIndex = '-1';
        cloneWrapper.style.background = '#ffffff';

        clone.style.width = `${larguraPreview}px`;
        clone.style.height = `${alturaPreview}px`;
        clone.style.transform = 'none';
        clone.style.margin = '0';

        const fundoClone = clone.querySelector('.orcamento-documento__fundo');
        if (fundoClone && basePdfCanvas && basePdfCanvas.width > 0 && basePdfCanvas.height > 0) {
          const fundoImagem = document.createElement('img');
          fundoImagem.src = basePdfCanvas.toDataURL('image/png');
          fundoImagem.alt = 'Base do orçamento';
          fundoImagem.className = 'orcamento-documento__fundo';
          fundoImagem.crossOrigin = 'anonymous';
          fundoClone.replaceWith(fundoImagem);
        }

        cloneWrapper.appendChild(clone);
        document.body.appendChild(cloneWrapper);

        try {
          const imagens = Array.from(clone.querySelectorAll('img'));
          await Promise.all(
            imagens.map(
              (img) =>
                new Promise<void>((resolve) => {
                  if (img.complete) {
                    resolve();
                    return;
                  }
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                })
            )
          );

          const canvas = await html2canvas(clone, {
            backgroundColor: '#ffffff',
            scale: 4,
            useCORS: true,
            logging: false,
            width: larguraPreview,
            height: alturaPreview,
            windowWidth: larguraPreview,
            windowHeight: alturaPreview,
          });

          const imagemDataUrl = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width, canvas.height],
          });

          pdf.addImage(imagemDataUrl, 'PNG', 0, 0, canvas.width, canvas.height);

          const pdfBlob = pdf.output('blob');
          const file = new File([pdfBlob], `orcamento-manual-order-${processo.id}.pdf`, { type: 'application/pdf' });
          await uploadAnexoOrder(processo.id, file, 'ORCAMENTO');
        } finally {
          cloneWrapper.remove();
        }
      }

      await handleSuccess();
    } catch (error) {
      console.error('[EnviarOrcamentoDialog] erro ao enviar orçamento manual', error);
      alert('Erro ao enviar orçamento.');
    } finally {
      setEnviandoManual(false);
    }
  };

  const updateItem = (
    arr: ItemOrcamento[],
    setArr: React.Dispatch<React.SetStateAction<ItemOrcamento[]>>,
    index: number,
    field: keyof ItemOrcamento,
    value: string | number
  ) => {
    const novo = [...arr];
    novo[index] = { ...novo[index], [field]: value };
    setArr(novo);
  };

  const addItem = (arr: ItemOrcamento[], setArr: React.Dispatch<React.SetStateAction<ItemOrcamento[]>>) => {
    setArr([...arr, itemVazio()]);
  };

  const removeItem = (
    arr: ItemOrcamento[],
    setArr: React.Dispatch<React.SetStateAction<ItemOrcamento[]>>,
    index: number
  ) => {
    setArr(arr.filter((_, i) => i !== index));
  };

  const renderSecaoOrcamento = (
    titulo: string,
    arr: ItemOrcamento[],
    setArr: React.Dispatch<React.SetStateAction<ItemOrcamento[]>>
  ) => (
    <div className="secao-orcamento">
      <h3>{titulo}</h3>
      {arr.map((item, i) => (
        <div key={`${titulo}-${i}`} className="orcamento-row">
          <InputText
            value={item.descricao}
            onChange={(e) => updateItem(arr, setArr, i, 'descricao', e.target.value)}
            placeholder="Descrição"
            className="orcamento-descricao"
          />
          <InputNumber
            value={item.valor}
            onValueChange={(e) => updateItem(arr, setArr, i, 'valor', e.value ?? 0)}
            mode="currency"
            currency="BRL"
            locale="pt-BR"
            className="orcamento-valor"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            outlined
            rounded
            onClick={() => removeItem(arr, setArr, i)}
            disabled={arr.length === 1}
          />
        </div>
      ))}
      <Button label="+ Adicionar" text onClick={() => addItem(arr, setArr)} style={{ marginTop: '4px' }} />
    </div>
  );

  /** Lê o arquivo recém-escolhido. Falha aqui NUNCA trava o modal: o campo continua
   *  digitável à mão, que é como funcionava antes. */
  const lerArquivoDoOrcamento = async (arquivo: File) => {
    if (!processo?.id) return;
    setLendoArquivo(true);
    try {
      const r = await lerOrcamentoDoArquivo(processo.id, arquivo);
      const d = r.data as LeituraOrcamento;
      setLeitura(d);
      // só preenche quando NÃO há divergência grave: com o paciente errado na tela, o
      // valor certo é o de outro pedido, e preenchê-lo ajudaria a errar mais rápido
      const grave = (d.alertas ?? []).some((a) => a.nivel === 'grave');
      if (d.ok && d.valorTotal && !grave) setValorArquivo(d.valorTotal);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { motivo?: string; detail?: string } } };
      setLeitura({
        ok: false,
        motivo: err?.response?.data?.motivo ?? err?.response?.data?.detail
          ?? 'não consegui ler este arquivo — preencha o valor à mão',
      } as LeituraOrcamento);
    } finally {
      setLendoArquivo(false);
    }
  };

  return (
    <>
      <Dialog
        header="Como deseja enviar o orçamento?"
        visible={visible && modo === 'escolha'}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={handleClose}
      >
        {cardIntelErro}
        {cardInteligencia}
        <div style={{ display: 'flex', gap: '16px', padding: '8px 0 16px' }}>
          <button
            onClick={() => setModo('arquivo')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '32px 16px',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <i className="pi pi-file-import" style={{ fontSize: '2rem', color: '#f97316' }} />
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Importar Arquivo</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
              Envie um PDF ou imagem com o orçamento e informe o valor total
            </span>
          </button>

          <button
            onClick={abrirOrcamentoManual}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '32px 16px',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <i className="pi pi-table" style={{ fontSize: '2rem', color: '#f97316' }} />
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Preencher Manualmente</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
              Preencha os itens de equipe, taxas, OPME e medicamentos
            </span>
          </button>
        </div>
      </Dialog>

      <Dialog
        header="Enviar Orçamento"
        visible={visible && modo === 'arquivo'}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={handleClose}
      >
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            Arquivo do Orçamento (opcional)
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={async (e) => {
              const lista = Array.from(e.target.files ?? []);
              setLeitura(null); setPartesUnidas([]); setErroUnificar('');
              if (lista.length <= 1) {
                const f = lista[0] ?? null;
                setArquivoSelecionado(f);
                if (f) lerArquivoDoOrcamento(f);
                return;
              }
              // 2+ arquivos: unifica PRIMEIRO. Se falhar, não seleciona nada — enviar só o 1º calado
              // mandaria à SES um orçamento faltando um pedaço.
              setArquivoSelecionado(null);
              if (!processo?.id) return;
              setLendoArquivo(true);
              try {
                const r = await unificarOrcamento(processo.id, lista);
                const paginas = String(r.headers?.['x-orcamento-paginas'] ?? '').split(',');
                const unico = new File([r.data as Blob], `ORCAMENTO_UNIFICADO_pedido_${processo.id}.pdf`, { type: 'application/pdf' });
                setPartesUnidas(lista.map((a, i) => ({ nome: a.name, paginas: Number(paginas[i]) || 0 })));
                setArquivoSelecionado(unico);
                await lerArquivoDoOrcamento(unico);
              } catch (err: unknown) {
                let motivo = 'não consegui unir os arquivos';
                const blob = (err as { response?: { data?: Blob } })?.response?.data;
                try { if (blob instanceof Blob) motivo = JSON.parse(await blob.text())?.motivo ?? motivo; } catch { /* corpo não era JSON */ }
                setErroUnificar(`${motivo}. Nenhum arquivo foi selecionado — junte-os num PDF só ou tente de novo.`);
                setLendoArquivo(false);
              }
            }}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
            O orçamento veio em mais de um arquivo (hospital, equipe, anestesia)? Selecione todos juntos: viram 1 PDF, lido por inteiro e enviado assim.
          </span>
          {arquivoSelecionado && (
            <span style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '6px', display: 'block' }}>
              <i className="pi pi-file" style={{ marginRight: '4px' }} />
              {arquivoSelecionado.name}
            </span>
          )}
          {partesUnidas.length > 1 && (
            <span style={{ fontSize: '0.8rem', color: '#065f46', marginTop: '4px', display: 'block' }}>
              <i className="pi pi-clone" style={{ marginRight: '4px' }} />
              {partesUnidas.length} arquivos unidos em 1 PDF de {partesUnidas.reduce((t, x) => t + x.paginas, 0)} página(s), nesta ordem:{' '}
              {partesUnidas.map((x) => `${x.nome} (${x.paginas} pág.)`).join(' + ')}. É este PDF que será enviado.
            </span>
          )}
          {erroUnificar && (
            <span role="alert" style={{ fontSize: '0.85rem', color: '#b91c1c', marginTop: '6px', display: 'block' }}>
              <i className="pi pi-times-circle" style={{ marginRight: '4px' }} />{erroUnificar}
            </span>
          )}
        </div>

        {/* O QUE A LEITURA ACHOU — e o que ela NÃO conseguiu.
            Ausência é declarada (mesma lei da Ficha do Pedido): arquivo ilegível diz o
            motivo, nunca fica em branco fazendo a pessoa achar que a tela quebrou. */}
        {lendoArquivo && (
          <div className="orc-leitura orc-leitura--lendo">
            <i className="pi pi-spin pi-spinner" /> lendo o orçamento…
          </div>
        )}

        {leitura && !lendoArquivo && (
          <div className={`orc-leitura ${leitura.alertas?.some((a) => a.nivel === 'grave')
            ? 'orc-leitura--grave' : leitura.ok ? 'orc-leitura--ok' : 'orc-leitura--falhou'}`}>
            {!leitura.ok ? (
              <p className="orc-leitura__motivo">
                <i className="pi pi-exclamation-circle" /> {leitura.motivo} — preencha à mão.
              </p>
            ) : (
              <>
                <p className="orc-leitura__titulo">
                  <i className="pi pi-eye" /> Li o documento{leitura.paginasLidas ? ` — ${leitura.paginasLidas}${leitura.paginasTotal && leitura.paginasTotal > leitura.paginasLidas ? ` de ${leitura.paginasTotal}` : ''} página(s)` : ''}
                  <span className={`orc-conf orc-conf--${leitura.confianca}`}>
                    confiança {leitura.confianca}
                  </span>
                </p>
                <dl className="orc-leitura__campos">
                  {leitura.paciente && (<><dt>Paciente</dt><dd>{leitura.paciente}</dd></>)}
                  {leitura.medicoOuPrestador && (<><dt>Emitido por</dt><dd>{leitura.medicoOuPrestador}</dd></>)}
                  {leitura.procedimento && (<><dt>Procedimento</dt><dd>{leitura.procedimento}</dd></>)}
                  {leitura.dataDocumento && (
                    <><dt>Data</dt><dd>
                      {new Date(`${leitura.dataDocumento}T12:00:00`).toLocaleDateString('pt-BR')}
                      {leitura.validadeDias ? ` · vale ${leitura.validadeDias} dias` : ''}
                    </dd></>
                  )}
                </dl>

                {leitura.itens?.length > 0 && (
                  <details className="orc-leitura__itens">
                    <summary>{leitura.itens.length} item(ns) no orçamento</summary>
                    <ul>
                      {leitura.itens.map((i, n) => (
                        <li key={n}>
                          <span>{i.descricao}</span>
                          <strong>{i.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {leitura.observacao && (
                  <p className="orc-leitura__obs">Observação da leitura: {leitura.observacao}</p>
                )}
              </>
            )}

            {(leitura.alertas ?? []).map((a, n) => (
              <p key={n} className={`orc-alerta orc-alerta--${a.nivel}`}>
                <i className={a.nivel === 'grave' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'} />
                {a.texto}
              </p>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0 16px' }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>
            Informe o valor total do orçamento recebido do médico.
          </p>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Valor Total do Orçamento
            </label>
            <InputNumber
              value={valorArquivo}
              onValueChange={(e) => setValorArquivo(e.value ?? null)}
              mode="currency"
              currency="BRL"
              locale="pt-BR"
              placeholder="R$ 0,00"
              style={{ width: '100%' }}
              className={leitura?.valorTotal && valorArquivo === leitura.valorTotal
                ? 'orc-valor--lido' : undefined}
            />
            {/* a origem do número fica VISÍVEL: sem isto alguém confirma achando que
                digitou, e o "confira" que a medição exige nunca acontece */}
            {leitura?.ok && leitura.valorTotal && valorArquivo === leitura.valorTotal && (
              <span className="orc-valor__origem">
                <i className="pi pi-file-pdf" /> lido do arquivo · <strong>confira</strong> antes de confirmar
              </span>
            )}
            {leitura?.ok && !leitura.valorTotal && (
              <span className="orc-valor__origem orc-valor__origem--vazio">
                não consegui ler o valor neste arquivo — digite
              </span>
            )}
          </div>
        </div>

        <div className="dialog-footer-actions">
          <Button label="Voltar" outlined onClick={() => setModo('escolha')} />
          <Button
            label={enviandoArquivo ? 'Enviando...' : 'Confirmar'}
            icon="pi pi-check"
            onClick={handleEnviarArquivo}
            disabled={enviandoArquivo || !valorArquivo}
            loading={enviandoArquivo}
          />
        </div>
      </Dialog>

      <Dialog
        header="Enviar Orçamento"
        visible={visible && modo === 'manual'}
        style={{ width: '86rem', maxWidth: '99vw' }}
        modal
        onHide={handleClose}
        className="orcamento-edit-dialog"
      >
        <div className="orcamento-dialog-layout">
          <div className="orcamento-secoes">
            {renderSecaoOrcamento('1. Equipe Médica', equipeMedica, setEquipeMedica)}
            {renderSecaoOrcamento('2. Taxas Hospitalares', taxasHospitalar, setTaxasHospitalar)}
            {renderSecaoOrcamento('3. OPME / Materiais', opmeMateriais, setOpmeMateriais)}
            {renderSecaoOrcamento('4. Anatomia Patológica', anatomiaPatologica, setAnatomiaPatologica)}
            {renderSecaoOrcamento('5. Medicamentos', medicamentos, setMedicamentos)}

            <div className="valor-total">
              <strong>VALOR TOTAL: {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
          </div>

          <div className="orcamento-preview">
            <div className="orcamento-documento" ref={previewDocumentoRef}>
              {baseOrcamento.linkBaseOrcamento ? (
                <object
                  data={`${baseOrcamento.linkBaseOrcamento}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                  type="application/pdf"
                  className="orcamento-documento__fundo"
                  aria-label="Base do orçamento"
                >
                  <div className="orcamento-documento__fallback">
                    Não foi possível renderizar a base do orçamento.
                  </div>
                </object>
              ) : (
                <div className="orcamento-documento__fallback">
                  {loadingBaseOrcamento ? 'Carregando base do médico...' : 'Base do orçamento não encontrada para este médico.'}
                </div>
              )}

              <div className="orcamento-documento__conteudo">
                <div className="orcamento-documento__cabecalho">
                  <div className="orcamento-documento__procedimento">{processo?.procedimento || 'PROCEDIMENTO NÃO INFORMADO'}</div>
                  <div className="orcamento-documento__meta-central">Paciente: {processo?.paciente || 'Não informado'}</div>
                  <div className="orcamento-documento__meta-central">Médico Responsável: {nomeMedicoPreview}</div>
                  <div className="orcamento-documento__meta-central">Hospital: {hospitalPreview}</div>
                  <div className="orcamento-documento__regra" />
                  <div className="orcamento-documento__subtexto">
                    Conforme solicitado, segue orçamento para realização do procedimento abaixo:
                  </div>
                </div>

                <div className="orcamento-documento__miolo">
                  <div className="orcamento-documento__coluna-itens">
                    <div className="orcamento-documento__bloco">
                      <div className="orcamento-documento__titulo-bloco">1. EQUIPE MÉDICA</div>
                      {equipePreview.map((item, index) => (
                        <div key={`doc-eq-${index}`} className="orcamento-documento__linha-item">
                          <span>{item.descricao || 'Item sem descrição'}</span>
                          <strong>{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </div>
                      ))}
                      <div className="orcamento-documento__subtotal">
                        Subtotal: <strong>{totalEquipe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      </div>
                    </div>

                    <div className="orcamento-documento__bloco">
                      <div className="orcamento-documento__titulo-bloco">2. TAXAS HOSPITALARES</div>
                      {taxasPreview.map((item, index) => (
                        <div key={`doc-tax-${index}`} className="orcamento-documento__linha-item">
                          <span>{item.descricao || 'Item sem descrição'}</span>
                          <strong>{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </div>
                      ))}
                      <div className="orcamento-documento__subtotal">
                        Subtotal: <strong>{totalTaxas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      </div>
                    </div>

                    <div className="orcamento-documento__bloco">
                      <div className="orcamento-documento__titulo-bloco">3. OPME / MATERIAIS</div>
                      {opmePreview.map((item, index) => (
                        <div key={`doc-opme-${index}`} className="orcamento-documento__linha-item">
                          <span>{item.descricao || 'Item sem descrição'}</span>
                          <strong>{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </div>
                      ))}
                      <div className="orcamento-documento__subtotal">
                        Subtotal: <strong>{totalOpme.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      </div>
                    </div>

                    <div className="orcamento-documento__bloco">
                      <div className="orcamento-documento__titulo-bloco">4. ANATOMIA PATOLÓGICA</div>
                      {anatomiaPreview.map((item, index) => (
                        <div key={`doc-anat-${index}`} className="orcamento-documento__linha-item">
                          <span>{item.descricao || 'Item sem descrição'}</span>
                          <strong>{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </div>
                      ))}
                      <div className="orcamento-documento__subtotal">
                        Subtotal: <strong>{totalAnatomia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      </div>
                    </div>

                    <div className="orcamento-documento__bloco">
                      <div className="orcamento-documento__titulo-bloco">5. MEDICAMENTOS</div>
                      {medicamentosPreview.map((item, index) => (
                        <div key={`doc-med-${index}`} className="orcamento-documento__linha-item">
                          <span>{item.descricao || 'Item sem descrição'}</span>
                          <strong>{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                        </div>
                      ))}
                      <div className="orcamento-documento__subtotal">
                        Subtotal: <strong>{totalMedicamentos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="orcamento-documento__coluna-checklist">
                    <div className="orcamento-documento__checklist">
                      <div className="orcamento-documento__titulo-bloco">INCLUSOS</div>
                      {itensInclusos.length > 0
                        ? itensInclusos.map((item) => (
                            <div key={item.label} className="orcamento-documento__linha-check">
                              {item.label}
                            </div>
                          ))
                        : null}
                    </div>

                    <div className="orcamento-documento__checklist">
                      <div className="orcamento-documento__titulo-bloco">NÃO INCLUSOS</div>
                      {itensNaoInclusos.length > 0
                        ? itensNaoInclusos.map((item) => (
                            <div key={item.label} className="orcamento-documento__linha-check">
                              {item.label}
                            </div>
                          ))
                        : null}
                    </div>
                  </div>
                </div>

                <div className="orcamento-documento__rodape-centro">
                  <div className="orcamento-documento__total">
                    VALOR TOTAL: <strong>{valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  </div>
                  <div className="orcamento-documento__infos-finais">
                    <span>Referência: CBHPM / Tabela Própria</span>
                    <span>Validade: 60 dias</span>
                  </div>
                </div>

                <div className="orcamento-documento__assinatura">
                  <div>{`Juiz de Fora, ${dataHoje}.`}</div>
                  {assinaturaSrc && <img src={assinaturaSrc} crossOrigin="anonymous" alt="Assinatura do médico" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {erroBasePdf && (
          <div className="orcamento-erro-base" role="alert">
            <i className="pi pi-exclamation-triangle" /> {erroBasePdf}
          </div>
        )}

        <div className="dialog-footer-actions">
          <Button label="Voltar" outlined onClick={() => setModo('escolha')} />
          <Button
            label="Enviar Orçamento"
            icon="pi pi-check"
            onClick={handleEnviarOrcamentoManual}
            loading={enviandoManual}
            disabled={enviandoManual || (Boolean(baseOrcamento.linkBaseOrcamento) && !basePdfCaptureReady)}
            tooltip={
              !enviandoManual && Boolean(baseOrcamento.linkBaseOrcamento) && !basePdfCaptureReady
                ? 'Aguardando o papel timbrado do médico carregar — sem ele o PDF final sai sem o timbre.'
                : undefined
            }
            tooltipOptions={{ position: 'top' }}
          />
        </div>
      </Dialog>

      <canvas ref={basePdfCanvasRef} style={{ display: 'none' }} aria-hidden="true" />
    </>
  );
}
