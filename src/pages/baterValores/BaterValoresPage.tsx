import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import type { EstadoGatilho, FilaBaterValores, ItemBaterValores, MenorDoProcesso, PainelBaterValores, Saida } from '../../services/api/baterValores';
import { compararComponentes, decidirBaterValores, listarBaterValores, painelBaterValores, lerAcordoValor, registrarAcordoValor, desfazerAcordoValor } from '../../services/api/baterValores';
import type { AcordoValor } from '../../services/api/baterValores';
import { readAuthProfile } from '../../access/authProfile';
import type { ComparativoComponentes } from '../../services/api/baterValores';
import { EntradaManualDialog } from './EntradaManualDialog';
import { baixarAnexo, getAnotacoes, getConteudoEmail, lerOrcamentoDoArquivo, registrarRespostaCotacao, salvarOrcamentoMedico, uploadAnexoOrder } from '../../services/api/orders';
import api from '../../services/api';

/* Fase 3.1 "bater valores" (@R 22/09/2026 14:24: "quando recebemos um orçamento e vemos que tem um valor
   menor no próprio processo, nós tentamos bater o processo").
   POR QUE ESTA TELA EXISTE: medido em 22/09, a cotação nascia e saía para a SES no MESMO clique — não havia
   instante para olhar o valor, e quando a negociação acontecia (caso #1271) ela ficava só no WhatsApp.
   Aqui o orçamento para antes de sair; a pessoa confirma (1 clique) ou registra a revisão que o MÉDICO fez.
   O que esta tela NUNCA faz: sugerir onde cortar. Hospital, OPME e anestesista são custo de terceiro. */

const FILTROS: { label: string; value: EstadoGatilho | 'todos' }[] = [
  { label: 'Com concorrente', value: 'COM_CONCORRENTE' },
  { label: 'Indeterminado', value: 'INDETERMINADO' },
  { label: 'Sem concorrente', value: 'SEM_CONCORRENTE' },
  { label: 'Todos', value: 'todos' },
];
const COR: Record<EstadoGatilho, 'danger' | 'warning' | 'success'> = {
  COM_CONCORRENTE: 'danger', INDETERMINADO: 'warning', SEM_CONCORRENTE: 'success',
};
const ROTULO: Record<EstadoGatilho, string> = {
  COM_CONCORRENTE: 'Há orçamento menor no processo',
  INDETERMINADO: 'Menor, mas pode ser parcial',
  SEM_CONCORRENTE: 'Nenhum orçamento menor',
};
const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function BaterValoresPage() {
  const [filtro, setFiltro] = useState<EstadoGatilho | 'todos'>('todos');
  const [dados, setDados] = useState<FilaBaterValores | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<PainelBaterValores | null>(null);
  const [manualAberto, setManualAberto] = useState(false);
  const ficha = useFichaPedido();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarBaterValores(filtro);
      setDados(r.data);
    } catch {
      // erro de rede NÃO é "fila vazia": dizer que não há nada seria mentir sobre orçamento parado
      setErro('Não foi possível carregar a fila. Nada foi decidido — tente de novo.');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  // @R 22/09: o marcador "3,1" da fase 3 abre direto o painel do pedido (?pedido=ID). Abre 1 vez só.
  const [params] = useSearchParams();
  const abriuDoLink = useRef(false);
  useEffect(() => {
    const alvo = Number(params.get('pedido'));
    if (!alvo || abriuDoLink.current || !dados) return;
    abriuDoLink.current = true;
    painelBaterValores(alvo).then((r) => setAberto(r.data)).catch(() => alert(`Não foi possível abrir o pedido #${alvo} na 3,1.`));
  }, [params, dados]);

  const abrir = async (item: ItemBaterValores) => {
    try {
      const r = await painelBaterValores(item.pedido);
      setAberto(r.data);
    } catch {
      alert('Não foi possível abrir o painel deste pedido.');
    }
  };

  return (
    <div className="p-3">
      <h2 className="mt-0 mb-1">3,1 Bater valores</h2>
      <p className="mt-0 text-600" style={{ maxWidth: 900 }}>
        Orçamentos que chegaram do médico e ainda não foram à SES. O sistema compara com o menor orçamento de
        terceiro <strong>do próprio processo</strong> e mostra a diferença — quem decide é você, com o médico.
        Sem orçamento menor no processo, é só confirmar: o e-mail sai na hora.
      </p>

      <div className="flex align-items-center gap-3 mb-3 flex-wrap">
        <SelectButton value={filtro} options={FILTROS} onChange={(e) => e.value && setFiltro(e.value)} />
        {dados && (
          <span className="text-600">
            {dados.contagem.COM_CONCORRENTE} com concorrente · {dados.contagem.INDETERMINADO} indeterminados ·
            {' '}{dados.contagem.SEM_CONCORRENTE} sem concorrente
          </span>
        )}
        <Button icon="pi pi-refresh" text onClick={carregar} aria-label="Atualizar" />
        {/* @R 22/09: qualquer pedido, em qualquer fase, ou um paciente novo — a fase NÃO muda */}
        <Button label="Colocar pedido na 3,1" icon="pi pi-plus" onClick={() => setManualAberto(true)} />
      </div>

      {erro && <div className="p-3 mb-3" style={{ background: '#fef3f2', color: '#b42318', borderRadius: 6 }}>{erro}</div>}

      <DataTable value={dados?.itens ?? []} loading={carregando} dataKey="pedido" size="small" stripedRows
        emptyMessage={erro ? ' ' : 'Nenhum orçamento esperando conferência de valor.'}>
        <Column header="#" body={(r: ItemBaterValores) => (
          <Button link className="p-0" label={String(r.pedido)} onClick={() => ficha.abrir(r.pedido)} />
        )} style={{ width: 70 }} />
        <Column header="Paciente" body={(r: ItemBaterValores) => (
          <div>
            {r.paciente}
            {r.origem === 'MANUAL' && (
              <div style={{ fontSize: '.75rem' }} title={r.entrada?.anotacao ?? ''}>
                <Tag severity="info" value={`incluído à mão${r.entrada?.por ? ` por ${r.entrada.por}` : ''}`} />
                {r.entrada && <span className="text-600"> · {r.entrada.motivoRotulo}</span>}
                {r.jaFoiSES && <span style={{ color: '#b54708' }}> · já foi à SES ({r.fase})</span>}
              </div>
            )}
          </div>
        )} />
        <Column header="Procedimento" body={(r: ItemBaterValores) => (
          <span style={{ fontSize: '.85rem' }}>{(r.procedimento ?? '').slice(0, 90)}</span>
        )} />
        <Column header="Nosso" body={(r: ItemBaterValores) => brl(r.nossoTotal)} style={{ whiteSpace: 'nowrap' }} />
        <Column header="Menor do processo" body={(r: ItemBaterValores) => <CelulaMenor r={r} />} style={{ minWidth: 150 }} />
        <Column header="Situação" body={(r: ItemBaterValores) => r.estado ? (
          <div>
            <Tag severity={COR[r.estado]} value={ROTULO[r.estado]} />
            {r.acimaPct != null && <div className="text-600" style={{ fontSize: '.8rem' }}>nosso {Math.round(r.acimaPct)}% acima</div>}
            {nossoEhOMenor(r) && <div className="mt-1"><Tag severity="success" value="Nosso é o menor" /></div>}
          </div>
        ) : null} />
        <Column body={(r: ItemBaterValores) => (
          <Button label="Conferir" icon="pi pi-check-square" size="small" onClick={() => abrir(r)} />
        )} style={{ width: 130 }} />
      </DataTable>

      {manualAberto && (
        <EntradaManualDialog onFechar={() => setManualAberto(false)} onPronto={() => { setManualAberto(false); carregar(); }} />
      )}

      {aberto && (
        <DialogDecisao painel={aberto} onFechar={() => setAberto(null)} onDecidido={() => { setAberto(null); carregar(); }}
          onAbrirFicha={() => ficha.abrir(aberto.pedido)} />
      )}
    </div>
  );
}

