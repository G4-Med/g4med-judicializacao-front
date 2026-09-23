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
import type { EstadoGatilho, FilaBaterValores, ItemBaterValores, PainelBaterValores, Saida } from '../../services/api/baterValores';
import { compararComponentes, decidirBaterValores, listarBaterValores, painelBaterValores, lerAcordoValor, registrarAcordoValor, desfazerAcordoValor } from '../../services/api/baterValores';
import type { AcordoValor } from '../../services/api/baterValores';
import { readAuthProfile } from '../../access/authProfile';
import type { ComparativoComponentes } from '../../services/api/baterValores';
import { EntradaManualDialog } from './EntradaManualDialog';
import { registrarRespostaCotacao, salvarOrcamentoMedico, uploadAnexoOrder } from '../../services/api/orders';

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
        <Column header="Menor do processo" body={(r: ItemBaterValores) => brl(r.menorTerceiro)} style={{ whiteSpace: 'nowrap' }} />
        <Column header="Situação" body={(r: ItemBaterValores) => r.estado ? (
          <div>
            <Tag severity={COR[r.estado]} value={ROTULO[r.estado]} />
            {r.acimaPct != null && <div className="text-600" style={{ fontSize: '.8rem' }}>nosso {Math.round(r.acimaPct)}% acima</div>}
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
        <DialogDecisao painel={aberto} onFechar={() => setAberto(null)} onDecidido={() => { setAberto(null); carregar(); }} />
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

function DialogDecisao({ painel, onFechar, onDecidido }: {
  painel: PainelBaterValores; onFechar: () => void; onDecidido: () => void;
}) {
  const [saida, setSaida] = useState<Saida>('CONFIRMADO');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [valorNovo, setValorNovo] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [pdf, setPdf] = useState(painel.pdfOrcamento ?? null);
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
      style={{ width: 'min(880px, 96vw)' }}>
      <div className="mb-3">
        <div><strong>{painel.paciente}</strong></div>
        <div className="text-600" style={{ fontSize: '.85rem' }}>{painel.procedimento}</div>
      </div>

      <div className="grid mb-2">
        <div className="col-6"><div className="text-600">Nosso orçamento</div><div className="text-2xl font-bold">{brl(painel.nossoTotal)}</div></div>
        <div className="col-6"><div className="text-600">Menor orçamento do processo</div><div className="text-2xl font-bold">{brl(painel.menorTerceiro)}</div>
          {painel.acimaPct != null && <div className="text-600">nosso está {Math.round(painel.acimaPct)}% acima</div>}</div>
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
          : saida === 'PERDA' ? 'Dar perda' : 'Confirmar e enviar'}
          icon={recusando ? 'pi pi-times' : 'pi pi-check'} severity={recusando ? 'danger' : undefined} loading={salvando}
          disabled={!pode} onClick={decidir} />
      </div>
    </Dialog>
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
