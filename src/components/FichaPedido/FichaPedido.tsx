import { useCallback, useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { listarCandidatosCotacao, convidarCandidatoCotacao, getMedicosCompleto, conferirOrcamentoPeca, getFichaPedido, getLogAuditoria, reverterHistorico, getConteudoEmail, moverSituacao } from '../../services/api/orders';
import { baixarAnexoEmailOriginal } from '../../services/api/emailsJuridico';
import { criarStatusOrcamentoPersonalizado } from '../../services/api/client';
import { EscreverEmail } from '../EscreverEmail/EscreverEmail';
import { Dropdown } from 'primereact/dropdown';
import './FichaPedido.css';
import { BlocoAnotacoes } from '../Anotacoes/BlocoAnotacoes';
import { BlocoLinksDocumentos } from '../LinkDocumentos/BlocoLinksDocumentos';
import { BlocoPecaInteiroTeor } from '../PecaInteiroTeor/PecaInteiroTeor';
import { BlocoPendenciaJuridica, DialogAbrirPendencia } from '../PendenciaJuridica/PendenciaJuridica';

import { baixarAnexo, salvarBlob, uploadAnexoOrder, getOrcamentoVersoes, criarOrcamentoVersao, reenviarOrcamentoVersao, promoverOrcamentoVersao, getWhatsappGrupoPedido, enviarWhatsappGrupoPedido } from '../../services/api/orders';

/**
 * FICHA DO PEDIDO — a rastreabilidade numa tela só.
 *
 * Mandato @R 16/09/2026: "uma ficha que vai atualizando a cada fase para sabermos o que
 * foi feito em cada pedido... para ela poder consultar informações inseridas e arquivos
 * inseridos em cada etapa... isso é a rastreabilidade".
 *
 * Nasceu de um acidente: 7 pedidos avançaram da fase 1 para a 2 em 31 minutos, um por
 * engano, e quem trabalhava a fase 2 não tinha como ver o que fora decidido na fase 1 —
 * havia observação jurídica escrita e campo de orçamentos invisíveis ali.
 *
 * SÓ LEITURA, com uma exceção deliberada: o botão de voltar fase. Está aqui porque é
 * aqui que a pessoa DESCOBRE que a fase está errada — mandá-la para outra tela para
 * corrigir é onde o erro sobrevive.
 *
 * AUSÊNCIA É DECLARADA: campo vazio mostra "não preenchido nesta fase". Branco mudo faz
 * a pessoa achar que a tela quebrou e perguntar no WhatsApp — que é o que queremos parar.
 */

type Campo = { rotulo: string; valor: unknown; preenchido: boolean };
type Arquivo = { id: number; tipo: string; nome: string; quando: string; link: string; confirmadoPor?: string };
type Rastro = { por: string | null; em: string | null; de?: string; para?: string; medido: boolean };
type Bloco = { fase: string; quando: string | null; campos: Campo[]; arquivos: Arquivo[]; rastro: Rastro };
type Trilha = { campo: string; de: string; para: string; por: string; em: string; historico_id: number };
type Urgencia = { vezesPedido: number; ultimoPedidoEm: string | null; repedidosManuais: number; ultimoRepedidoManualEm: string | null };
type EmailRecebido = { id: number; remetente: string | null; assunto: string | null; quando: string; status: string; detalhe: string | null };
type EmailOriginal = { anexoId: number; nome: string; quando: string; link: string };
type Situacao = {
  statusProcesso: string | null;
  /** fase 2 e 3 têm o mesmo statusProcesso; o servidor diz qual é (rótulo virtual "Selecionar Médico…") */
  faseExibida?: string | null;
  statusJuridico: string | null;
  statusOrcamento: string | null;
  statusPerda: string | null;
  dataStatusPerda?: string | null;
};
type SituacaoOpcoes = Record<string, string[]>;

interface OrcamentoDaPeca {
  id: number; valorTotal: number | null; prestador?: string | null;
  /** etiqueta canonizada (agrupa as grafias); o `prestador` acima continua sendo o
   *  texto CRU como estava na peça — decisão @R 18/09 */
  prestadorExibicao?: string | null; grupoPrestador?: number | null;
  procedimento?: string | null; categoria?: string | null; dataOrcamento?: string | null;
  anexoOrigemId?: number | null; anexoOrigemNome?: string | null; paginaOrigem?: number | null;
  linkArquivo?: string | null; fonte?: string; confirmado?: boolean; confirmadoPor?: string | null;
}
interface PecaLida {
  anexoId: number; nome?: string | null; status?: string | null; mensagem?: string | null;
}

type Emails = {
  origem: 'COM_CONTEUDO' | 'SEM_ORIGINAL' | 'NAO_VEIO_POR_EMAIL';
  explicacao: string | null;
  recebidos: EmailRecebido[];
  originais: EmailOriginal[];
  /** para quem a ficha escreve — o mesmo endereço que recebeu o que está listado */
  solicitante?: string | null;
};

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const ROTULO_CAMPO: Record<string, string> = {
  statusProcesso: 'a fase',
  statusJuridico: 'o status jurídico',
  statusOrcamento: 'o status do orçamento',
  statusPerda: 'o motivo da perda',
};
const rotuloCampo = (c: string) => ROTULO_CAMPO[c] ?? c;

function valorLegivel(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function FichaPedido({
  orderId,
  aberto,
  aoFechar,
  podeVoltarFase = false,
  aoMudarSituacao,
}: {
  orderId: number | null;
  aberto: boolean;
  aoFechar: () => void;
  podeVoltarFase?: boolean;
  /** Avisa a tela QUE ABRIU a ficha que o pedido mudou de fase. Sem isto, a ficha se
   *  atualiza sozinha e a tabela atrás continua mostrando a fase antiga — a pessoa fecha
   *  a ficha e conclui que não funcionou (@R 17/09: "atualizar a página corretamente,
   *  para garantir que moveu o item para a fase"). */
  aoMudarSituacao?: () => void;
}) {
  const [dados, setDados] = useState<{
    blocos: Bloco[]; trilha: Trilha[]; statusAtual: string; totalArquivos: number;
    urgencia?: Urgencia; emails?: Emails;
    orcamentosDaPeca?: OrcamentoDaPeca[]; pecasLidas?: PecaLida[];
    situacao?: Situacao; situacaoOpcoes?: SituacaoOpcoes;
    medicoAtual?: { id: number; nome: string; categoria: string | null } | null;
  } | null>(null);
  const [mudandoCampo, setMudandoCampo] = useState<string | null>(null);
  // conteúdo de e-mail carregado SOB DEMANDA: abrir a ficha não deve baixar .eml do R2
  // que ninguém vai ler — a ficha é consultada o tempo todo, o e-mail raramente.
  const [corpos, setCorpos] = useState<Record<number, { carregando?: boolean; texto?: string; vazio?: boolean; erro?: string; anexos?: string[] }>>({});
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  useEffect(() => {
    if (!aberto || !orderId) return;
    setCarregando(true);
    setErro('');
    setCorpos({});   // ¬carregar o e-mail do pedido ANTERIOR nesta ficha
    getFichaPedido(orderId)
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.detail ?? 'Não foi possível carregar a ficha deste pedido.'))
      .finally(() => setCarregando(false));
  }, [aberto, orderId]);

  // @R 19/09: "na ficha, ver o médico e adicionar mais de um médico".
  // Reusa listarCandidatosCotacao/convidarCandidatoCotacao — que já existiam no serviço
  // e só tinham consumidor em UMA tela. Aqui a ficha passa a mostrar quem foi convidado
  // e permite convidar mais, sem decidir vencedor (essa regra é do @R e está aberta).
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [medicosLista, setMedicosLista] = useState<any[]>([]);
  const [convidando, setConvidando] = useState<number | null>(null);
  const [erroMedico, setErroMedico] = useState<string | null>(null);

  /* ── VERSÕES DO ORÇAMENTO (#485 A · @R 19/09) ──────────────────────────────────
     A equipe REFAZ o orçamento (documento novo, que nasce fora e volta como PDF); a nova
     versão vira a VIGENTE e o valor do pedido a acompanha. Reenvio ao solicitante é clique
     separado e diz que SUBSTITUI. Nada apaga PDF antigo (já é peça processual). */
  type Versao = {
    id: number; numeroVersao: number | null; vigente: boolean; valorTotal: number | null;
    totalImpresso: number | null; somaRubricas: number | null; divergencia: number | null;
    dataEmissao: string | null; validade: string | null; semValidadeDeclarada: boolean;
    equipeMedicaValor: number | null; anestesistaValor: number | null;
    taxasHospitalaresValor: number | null; opmeMateriaisValor: number | null;
    anexoId: number | null; anexoUrl: string | null; anexoNome: string | null;
    substituiId: number | null; substituiNumero?: number | null; observacao: string | null; criadoPor: string | null;
    origemRefacao?: string | null; refeita?: boolean;
    criadoEm: string | null; reenviadoEm: string | null; reenviadoPor: string | null;
  };
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [troca, setTroca] = useState<{ anterior: number | null; em: string | null; por: string | null }>({ anterior: null, em: null, por: null });
  /* ── GRUPO WHATSAPP DO CLIENTE (#485 F · @R 19/09) ─────────────────────────────────
     Só aparece se o cliente do pedido tem grupo com envio LIGADO. Texto da cotação + link
     autenticado; nenhum PDF no grupo. Entra numa fila; o relay envia e registra quem/quando. */
  type WaGrupo = { id: number; grupoJid: string; grupoNome: string; funcao: string };
  type WaEnvio = { id: number; grupoNome: string | null; status: string; criadoPor: string | null; criadoEm: string | null; enviadoEm: string | null; erro: string | null };
  const [waGrupos, setWaGrupos] = useState<WaGrupo[]>([]);
  const [waEnvios, setWaEnvios] = useState<WaEnvio[]>([]);
  const [waMotivo, setWaMotivo] = useState<string | null>(null);
  const [waEnviando, setWaEnviando] = useState(false);
  const carregarWa = useCallback(async () => {
    if (!orderId) return;
    try {
      const r = (await getWhatsappGrupoPedido(orderId)).data;
      setWaGrupos(r?.grupos ?? []); setWaEnvios(r?.envios ?? []); setWaMotivo(r?.motivoSemGrupo ?? null);
    } catch { setWaGrupos([]); setWaEnvios([]); setWaMotivo(null); }
  }, [orderId]);
  useEffect(() => { if (aberto && orderId) void carregarWa(); }, [aberto, orderId, carregarWa]);
  const enviarWa = async (g: WaGrupo) => {
    if (!orderId) return;
    if (!window.confirm(`Enviar a cotação deste pedido no grupo "${g.grupoNome}"?\n\nVai o texto da cotação e o link da plataforma (exige login). Nenhum PDF vai no grupo. Fica registrado quem enviou e quando.`)) return;
    setWaEnviando(true);
    try { await enviarWhatsappGrupoPedido(orderId, g.id); await carregarWa(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Não foi possível colocar o envio na fila.'); }
    finally { setWaEnviando(false); }
  };
  const [valorPedido, setValorPedido] = useState<number | null>(null);
  const [novaVersaoAberta, setNovaVersaoAberta] = useState(false);
  const [salvandoVersao, setSalvandoVersao] = useState(false);
  const [erroVersao, setErroVersao] = useState<string | null>(null);
  const [nv, setNv] = useState({ valorTotal: '', dataEmissao: new Date().toISOString().slice(0, 10), validade: '',
    totalImpresso: '', equipeMedicaValor: '', anestesistaValor: '', taxasHospitalaresValor: '', opmeMateriaisValor: '',
    observacao: '', origemRefacao: '', jaTrocar: false, arquivo: null as File | null });
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')));
  const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dataBr = (v: string | null | undefined) => (v ? new Date(v + (v.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—');
  const carregarVersoes = useCallback(async () => {
    if (!orderId) return;
    try {
      const r = (await getOrcamentoVersoes(orderId)).data;
      setVersoes(r?.versoes ?? []); setValorPedido(r?.valorOrcamentoPedido ?? null);
      setTroca({ anterior: r?.valorOrcamentoAnterior ?? null, em: r?.orcamentoTrocadoEm ?? null, por: r?.orcamentoTrocadoPor ?? null });
    } catch { setVersoes([]); }
  }, [orderId]);
  useEffect(() => { if (aberto && orderId) void carregarVersoes(); }, [aberto, orderId, carregarVersoes]);
  const somaNv = [nv.equipeMedicaValor, nv.anestesistaValor, nv.taxasHospitalaresValor, nv.opmeMateriaisValor]
    .map(num).filter((x): x is number => x != null);
  const somaRubricasNv = somaNv.length ? somaNv.reduce((a, b) => a + b, 0) : null;
  const totalRefNv = num(nv.totalImpresso) ?? num(nv.valorTotal);
  const salvarNovaVersao = async () => {
    if (!orderId) return;
    const valor = num(nv.valorTotal);
    if (!valor || valor <= 0) { setErroVersao('Informe o valor total da nova versão.'); return; }
    setSalvandoVersao(true); setErroVersao(null);
    try {
      let anexoId: number | null = null;
      if (nv.arquivo) {
        const up = await uploadAnexoOrder(orderId, nv.arquivo, 'ORCAMENTO');
        anexoId = up.data?.id ?? null;
      }
      await criarOrcamentoVersao(orderId, {
        valorTotal: valor, dataEmissao: nv.dataEmissao || undefined, validade: nv.validade || null,
        totalImpresso: num(nv.totalImpresso), equipeMedicaValor: num(nv.equipeMedicaValor),
        anestesistaValor: num(nv.anestesistaValor), taxasHospitalaresValor: num(nv.taxasHospitalaresValor),
        opmeMateriaisValor: num(nv.opmeMateriaisValor), anexoId, observacao: nv.observacao,
        origemRefacao: nv.origemRefacao || undefined, vigente: nv.jaTrocar,
      });
      setNovaVersaoAberta(false);
      setNv({ ...nv, valorTotal: '', validade: '', totalImpresso: '', equipeMedicaValor: '', anestesistaValor: '',
        taxasHospitalaresValor: '', opmeMateriaisValor: '', observacao: '', origemRefacao: '', jaTrocar: false, arquivo: null });
      await carregarVersoes();
    } catch (e: any) {
      setErroVersao(e?.response?.data?.error ?? 'Não foi possível salvar a versão.');
    } finally { setSalvandoVersao(false); }
  };
  const trocar = async (v: Versao) => {
    if (!orderId) return;
    if (!window.confirm(`Trocar o orçamento atual (${brl(valorPedido)}) pela versão ${v.numeroVersao ?? ''} (${brl(v.valorTotal)})?` +
      '\n\nO valor do pedido passa a ser o desta versão. O valor anterior fica guardado e aparece na ficha. Só admin, gerente ou supervisor.')) return;
    try {
      await promoverOrcamentoVersao(orderId, v.id);
      await carregarVersoes();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível trocar.');
    }
  };
  const reenviar = async (v: Versao) => {
    if (!orderId) return;
    const anterior = versoes.find((x) => x.id === v.substituiId);
    const quando = anterior ? dataBr(anterior.dataEmissao ?? anterior.criadoEm) : null;
    if (!window.confirm(`Reenviar ao solicitante a versão ${v.numeroVersao ?? ''} (${brl(v.valorTotal)})?` +
      (quando ? `\n\nO e-mail dirá que este orçamento SUBSTITUI o enviado em ${quando}.` : '') +
      '\n\nO PDF desta versão vai anexado. Só admin, gerente ou supervisor.')) return;
    try {
      const r = await reenviarOrcamentoVersao(orderId, v.id);
      alert(`E-mail colocado na fila: "${r.data?.assunto}".`);
      await carregarVersoes();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível reenviar.');
    }
  };

  const recarregarCandidatos = useCallback(async () => {
    if (!orderId) return;
    try {
      const r: any = await listarCandidatosCotacao(orderId);
      setCandidatos(r?.data?.candidatos ?? r?.data ?? []);
    } catch {
      setCandidatos([]);   // lista vazia não é erro: a maioria dos pedidos ainda não tem convidado
    }
  }, [orderId]);

  useEffect(() => {
    if (!aberto || !orderId) return;
    void recarregarCandidatos();
    getMedicosCompleto()
      .then((r: any) => setMedicosLista(r?.data ?? []))
      .catch(() => setMedicosLista([]));
  }, [aberto, orderId, recarregarCandidatos]);

  const voltarFase = async () => {
    if (!orderId) return;
    try {
      setRevertendo(true);
      // a última mudança de fase é o que se desfaz — buscada na hora, ¬deduzida da tela
      // excluir_origem=reversao: sem isto o botão vira GANGORRA — depois de desfazer, a
      // "última mudança" passa a ser o PRÓPRIO desfazer, e o 2º clique refaz o que o 1º
      // tinha desfeito. O @R gerou 4 registros alternados no pedido #1248 tentando, e no
      // #1243 o diálogo chegou a oferecer "voltar para Perda" — o oposto do que ele queria.
      const log = await getLogAuditoria({
        order_id: String(orderId),
        campo: 'statusProcesso',
        excluir_origem: 'reversao',
      });
      // @R 20/09 13:36 ("erro para voltar fase em qualquer pedido"): a linha da CRIAÇÃO do pedido
      // (e a da restauração da lixeira) não tem valor anterior — "voltar" para ela mandava fase
      // vazia ao banco e dava 500. Só uma mudança REAL de fase (com "de" e "para") é desfazível.
      const itens: Array<{ valorAnterior?: string | null }> = log.data?.itens ?? [];
      const ultima = itens.find((i) => i.valorAnterior != null && i.valorAnterior !== '') as any;
      if (!ultima) {
        alert('Este pedido ainda não mudou de fase desde que entrou — não há fase anterior para voltar. Use "Situação do pedido" para escolher a fase.');
        return;
      }
      const ok = window.confirm(
        `Voltar este pedido de "${ultima.valorNovo}" para "${ultima.valorAnterior}"?\n\n` +
          `Quem mudou: ${ultima.usuario ?? 'automático'}\nQuando: ${dataHora(ultima.createDate)}\n\n` +
          'A volta fica registrada no histórico com o seu nome.',
      );
      if (!ok) return;
      const resp = await reverterHistorico(ultima.id);
      const r = await getFichaPedido(orderId);
      setDados(r.data);
      aoMudarSituacao?.();   // a tabela atrás também precisa saber
      const campos: string[] = resp?.data?.camposRevertidos ?? [];
      // Diz QUANTOS campos voltaram: dar perda mexe em três, e a versão antiga desfazia
      // um só — o pedido voltava para a fase certa ainda marcado como perdido.
      alert(campos.length > 1
        ? `Pedido devolvido para a fase anterior (${campos.length} campos restaurados: ${campos.join(', ')}).`
        : 'Pedido devolvido para a fase anterior.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      // o 409 do backend tem mensagem própria e ela é melhor que qualquer genérica:
      // diz que o pedido andou de novo desde aquele registro.
      alert(err?.response?.data?.error ?? 'Não foi possível voltar a fase deste pedido.');
    } finally {
      setRevertendo(false);
    }
  };

  // MOVER a situação (@R 17/09). Distinto do "voltar fase": aquele DESFAZ o que
  // aconteceu; este COLOCA o pedido onde ele deveria estar. Não dispara e-mail — se
  // disparasse, corrigir um cadastro mandaria a cotação de novo ao órgão público.
  const [pendenciaPelaSituacao, setPendenciaPelaSituacao] = useState(false);
  const mudarSituacao = async (campo: string, valor: string | null) => {
    if (!orderId) return;
    const atual = (dados?.situacao as Record<string, unknown> | undefined)?.[campo] ?? null;
    if (atual === valor) return;
    // 21/09: mandar ao jurídico um pedido que está em Orçamento/Protocolar por AQUI era o "recado solto" —
    // sem dizer o que falta, sem guardar a origem, sem volta. O caminho certo é o bilhete 1.1.
    if (campo === 'statusProcesso' && valor === 'Aguardando Juridico'
        && (atual === 'Aguardando Orçamento' || atual === 'Aguardando Protocolar')) {
      setPendenciaPelaSituacao(true);
      return;
    }
    const ok = window.confirm(
      `Mudar ${rotuloCampo(campo)} de "${atual ?? '(vazio)'}" para "${valor ?? '(vazio)'}"?\n\n` +
      'Isto corrige o cadastro e fica registrado no histórico com o seu nome.\n' +
      'Nenhum e-mail é enviado por esta mudança.',
    );
    if (!ok) return;
    try {
      setMudandoCampo(campo);
      await moverSituacao(orderId, campo, valor);
      // relê do servidor em vez de assumir: o backend pode ter mexido em mais de um campo
      // (limpar statusPerda também limpa a data da perda).
      const r = await getFichaPedido(orderId);
      setDados(r.data);
      aoMudarSituacao?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error ?? 'Não foi possível mudar este campo.');
    } finally {
      setMudandoCampo(null);
    }
  };

  /**
   * CRIAR UM STATUS NOVO PARA A FASE (@R 17/09: "ao lado de status podemos ter um lápis
   * para criarmos um novo status para a fase, ou trocar o status possível naquela fase").
   *
   * POR QUE SÓ AQUI, NO ORÇAMENTO: os status das outras linhas são o VOCABULÁRIO do
   * funil — cada um dispara (ou marca) um fluxo do sistema, e um nome inventado na tela
   * criaria um estado que nenhum código sabe tratar, aparecendo como fase fantasma nos
   * relatórios. O status de orçamento já tinha, desde 26/08, um cadastro de ETIQUETA
   * MANUAL: rótulo sem automação nenhuma. É esse cadastro que o botão alimenta — nada
   * novo é inventado, o que era uma tela separada passou a caber no lugar onde a decisão
   * acontece.
   *
   * A etiqueta nasce PRESA À FASE em que foi criada, porque foi ali que ela fez sentido;
   * quem quiser uma que valha em todas cadastra pela tela de cadastro, sem fase.
   */
  const criarStatusDaFase = async () => {
    const nome = window.prompt(
      'Nome do novo status de orçamento (é só uma etiqueta — não dispara e-mail nem automação):',
    )?.trim();
    if (!nome) return;
    try {
      setMudandoCampo('statusOrcamento');
      // a tela conhece a FASE pelo rótulo que o usuário vê (statusProcesso); o servidor
      // traduz para a chave do canon. Mandar o rótulo daqui evita a tela ter a sua
      // própria cópia do vocabulário de fases — a cópia é que envelhece calada.
      const faseAtual = (dados?.situacao as Record<string, string | null> | undefined)?.statusProcesso ?? undefined;
      await criarStatusOrcamentoPersonalizado(nome, faseAtual ?? undefined);
      await moverSituacao(orderId!, 'statusOrcamento', nome);
      const r = await getFichaPedido(orderId!);
      setDados(r.data);
      aoMudarSituacao?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; nome?: string[] } } };
      alert(
        err?.response?.data?.error
        ?? (err?.response?.data?.nome?.[0] ? `Status: ${err.response.data.nome[0]}` : null)
        ?? 'Não foi possível criar este status.',
      );
    } finally {
      setMudandoCampo(null);
    }
  };

  const abrirEmail = async (anexoId: number) => {
    if (!orderId || corpos[anexoId]?.texto !== undefined || corpos[anexoId]?.carregando) return;
    setCorpos((c) => ({ ...c, [anexoId]: { carregando: true } }));
    try {
      const r = await getConteudoEmail(orderId, anexoId);
      setCorpos((c) => ({ ...c, [anexoId]: { texto: r.data.corpo ?? '', vazio: !!r.data.vazio, anexos: r.data.anexos ?? [] } }));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      // a CAUSA vai para a tela: "não foi possível" sem motivo faz a pessoa concluir que o
      // e-mail não existe, quando o que houve foi o armazenamento não responder.
      setCorpos((c) => ({ ...c, [anexoId]: { erro: err?.response?.data?.detail ?? 'Não consegui ler este e-mail.' } }));
    }
  };

  return (
    <Dialog
      header={`Ficha do pedido #${orderId ?? ''}`}
      visible={aberto}
      style={{ width: 'min(920px, 96vw)' }}
      onHide={aoFechar}
    >
      {carregando && <p>Carregando a ficha…</p>}
      {erro && <p className="fic__erro">{erro}</p>}

      {dados && (
        <>
          {/* SITUAÇÃO COMPLETA (@R 17/09: "na ficha não mostra a fase e os status, é
              importante também para podermos ver e alterar corretamente caso precise").
              Os quatro juntos porque é a COMBINAÇÃO que conta a história: "Perda" com
              "Perda pelo Medico" é o médico que recusou; "Perda" com "Perda Pelo
              Juridico" é decisão nossa. Ver um sem o outro fez o #1248 parecer
              consertado quando só um dos três campos tinha voltado. */}
          <section className="fic__situacao">
            <header className="fic__situacao-cab">
              <strong>Situação do pedido</strong>
              {podeVoltarFase
                ? <small>Alterar aqui corrige o cadastro e fica no histórico — nenhum e-mail é enviado.</small>
                : <small>Somente leitura — seu perfil não altera a situação.</small>}
            </header>
            <div className="fic__situacao-grade">
              {(['statusProcesso', 'statusJuridico', 'statusOrcamento', 'statusPerda'] as const).map((campo) => {
                // Fase: o que a tela mostra é a fase EXIBIDA (fase 2 e 3 dividem o mesmo status;
                // o servidor diz qual é pelo médico) — reunião 20/09, 00:38:51.
                const atual = campo === 'statusProcesso'
                  ? (dados.situacao?.faseExibida ?? dados.situacao?.statusProcesso ?? null)
                  : ((dados.situacao as Record<string, string | null> | undefined)?.[campo] ?? null);
                const opcoes = dados.situacaoOpcoes?.[campo] ?? [];
                return (
                  <div className="fic__situacao-item" key={campo}>
                    <label>{rotuloCampo(campo).replace(/^(a|o) /, '')}</label>
                    {podeVoltarFase && opcoes.length > 0 ? (
                      <Dropdown
                        value={atual}
                        options={opcoes.map((o) => ({ label: o, value: o }))}
                        onChange={(e) => mudarSituacao(campo, e.value)}
                        placeholder="— não definido"
                        // só statusPerda pode ficar vazio: pedido que deixou de ser perda
                        // não tem motivo de perda. Fase vazia não é um estado que exista.
                        showClear={campo === 'statusPerda'}
                        disabled={mudandoCampo !== null}
                        loading={mudandoCampo === campo}
                        className="fic__situacao-drop"
                      />
                    ) : (
                      <strong>{atual ?? '— não definido'}</strong>
                    )}
                    {podeVoltarFase && campo === 'statusOrcamento' && (
                      <button
                        type="button"
                        className="fic__situacao-novo"
                        onClick={criarStatusDaFase}
                        disabled={mudandoCampo !== null}
                        title="Criar um status novo para esta fase e aplicá-lo agora"
                      >
                        <i className="pi pi-pencil" /> novo status
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {dados.situacao?.dataStatusPerda && (
              <small className="fic__situacao-nota">
                Perda registrada em {new Date(dados.situacao.dataStatusPerda).toLocaleDateString('pt-BR')}
                {' '}— limpar o motivo da perda também limpa esta data.
              </small>
            )}
          </section>

          {/* Reunião 20/09 (Fase 5): anotações INTERNAS — memória da equipe sobre o caso; nas filas
              o nome do paciente ganha "!" enquanto houver anotação. Nunca sai para fora. */}
          {orderId && <BlocoAnotacoes orderId={orderId} />}
          {orderId && <BlocoLinksDocumentos orderId={orderId} />}
          {/* #684 (@R 24/09 00:02): trocar a peça de inteiro teor ou adicionar partes (processo em volumes) pela FICHA. */}
          {orderId && <BlocoPecaInteiroTeor orderId={orderId} />}

          {/* Pedido do Fabrício (reunião 20/09): bilhete de ida e volta ao jurídico — o pedido vai para
              a 1.1 com o que falta e volta sozinho para onde estava quando a Valéria responde. */}
          {orderId && <BlocoPendenciaJuridica orderId={orderId} onMudou={aoMudarSituacao} />}
          <DialogAbrirPendencia orderId={orderId ?? null} visible={pendenciaPelaSituacao}
            onHide={() => setPendenciaPelaSituacao(false)}
            onFeito={async () => { if (orderId) { const r = await getFichaPedido(orderId); setDados(r.data); } aoMudarSituacao?.(); }} />

          <section className="fic__situacao">
            <header className="fic__situacao-cab">
              <strong>Médicos deste pedido</strong>
              <small>Quem está cotando. Adicionar não tira o atual — os dois recebem o pedido.</small>
            </header>
            {/* Reunião 20/09 (00:31:43): "ele tem médico como hospital Santa Rita, mas aqui não
                apareceu". O prestador PRINCIPAL agora vem no payload (medicoAtual) e abre a lista;
                os convidados seguem abaixo. */}
            {dados.medicoAtual ? (
              <p style={{ margin: '.2rem 0 .4rem' }}>
                <strong>{dados.medicoAtual.nome}</strong>
                <small style={{ opacity: .7 }}> · principal{dados.medicoAtual.categoria ? ` · ${dados.medicoAtual.categoria.toLowerCase()}` : ''}</small>
              </p>
            ) : (
              <p style={{ margin: '.2rem 0 .4rem', opacity: .7 }}>Sem médico principal (pedido em Selecionar Médico).</p>
            )}
            {candidatos.length === 0 && !dados.medicoAtual && (
              <p style={{ margin: '.2rem 0 .5rem', opacity: .7 }}>
                Nenhum médico convidado ainda por este caminho.
              </p>
            )}
            {candidatos.length > 0 && (
              <ul style={{ margin: '0 0 .6rem', paddingLeft: '1.1rem' }}>
                {candidatos.map((c: any) => (
                  <li key={c.id ?? c.idMedico}>
                    {c.nomeMedico || c.medico || `médico ${c.idMedico}`}
                    {c.situacao ? <small style={{ opacity: .7 }}> · {c.situacao}</small> : null}
                    {c.valorRespondido ? <small style={{ opacity: .7 }}> · R$ {c.valorRespondido}</small> : null}
                    {c.vencedor ? <strong> · vencedor</strong> : null}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="fic__situacao-drop"
                value={convidando ?? ''}
                onChange={(e) => setConvidando(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Adicionar outro médico ao orçamento…</option>
                {medicosLista.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.nomeSistema || m.nomeCompleto}</option>
                ))}
              </select>
              <button
                type="button"
                className="fic__situacao-novo"
                disabled={!convidando || !orderId}
                onClick={async () => {
                  if (!convidando || !orderId) return;
                  setErroMedico(null);
                  try {
                    await convidarCandidatoCotacao(orderId, convidando);
                    setConvidando(null);
                    await recarregarCandidatos();
                  } catch (err: any) {
                    setErroMedico(err?.response?.data?.error || 'Não consegui adicionar este médico.');
                  }
                }}
              >
                <i className="pi pi-user-plus" /> adicionar
              </button>
            </div>
            {erroMedico && <p style={{ color: '#b91c1c', marginBottom: 0 }}>{erroMedico}</p>}
          </section>

          <div className="fic__topo">
            <span>
              Fase atual: <strong>{dados.statusAtual}</strong>
            </span>
            <span>{dados.totalArquivos} arquivo(s) no pedido</span>
            {(dados.urgencia?.vezesPedido ?? 1) > 1 && (
              <span className={`fic__urgencia fic__urgencia--${(dados.urgencia?.repedidosManuais ?? 0) > 0 ? 'max' : (dados.urgencia!.vezesPedido >= 3 ? 'tres' : 'dois')}`}>
                <i className="pi pi-exclamation-triangle" aria-hidden="true" /> Urgência {dados.urgencia!.vezesPedido}×
                {dados.urgencia?.ultimoPedidoEm && <> — último pedido em {dataHora(dados.urgencia.ultimoPedidoEm)}</>}
                {(dados.urgencia?.repedidosManuais ?? 0) > 0 && (
                  <> · {dados.urgencia!.repedidosManuais} cobrança(s) por telefone</>
                )}
              </span>
            )}
            {podeVoltarFase && (
              <button type="button" className="fic__voltar" onClick={voltarFase} disabled={revertendo}>
                {revertendo ? 'Voltando…' : '↩ Voltar para a fase anterior'}
              </button>
            )}
          </div>

          {dados.blocos.map((b) => (
            <section className="fic__bloco" key={b.fase}>
              <header className="fic__fase">
                <strong>{b.fase}</strong>
                <span className="fic__quando">{dataHora(b.quando)}</span>
                {b.rastro.medido && (
                  <span className="fic__rastro">
                    por {b.rastro.por} em {dataHora(b.rastro.em)}
                  </span>
                )}
              </header>

              <dl className="fic__campos">
                {b.campos.map((c, i) => (
                  <div key={`${b.fase}-${i}`} className={c.preenchido ? '' : 'fic__vazio'}>
                    <dt>{c.rotulo}</dt>
                    <dd>{c.preenchido ? valorLegivel(c.valor) : 'não preenchido nesta fase'}</dd>
                  </div>
                ))}
              </dl>

              {b.arquivos.length > 0 && (
                <ul className="fic__arquivos">
                  {b.arquivos.map((a) => (
                    <li key={a.id}>
                      <a href={a.link} target="_blank" rel="noreferrer">
                        {a.nome}
                      </a>
                      {/* BAIXAR de verdade (@R 18/09). O link acima ABRE (o R2 não manda
                          Content-Disposition e `download` é ignorado em cross-origin); este passa
                          pelo backend, que força o attachment. Os dois ficam: abrir é útil para
                          conferir rápido, baixar é o que a equipe pediu. */}
                      {a.id != null && (
                        <button type="button" className="fic__baixar-anexo"
                          title="Baixar este arquivo"
                          onClick={async () => {
                            try {
                              const { data } = await baixarAnexo(a.id as number);
                              salvarBlob(data, `${(a.tipo || 'anexo').toLowerCase()}-${a.id}.pdf`);
                            } catch {
                              alert('Não foi possível baixar este arquivo agora.');
                            }
                          }}>
                          <i className="pi pi-download" /> baixar
                        </button>
                      )}
                      <span className="fic__tipo">{a.tipo}</span>
                      <span className="fic__quando">{dataHora(a.quando)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* ═══ O QUE AS PEÇAS DISSERAM SOBRE PREÇO (@R 18/09) ═══
              ⟦"processamento das peças para ganhar a área na ficha técnica e dos
              orçamentos, para termos os orçamentos para enviar corretamente"⟧

              A extração já rodava e já gravava — 683 orçamentos vindos de peça de inteiro
              teor na base (medido 18/09). O que faltava era exatamente isto: aparecer.
              Enquanto não aparecia, a equipe reabria o PDF de 300 páginas para procurar
              um número que o sistema já tinha lido e guardado.

              CADA LINHA CARREGA DE ONDE VEIO (documento + página). Valor sem origem é
              boato: quem for usá-lo para julgar uma cotação precisa poder abrir a página
              e ver com os próprios olhos. */}
          {(waGrupos.length > 0 || waEnvios.length > 0) && (
            <section className="fic__bloco fic__wa">
              <header className="fic__fase">
                <strong>Grupo WhatsApp do cliente</strong>
                <small>Manda a cotação no grupo (texto + link com login). Só grupos com envio ligado na ficha do cliente.</small>
              </header>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
                {waGrupos.map((g) => (
                  <button key={g.id} type="button" className="fic__btn fic__btn--primario" disabled={waEnviando} onClick={() => void enviarWa(g)}>
                    Enviar no grupo "{g.grupoNome}"{g.funcao === 'SOLICITACAO' ? '' : ` (${g.funcao.toLowerCase()})`}
                  </button>
                ))}
                {waGrupos.length === 0 && waMotivo && <span className="fic__nota">{waMotivo}</span>}
              </div>
              {waEnvios.length > 0 && (
                <ul className="fic__orcpeca-lista">
                  {waEnvios.map((e) => (
                    <li key={e.id} className="fic__orcpeca-item">
                      <span className="fic__orcpeca-valor">{e.grupoNome}</span>
                      <span className="fic__orcpeca-quem">
                        {e.status === 'ENVIADO' ? <b style={{ color: '#0F766E' }}>enviado {dataHora(e.enviadoEm)}</b>
                          : e.status === 'ERRO' ? <b style={{ color: '#B91C1C' }}>erro: {e.erro}</b>
                          : <em style={{ color: '#B45309' }}>na fila (o relay envia em até 5 min)</em>}
                        {e.criadoPor ? ` · pedido por ${e.criadoPor} ${dataHora(e.criadoEm)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(versoes.length > 0 || valorPedido != null) && (
            <section className="fic__bloco fic__versoes">
              <header className="fic__fase">
                <strong>Versões do nosso orçamento ({versoes.length})</strong>
                <small>
                  Orçamento atual do pedido: <b>{brl(valorPedido)}</b>
                  {troca.anterior != null && (
                    <> · <span style={{ color: '#7C2D12' }}>anterior {brl(troca.anterior)}, trocado {dataHora(troca.em)}{troca.por ? ` por ${troca.por}` : ''}</span></>
                  )}
                  <br />
                  A versão refeita entra como <b>proposta</b>: o orçamento atual continua até alguém clicar em
                  &quot;Trocar pelo atual&quot;. O reenvio ao solicitante é outro clique e diz que substitui a anterior. PDF antigo nunca some.
                </small>
                <button type="button" className="fic__btn" onClick={() => { setErroVersao(null); setNovaVersaoAberta(true); }}>
                  Refazer orçamento (nova versão)
                </button>
              </header>
              {versoes.length === 0 && (
                <p className="fic__nota">Ainda sem versão registrada; o valor atual do pedido é {brl(valorPedido)}.</p>
              )}
              <ul className="fic__orcpeca-lista">
                {versoes.map((v) => (
                  <li key={v.id} className="fic__orcpeca-item" style={{ opacity: v.vigente ? 1 : 0.75 }}>
                    <span className="fic__orcpeca-valor">
                      v{v.numeroVersao ?? '?'} · {brl(v.valorTotal)}
                      {v.refeita && <b className="fic__badge-refeita" title={v.origemRefacao ?? ''}> REFEITA</b>}
                    </span>
                    {v.refeita && (
                      <span className="fic__orcpeca-proc" style={{ color: '#7C2D12' }}>
                        refeita{v.substituiNumero != null ? ` · substitui a v${v.substituiNumero}` : ''}{v.origemRefacao ? ` · ${v.origemRefacao}` : ''}
                      </span>
                    )}
                    <span className="fic__orcpeca-quem">
                      {v.vigente ? <b style={{ color: '#0F766E' }}>vigente</b> : (versoes.some((x) => x.vigente && (x.numeroVersao ?? 0) > (v.numeroVersao ?? 0)) ? 'substituída' : <b style={{ color: '#B45309' }}>proposta (não trocada)</b>)}
                      {' · emitido '}{dataBr(v.dataEmissao ?? v.criadoEm)}
                      {' · '}{v.semValidadeDeclarada ? <em style={{ color: '#B45309' }}>sem validade declarada</em> : `válido até ${dataBr(v.validade)}`}
                    </span>
                    {v.somaRubricas != null && (
                      <span className="fic__orcpeca-proc">
                        equipe {brl(v.equipeMedicaValor)} · anestesista {brl(v.anestesistaValor)} · taxas {brl(v.taxasHospitalaresValor)} · OPME {brl(v.opmeMateriaisValor)}
                        {v.divergencia != null && Math.abs(v.divergencia) >= 0.01 && (
                          <em style={{ color: '#B91C1C' }}> · soma das rubricas difere do total em {brl(v.divergencia)}</em>
                        )}
                      </span>
                    )}
                    {v.somaRubricas == null && <span className="fic__orcpeca-proc"><em>sem decomposição declarada</em></span>}
                    <span className="fic__orcpeca-origem">
                      {v.anexoUrl ? <a href={v.anexoUrl} target="_blank" rel="noreferrer">{v.anexoNome || 'PDF'}</a> : 'sem PDF anexado'}
                      {v.criadoPor ? ` · por ${v.criadoPor}` : ''}
                      {v.reenviadoEm ? ` · reenviado ${dataHora(v.reenviadoEm)}${v.reenviadoPor ? ` por ${v.reenviadoPor}` : ''}` : ''}
                      {v.observacao ? ` · ${v.observacao}` : ''}
                      {v.vigente && v.anexoUrl && (
                        <>
                          {' · '}
                          <button type="button" className="fic__link" onClick={() => void reenviar(v)}>reenviar ao solicitante (substitui)</button>
                        </>
                      )}
                      {!v.vigente && (
                        <>
                          {' · '}
                          <button type="button" className="fic__link" onClick={() => void trocar(v)}>trocar o orçamento atual por esta versão</button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <Dialog header="Refazer orçamento — nova versão" visible={novaVersaoAberta} style={{ width: '46rem', maxWidth: '96vw' }} modal onHide={() => setNovaVersaoAberta(false)}>
                <div className="fic__form">
                  <p className="fic__nota">A versão nova entra como PROPOSTA: o orçamento atual do pedido continua até a troca manual. Nada é enviado por e-mail agora.</p>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: '.5rem' }}>
                    <input type="checkbox" checked={nv.jaTrocar} onChange={(e) => setNv({ ...nv, jaTrocar: e.target.checked })} />
                    Já trocar o orçamento atual por esta versão agora (o valor do pedido muda; o anterior fica guardado)
                  </label>
                  <label>Por que está refazendo? (quem pediu, onde, quando) — fica registrado como REFAÇÃO
                    <input value={nv.origemRefacao} onChange={(e) => setNv({ ...nv, origemRefacao: e.target.value })} placeholder="ex.: pedido do Dr. X no grupo Y em 18/09 · desconto sai da equipe" />
                  </label>
                  <label>Valor total (R$) *<input value={nv.valorTotal} onChange={(e) => setNv({ ...nv, valorTotal: e.target.value })} placeholder="0,00" /></label>
                  <label>Data de emissão<input type="date" value={nv.dataEmissao} onChange={(e) => setNv({ ...nv, dataEmissao: e.target.value })} /></label>
                  <label>Validade <small>(vazio = "sem validade declarada", fica visível)</small><input type="date" value={nv.validade} onChange={(e) => setNv({ ...nv, validade: e.target.value })} /></label>
                  <label>Total impresso no PDF (R$) <small>(se diferente do valor)</small><input value={nv.totalImpresso} onChange={(e) => setNv({ ...nv, totalImpresso: e.target.value })} placeholder="0,00" /></label>
                  <fieldset className="fic__rubricas">
                    <legend>Decomposição (opcional — as 4 rubricas das petições)</legend>
                    <label>Equipe médica<input value={nv.equipeMedicaValor} onChange={(e) => setNv({ ...nv, equipeMedicaValor: e.target.value })} /></label>
                    <label>Anestesista<input value={nv.anestesistaValor} onChange={(e) => setNv({ ...nv, anestesistaValor: e.target.value })} /></label>
                    <label>Taxas hospitalares<input value={nv.taxasHospitalaresValor} onChange={(e) => setNv({ ...nv, taxasHospitalaresValor: e.target.value })} /></label>
                    <label>OPME / materiais<input value={nv.opmeMateriaisValor} onChange={(e) => setNv({ ...nv, opmeMateriaisValor: e.target.value })} /></label>
                    {somaRubricasNv != null && totalRefNv != null && (
                      <p className="fic__nota">
                        Soma das rubricas: <b>{brl(somaRubricasNv)}</b>
                        {Math.abs(somaRubricasNv - totalRefNv) >= 0.01
                          ? <span style={{ color: '#B91C1C' }}> · difere do total em {brl(totalRefNv - somaRubricasNv)} (fica registrado, não some)</span>
                          : <span style={{ color: '#0F766E' }}> · bate com o total</span>}
                      </p>
                    )}
                  </fieldset>
                  <label>PDF da nova versão<input type="file" accept="application/pdf" onChange={(e) => setNv({ ...nv, arquivo: e.target.files?.[0] ?? null })} /></label>
                  <label>Observação<input value={nv.observacao} onChange={(e) => setNv({ ...nv, observacao: e.target.value })} placeholder="ex.: OPME renegociado com o Lauro" /></label>
                  {erroVersao && <p className="fic__erro">{erroVersao}</p>}
                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                    <button type="button" className="fic__btn" onClick={() => setNovaVersaoAberta(false)}>Cancelar</button>
                    <button type="button" className="fic__btn fic__btn--primario" disabled={salvandoVersao} onClick={() => void salvarNovaVersao()}>
                      {salvandoVersao ? 'Salvando…' : 'Salvar como versão vigente'}
                    </button>
                  </div>
                </div>
              </Dialog>
            </section>
          )}

          {dados.orcamentosDaPeca && dados.orcamentosDaPeca.length > 0 && (
            <section className="fic__bloco fic__orcpeca">
              <header className="fic__fase">
                <strong>Orçamentos encontrados nas peças ({dados.orcamentosDaPeca.length})</strong>
                <small>
                  Lidos automaticamente da decisão de inteiro teor — são <em>proposta de
                  leitura</em>, não valor conferido. Servem para julgar a cotação que chegar
                  e montar o que vai à SES; não são enviados ao médico que vai cotar (o
                  número ancoraria o preço dele).
                </small>
              </header>
              <ul className="fic__orcpeca-lista">
                {dados.orcamentosDaPeca.map((o) => (
                  <li key={o.id} className="fic__orcpeca-item">
                    <span className="fic__orcpeca-valor">
                      {o.valorTotal != null
                        ? o.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'valor não lido'}
                    </span>
                    <span className="fic__orcpeca-quem"
                      title={o.prestador && o.prestadorExibicao !== o.prestador
                        ? `na peça está escrito: ${o.prestador}`
                        : undefined}>
                      {o.prestadorExibicao || o.prestador || 'prestador não identificado'}
                    </span>
                    {o.procedimento && <span className="fic__orcpeca-proc">{o.procedimento}</span>}
                    <span className="fic__orcpeca-origem">
                      {o.anexoOrigemNome || 'peça'}
                      {o.paginaOrigem != null ? ` · pág. ${o.paginaOrigem}` : ''}
                      {o.linkArquivo && (
                        <>
                          {' · '}
                          <a href={o.linkArquivo} target="_blank" rel="noreferrer">abrir</a>
                        </>
                      )}
                      {o.confirmado
                        ? <em className="fic__orcpeca-ok"> · conferido por {o.confirmadoPor}</em>
                        : <em className="fic__orcpeca-prop"> · não conferido</em>}
                      {/* O GESTO DE CONFERIR (@R 18/09): ⟦"quem for usar o número abre a
                          página do link, confere e marca. Sem mutirão"⟧. Fica aqui, ao
                          lado do link, porque é aqui que a pessoa acabou de abrir a
                          fonte — pedir que ela vá a outra tela marcar seria garantir
                          que ninguém marca. */}
                      {!o.confirmado && (
                        <button type="button" className="fic__orcpeca-conferir"
                          title="Abri a página do documento e confirmei que este valor está certo"
                          onClick={async () => {
                            try {
                              await conferirOrcamentoPeca(o.id);
                              // relê a ficha: a marca precisa aparecer no MESMO clique,
                              // senão a pessoa clica de novo achando que não funcionou
                              if (orderId) {
                                const r = await getFichaPedido(orderId);
                                setDados(r.data);
                              }
                            } catch {
                              alert('Não foi possível registrar a conferência.');
                            }
                          }}>conferi</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {/* A COBERTURA anda junto: "3 orçamentos" parece o total da peça quando
                  pode ser o total das páginas que deu para ler. A frase honesta é a do
                  processador, com os números dele. */}
              {dados.pecasLidas && dados.pecasLidas.length > 0 && (
                <ul className="fic__orcpeca-cobertura">
                  {dados.pecasLidas.map((p) => (
                    <li key={p.anexoId}>
                      <strong>{p.nome}</strong> · {p.status || 'não processada'}
                      {p.mensagem ? ` — ${p.mensagem}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {dados.emails && (
            <section className="fic__bloco fic__emails">
              <header className="fic__fase fic__fase--com-acao">
                <strong>E-mails deste pedido</strong>
                {/* @R 17/09: escrever ao solicitante "em qualquer fase, em ações em cada
                    parte do pedido". O lugar natural é aqui, ao lado do que já foi dito
                    a ele — quem vai escrever precisa ver o histórico antes, senão repete
                    ou contradiz o que o sistema já mandou. */}
                {orderId && (
                  <EscreverEmail
                    orderId={orderId}
                    destinatarioPadrao={dados.emails?.solicitante ?? null}
                    aoEnviar={async () => {
                      const r = await getFichaPedido(orderId);
                      setDados(r.data);
                    }}
                  />
                )}
              </header>

              {/* AUSÊNCIA DECLARADA, e com o MOTIVO: medido 17/09, só 3,2% dos pedidos têm
                  o e-mail original — não porque a captura falhe (ela pega 90% dos que vêm
                  por e-mail), mas porque a maioria é cadastro manual. Sem dizer isso, a
                  equipe leria branco e concluiria que a tela quebrou. */}
              {dados.emails.explicacao && <p className="fic__vazio-msg">{dados.emails.explicacao}</p>}

              {dados.emails.recebidos.length > 0 && (
                <ul className="fic__emails-lista">
                  {dados.emails.recebidos.map((e) => (
                    <li key={e.id}>
                      <strong>{e.assunto || '(sem assunto)'}</strong>
                      <span className="fic__de">{e.remetente || '(remetente desconhecido)'}</span>
                      <span className="fic__quando">{dataHora(e.quando)}</span>
                      <span className="fic__tipo">{e.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {dados.emails.originais.map((o) => (
                <details key={o.anexoId} className="fic__email" onToggle={(ev) => {
                  if ((ev.target as HTMLDetailsElement).open) abrirEmail(o.anexoId);
                }}>
                  <summary>{o.nome} · {dataHora(o.quando)} — abrir o conteúdo</summary>
                  {corpos[o.anexoId]?.carregando && <p>Lendo o e-mail…</p>}
                  {corpos[o.anexoId]?.erro && <p className="fic__erro">{corpos[o.anexoId].erro}</p>}
                  {corpos[o.anexoId]?.vazio && (
                    <p className="fic__vazio-msg">Este e-mail não tem texto — só anexos ou imagem.</p>
                  )}
                  {corpos[o.anexoId]?.texto && !corpos[o.anexoId]?.vazio && (
                    <pre className="fic__corpo-email">{corpos[o.anexoId].texto}</pre>
                  )}
                  {/* #541 (@R 21/09): "se tem anexo na chegada temos que ter um botão para ver os anexos" —
                      o servidor extrai do .eml guardado; cada nome vira um download. */}
                  {(corpos[o.anexoId]?.anexos?.length ?? 0) > 0 && (
                    <p className="fic__anexos-email"><i className="pi pi-paperclip" /> Anexos do e-mail:{' '}
                      {corpos[o.anexoId]!.anexos!.map((nome, i) => (
                        <button key={i} type="button" className="fic__baixar" onClick={async () => {
                          try { const { data } = await baixarAnexoEmailOriginal(orderId as number, o.anexoId, i + 1); salvarBlob(data, nome); }
                          catch { alert('Não consegui baixar este anexo agora.'); }
                        }}>{nome}</button>
                      ))}
                    </p>
                  )}
                  <a href={o.link} target="_blank" rel="noreferrer" className="fic__baixar">
                    baixar o e-mail original (.eml)
                  </a>
                </details>
              ))}
            </section>
          )}

          <details className="fic__trilha">
            <summary>Trilha completa ({dados.trilha.length} mudanças)</summary>
            <ul>
              {dados.trilha.map((t, i) => (
                <li key={i}>
                  <span className="fic__campo">{t.campo}</span>: {t.de || '(vazio)'} → <strong>{t.para}</strong> · {t.por} ·{' '}
                  {dataHora(t.em)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Dialog>
  );
}

export default FichaPedido;