function TerceiroComparavel({ pedido, t }: { pedido: number; t: PainelBaterValores['terceiros'][number] }) {
  const [comp, setComp] = useState<ComparativoComponentes | null>(t.comparativo ?? null);
  const [lendo, setLendo] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ler = async () => {
    setLendo(true);
    try { const r = await compararComponentes(pedido, t.id); setComp(r.data); setAberto(true); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Não foi possível ler este orçamento agora (erro de rede).');
    } finally { setLendo(false); }
  };
  const dif = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${brl(v)}`);
  return (
    <div className="bv-terceiro">
      <div className="bv-terceiro__linha">
        <span>{brl(t.valorTotal)} — {t.prestador ?? 'prestador não identificado'}{t.pagina ? ` (p. ${t.pagina})` : ''}
          {!t.comparavel && <span style={{ color: '#b54708' }}> · pode ser parcial</span>}</span>
        <span className="bv-terceiro__acoes">
          {t.linkAbrir
            ? <a href={t.linkAbrir} target="_blank" rel="noreferrer" title={t.origemAbrir === 'PECA' ? `Abre o processo inteiro na página ${t.pagina ?? '?'}` : 'Abrir a imagem do orçamento'}>
                <i className="pi pi-image" /> Ver orçamento</a>
            : <span className="text-600" title="O arquivo de origem não foi guardado">sem arquivo</span>}
          {comp
            ? <button type="button" onClick={() => setAberto((v) => !v)}>{aberto ? 'Esconder comparativo' : 'Ver comparativo'}</button>
            : <button type="button" onClick={ler} disabled={lendo}>{lendo ? 'Lendo a folha…' : 'Comparar por componente'}</button>}
        </span>
      </div>
      {comp && aberto && (
        <div className="bv-comp">
          {comp.nossoSemComponentes
            ? <div className="bv-comp__destaque bv-comp__destaque--aviso">O nosso orçamento ainda não está discriminado por componente — só o total. Sem isso não dá para dizer onde está a diferença.</div>
            : comp.maiorDiferenca && <div className="bv-comp__destaque">A maior diferença está em <b>{comp.maiorDiferenca}</b>.</div>}
          <table>
            <thead><tr><th>Componente</th><th>Nosso</th><th>Terceiro</th><th>Diferença</th></tr></thead>
            <tbody>
              {comp.linhas.map((l) => (
                <tr key={l.bloco}><td>{l.rotulo}</td><td>{l.nosso == null ? '—' : brl(l.nosso)}</td><td>{brl(l.terceiro)}</td>
                  <td className={l.diferenca != null && l.diferenca > 0 ? 'bv-comp__acima' : ''}>{dif(l.diferenca)}{l.pct != null ? ` (${l.pct > 0 ? '+' : ''}${l.pct.toLocaleString('pt-BR')}%)` : ''}</td></tr>
              ))}
            </tbody>
          </table>
          <ul className="bv-comp__notas">
            <li>Rubricas do terceiro somam {brl(comp.somaRubricasTerceiro)}{comp.totalDeclaradoTerceiro != null
                ? ` · total do orçamento ${brl(comp.totalDeclaradoTerceiro)}${comp.fonteTotalTerceiro ? ` (${comp.fonteTotalTerceiro})` : ''}`
                : ' · sem total declarado'}
              {comp.inconsistenteTerceiro
                ? <b style={{ color: '#b42318' }}> · INCONSISTENTE: as linhas somam mais que o total — confira no papel antes de usar estes números</b>
                : comp.naoDetalhadoTerceiro ? <b> · {brl(comp.naoDetalhadoTerceiro)} não detalhados na folha</b> : null}.</li>
            <li>Diárias do terceiro: {[
                comp.diariasTerceiro?.enfermaria != null && `${comp.diariasTerceiro.enfermaria} de enfermaria`,
                comp.diariasTerceiro?.apartamento != null && `${comp.diariasTerceiro.apartamento} de apartamento`,
                comp.diariasTerceiro?.uti != null && `${comp.diariasTerceiro.uti} de CTI/UTI`,
                ...(comp.diariasTerceiro?.outras ?? []).map((o) => `${o.qtd} de ${o.tipo}`),
              ].filter(Boolean).join(' · ') || 'a folha não diz'}{comp.diariasTerceiro && comp.diariasTerceiro.apartamento === undefined
                ? ' (leitura antiga, sem apartamento separado — use "ler de novo")' : ''}. As nossas diárias não ficam registradas na cotação — confira no PDF do médico antes de comparar o hospitalar.</li>
            {!comp.legivel && <li style={{ color: '#b54708' }}>A IA marcou a folha como difícil de ler: {comp.observacao ?? 'confira na imagem'}.</li>}
            <li className="text-600">Como agrupamos: {comp.regraAgregacao}</li>
            <li className="text-600">Leitura por IA ({comp.modelo}) em {comp.lidoEm ? new Date(comp.lidoEm).toLocaleString('pt-BR') : '?'} — confira os números na imagem antes de citar ao médico.
              {' '}<button type="button" className="bv-comp__reler" onClick={ler} disabled={lendo}>{lendo ? 'lendo…' : 'ler de novo'}</button></li>
          </ul>
          <details><summary>Rubricas lidas ({comp.rubricas.length})</summary>
            <ul className="bv-comp__rubricas">{comp.rubricas.map((r, i) => <li key={i}>{r.descricao} — {brl(r.valor)} <small>({r.bloco})</small></li>)}</ul>
          </details>
        </div>
      )}
    </div>
  );
}

function DialogDecisao({ painel, onFechar, onDecidido, onAbrirFicha }: {
  painel: PainelBaterValores; onFechar: () => void; onDecidido: () => void; onAbrirFicha: () => void;
}) {
  const [saida, setSaidaCrua] = useState<Saida>('CONFIRMADO');
  // #706 (@R 24/09 11:34, via eliza-urgência: "para aprovar precisa da confirmação dupla do usuário"): o 1º clique
  // em "Confirmar e enviar" só MOSTRA o que vai sair (valor, PDF, destino, fase seguinte, quem assina); o envio à SES
  // é o 2º clique. Trocar a saída desfaz o 1º passo.
  const [passo2, setPasso2] = useState(false);
  const setSaida = (s: Saida) => { setSaidaCrua(s); setPasso2(false); };
  // o token nem sempre traz o username (print do @R 24/09 12:44: "no nome de o seu usuário") — quem diz é o servidor
  const [usuario, setUsuario] = useState<string>(readAuthProfile().username || '');
  useEffect(() => {
    api.get('/auth/eu/').then((r) => r.data?.username && setUsuario(r.data.username)).catch(() => undefined);
  }, []);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [valorNovo, setValorNovo] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [pdf, setPdf] = useState(painel.pdfOrcamento ?? null);
  // #711 (@R 24/09 12:45: "na mesma tela do modal eu poder ver o orçamento grande... não consegui ver o orçamento"):
  // o PDF que vai à SES fica ABERTO na própria janela; o mesmo arquivo alimenta a checagem por visão.
  const [pdfArquivo, setPdfArquivo] = useState<File | null>(null);
  useEffect(() => {
    let vivo = true;
    if (painel.pdfOrcamento && painel.pdfOrcamento.id > 0) {
      baixarAnexo(painel.pdfOrcamento.id)
        .then((r) => vivo && setPdfArquivo(new File([r.data as Blob], painel.pdfOrcamento!.nome || 'orcamento.pdf', { type: 'application/pdf' })))
        .catch(() => undefined);
    }
    return () => { vivo = false; };
  }, [painel.pdfOrcamento]);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const revisando = saida === 'REVISADO';
  const recusando = saida === 'RECUSADO' || saida === 'PERDA';
  // @R 22/09 21:22: confirmar exige o PDF do orçamento (vai anexo à SES) e recusar exige o porquê em texto
  const faltaPdf = saida === 'CONFIRMADO' && !!painel.temEmailRetido && !pdf;
  const pode = !salvando && !enviandoPdf && !faltaPdf
    && (!revisando || (!!motivo && !!valorNovo && valorNovo > 0))
    && (!recusando || obs.trim().length >= 10);

  const anexarPdf = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (pdf && !window.confirm(`Este PDF vai SUBSTITUIR o orçamento atual (${pdf.nome}) como o que segue para a SES. Continuar?`)) return;
    setEnviandoPdf(true);
    try {
      await uploadAnexoOrder(painel.pedido, arquivo, 'ORCAMENTO');
      setPdf({ id: 0, nome: arquivo.name, em: new Date().toISOString() });
      setPdfArquivo(arquivo);
    } catch {
      alert('Não consegui anexar o PDF agora. Tente de novo.');
    } finally {
      setEnviandoPdf(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  const decidir = async () => {
    // As recusas passam PRIMEIRO pela rota própria (a mesma da tela da fase 3): a recusa do médico devolve o
    // pedido a Selecionar médico; a perda gera a negativa à SES na Central. Só depois a 3,1 registra a saída.
    if (saida === 'RECUSADO' && !window.confirm('O médico recusa baixar o valor: o pedido sai dele e VOLTA para Selecionar médico (fase 2). O e-mail de orçamento parado é cancelado. Confirmar?')) return;
    if (saida === 'PERDA' && !window.confirm('Perda na cotação por não atingir o valor: o pedido vai para Perda e a negativa à SES fica na Central de E-mails para envio. O e-mail de orçamento parado é cancelado. Confirmar?')) return;
    setSalvando(true);
    try {
      if (saida === 'RECUSADO') {
        await registrarRespostaCotacao(painel.pedido, 'RECUSOU', obs, 'PRECO');
      }
      if (saida === 'PERDA') {
        await salvarOrcamentoMedico(painel.pedido, {
          acao: 'nao_faco', parecer: obs, motivoPerdaCategoria: 'VALOR_NAO_ATINGIDO', confirmarPerdaComOutrosCotando: true,
        });
      }
      const r = await decidirBaterValores(painel.pedido, {
        saida, motivo: motivo ?? undefined, observacao: obs || undefined, valorNovo: revisando ? valorNovo : undefined,
      });
      const envio = r.data.envio;
      if (saida === 'CONFIRMADO') {
        // o desfecho REAL do e-mail, nunca "sucesso" genérico — quem clica precisa saber se a SES recebeu
        if (envio?.enviado) alert(`Valor confirmado e e-mail ENVIADO à SES (${envio.para ?? 'solicitante'}).`);
        else if (envio) alert(`Valor confirmado, mas o e-mail NÃO saiu: ${envio.motivo}. Ele está na Central de E-mails.`);
        else if (painel.jaFoiSES) alert('Valor confirmado e registrado. O pedido já tinha ido à SES e continua na fase atual.');
        else alert('Valor confirmado. Não havia e-mail de orçamento retido — envie pela tela de Orçamento Médico.');
      } else if (saida === 'RECUSADO') {
        alert('Recusa registrada: o pedido voltou para Selecionar médico (fase 2)'
          + (r.data.emailCancelado ? ' e o e-mail de orçamento parado foi cancelado.' : '.'));
      } else if (saida === 'PERDA') {
        alert('Perda registrada (valor não atingido). A negativa à SES está na Central de E-mails'
          + (r.data.emailCancelado ? '; o e-mail de orçamento parado foi cancelado.' : '.'));
      } else {
        alert('Revisão registrada. Agora suba a nova versão com o valor que o médico mandou (Orçamento Médico → versões) — é ela que vai à SES.');
      }
      onDecidido();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não foi possível registrar: ${msg ?? 'erro de rede'}.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog header={`Conferência de valor — pedido #${painel.pedido}`} visible onHide={onFechar}
      style={{ width: 'min(1560px, 98vw)' }} contentStyle={{ paddingBottom: 12 }}>
      <div className="grid">
      <div className="col-12 lg:col-7 visor-orcamento-col">
        <VisorOrcamento arquivo={pdfArquivo} nome={pdf?.nome ?? null} />
      </div>
      <div className="col-12 lg:col-5">
      <ChecagemOrcamento pedido={painel.pedido} arquivo={pdfArquivo} nossoTotal={painel.nossoTotal} />
      <AnotacoesDoPedido pedido={painel.pedido} />
      <div className="mb-3">
        <div><strong>{painel.paciente}</strong></div>
        <div className="text-600" style={{ fontSize: '.85rem' }}>{painel.procedimento}</div>
      </div>

      <div className="grid mb-2">
        <div className="col-6"><div className="text-600">Nosso orçamento</div><div className="text-2xl font-bold">{brl(painel.nossoTotal)}</div></div>
        <div className="col-6"><div className="text-600">Menor orçamento do processo</div>
          <div className="text-2xl font-bold">{painel.menorDoProcesso ? brl(painel.menorDoProcesso.valor) : brl(painel.menorTerceiro)}</div>
          {painel.menorDoProcesso
            ? <div className="text-600" style={{ fontSize: '.85rem' }}>{painel.menorDoProcesso.prestador ?? 'prestador não identificado'} · {textoPosicao(painel.menorDoProcesso)}
                {painel.menorDoProcesso.conferencia !== 'VALIDADO' && <span style={{ color: '#b54708' }}> · ainda não conferido</span>}</div>
            : painel.semOrcamentoMotivo && <div className="text-600" style={{ fontSize: '.85rem' }}>{painel.semOrcamentoMotivo}</div>}
          {painel.acimaPct != null && <div className="text-600">nosso está {Math.round(painel.acimaPct)}% acima</div>}
          {painel.referenciaPreco && <div className="text-600" style={{ fontSize: '.85rem' }}>Referência do {painel.referenciaPreco.origem}: {brl(painel.referenciaPreco.valor)}
            {painel.referenciaPreco.nossoAcimaPct != null && ` · nosso ${Math.abs(Math.round(painel.referenciaPreco.nossoAcimaPct))}% ${painel.referenciaPreco.nossoAcimaPct > 0 ? 'acima' : 'abaixo'}`}</div>}
        </div>
      </div>

      {painel.entrada && (
        <div className="p-2 mb-2" style={{ background: '#eff8ff', color: '#175cd3', borderRadius: 6, fontSize: '.85rem' }}>
          <strong>Incluído à mão{painel.entrada.por ? ` por ${painel.entrada.por}` : ''}</strong> — {painel.entrada.motivoRotulo}
          {painel.entrada.valorAlvo != null && <> · valor a bater {brl(painel.entrada.valorAlvo)}</>}
          <div>{painel.entrada.anotacao}</div>
          {painel.jaFoiSES && <div style={{ color: '#b54708' }}>Este pedido já foi à SES; se o médico mandar valor novo, ele sai pela refação.</div>}
        </div>
      )}
      {painel.aviso && <div className="p-2 mb-2" style={{ background: '#fffaeb', color: '#b54708', borderRadius: 6 }}>{painel.aviso}</div>}

      <TudoDoProcesso painel={painel} onAbrirFicha={onAbrirFicha} />

      {/* @R 22/09 18:39 (#629): só os orçamentos VALIDADOS na conferência; cada um abre a imagem e pode ser
          comparado por componente (a IA lê a folha, o servidor faz as contas). */}
      <div className="mb-3">
        <div className="text-600 mb-1">Orçamentos de terceiro validados no processo, abaixo do nosso</div>
        {painel.terceiros.length === 0 && <div style={{ fontSize: '.85rem' }} className="text-600">Nenhum orçamento validado abaixo do nosso.</div>}
        {painel.terceiros.map((t) => (
          <TerceiroComparavel key={t.id} pedido={painel.pedido} t={t} />
        ))}
        {!!painel.aguardandoConferencia && (
          <div style={{ fontSize: '.8rem', color: '#b54708' }} className="mt-1">
            {painel.aguardandoConferencia} orçamento(s) abaixo do nosso ainda esperam conferência e não entram aqui —{' '}
            <a href={`/conferencia-orcamentos?pedido=${painel.pedido}`}>conferir na tela 1,3</a>.
          </div>
        )}
      </div>

      <BlocoAcordoValor pedido={painel.pedido} nossoTotal={painel.nossoTotal} menorTerceiro={painel.menorTerceiro} />

      <div className="p-2 mb-3 text-600" style={{ background: '#f2f4f7', borderRadius: 6, fontSize: '.85rem' }}>
        Não alteramos o valor do médico. Hospital, OPME e anestesista são custo de terceiro; se houver espaço,
        ele está no honorário — e a decisão é do médico. Se ele mandou valor novo, registre abaixo.
      </div>

      <div className="text-600 mb-1" style={{ fontSize: '.8rem' }}>Aceitar o valor</div>
      <SelectButton className="mb-2" value={saida} onChange={(e) => e.value && setSaida(e.value)} options={[
        { label: 'Confirmar o valor → vai à SES e segue para 4. Protocolar', value: 'CONFIRMADO' },
        { label: 'O médico revisou', value: 'REVISADO' },
      ]} />
      <div className="text-600 mb-1" style={{ fontSize: '.8rem' }}>Recusar o valor</div>
      <SelectButton className="mb-3" value={saida} onChange={(e) => e.value && setSaida(e.value)} options={[
        { label: 'Médico recusou → volta a Selecionar médico', value: 'RECUSADO' },
        { label: 'Perda: valor não atingido', value: 'PERDA' },
      ]} />

      {saida === 'CONFIRMADO' && (
        <div className="p-2 mb-2" style={{ border: '1px solid #e4e7ec', borderRadius: 6, fontSize: '.85rem' }}>
          <div className="text-600 mb-1">Orçamento que vai anexo à SES</div>
          {pdf
            ? <div><i className="pi pi-file-pdf" style={{ color: '#f97316' }} /> {pdf.nome}</div>
            : <div style={{ color: '#b42318' }}>Nenhum PDF de orçamento anexado — anexe antes de confirmar.</div>}
          <input ref={arquivoRef} type="file" accept="application/pdf" hidden onChange={(e) => anexarPdf(e.target.files?.[0])} />
          <Button className="mt-2" size="small" outlined icon="pi pi-upload" loading={enviandoPdf}
            label={pdf ? 'Trocar o PDF do orçamento' : 'Anexar o PDF do orçamento'} onClick={() => arquivoRef.current?.click()} />
          {!painel.temEmailRetido && <div className="text-600 mt-1">Não há e-mail de orçamento parado para este pedido: a confirmação só fica registrada.</div>}
        </div>
      )}

      <div className="flex flex-column gap-2">
        {!recusando && <Dropdown value={motivo} onChange={(e) => setMotivo(e.value)} showClear
          options={painel.motivosRevisao} optionLabel="rotulo" optionValue="valor"
          placeholder={revisando ? 'Motivo da revisão (obrigatório)' : 'Motivo (opcional)'} />}
        {revisando && (
          <InputNumber value={valorNovo} onValueChange={(e) => setValorNovo(e.value ?? null)} mode="currency"
            currency="BRL" locale="pt-BR" placeholder="Valor que o MÉDICO mandou" />
        )}
        <InputTextarea value={obs} onChange={(e) => setObs(e.target.value)} rows={recusando ? 3 : 2}
          placeholder={recusando ? 'Por que (obrigatório, mín. 10 letras) — ex.: o médico não baixa o honorário' : 'Observação (opcional)'} />
      </div>

      <div className="flex justify-content-end gap-2 mt-3">
        <Button label="Cancelar" text onClick={onFechar} />
        <Button label={saida === 'REVISADO' ? 'Registrar revisão' : saida === 'RECUSADO' ? 'Registrar recusa'
          : saida === 'PERDA' ? 'Dar perda' : passo2 ? 'Confira o resumo abaixo' : 'Confirmar e enviar'}
          icon={recusando ? 'pi pi-times' : 'pi pi-check'} severity={recusando ? 'danger' : undefined} loading={salvando}
          disabled={!pode || (saida === 'CONFIRMADO' && passo2)} onClick={() => (saida === 'CONFIRMADO' ? setPasso2(true) : decidir())} />
      </div>
      {saida === 'CONFIRMADO' && passo2 && (
        <div className="p-3 mt-3 confirmacao-dupla" style={{ border: '2px solid #f97316', borderRadius: 8, background: '#fff7ed' }}
          ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <div className="font-bold mb-2">Confirme o envio (2º passo)</div>
          <ul className="m-0 pl-3" style={{ fontSize: '.9rem', lineHeight: 1.6 }}>
            <li>Pedido <b>#{painel.pedido}</b> — {painel.paciente}</li>
            <li>Valor que vai à SES: <b>{brl(painel.nossoTotal)}</b>{painel.menorDoProcesso && <> (menor do processo: {brl(painel.menorDoProcesso.valor)})</>}</li>
            <li>PDF anexo: <b>{pdf?.nome ?? 'nenhum'}</b></li>
            <li>{painel.temEmailRetido ? 'O e-mail de orçamento parado SAI AGORA para a Secretaria de Estado de Saúde' : 'Não há e-mail parado: a confirmação só fica registrada'}</li>
            <li>Depois: o pedido segue para <b>4. Protocolar</b> (ou <b>5.1</b>, se for segredo de justiça ou sem processo)</li>
            <li>A aprovação fica registrada no nome de <b>{usuario || 'quem está logado'}</b>, com data e hora</li>
          </ul>
          <div className="flex justify-content-end gap-2 mt-2">
            <Button label="Voltar" text onClick={() => setPasso2(false)} />
            <Button label="Sim, enviar à SES" icon="pi pi-send" severity="warning" loading={salvando} disabled={!pode} onClick={decidir} />
          </div>
        </div>
      )}
      </div>
      </div>
    </Dialog>
  );
}



