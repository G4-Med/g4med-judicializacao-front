import { useCallback, useEffect, useState } from 'react';
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
import type { EstadoConferencia, ItemConferencia, ListaConferencia } from '../../services/api/conferenciaOrcamentos';
import { decidirConferencia, listarConferencia } from '../../services/api/conferenciaOrcamentos';

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

export function ConferenciaOrcamentosPage() {
  const [estado, setEstado] = useState<EstadoConferencia | 'todos'>('REVISAR');
  const [todasFases, setTodasFases] = useState(false);
  const [dados, setDados] = useState<ListaConferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emAcao, setEmAcao] = useState<number | null>(null);
  const [descartando, setDescartando] = useState<ItemConferencia | null>(null);
  const [motivo, setMotivo] = useState('');
  const ordenacao = useOrdenacao('pedido', -1);
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

  const decidir = async (it: ItemConferencia, acao: 'VALIDAR' | 'DESCARTAR' | 'DESFAZER', mot?: string) => {
    setEmAcao(it.id); setErro(null);
    try {
      await decidirConferencia(it.id, acao, mot);
      setDescartando(null); setMotivo('');
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
        Referências do SUS (nota técnica, NatJus, SIGTAP) já saem descartadas. Toda decisão pode ser desfeita.
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

      {erro ? <div role="alert" className="mb-3 p-2" style={{ background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 6 }}>{erro}</div> : null}

      <DataTable value={dados?.itens ?? []} loading={carregando} size="small" stripedRows paginator rows={25} dataKey="id" {...ordenacao}
        emptyMessage={erro ? 'Lista não carregada.' : (estado === 'REVISAR' ? 'Nada a revisar.' : 'Nenhum orçamento neste filtro.')}>
        <Column field="pedido" header="Pedido" sortable style={{ width: '6rem' }} body={(r: ItemConferencia) => (
          <Button label={`#${r.pedido}`} link size="small" onClick={() => ficha.abrir(r.pedido)} />)} />
        <Column field="paciente" header="Paciente" sortable />
        <Column field="fase" header="Fase" sortable style={{ width: '11rem' }} />
        <Column field="prestador" header="Prestador" sortable body={(r: ItemConferencia) => r.prestador ?? <em className="text-500">não identificado</em>} />
        <Column field="valorTotal" header="Valor" sortable style={{ width: '9rem', textAlign: 'right' }} body={(r: ItemConferencia) => brl(r.valorTotal)} />
        <Column header="O que é" body={(r: ItemConferencia) => (
          <span title={r.observacao ?? ''} style={{ fontSize: '.85rem' }}>{r.procedimento ?? '—'}</span>)} />
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
            {r.estado !== 'VALIDADO' ? <Button label="Validar" icon="pi pi-check" size="small" severity="success" outlined
              loading={emAcao === r.id} onClick={() => decidir(r, 'VALIDAR')} /> : null}
            {r.estado !== 'DESCARTADO' ? <Button label="Descartar" icon="pi pi-times" size="small" severity="danger" outlined
              disabled={emAcao === r.id} onClick={() => { setDescartando(r); setMotivo(''); }} /> : null}
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
        <label htmlFor="conf-motivo" className="block mb-1">Por que não é orçamento? (ex.: "petição citando valor", "nota técnica do SUS")</label>
        <InputTextarea id="conf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="w-full" autoFocus maxLength={300} />
        <small className="text-600">O motivo ensina a próxima regra do leitor. Mínimo de 5 caracteres.</small>
      </Dialog>
    </div>
  );
}
