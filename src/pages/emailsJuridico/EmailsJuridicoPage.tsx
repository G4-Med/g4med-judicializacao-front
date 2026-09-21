import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tag } from 'primereact/tag';
import { useNavigate } from 'react-router-dom';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import { useOrdenacao } from '../../components/Tabela/useOrdenacao';
import type { ClasseEmailJuridico, ContagemEmailsJuridico, EmailJuridicoItem } from '../../services/api/emailsJuridico';
import { CLASSE_LABEL, conteudoEmailJuridico, listarEmailsJuridico, tratarEmailJuridico } from '../../services/api/emailsJuridico';

/* ── contagem compartilhada (menu · home · fases) ─────────────────────────────────────────
   Uma chamada a cada 2 min, 1 cache para todo mundo — mesmo desenho do contador da 1.1. */
const VALIDADE_MS = 2 * 60 * 1000;
let contagemCache: ContagemEmailsJuridico | null = null;
let contagemEm = 0;
let contagemEmVoo: Promise<void> | null = null;
const ouvintes = new Set<() => void>();
async function carregarContagem(forcar = false) {
  if (!forcar && contagemCache && Date.now() - contagemEm < VALIDADE_MS) return;
  if (contagemEmVoo) return contagemEmVoo;
  contagemEmVoo = listarEmailsJuridico({ status: 'ABERTO' })
    .then(({ data }) => { contagemCache = data.contagem; contagemEm = Date.now(); })
    .catch(() => { /* sem rede: mantém o último número; 0 nunca é inventado */ })
    .finally(() => { contagemEmVoo = null; ouvintes.forEach((f) => f()); });
  return contagemEmVoo;
}
/** Quantos e-mails/ofícios estão ABERTOS na fila do jurídico (e quantos vencidos). */
export function useEmailsJuridicoContagem(): ContagemEmailsJuridico | null {
  const [c, setC] = useState(contagemCache);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) setC(contagemCache); };
    carregarContagem().then(atualizar); ouvintes.add(atualizar);
    const t = window.setInterval(() => { carregarContagem(); }, VALIDADE_MS);
    return () => { vivo = false; ouvintes.delete(atualizar); window.clearInterval(t); };
  }, []);
  return c;
}