/* ── #711 (@R 24/09 12:45) o orçamento GRANDE na própria janela ─────────────────────────────────────────────── */
function VisorOrcamento({ arquivo, nome }: { arquivo: File | null; nome: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!arquivo) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);
  if (!nome) {
    return <div className="p-4 text-600" style={{ border: '1px dashed #d0d5dd', borderRadius: 8 }}>Nenhum PDF de orçamento neste pedido — anexe à direita.</div>;
  }
  if (!url) return <div className="p-4 text-600"><i className="pi pi-spin pi-spinner" /> Abrindo o orçamento…</div>;
  return (
    <div style={{ position: 'sticky', top: 0 }}>
      <div className="text-600 mb-1" style={{ fontSize: '.8rem' }}>Orçamento que vai à SES — {nome}</div>
      <iframe title="Orçamento que vai à SES" src={url} className="visor-orcamento" style={{ width: '100%', height: '76vh', border: '1px solid #d0d5dd', borderRadius: 8 }} />
    </div>
  );
}

/* ── #711 checagem do orçamento por VISÃO (a leitura que já existia no envio manual; não grava nada) ─────────────
   @R 24/09 12:45: ⟦"verificar se o orçamento está com a data, nome do médico, o valor, a descrição, se tem informação
   para contato, se está discriminado em OPME, hospital e equipe médica, e se tem diárias, apartamento, e se o nome do
   paciente bate com o pedido"⟧. Cada linha diz OK, ATENÇÃO ou PROBLEMA com o que foi lido — quem aprova é a pessoa. */
