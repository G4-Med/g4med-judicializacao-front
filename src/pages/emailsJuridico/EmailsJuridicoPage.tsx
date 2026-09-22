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
import { CLASSE_LABEL, baixarAnexoEmailJuridico, conteudoEmailJuridico, corrigirTextoEmail, listarEmailsJuridico, responderEmailJuridico, tratarEmailJuridico } from '../../services/api/emailsJuridico';
import { salvarBlob } from '../../services/api/orders';

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
/** Idade da mensagem em DIAS DE CALENDÁRIO até hoje, no fuso de Brasília (@R 21/09 15:29: "quantos
 *  dias até a data de hoje para saber a idade de cada mensagem... o que é recente e o que não é").
 *  Dia de calendário, ¬24 h corridas: um e-mail das 23h de ontem tem "1 dia", não "0". Cor pela
 *  idade: até 2 dias verde (recente), até 7 âmbar, mais que isso cinza — a cor mede o tempo, não
 *  a urgência (prazo vencido já tem a linha vermelha própria). */
const DIA_BRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
function diasAteHoje(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.parse(DIA_BRT.format(d));
  const b = Date.parse(DIA_BRT.format(new Date()));
  return Math.round((b - a) / 86_400_000);
}
function Idade({ iso }: { iso: string | null }) {
  const n = diasAteHoje(iso);
  if (n == null) return <span className="text-500">—</span>;
  const texto = n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `${n} dias`;
  const cor = n <= 2 ? '#15803d' : n <= 7 ? '#b45309' : '#64748b';
  return <span style={{ color: cor, fontWeight: n <= 7 ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}
    title={n > 1 ? `chegou há ${n} dias` : texto}>{texto}</span>;
}

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
  // @R 21/09 16:15: "o aviso para Valéria é para questão Justiça, para ela saber se tem avisos novos da
  // Justiça" — o aviso nas fases conta SÓ a classe Justiça. O resto continua na fila, sem gritar.
  const c = useEmailsJuridicoContagem();
  const navigate = useNavigate();
  if (!c || !(c.novosJustica || c.vencidosJustica)) return null;
  return (
    <div className="mc-aviso-emails mc-aviso-emails--alerta" role="alert"
      style={{ margin: '0 0 .75rem', padding: '.5rem .75rem', borderRadius: 6, background: '#fde8e8', border: '1px solid #f5b5b5', display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <i className="pi pi-bell" />
      <span>
        {c.novosJustica ? <><strong>{c.novosJustica} aviso(s) NOVO(S) da Justiça</strong> desde 01/09, ainda não tratado(s)</> : null}
        {c.novosJustica && c.vencidosJustica ? ' — ' : null}
        {c.vencidosJustica ? <strong>{c.vencidosJustica} da Justiça com prazo vencido</strong> : null}.
      </span>
      <Button label="Ver os da Justiça" size="small" text onClick={() => navigate('/emails-juridico?classe=JUSTICA')} />
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
  // Checkbox por linha + ações em lote (@R 21/09 23:39: "marcar todos ou deselecionar... darmos
  // tratados em todos e um voltar para tratar"). O lote reusa a MESMA rota por-item que o botão
  // "Tratado"/↩ de cada linha já usa — sem endpoint novo, sem 2ª fonte de verdade de status.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);
  // ?classe=JUSTICA vem do alerta da Home/fases: abre já filtrado no que o alerta contou.
  const [classeFiltro, setClasseFiltro] = useState<ClasseEmailJuridico | null>(() => {
    const q = new URLSearchParams(window.location.search).get('classe');
    return q && q in CLASSE_LABEL ? (q as ClasseEmailJuridico) : null;
  });
  const [aberto, setAberto] = useState<EmailJuridicoItem | null>(null);
  const ordenacao = useOrdenacao('chegouEm', -1);   // @R: mais recente primeiro, sempre
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

  const alternarSelecao = (id: number) => setSelecionados((s) => {
    const novo = new Set(s);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const marcarTodosVisiveis = () => setSelecionados(new Set(visiveis.map((i) => i.id)));
  const limparSelecao = () => setSelecionados(new Set());
  const todosVisiveisSelecionados = visiveis.length > 0 && visiveis.every((i) => selecionados.has(i.id));

  // 1 requisição por item (a rota é por-item — não existe endpoint de lote no servidor), em
  // paralelo com allSettled: 1 falha não trava as outras, e o operador vê quantas deram certo.
  const aplicarEmLote = async (body: Parameters<typeof tratarEmailJuridico>[1]) => {
    const ids = Array.from(selecionados);
    if (!ids.length) return;
    setAplicandoLote(true);
    try {
      const resultados = await Promise.allSettled(ids.map((id) => tratarEmailJuridico(id, body)));
      const atualizados = new Map<number, EmailJuridicoItem>();
      let falhas = 0;
      resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') atualizados.set(ids[i], r.value.data);
        else falhas += 1;
      });
      setItens((xs) => xs.map((x) => atualizados.get(x.id) ?? x));
      carregarContagem(true);
      if (falhas) alert(`${atualizados.size} de ${ids.length} aplicado(s). ${falhas} falharam — tente de novo nesses.`);
      limparSelecao();
    } finally { setAplicandoLote(false); }
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
          <Tag value={`${contagem.novosSemRuido} NOVO(S) desde 01/09`} severity={contagem.novosSemRuido ? 'danger' : 'secondary'} icon="pi pi-bell"
            title="Corte definido pelo @R em 21/09: chegou a partir de 01/09/2026 e ainda não foi tratado. O que chegou antes foi marcado como visto." />
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

      {selecionados.size > 0 && (
        <div className="flex gap-2 flex-wrap align-items-center mb-2 p-2"
          style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6 }}>
          <strong>{selecionados.size} selecionado(s)</strong>
          <Button label="Marcar tratados" icon="pi pi-check" size="small" severity="success" outlined
            loading={aplicandoLote} onClick={() => aplicarEmLote({ tratado: true })} />
          <Button label="Voltar (reabrir)" icon="pi pi-undo" size="small" outlined
            loading={aplicandoLote} onClick={() => aplicarEmLote({ tratado: false })} />
          <Button label="Limpar seleção" size="small" text onClick={limparSelecao} disabled={aplicandoLote} />
        </div>
      )}

      <DataTable value={visiveis} loading={carregando} size="small" stripedRows paginator rows={25} dataKey="id" {...ordenacao}
        emptyMessage={status === 'ABERTO' ? 'Nada aberto — a fila está zerada.' : 'Nenhum e-mail neste filtro.'}
        rowClassName={(r: EmailJuridicoItem) => (r.vencido ? 'mc-linha-vencida' : '')}>
        <Column header={
          <input type="checkbox" checked={todosVisiveisSelecionados} aria-label="Marcar todos os visíveis"
            title={todosVisiveisSelecionados ? 'Desmarcar todos' : 'Marcar todos os visíveis'}
            onChange={() => (todosVisiveisSelecionados ? limparSelecao() : marcarTodosVisiveis())} />
        } style={{ width: '2.5rem' }} body={(r: EmailJuridicoItem) => (
          <input type="checkbox" checked={selecionados.has(r.id)} aria-label={`Selecionar e-mail ${r.id}`}
            onChange={() => alternarSelecao(r.id)} />
        )} />
        <Column field="chegouEm" header="Chegou" sortable style={{ width: '10rem' }} body={(r: EmailJuridicoItem) => (
          <span>{r.novo && <Tag value="NOVO" severity="danger" className="mr-1" />}{fmt(r.dataEmail || r.chegouEm)}</span>
        )} />
        <Column field="chegouEm" header="Idade" sortable style={{ width: '7rem' }}
          headerTooltip="Dias desde a chegada até hoje (horário de Brasília)"
          body={(r: EmailJuridicoItem) => <Idade iso={r.dataEmail || r.chegouEm} />} />
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
  const [baixando, setBaixando] = useState<number | null>(null);
  /* RESPONDER (@R 21/09): "a pessoa tem que ter como abrir e ver o e-mail e ter como responder e baixar
     anexos e adicionar anexos, e ter uma área para IA corrigir o texto digitado". O envio é um clique da
     pessoa, com confirmação — nunca sai sozinho. */
  const [respAberta, setRespAberta] = useState(false);
  const [para, setPara] = useState('');
  const [assunto, setAssunto] = useState(`Re: ${item.assunto ?? ''}`);
  const [texto, setTexto] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [corrigindo, setCorrigindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setCorpo(null); setErro(null);
    conteudoEmailJuridico(item.id).then(({ data }) => { setCorpo(data.corpo); setAnexos(data.anexos); })
      .catch((e) => setErro(e?.response?.data?.detail || 'Não consegui ler o e-mail.'));
  }, [item.id]);

  const baixar = async (n: number, nome: string) => {
    setBaixando(n);
    try { const { data } = await baixarAnexoEmailJuridico(item.id, n); salvarBlob(data, nome); }
    catch { alert('Não consegui baixar este anexo agora.'); }
    finally { setBaixando(null); }
  };
  const corrigir = async () => {
    if (texto.trim().length < 5) return;
    setCorrigindo(true); setMsg(null);
    try { const { data } = await corrigirTextoEmail(texto); setTexto(data.texto); setMsg('Texto revisado pela IA — confira antes de enviar.'); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'A IA não respondeu; texto mantido.'); }
    finally { setCorrigindo(false); }
  };
  const enviar = async () => {
    const dest = para.trim() || (item.remetente?.match(/<([^>]+)>/)?.[1] ?? item.remetente ?? '');
    if (!window.confirm(`Enviar esta resposta para ${dest}${arquivos.length ? ` com ${arquivos.length} anexo(s)` : ''}?`)) return;
    setEnviando(true); setMsg(null);
    try {
      const { data } = await responderEmailJuridico(item.id, { para: para.trim() || undefined, assunto, corpo: texto, anexos: arquivos });
      setMsg(`Enviado para ${data.para}${data.anexos ? ` com ${data.anexos} anexo(s)` : ''}.`);
      setRespAberta(false); setTexto(''); setArquivos([]);
      onObservacao(data.observacao);
    } catch (e: any) { setMsg(e?.response?.data?.error || 'Não consegui enviar.'); }
    finally { setEnviando(false); }
  };

  return (
    <div>
      <p className="mt-0 mb-1"><strong>De:</strong> {item.remetente} · <strong>Em:</strong> {fmt(item.dataEmail || item.chegouEm)}
        {item.cnj ? <> · <strong>CNJ:</strong> {item.cnj}</> : null} · <strong>Prazo:</strong> {fmtDia(item.prazo)}</p>
      {anexos.length > 0 && (
        <p className="mt-0 mb-2 text-sm"><i className="pi pi-paperclip" /> Anexos:{' '}
          {anexos.map((a, i) => (
            <Button key={i} label={a} icon="pi pi-download" size="small" link loading={baixando === i + 1} onClick={() => baixar(i + 1, a)} />
          ))}
        </p>
      )}
      {erro && <p className="text-red-600">{erro}</p>}
      {corpo == null && !erro && <p><i className="pi pi-spin pi-spinner" /> lendo…</p>}
      {corpo != null && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#f8f9fa', padding: '.75rem', borderRadius: 6, maxHeight: '40vh', overflow: 'auto' }}>{corpo}</pre>}

      <div className="mt-3 flex gap-2 align-items-center">
        <Button label={respAberta ? 'Fechar resposta' : 'Responder'} icon="pi pi-reply" size="small" onClick={() => setRespAberta((v) => !v)} />
        {msg && <small>{msg}</small>}
      </div>
      {respAberta && (
        <div className="mt-2 p-2" style={{ border: '1px solid #dee2e6', borderRadius: 6 }}>
          <div className="flex gap-2 flex-wrap mb-2">
            <InputText value={para} onChange={(e) => setPara(e.target.value)} placeholder={`Para (padrão: ${item.remetente?.match(/<([^>]+)>/)?.[1] ?? item.remetente ?? ''})`} className="p-inputtext-sm" style={{ flex: 1, minWidth: '18rem' }} />
            <InputText value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto" className="p-inputtext-sm" style={{ flex: 1, minWidth: '18rem' }} />
          </div>
          <InputTextarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} className="w-full" placeholder="Escreva a resposta. O botão 'Corrigir com IA' revisa ortografia e clareza sem mudar o sentido — você confere antes de enviar." />
          <div className="flex gap-2 flex-wrap align-items-center mt-2">
            <Button label="Corrigir texto com IA" icon="pi pi-sparkles" size="small" outlined loading={corrigindo} disabled={texto.trim().length < 5} onClick={corrigir} />
            <label className="p-button p-button-sm p-button-outlined" style={{ cursor: 'pointer' }}>
              <i className="pi pi-paperclip mr-1" /> Adicionar anexos
              <input type="file" multiple style={{ display: 'none' }} onChange={(e) => setArquivos((xs) => [...xs, ...Array.from(e.target.files ?? [])])} />
            </label>
            {arquivos.map((f, i) => (
              <Tag key={i} value={f.name} severity="secondary" icon="pi pi-times" style={{ cursor: 'pointer' }} onClick={() => setArquivos((xs) => xs.filter((_, k) => k !== i))} />
            ))}
            <span style={{ flex: 1 }} />
            <Button label="Enviar resposta" icon="pi pi-send" size="small" severity="success" loading={enviando} disabled={texto.trim().length < 10 || assunto.trim().length < 3} onClick={enviar} />
          </div>
        </div>
      )}

      <label className="block mt-3 mb-1 text-sm">Anotação interna (o que foi feito / a quem foi passado)</label>
      <InputTextarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="w-full" />
      <div className="mt-2"><Button label="Salvar anotação" size="small" onClick={() => onObservacao(obs)} /></div>
    </div>
  );
}