/** Aviso curto para o topo das fases Análise Jurídica / Pendências (ordem @R: "aviso nas fases"). */
export function AvisoEmailsJuridico() {
  const c = useEmailsJuridicoContagem();
  const navigate = useNavigate();
  if (!c || !c.abertos) return null;
  return (
    <div className={`mc-aviso-emails ${c.vencidos ? 'mc-aviso-emails--vencido' : ''}`} role="status"
      style={{ margin: '0 0 .75rem', padding: '.5rem .75rem', borderRadius: 6, background: c.vencidos ? '#fde8e8' : '#fff4d6', border: '1px solid ' + (c.vencidos ? '#f5b5b5' : '#f2d28a'), display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <i className="pi pi-envelope" />
      <span><strong>{c.abertos}</strong> e-mail(s)/ofício(s) chegaram ao jurídico e ainda não foram tratados
        {c.vencidos ? <> — <strong>{c.vencidos} com prazo vencido</strong></> : null}
        {c.novosHoje ? <> · {c.novosHoje} hoje</> : null}.</span>
      <Button label="Ver a fila" size="small" text onClick={() => navigate('/emails-juridico')} />
    </div>
  );
}

const CLASSES: { label: string; value: ClasseEmailJuridico }[] = (Object.keys(CLASSE_LABEL) as ClasseEmailJuridico[]).map((k) => ({ label: CLASSE_LABEL[k], value: k }));
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDia = (s: string | null) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

export function EmailsJuridicoPage() {
  const [status, setStatus] = useState<'ABERTO' | 'TRATADO' | 'TODOS'>('ABERTO');
  const [itens, setItens] = useState<EmailJuridicoItem[]>([]);
  const [contagem, setContagem] = useState<ContagemEmailsJuridico | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [classeFiltro, setClasseFiltro] = useState<ClasseEmailJuridico | null>(null);
  const [aberto, setAberto] = useState<EmailJuridicoItem | null>(null);
  const ordenacao = useOrdenacao('prazo', 1);
  const ficha = useFichaPedido();

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const { data } = await listarEmailsJuridico({ status });
      setItens(data.itens); setContagem(data.contagem);
      contagemCache = data.contagem; contagemEm = Date.now(); ouvintes.forEach((f) => f());
    } catch (e: any) {
      setErro(e?.response?.data?.detail || e?.response?.data?.error || 'Não consegui carregar a fila agora.');
    } finally { setCarregando(false); }
  }, [status]);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return itens.filter((i) => (!classeFiltro || i.classe === classeFiltro)
      && (!b || `${i.remetente ?? ''} ${i.assunto ?? ''} ${i.cnj ?? ''} ${i.orderId ?? ''}`.toLowerCase().includes(b)));
  }, [itens, busca, classeFiltro]);

  const aplicar = async (id: number, body: Parameters<typeof tratarEmailJuridico>[1]) => {
    try {
      const { data } = await tratarEmailJuridico(id, body);
      setItens((xs) => xs.map((x) => (x.id === id ? data : x)));
      if (aberto?.id === id) setAberto(data);
      carregarContagem(true);
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.response?.data?.detail || 'Não consegui salvar.');
    }
  };

  return (
    <div className="p-3">
      <h1 className="mt-0 mb-1">E-mails e ofícios que chegam ao jurídico</h1>
      <p className="mt-0 mb-3 text-color-secondary">
        Tudo que chega na caixa do jurídico e <strong>não vira pedido</strong> — ofícios da Defensoria, do TJMG, do CNJ,
        respostas soltas da SES, e-mails de hospitais. Antes de 21/09/2026 isso era barrado em silêncio (277 e-mails, sem
        ninguém ver). Aqui é <strong>fila</strong>: dê classe, dono e prazo, leia a íntegra e marque como tratado.
      </p>

      {contagem && (
        <div className="flex gap-3 flex-wrap mb-3">
          <Tag value={`${contagem.abertos} aberto(s)`} severity={contagem.abertos ? 'warning' : 'success'} />
          <Tag value={`${contagem.vencidos} vencido(s)`} severity={contagem.vencidos ? 'danger' : 'secondary'} />
          <Tag value={`${contagem.novosHoje} hoje`} severity="info" />
          {(Object.keys(contagem.porClasse) as ClasseEmailJuridico[]).map((k) => (
            <Tag key={k} value={`${CLASSE_LABEL[k]}: ${contagem.porClasse[k]}`} severity="secondary" />
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap align-items-center mb-2">
        <Dropdown value={status} options={[{ label: 'Abertos', value: 'ABERTO' }, { label: 'Tratados', value: 'TRATADO' }, { label: 'Todos', value: 'TODOS' }]}
          onChange={(e) => setStatus(e.value)} />
        <Dropdown value={classeFiltro} options={CLASSES} placeholder="Todas as classes" showClear onChange={(e) => setClasseFiltro(e.value ?? null)} />
        <InputText value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar remetente, assunto, CNJ, nº do pedido" style={{ minWidth: '22rem' }} />
        <Button icon="pi pi-refresh" text onClick={carregar} loading={carregando} title="Recarregar" />
      </div>
      {erro && <p className="text-red-600">{erro}</p>}

      <DataTable value={visiveis} loading={carregando} size="small" stripedRows paginator rows={25} dataKey="id" {...ordenacao}
        emptyMessage={status === 'ABERTO' ? 'Nada aberto — a fila está zerada.' : 'Nenhum e-mail neste filtro.'}
        rowClassName={(r: EmailJuridicoItem) => (r.vencido ? 'mc-linha-vencida' : '')}>
        <Column field="chegouEm" header="Chegou" sortable body={(r: EmailJuridicoItem) => fmt(r.dataEmail || r.chegouEm)} style={{ width: '9rem' }} />
        <Column field="classe" header="Classe" sortable style={{ width: '10rem' }} body={(r: EmailJuridicoItem) => (
          <Dropdown value={r.classe} options={CLASSES} onChange={(e) => aplicar(r.id, { classe: e.value })} className="p-inputtext-sm" />
        )} />
        <Column field="remetente" header="De" sortable body={(r: EmailJuridicoItem) => <span title={r.motivoBarrado ?? ''}>{r.remetente}</span>} />
        <Column field="assunto" header="Assunto" sortable body={(r: EmailJuridicoItem) => (
          <span>{r.assunto || <em>(sem assunto)</em>}{r.temAnexo ? <i className="pi pi-paperclip ml-2" title={r.anexos.join('\n')} /> : null}</span>
        )} />
        <Column field="cnj" header="Processo / pedido" body={(r: EmailJuridicoItem) => (
          <span>{r.cnj ?? '—'}{r.orderId ? <Button label={`#${r.orderId}`} link size="small" onClick={() => ficha.abrir(r.orderId as number)} /> : null}</span>
        )} style={{ width: '13rem' }} />
        <Column field="prazo" header="Prazo" sortable style={{ width: '9rem' }} body={(r: EmailJuridicoItem) => (
          <input type="date" value={r.prazo ?? ''} onChange={(e) => aplicar(r.id, { prazo: e.target.value || null })}
            className={r.vencido ? 'mc-prazo-vencido' : ''} title={r.diasParaPrazo == null ? 'sem prazo' : `${r.diasParaPrazo} dia(s)`} />
        )} />
        <Column field="dono" header="Dono" sortable style={{ width: '9rem' }} body={(r: EmailJuridicoItem) => (
          <InputText defaultValue={r.dono ?? ''} placeholder="usuário" className="p-inputtext-sm" style={{ width: '8rem' }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.dono ?? '')) aplicar(r.id, { dono: v || null }); }} />
        )} />
        <Column header="Íntegra" style={{ width: '7rem' }} body={(r: EmailJuridicoItem) => (
          <Button label="Ler" icon="pi pi-eye" size="small" text disabled={!r.temIntegra} title={r.temIntegra ? 'Ver o e-mail inteiro' : 'Chegou antes da área e a íntegra não foi recuperada'} onClick={() => setAberto(r)} />
        )} />
        <Column header="Tratado" style={{ width: '10rem' }} body={(r: EmailJuridicoItem) => (r.tratadoEm
          ? <span title={`por ${r.tratadoPor ?? '?'}`}>{fmt(r.tratadoEm)} <Button icon="pi pi-undo" text size="small" title="Reabrir" onClick={() => aplicar(r.id, { tratado: false })} /></span>
          : <Button label="Tratado" icon="pi pi-check" size="small" severity="success" outlined onClick={() => aplicar(r.id, { tratado: true })} />)} />
      </DataTable>

      <Dialog visible={!!aberto} onHide={() => setAberto(null)} style={{ width: 'min(60rem, 95vw)' }} header={aberto?.assunto || 'E-mail'}>
        {aberto && <Integra item={aberto} onObservacao={(t) => aplicar(aberto.id, { observacao: t })} />}
      </Dialog>
    </div>
  );
}

function Integra({ item, onObservacao }: { item: EmailJuridicoItem; onObservacao: (t: string) => void }) {
  const [corpo, setCorpo] = useState<string | null>(null);
  const [anexos, setAnexos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [obs, setObs] = useState(item.observacao ?? '');
  useEffect(() => {
    setCorpo(null); setErro(null);
    conteudoEmailJuridico(item.id).then(({ data }) => { setCorpo(data.corpo); setAnexos(data.anexos); })
      .catch((e) => setErro(e?.response?.data?.detail || 'Não consegui ler o e-mail.'));
  }, [item.id]);
  return (
    <div>
      <p className="mt-0 mb-1"><strong>De:</strong> {item.remetente} · <strong>Em:</strong> {fmt(item.dataEmail || item.chegouEm)}
        {item.cnj ? <> · <strong>CNJ:</strong> {item.cnj}</> : null} · <strong>Prazo:</strong> {fmtDia(item.prazo)}</p>
      {anexos.length > 0 && <p className="mt-0 mb-2 text-sm"><i className="pi pi-paperclip" /> Anexos: {anexos.join(' · ')} <em>(o arquivo fica no .eml; peça ao suporte se precisar abrir)</em></p>}
      {erro && <p className="text-red-600">{erro}</p>}
      {corpo == null && !erro && <p><i className="pi pi-spin pi-spinner" /> lendo…</p>}
      {corpo != null && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#f8f9fa', padding: '.75rem', borderRadius: 6, maxHeight: '50vh', overflow: 'auto' }}>{corpo}</pre>}
      <label className="block mt-3 mb-1 text-sm">Anotação interna (o que foi feito / a quem foi passado)</label>
      <InputTextarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="w-full" />
      <div className="mt-2"><Button label="Salvar anotação" size="small" onClick={() => onObservacao(obs)} /></div>
    </div>
  );
}