type LeituraOrc = {
  ok: boolean; motivo?: string; valorTotal: number | null; paciente: string | null; medicoOuPrestador: string | null;
  dataDocumento: string | null; validadeDias: number | null; procedimento: string | null;
  itens: { descricao: string; valor: number; bloco?: string }[]; confianca: string; observacao: string | null;
  alertas: { nivel: string; campo: string; texto: string }[]; contato?: string | null; registroProfissional?: string | null;
  diarias?: number | null; acomodacao?: string | null;
};
type LinhaChecagem = { item: string; estado: 'OK' | 'ATENCAO' | 'PROBLEMA'; texto: string };

export function montarChecagem(l: LeituraOrc, nossoTotal: number | null): LinhaChecagem[] {
  const alerta = (campo: string) => l.alertas.find((a) => a.campo === campo);
  const linhas: LinhaChecagem[] = [];
  const ap = alerta('paciente');
  linhas.push(ap ? { item: 'Paciente', estado: 'PROBLEMA', texto: ap.texto }
    : l.paciente ? { item: 'Paciente', estado: 'OK', texto: `${l.paciente} — bate com o pedido` }
      : { item: 'Paciente', estado: 'ATENCAO', texto: 'o nome do paciente não foi lido no PDF' });
  const av = alerta('validade') ?? alerta('dataDocumento');
  linhas.push(!l.dataDocumento ? { item: 'Data', estado: 'ATENCAO', texto: 'sem data no orçamento' }
    : { item: 'Data', estado: av ? (av.nivel === 'grave' ? 'PROBLEMA' : 'ATENCAO') : 'OK',
        texto: `${l.dataDocumento.split('-').reverse().join('/')}${l.validadeDias ? ` · validade ${l.validadeDias} dias` : ''}${av ? ` — ${av.texto}` : ''}` });
  const am = alerta('medico');
  linhas.push(!l.medicoOuPrestador ? { item: 'Médico / prestador', estado: 'PROBLEMA', texto: 'não identificado no PDF' }
    : { item: 'Médico / prestador', estado: am ? 'ATENCAO' : 'OK',
        texto: `${l.medicoOuPrestador}${l.registroProfissional ? ` · ${l.registroProfissional}` : ''}${am ? ` — ${am.texto}` : ''}` });
  if (l.valorTotal == null) linhas.push({ item: 'Valor', estado: 'PROBLEMA', texto: 'o total não foi lido no PDF' });
  else if (nossoTotal != null && Math.abs(l.valorTotal - nossoTotal) > 1) {
    linhas.push({ item: 'Valor', estado: 'PROBLEMA', texto: `o PDF diz ${brl(l.valorTotal)} e o registrado no pedido (o que vai à SES) é ${brl(nossoTotal)}` });
  } else linhas.push({ item: 'Valor', estado: 'OK', texto: `${brl(l.valorTotal)} — igual ao registrado` });
  const ai = alerta('itens');
  if (ai) linhas.push({ item: 'Soma dos itens', estado: 'ATENCAO', texto: ai.texto });
  linhas.push(l.procedimento ? { item: 'Descrição', estado: 'OK', texto: l.procedimento } : { item: 'Descrição', estado: 'ATENCAO', texto: 'sem descrição do procedimento' });
  const temFone = /\d{4}[-\s]?\d{4}/.test(l.contato ?? '');
  linhas.push(!l.contato ? { item: 'Contato', estado: 'PROBLEMA', texto: 'o PDF não traz telefone nem e-mail' }
    : { item: 'Contato', estado: temFone ? 'OK' : 'ATENCAO', texto: temFone ? l.contato : `sem telefone — só: ${l.contato}` });
  const soma = (b: string[]) => l.itens.filter((i) => b.includes(i.bloco ?? '')).reduce((a, i) => a + (Number(i.valor) || 0), 0);
  const equipe = soma(['EQUIPE_MEDICA', 'ANESTESIA']); const hosp = soma(['HOSPITAL']); const opme = soma(['OPME']);
  const partes = [equipe ? `equipe médica ${brl(equipe)}` : null, hosp ? `hospital ${brl(hosp)}` : null, opme ? `OPME ${brl(opme)}` : null].filter(Boolean);
  linhas.push({ item: 'Discriminação', estado: equipe && hosp ? 'OK' : 'ATENCAO',
    texto: partes.length ? `${partes.join(' · ')}${!opme ? ' · OPME não consta' : ''}` : 'o PDF não separa equipe médica, hospital e OPME' });
  linhas.push(l.diarias && l.acomodacao ? { item: 'Diárias', estado: 'OK', texto: `${l.diarias} diária(s) · ${l.acomodacao}` }
    : { item: 'Diárias', estado: 'ATENCAO', texto: l.diarias ? `${l.diarias} diária(s), acomodação não informada` : l.acomodacao ? `${l.acomodacao}, sem número de diárias` : 'sem diárias nem acomodação' });
  if (l.confianca === 'baixa' || l.observacao) linhas.push({ item: 'Leitura', estado: 'ATENCAO', texto: `confiança ${l.confianca}${l.observacao ? ` — ${l.observacao}` : ''}` });
  return linhas;
}

