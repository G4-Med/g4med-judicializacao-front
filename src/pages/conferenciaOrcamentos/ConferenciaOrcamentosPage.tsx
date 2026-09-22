import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { useOrdenacao } from '../../components/Tabela/useOrdenacao';
import type { EstadoConferencia, ItemConferencia, ListaConferencia, ProgressoRevisaoIa } from '../../services/api/conferenciaOrcamentos';
import { decidirConferencia, iniciarRevisaoIa, listarConferencia, progressoRevisaoIa } from '../../services/api/conferenciaOrcamentos';

/* Conferência de orçamentos (decisão @R 22/09/2026, "encolher primeiro").
   POR QUE: medido no gabarito da eliza-advogado, 30% do que o leitor chamava de orçamento NÃO era
   (petição que cita valor, nota técnica do SUS). Isso chegava ao médico como "preço de referência".
   Agora o médico só vê o que está VALIDADO; esta tela é onde o jurídico confere o resto. */

const ESTADOS: { label: string; value: EstadoConferencia | 'todos' }[] = [
  { label: 'A revisar', value: 'REVISAR' },
  { label: 'Descartados', value: 'DESCARTADO' },
  { label: 'Validados', value: 'VALIDADO' },
  { label: 'Todos', value: 'todos' },
];
const COR: Record<EstadoConferencia, 'warning' | 'danger' | 'success'> = { REVISAR: 'warning', DESCARTADO: 'danger', VALIDADO: 'success' };
const ROTULO: Record<EstadoConferencia, string> = { REVISAR: 'A revisar', DESCARTADO: 'Descartado', VALIDADO: 'Validado' };
const ORIGEM: Record<string, string> = { RECORTE: 'folha', ARQUIVO: 'arquivo', PECA: 'processo' };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const VEREDITO: Record<string, { txt: string; cor: string }> = {
  NAO_E_ORCAMENTO: { txt: 'não é orçamento (2 juízes)', cor: '#b42318' },
  ORCAMENTO: { txt: 'é orçamento (2 juízes)', cor: '#067647' },
  DIVERGENTE: { txt: 'juízes divergem', cor: '#b54708' },
  INDETERMINADO: { txt: 'só 1 juiz respondeu', cor: '#667085' },
};
const MOTIVOS_PRONTOS = ['Petição que só cita o valor', 'Decisão/sentença citando valor', 'Nota técnica / NatJus',
  'Tabela SUS / SIGTAP', 'Laudo, não é orçamento', 'Orçamento repetido (já está em outra linha)', 'Orçamento de outro paciente'];
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** O que o revisor por IA entendeu da folha de origem (@R 22/09: "coluna que indica o que a LLM
 *  entende que é o documento"). Visão = imagem; Jev = texto. Sem parecer = ainda não revisado. */
function ParecerIa({ ia }: { ia: ItemConferencia['ia'] }) {
  if (!ia) return <span className="text-500" style={{ fontSize: '.8rem' }}>ainda não revisado</span>;
  const v = VEREDITO[ia.veredito ?? ''] ;
  return (
    <div style={{ fontSize: '.8rem' }} title={[ia.motivo, `visão ${pct(ia.confianca)} · Jev ${pct(ia.jev)}`, ia.modelo].filter(Boolean).join('\n')}>
      <strong>{ia.rotulo}</strong>{ia.timbrado ? ' · papel timbrado' : ''}
      {ia.emissor ? <div className="text-600">emitido por {ia.emissor}</div> : null}
      {!ia.emissor && ia.tipo === 'ORCAMENTO' ? <div className="text-600">emissor não identificado na folha</div> : null}
      {v ? <div style={{ color: v.cor }}>{v.txt}</div> : null}
      {ia.sugestao ? <div style={{ fontWeight: 700, color: ia.sugestao === 'VALIDAR' ? '#067647' : '#b42318' }}>
        → IA sugere {ia.sugestao === 'VALIDAR' ? 'validar' : 'descartar'}</div> : null}
    </div>
  );
}

export function ConferenciaOrcamentosPage() {
  const [estado, setEstado] = useState<EstadoConferencia | 'todos'>('REVISAR');
  const [todasFases, setTodasFases] = useState(false);
  const [dados, setDados] = useState<ListaConferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emAcao, setEmAcao] = useState<number | null>(null);
  const [descartando, setDescartando] = useState<ItemConferencia | null>(null);
  // @R 22/09 11:55: "cliquei em validar e nada aconteceu" — gravava (200), mas a linha só sumia da aba.
  // Todo clique agora confirma na tela o que aconteceu, para onde foi, e oferece desfazer.
  const [feito, setFeito] = useState<{ it: ItemConferencia; acao: 'VALIDAR' | 'DESCARTAR' | 'DESFAZER' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const ordenacao = useOrdenacao('pedido', -1);
  // @R 22/09 ~11:50: "crie o botão, passe, analise o resultado para sempre eu passar nos que precisam"
  const [ia, setIa] = useState<ProgressoRevisaoIa | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const ficha = useFichaPedido();

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const { data } = await listarConferencia({ estado, todasFases });
      setDados(data);
    } catch (e: unknown) {
      const r = (e as { response?: { status?: number; data?: { error?: string; detail?: string } } }).response;
      // Erro NUNCA vira "nada a conferir": a tabela vazia só aparece com resposta 200.
      setDados(null);
      setErro(r?.status === 403 ? 'Seu usuário não tem acesso à conferência.' : (r?.data?.error ?? r?.data?.detail ?? 'Não foi possível carregar a lista.'));
    } finally { setCarregando(false); }
  }, [estado, todasFases]);
  useEffect(() => { carregar(); }, [carregar]);
  // acompanha a rodada da IA e recarrega a lista quando ELA termina. ⚠ 22/09 (#594, @R): rodada de 1 item
  // leva 3 s e o processo só grava "começou" depois do 1º GET — a tela lia a rodada ANTERIOR (já parada),
  // parava de olhar e nunca recarregava. Por isso, após o clique, espera a rodada NOVA aparecer (início
  // diferente do que havia antes do clique), olha a cada 2 s e recarrega quando ela terminar (teto 90 s).
  const esperandoRef = useRef<{ inicioAntes: string | null | undefined; ate: number } | null>(null);
  useEffect(() => {
    let vivo = true; let timer: ReturnType<typeof setTimeout> | undefined; let estavaRodando = false;
    const olhar = async () => {
      try {
        const { data } = await progressoRevisaoIa();
        if (!vivo) return;
        setIa(data);
        const esp = esperandoRef.current;
        const nova = !!esp && (data.progresso?.inicio ?? null) !== esp.inicioAntes;
        if ((estavaRodando || nova) && !data.emCurso) { esperandoRef.current = null; carregar(); }
        estavaRodando = data.emCurso;
        const aguardandoInicio = !!esperandoRef.current && !nova && Date.now() < (esperandoRef.current?.ate ?? 0);
        if (data.emCurso || aguardandoInicio) timer = setTimeout(olhar, 2000);
        else if (esperandoRef.current && !nova) esperandoRef.current = null;
      } catch { /* sem progresso: o botão continua disponível */ }
    };
    olhar();
    return () => { vivo = false; if (timer) clearTimeout(timer); };
  }, [iniciando, carregar]);
  const revisarComIa = async (alvo: EstadoConferencia | 'todos') => {
    setIniciando(true); setErro(null);
    esperandoRef.current = { inicioAntes: ia?.progresso?.inicio ?? null, ate: Date.now() + 90_000 };
    try { await iniciarRevisaoIa(alvo); } catch (e: unknown) {
      esperandoRef.current = null;
      const r = (e as { response?: { data?: { error?: string } } }).response;
      setErro(r?.data?.error ?? 'Não foi possível iniciar a revisão da IA.');
    } finally { setIniciando(false); }
  };

  const decidir = async (it: ItemConferencia, acao: 'VALIDAR' | 'DESCARTAR' | 'DESFAZER', mot?: string) => {
    setEmAcao(it.id); setErro(null);
    try {
      await decidirConferencia(it.id, acao, mot);
      setDescartando(null); setMotivo('');
      setFeito({ it, acao });
      await carregar();
    } catch (e: unknown) {
      const r = (e as { response?: { data?: { error?: string } } }).response;
      setErro(r?.data?.error ?? 'Não foi possível gravar a decisão.');
    } finally { setEmAcao(null); }
  };

  const c = dados?.contagem;
  return (
    <div className="p-3">
      <h1 className="mt-0 mb-1">Conferência de orçamentos</h1>
      <p className="mt-0 text-600" style={{ maxWidth: '60rem' }}>
        O leitor acha orçamentos dentro das peças do processo. <strong>O médico só vê os validados.</strong>{' '}
        Os que o leitor tem dúvida ficam em <em>A revisar</em>, escondidos do médico até alguém validar.
        Referências do SUS (nota técnica, NatJus, SIGTAP) já saem descartadas. Toda decisão pode ser desfeita.{' '}
        Uma IA também olha a folha de cada um: quando a leitura da imagem e a do texto concordam que a folha
        não é orçamento (é petição, decisão…), ele sai sozinho de <em>A revisar</em>. Sua decisão sempre vence.
      </p>

      <div className="flex flex-wrap align-items-center gap-3 mb-3">
        <SelectButton value={estado} options={ESTADOS.map((o) => ({
          ...o, label: c && o.value !== 'todos' ? `${o.label} (${c[o.value]})` : o.label,
        }))} onChange={(e) => e.value && setEstado(e.value)} />
        <span className="flex align-items-center gap-2">
          <Checkbox inputId="conf-todas" checked={todasFases} onChange={(e) => setTodasFases(!!e.checked)} />
          <label htmlFor="conf-todas">Incluir pedidos encerrados (padrão: só fases 1 a 4b, onde o médico ainda recebe link)</label>
        </span>
        <Button icon="pi pi-refresh" text size="small" label="Atualizar" onClick={carregar} />
      </div>

      <div className="flex flex-wrap align-items-center gap-2 mb-3 p-2" style={{ background: '#f4f7fb', border: '1px solid #dbe4f0', borderRadius: 8 }}>
        <i className="pi pi-eye" style={{ color: '#1d4ed8' }} />
        <strong>Revisar com IA</strong>
        <span className="text-600" style={{ fontSize: '.85rem' }}>a IA olha a folha de cada orçamento ainda sem parecer (só os que ninguém decidiu):</span>
        <Button size="small" label="A revisar" loading={iniciando} disabled={!!ia?.emCurso} onClick={() => revisarComIa('REVISAR')} />
        <Button size="small" outlined label="Descartados" disabled={!!ia?.emCurso || iniciando} onClick={() => revisarComIa('DESCARTADO')} />
        <Button size="small" outlined label="Os dois" disabled={!!ia?.emCurso || iniciando} onClick={() => revisarComIa('todos')} />
        {ia?.progresso && (
          <span style={{ fontSize: '.85rem' }} className={ia.emCurso ? 'text-primary' : 'text-600'}>
            {ia.emCurso
              ? <><i className="pi pi-spin pi-spinner" style={{ fontSize: 12 }} /> IA revisou {ia.progresso.feitos} de {ia.progresso.total}…</>
              : <>Última rodada ({fmt(ia.progresso.fim ?? ia.progresso.inicio)}, por {ia.progresso.por}): {ia.progresso.total} olhados
                  {Object.entries(ia.progresso.resultado || {}).map(([k, n]) => ` · ${n} ${ROTULO[k as EstadoConferencia]?.toLowerCase() ?? k}`).join('')}
                  {ia.progresso.erros ? ` · ${ia.progresso.erros} sem folha legível` : ''}</>}
          </span>
        )}
      </div>

      {feito ? (
        <div role="status" className="mb-3 p-2 flex align-items-center gap-2 flex-wrap"
          style={{ background: feito.acao === 'VALIDAR' ? '#e8f5ec' : feito.acao === 'DESCARTAR' ? '#fdecec' : '#eef2f7',
            border: '1px solid #cfd8e3', borderRadius: 6 }}>
          <i className={feito.acao === 'VALIDAR' ? 'pi pi-check-circle' : feito.acao === 'DESCARTAR' ? 'pi pi-times-circle' : 'pi pi-undo'} />
          <span>
            <strong>#{feito.it.pedido} · {brl(feito.it.valorTotal)}</strong>{' '}
            {feito.acao === 'VALIDAR' ? '— validado: foi para "Validados" e o médico já pode ver este valor.'
              : feito.acao === 'DESCARTAR' ? '— descartado: foi para "Descartados" e não vai ao médico.'
              : '— desfeito: voltou para a decisão da máquina.'}
          </span>
          {feito.acao !== 'DESFAZER' ? <Button size="small" text label="Desfazer" icon="pi pi-undo" disabled={emAcao === feito.it.id}
            onClick={() => decidir(feito.it, 'DESFAZER')} /> : null}
          <Button size="small" text icon="pi pi-times" aria-label="Fechar aviso" onClick={() => setFeito(null)} />
        </div>
      ) : null}
      {erro ? <div role="alert" className="mb-3 p-2" style={{ background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 6 }}>{erro}</div> : null}

      {/* @R 22/09: "um numerador para ver mais itens sem passar de página: 200 100 50 20" */}
      <DataTable value={dados?.itens ?? []} loading={carregando} size="small" stripedRows paginator rows={50}
        rowsPerPageOptions={[20, 50, 100, 200]} paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
        currentPageReportTemplate="{first}–{last} de {totalRecords}" dataKey="id" {...ordenacao}
        emptyMessage={erro ? 'Lista não carregada.' : (estado === 'REVISAR' ? 'Nada a revisar.' : 'Nenhum orçamento neste filtro.')}>
        <Column field="pedido" header="Pedido" sortable style={{ width: '7rem', whiteSpace: 'nowrap' }} body={(r: ItemConferencia) => (
          <Button label={`#${r.pedido}`} link size="small" onClick={() => ficha.abrir(r.pedido)} />)} />
        <Column field="paciente" header="Paciente" sortable />
        <Column field="fase" header="Fase" sortable style={{ width: '11rem' }} />
        <Column field="prestador" header="Prestador" sortable body={(r: ItemConferencia) => r.prestador ?? <em className="text-500">não identificado</em>} />
        <Column field="valorTotal" header="Valor" sortable style={{ width: '9rem', textAlign: 'right' }} body={(r: ItemConferencia) => brl(r.valorTotal)} />
        <Column header="Procedimento" body={(r: ItemConferencia) => (
          <span title={r.observacao ?? ''} style={{ fontSize: '.85rem' }}>{r.procedimento ?? '—'}</span>)} />
        <Column header="O que a IA diz que é" style={{ width: '13rem' }} body={(r: ItemConferencia) => <ParecerIa ia={r.ia} />} />
        <Column field="estado" header="Situação" sortable style={{ width: '16rem' }} body={(r: ItemConferencia) => (
          <div>
            <Tag value={ROTULO[r.estado]} severity={COR[r.estado]} />
            <div style={{ fontSize: '.8rem' }} className="text-600 mt-1">
              {r.decididoPorPessoa
                ? <>por {r.conferenciaPor} {fmt(r.conferenciaEm)}{r.conferenciaMotivo ? ` — ${r.conferenciaMotivo}` : ''}</>
                : r.frase}
            </div>
          </div>)} />
        <Column header="Documento" style={{ width: '8rem' }} body={(r: ItemConferencia) => (r.linkAbrir
          ? <a href={r.linkAbrir} target="_blank" rel="noreferrer" title={r.origemAbrir === 'PECA' && r.pagina ? `Abre o processo inteiro — o orçamento está na página ${r.pagina}` : 'Abrir o documento'}>
              <i className="pi pi-file-pdf" /> {ORIGEM[r.origemAbrir ?? ''] ?? 'abrir'}{r.pagina ? ` · p. ${r.pagina}` : ''}
            </a>
          : <span className="text-500">sem arquivo</span>)} />
        <Column header="Decidir" style={{ width: '15rem' }} body={(r: ItemConferencia) => (
          <div className="flex gap-1 flex-wrap">
            {r.estado !== 'VALIDADO' ? <Button label="Validar" icon="pi pi-check" size="small" severity="success" outlined={r.ia?.sugestao !== 'VALIDAR'}
              loading={emAcao === r.id} onClick={() => decidir(r, 'VALIDAR')} /> : null}
            {r.estado !== 'DESCARTADO' ? <Button label="Descartar" icon="pi pi-times" size="small" severity="danger" outlined={r.ia?.sugestao !== 'DESCARTAR'}
              disabled={emAcao === r.id} onClick={() => { setDescartando(r);
                setMotivo(r.ia?.sugestao === 'DESCARTAR' ? `IA: ${r.ia.rotulo}${r.ia.motivo ? ` — ${r.ia.motivo}` : ''}`.slice(0, 300) : ''); }} /> : null}
            {r.decididoPorPessoa ? <Button label="Desfazer" icon="pi pi-undo" size="small" text
              disabled={emAcao === r.id} onClick={() => decidir(r, 'DESFAZER')} title="Volta para a decisão do leitor" /> : null}
          </div>)} />
      </DataTable>

      <Dialog header="Descartar orçamento" visible={!!descartando} style={{ width: '32rem' }} onHide={() => setDescartando(null)}
        footer={<>
          <Button label="Cancelar" text onClick={() => setDescartando(null)} />
          <Button label="Descartar" severity="danger" disabled={motivo.trim().length < 5} loading={emAcao === descartando?.id}
            onClick={() => descartando && decidir(descartando, 'DESCARTAR', motivo.trim())} />
        </>}>
        {descartando ? <p className="mt-0">#{descartando.pedido} · {descartando.prestador ?? 'prestador não identificado'} · {brl(descartando.valorTotal)}</p> : null}
        {descartando?.ia?.sugestao === 'DESCARTAR' ? (
          <div className="mb-2 p-2" style={{ background: '#fff7e6', borderRadius: 6, fontSize: '.85rem' }}>
            A IA viu: <strong>{descartando.ia.rotulo}</strong>{descartando.ia.motivo ? ` — ${descartando.ia.motivo}` : ''} (já preenchido abaixo; ajuste se quiser)
          </div>
        ) : null}
        {/* @R 22/09 12:00: "ao clicar em descartar já dar a justificativa... para ficar documentada" */}
        <div className="flex flex-wrap gap-1 mb-2">
          {MOTIVOS_PRONTOS.map((m) => (
            <Button key={m} label={m} size="small" outlined={motivo !== m} severity="secondary" style={{ fontSize: '.8rem', padding: '.25rem .5rem' }}
              onClick={() => setMotivo(m)} />
          ))}
        </div>
        <label htmlFor="conf-motivo" className="block mb-1">Por que não é orçamento? (escolha acima ou escreva)</label>
        <InputTextarea id="conf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="w-full" autoFocus maxLength={300} />
        <small className="text-600">O motivo ensina a próxima regra do leitor. Mínimo de 5 caracteres.</small>
      </Dialog>
    </div>
  );
}