const COR_CHECAGEM: Record<LinhaChecagem['estado'], [string, string]> = {
  OK: ['pi-check-circle', '#067647'], ATENCAO: ['pi-exclamation-triangle', '#b54708'], PROBLEMA: ['pi-times-circle', '#b42318'],
};

function ChecagemOrcamento({ pedido, arquivo, nossoTotal }: { pedido: number; arquivo: File | null; nossoTotal: number | null }) {
  const [leitura, setLeitura] = useState<LeituraOrc | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ler = useCallback(async () => {
    if (!arquivo) return;
    setLendo(true); setErro(null);
    try {
      const { data } = await lerOrcamentoDoArquivo(pedido, arquivo);
      if (data?.ok === false && data?.motivo) setErro(String(data.motivo));
      setLeitura(data as LeituraOrc);
    } catch {
      setErro('Não consegui ler o orçamento agora.');
    } finally {
      setLendo(false);
    }
  }, [pedido, arquivo]);
  useEffect(() => { ler(); }, [ler]);
  const linhas = leitura && leitura.ok !== false ? montarChecagem(leitura, nossoTotal) : [];
  const n = (e: LinhaChecagem['estado']) => linhas.filter((x) => x.estado === e).length;
  return (
    <div className="mb-3 p-2 checagem-orcamento" style={{ border: '1px solid #d0d5dd', borderRadius: 8, fontSize: '.85rem' }}>
      <div className="flex align-items-center justify-content-between mb-1">
        <strong>Checagem do orçamento (IA lendo o PDF)</strong>
        {linhas.length > 0 && <span className="text-600">{n('OK')} ok · {n('ATENCAO')} atenção · {n('PROBLEMA')} problema</span>}
      </div>
      {!arquivo && <div className="text-600">Sem PDF para checar.</div>}
      {lendo && <div className="text-600"><i className="pi pi-spin pi-spinner" /> Lendo o orçamento…</div>}
      {erro && <div style={{ color: '#b42318' }}>{erro}</div>}
      {linhas.map((x) => (
        <div key={x.item} className="flex gap-2 py-1" style={{ borderBottom: '1px solid #f2f4f7' }}>
          <i className={`pi ${COR_CHECAGEM[x.estado][0]}`} style={{ color: COR_CHECAGEM[x.estado][1], marginTop: 2 }} />
          <span style={{ minWidth: 130, fontWeight: 600 }}>{x.item}</span>
          <span className="flex-1">{x.texto}</span>
        </div>
      ))}
      {leitura && !lendo && <Button className="mt-1" size="small" text icon="pi pi-refresh" label="Ler de novo" onClick={ler} />}
    </div>
  );
}

/* ── anotações do pedido (a porteira da eliza-urgência grava o veredito do lote aqui — R4, 24/09) ─────────────── */
function AnotacoesDoPedido({ pedido }: { pedido: number }) {
  const [itens, setItens] = useState<{ id: number; texto: string; usuario: string | null; createDate: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    getAnotacoes(pedido).then((r) => setItens(((r.data?.itens ?? []) as typeof itens).slice().reverse())).catch(() => undefined);
  }, [pedido]);
  if (!itens.length) return null;
  const mostrar = aberto ? itens : itens.slice(0, 2);
  return (
    <div className="mb-3 p-2 anotacoes-pedido" style={{ background: '#f9fafb', borderRadius: 8, fontSize: '.8rem' }}>
      <div className="font-bold mb-1">Anotações do pedido ({itens.length})</div>
      {mostrar.map((a) => (
        <div key={a.id} className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>
          <span className="text-600">{a.usuario ?? 'sistema'} · {new Date(a.createDate).toLocaleString('pt-BR')}:</span> {a.texto}
        </div>
      ))}
      {itens.length > 2 && <Button size="small" text label={aberto ? 'mostrar menos' : `ver todas (${itens.length})`} onClick={() => setAberto(!aberto)} />}
    </div>
  );
}

/* ── #706 (@R 24/09): o MENOR do processo sempre à vista — valor, onde está em relação ao nosso, ou por que não há ── */
function textoPosicao(m: MenorDoProcesso): string {
  const d = m.difPctNosso != null ? Math.abs(Math.round(m.difPctNosso)) : null;
  if (m.posicao === 'ABAIXO') return `abaixo do nosso${d != null ? ` (${d}%)` : ''}`;
  if (m.posicao === 'ACIMA') return `acima do nosso${d != null ? ` (+${d}%)` : ''}`;
  return 'igual ao nosso';
}

function nossoEhOMenor(r: ItemBaterValores): boolean {
  return !!r.menorDoProcesso && (r.menorDoProcesso.posicao === 'ACIMA' || r.menorDoProcesso.posicao === 'IGUAL');
}

function CelulaMenor({ r }: { r: ItemBaterValores }) {
  const m = r.menorDoProcesso;
  if (!m) return <span className="text-600" style={{ fontSize: '.75rem' }}>{r.semOrcamentoMotivo ?? '—'}</span>;
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      {brl(m.valor)}
      <div className="text-600" style={{ fontSize: '.75rem', whiteSpace: 'normal' }}>
        {textoPosicao(m)}{m.conferencia !== 'VALIDADO' && <span style={{ color: '#b54708' }}> · não conferido</span>}
        {(r.orcamentosNoProcesso ?? 0) > 1 && <> · {r.orcamentosNoProcesso} no processo</>}
      </div>
    </div>
  );
}

/* ── #706 "Tudo do processo" (@R 24/09: "ver todos os orçamentos dentro do processo caso tenha e todos os exames e
   informações do processo e ver o email de solicitação e um resumo do que foi pedido... na hora de conferir temos
   todas as informações para podermos verificar e conferir o pedido antes de enviar"). Só LEITURA: nada aqui grava. */
function TudoDoProcesso({ painel, onAbrirFicha }: { painel: PainelBaterValores; onAbrirFicha: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState<{ id: number; texto: string } | null>(null);
  const [lendo, setLendo] = useState<number | null>(null);
  const docs = painel.documentos ?? [];
  const emails = docs.filter((d) => d.tipo === 'EMAIL_ORIGINAL');
  const outros = docs.filter((d) => d.tipo !== 'EMAIL_ORIGINAL');
  const orcs = painel.orcamentosProcesso ?? [];

  const ver = async (id: number) => {
    setLendo(id);
    try {
      const { data } = await baixarAnexo(id);
      window.open(URL.createObjectURL(data as Blob), '_blank');
    } catch {
      alert('Não consegui abrir este documento agora.');
    } finally {
      setLendo(null);
    }
  };
  const lerEmail = async (id: number) => {
    if (email?.id === id) { setEmail(null); return; }
    setLendo(id);
    try {
      const { data } = await getConteudoEmail(painel.pedido, id);
      const texto = (data as { texto?: string; corpo?: string })?.texto ?? (data as { corpo?: string })?.corpo ?? JSON.stringify(data);
      // o e-mail pode vir com a cadeia inteira de encaminhamentos (#1280: 216.916 caracteres) — a tela mostra o começo e DIZ que cortou
      const LIMITE = 30000;
      const t = String(texto);
      setEmail({ id, texto: t.length > LIMITE ? `${t.slice(0, LIMITE)}\n\n[… texto cortado: mostrando ${LIMITE.toLocaleString('pt-BR')} de ${t.length.toLocaleString('pt-BR')} caracteres — o e-mail completo está na ficha do pedido]` : t });
    } catch {
      alert('Não consegui ler o e-mail agora.');
    } finally {
      setLendo(null);
    }
  };

  return (
    <div className="mb-3 tudo-do-processo" style={{ border: '1px solid #d0d5dd', borderRadius: 8 }}>
      <button type="button" className="w-full text-left p-2" style={{ background: '#f9fafb', border: 0, borderRadius: 8, cursor: 'pointer' }}
        onClick={() => setAberto(!aberto)}>
        <i className={`pi ${aberto ? 'pi-chevron-down' : 'pi-chevron-right'}`} />{' '}
        <strong>Tudo do processo</strong>
        <span className="text-600" style={{ fontSize: '.85rem' }}> — {orcs.length} orçamento(s) · {outros.length} documento(s) · {emails.length} e-mail(s) de solicitação</span>
      </button>
      {aberto && (
        <div className="p-2" style={{ fontSize: '.85rem' }}>
          {!!painel.resumoClinico?.length && (
            <div className="mb-3">
              <div className="font-bold mb-1">O que foi pedido (resumo da IA)</div>
              {painel.resumoClinico.map((c) => (
                <div key={c.campo}><span className="text-600">{c.campo}:</span> {c.valor}</div>
              ))}
            </div>
          )}

          <div className="mb-3">
            <div className="font-bold mb-1">Orçamentos encontrados no processo</div>
            {orcs.length === 0 && <div className="text-600">{painel.semOrcamentoMotivo ?? 'Nenhum orçamento de terceiro no processo.'}</div>}
            {orcs.map((o) => (
              <div key={o.id} className="flex align-items-center gap-2 py-1" style={{ borderBottom: '1px solid #f2f4f7' }}>
                <span style={{ minWidth: 110, fontWeight: 600 }}>{brl(o.valorTotal)}</span>
                <span className="flex-1">{o.prestador ?? 'prestador não identificado'}{o.pagina ? ` · p. ${o.pagina}` : ''}
                  {o.procedimento && <span className="text-600"> · {o.procedimento.slice(0, 80)}</span>}</span>
                <Tag value={o.conferencia === 'VALIDADO' ? 'validado' : o.conferencia === 'DESCARTADO' ? 'descartado' : 'não conferido'}
                  severity={o.conferencia === 'VALIDADO' ? 'success' : o.conferencia === 'DESCARTADO' ? 'secondary' : 'warning'} />
                {o.difPctNosso != null && <span className="text-600" style={{ minWidth: 60 }}>{o.difPctNosso > 0 ? '+' : ''}{Math.round(o.difPctNosso)}%</span>}
                {o.linkAbrir && <a href={o.linkAbrir} target="_blank" rel="noreferrer">abrir</a>}
              </div>
            ))}
          </div>

          <div className="mb-3">
            <div className="font-bold mb-1">E-mail de solicitação</div>
            {emails.length === 0 && <div className="text-600">Nenhum e-mail de solicitação guardado.</div>}
            {emails.map((e) => (
              <div key={e.id} className="mb-1">
                <Button link className="p-0" label={`${e.nome ?? 'E-mail original'}${e.em ? ` · ${new Date(e.em).toLocaleDateString('pt-BR')}` : ''}`}
                  icon="pi pi-envelope" loading={lendo === e.id} onClick={() => lerEmail(e.id)} />
                {email?.id === e.id && (
                  <pre className="p-2 mt-1" style={{ whiteSpace: 'pre-wrap', background: '#f9fafb', borderRadius: 6, maxHeight: 260, overflow: 'auto', fontFamily: 'inherit' }}>{email.texto}</pre>
                )}
              </div>
            ))}
          </div>

          <div className="mb-2">
            <div className="font-bold mb-1">Documentos (exames, laudos, peças)</div>
            {outros.length === 0 && <div className="text-600">Nenhum documento anexado.</div>}
            {outros.map((d) => (
              <div key={d.id} className="flex align-items-center gap-2 py-1">
                <span className="text-600" style={{ minWidth: 170 }}>{d.tipoRotulo}</span>
                <span className="flex-1">{d.nome ?? '—'}</span>
                <Button size="small" text icon="pi pi-eye" label="Ver" loading={lendo === d.id} onClick={() => ver(d.id)} />
              </div>
            ))}
            {painel.pdfOrcamento && painel.pdfOrcamento.id > 0 && (
              <div className="flex align-items-center gap-2 py-1">
                <span style={{ minWidth: 170, color: '#f97316' }}>Nosso orçamento (vai à SES)</span>
                <span className="flex-1">{painel.pdfOrcamento.nome}</span>
                <Button size="small" text icon="pi pi-eye" label="Ver" loading={lendo === painel.pdfOrcamento.id} onClick={() => ver(painel.pdfOrcamento!.id)} />
              </div>
            )}
          </div>
          <Button size="small" outlined icon="pi pi-folder-open" label="Abrir a ficha completa do pedido" onClick={onAbrirFicha} />
        </div>
      )}
    </div>
  );
}

/* ── #642 COMBINADO DIFERENTE (@R 23/09) ────────────────────────────────────────────────────────
   O acordo fechado com o médico fica registrado aqui, com os dois donos da redução: a parte do MÉDICO
   baixa o orçamento (é o que vai à SES) e a parte da G4MED sai da nossa comissão — fora do valor
   enviado. O cotado nunca é apagado: a diferença entre cotado e acordado é o dado. Só Admin e Gerente
   registram; o estado (previsto / realizado / extinto) vem do resultado do pedido. */
const ROTULO_ESTADO: Record<AcordoValor['estado'], [string, string]> = {
  PREVISTO: ['previsto — caso em aberto', '#175cd3'],
  REALIZADO: ['realizado — ganho, abatido', '#067647'],
  EXTINTO: ['extinto — caso perdido, nada abatido', '#667085'],
};
const COMPONENTES_ACORDO = [
  { label: 'Honorários (equipe médica)', value: 'HONORARIOS' }, { label: 'OPME / materiais', value: 'OPME' },
  { label: 'Hospitalar', value: 'HOSPITALAR' }, { label: 'Outros', value: 'OUTROS' },
];

function BlocoAcordoValor({ pedido, nossoTotal, menorTerceiro }: { pedido: number; nossoTotal: number | null; menorTerceiro: number | null }) {
  const perfil = readAuthProfile();
  const podeEscrever = perfil.isSuperuser || (perfil.groups ?? []).some((g) => g === 'ADMIN' || g === 'GERENTE');
  const [acordo, setAcordo] = useState<AcordoValor | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [cotado, setCotado] = useState<number | null>(null);
  const [pm, setPm] = useState<number | null>(null);
  // @R 23/09 01:59: a parte da G4MED NÃO se digita — é a comissão que deixa de existir (taxa × redução).
  const [taxa, setTaxa] = useState<number | null>(null);
  const [componente, setComponente] = useState<AcordoValor['componente']>('HONORARIOS');
  const [com, setCom] = useState('');
  const [regra, setRegra] = useState('');
  const [razao, setRazao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data } = await lerAcordoValor(pedido);
      setAcordo(data.acordo);
      setCotado(data.cotadoAtual || nossoTotal || null);
      setTaxa(data.taxaCliente ?? null);
      setErroLeitura(null);
    } catch {
      setErroLeitura('Não consegui ler o combinado deste pedido agora.');
    } finally {
      setCarregado(true);
    }
  }, [pedido, nossoTotal]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviado = cotado != null && pm != null ? cotado - pm : null;
  const pg = taxa != null && pm != null ? Math.round(taxa * pm) / 100 : null;
  const tresPct = menorTerceiro ? Math.round(menorTerceiro * 97) / 100 : null;

  const salvar = async () => {
    if (cotado == null || pm == null) return;
    const corpo: Record<string, unknown> = {
      valorCotado: cotado, valorAcordado: (cotado - pm).toFixed(2), parteMedico: pm,
      componente, aplicaNoEnvio: true, acordadoCom: com, regra, razao,
    };
    if (componente === 'OPME' || componente === 'HOSPITALAR') {
      if (!window.confirm('A regra é que a cessão sai da equipe médica. Confirmar redução em OPME/hospitalar?')) return;
      corpo.confirmar = true;
    }
    setSalvando(true);
    try {
      await registrarAcordoValor(pedido, corpo);
      setEditando(false);
      await carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não registrei: ${msg ?? 'erro de rede'}.`);
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async () => {
    const motivo = window.prompt('Por que desfazer este combinado? (mínimo 10 letras)') ?? '';
    if (motivo.trim().length < 10) return;
    try { await desfazerAcordoValor(pedido, motivo.trim()); await carregar(); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não desfiz: ${msg ?? 'erro de rede'}.`);
    }
  };

  if (!carregado) return null;
  return (
    <div className="p-2 mb-3" style={{ border: '1px solid #d0d5dd', borderRadius: 6, fontSize: '.85rem' }}>
      <div className="flex justify-content-between align-items-center mb-1">
        <strong>Combinado diferente</strong>
        {acordo && <span style={{ color: ROTULO_ESTADO[acordo.estado][1] }}>{ROTULO_ESTADO[acordo.estado][0]}</span>}
      </div>
      {erroLeitura && <div style={{ color: '#b42318' }}>{erroLeitura}</div>}
      {!erroLeitura && !acordo && !editando && <div className="text-600">Nenhum combinado registrado para este pedido.</div>}
      {acordo && !editando && (
        <div>
          <div>Cotado <strong>{brl(acordo.valorCotado)}</strong> → vai à SES <strong>{brl(acordo.valorEnviado)}</strong></div>
          <div>Médico cede <strong>{brl(acordo.parteMedico)}</strong> (no orçamento, {COMPONENTES_ACORDO.find((c) => c.value === acordo.componente)?.label})
            · G4MED cede <strong>{brl(acordo.parteG4med)}</strong> (na comissão) · total <strong>{brl(acordo.reducaoTotalAbsorvida)}</strong></div>
          {acordo.regra && <div className="text-600">Regra: {acordo.regra}</div>}
          <div className="text-600">Com {acordo.acordadoCom}{acordo.acordadoEm ? ` em ${new Date(acordo.acordadoEm).toLocaleString('pt-BR')}` : ''} · registrado por {acordo.criadoPor} · {acordo.razao}</div>
          <div className="text-600" style={{ fontSize: '.78rem' }}>A parte da G4MED sai da comissão e só é abatida se o caso for ganho.</div>
        </div>
      )}
      {podeEscrever && !editando && (
        <div className="flex gap-2 mt-2">
          <Button size="small" outlined icon="pi pi-pencil" label={acordo ? 'Registrar novo combinado' : 'Registrar combinado'}
            onClick={() => { setEditando(true); setPm(tresPct && cotado && cotado > tresPct ? Math.round((cotado - tresPct) * 100) / 100 : null); }} />
          {acordo && acordo.estado !== 'REALIZADO' && <Button size="small" text severity="danger" label="Desfazer" onClick={desfazer} />}
        </div>
      )}
      {editando && (
        <div className="flex flex-column gap-2 mt-2">
          <div className="grid">
            <div className="col-4"><label className="text-600">Cotado</label>
              <InputNumber value={cotado} onValueChange={(e) => setCotado(e.value ?? null)} mode="currency" currency="BRL" locale="pt-BR" className="w-full" /></div>
            <div className="col-4"><label className="text-600">Médico cede (no orçamento)</label>
              <InputNumber value={pm} onValueChange={(e) => setPm(e.value ?? null)} mode="currency" currency="BRL" locale="pt-BR" className="w-full" /></div>
            <div className="col-4"><label className="text-600">G4MED cede (na comissão)</label>
              <div className="text-xl font-bold" style={{ paddingTop: 6 }}>{taxa == null ? '—' : brl(pg)}</div>
              <small className="text-600">{taxa == null ? 'cliente sem taxa cadastrada' : `${taxa}% da redução — calculado, não se digita`}</small></div>
          </div>
          <div>Vai à SES: <strong>{brl(enviado)}</strong>
            {tresPct != null && <span className="text-600"> · 3% abaixo do menor terceiro seria {brl(tresPct)}</span>}</div>
          <Dropdown value={componente} options={COMPONENTES_ACORDO} onChange={(e) => setComponente(e.value)} />
          <input className="p-inputtext" placeholder="Acordado com (médico/prestador)" value={com} onChange={(e) => setCom(e.target.value)} />
          <input className="p-inputtext" placeholder="Regra (ex.: 3% abaixo do valor de quem judicializou)" value={regra} onChange={(e) => setRegra(e.target.value)} />
          <InputTextarea rows={2} placeholder="Por que (obrigatório, mín. 10 letras)" value={razao} onChange={(e) => setRazao(e.target.value)} />
          <div className="flex justify-content-end gap-2">
            <Button size="small" text label="Cancelar" onClick={() => setEditando(false)} />
            <Button size="small" icon="pi pi-check" label="Registrar" loading={salvando}
              disabled={salvando || cotado == null || pm == null || pm <= 0 || taxa == null || razao.trim().length < 10 || com.trim().length < 3}
              onClick={salvar} />
          </div>
        </div>
      )}
    </div>
  );
}
