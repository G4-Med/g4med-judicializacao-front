/**
 * Quadro de tarefas (@R 23/09 15:13/15:14): o resumo por IA de uma conversa do chat — o que foi falado,
 * em que ponto cada um está e as TAREFAS que saíram dela. O mesmo componente mostra o quadro recém-criado
 * (modal do chat) e os quadros salvos (menu → Quadro de tarefas), para os dois lugares nunca divergirem.
 */
import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { resumirConversa, type ConteudoQuadro, type PeriodoResumo } from '../../services/api/mensagens';
import './QuadroTarefas.css';

export const PERIODOS_RESUMO: { label: string; value: PeriodoResumo }[] = [
  { label: 'Último dia', value: 'dia' }, { label: 'Última semana', value: 'semana' }, { label: 'Último mês', value: 'mes' },
];
const ROTULO_PERIODO: Record<string, string> = { dia: 'último dia', semana: 'última semana', mes: 'último mês' };
const COR_SITUACAO: Record<string, string> = { resolvido: 'qt-sit--ok', pendente: 'qt-sit--pend', 'aguardando resposta': 'qt-sit--esp' };

/** Texto pronto para colar (WhatsApp, e-mail): só as tarefas, numeradas, com responsável e prazo. */
export function textoTarefas(c: ConteudoQuadro, titulo?: string) {
  const ts = c.tarefas ?? [];
  const linhas = ts.map((t, i) => `${i + 1}. ${t.tarefa} — ${t.responsavel}`
    + (t.prazo && t.prazo !== 'sem prazo' ? ` (prazo: ${t.prazo})` : '')
    + (t.pedidos?.length ? ` [pedido ${t.pedidos.map((p) => `#${p}`).join(', ')}]` : ''));
  return [titulo ?? `Tarefas — conversa com ${c.com ?? ''} (${ROTULO_PERIODO[c.periodo] ?? c.periodo})`, ...linhas].join('\n');
}

export async function copiarTexto(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

export function QuadroTarefasView({ c, abrirPedido }: { c: ConteudoQuadro; abrirPedido?: (id: number) => void }) {
  const [copiado, setCopiado] = useState(false);
  if (c.vazio) return <p className="qt-vazio">Nenhuma mensagem nesta conversa no {ROTULO_PERIODO[c.periodo]}.</p>;
  const pedidoLinks = (ps: number[]) => ps?.length ? (
    <span className="qt-pedidos">{ps.map((p) => abrirPedido
      ? <button key={p} type="button" className="qt-pedido" onClick={() => abrirPedido(p)}>#{p}</button>
      : <span key={p} className="qt-pedido">#{p}</span>)}</span>) : null;
  return (
    <div className="qt">
      <p className="qt-meta">
        Conversa com <strong>{c.com}</strong> · {ROTULO_PERIODO[c.periodo] ?? c.periodo}
        {c.foco ? <> · foco: <em>{c.foco}</em></> : null}
        {' '}· {c.analisadas} de {c.total} mensagens lidas
        {c.cortadas ? <strong className="qt-alerta"> (as {c.cortadas} mais antigas ficaram de fora)</strong> : null}
      </p>
      <section className="qt-bloco qt-resumo"><h4><i className="pi pi-align-left" /> Resumo</h4><p>{c.resumo}</p></section>

      {!!c.emQuePonto?.length && (
        <section className="qt-bloco"><h4><i className="pi pi-users" /> Em que ponto cada um está</h4>
          <div className="qt-pessoas">{c.emQuePonto.map((p) => (
            <div key={p.nome} className="qt-pessoa"><strong>{p.nome}</strong><span>{p.situacao}</span></div>))}
          </div>
        </section>
      )}

      <section className="qt-bloco">
        <div className="qt-bloco-topo">
          <h4><i className="pi pi-check-square" /> Tarefas ({c.tarefas?.length ?? 0})</h4>
          {!!c.tarefas?.length && (
            <Button label={copiado ? 'Copiado!' : 'Copiar tarefas'} icon={copiado ? 'pi pi-check' : 'pi pi-copy'} size="small"
              outlined onClick={async () => { if (await copiarTexto(textoTarefas(c))) { setCopiado(true); setTimeout(() => setCopiado(false), 1800); } }} />
          )}
        </div>
        {!c.tarefas?.length ? <p className="qt-vazio">Nenhuma tarefa saiu desta conversa.</p> : (
          <ol className="qt-tarefas">{c.tarefas.map((t, i) => (
            <li key={i}><span className="qt-tarefa">{t.tarefa}</span>
              <span className="qt-tarefa-meta"><i className="pi pi-user" /> {t.responsavel}
                {t.prazo && t.prazo !== 'sem prazo' && <> · <i className="pi pi-calendar" /> {t.prazo}</>}
                {pedidoLinks(t.pedidos)}</span></li>))}
          </ol>)}
      </section>

      {!!c.pontos?.length && (
        <section className="qt-bloco"><h4><i className="pi pi-list" /> Pontos levantados</h4>
          <ul className="qt-pontos">{c.pontos.map((p, i) => (
            <li key={i}>
              <div className="qt-ponto-topo"><span className={`qt-sit ${COR_SITUACAO[p.situacao] ?? ''}`}>{p.situacao}</span>
                <strong>{p.assunto}</strong>{pedidoLinks(p.pedidos)}</div>
              <div className="qt-ponto-meta">levantado por {p.levantadoPor}
                {p.situacao !== 'resolvido' && <> · com <strong>{p.comQuem}</strong>: {p.proximoPasso}</>}</div>
            </li>))}
          </ul>
        </section>
      )}
      <p className="qt-rodape"><i className="pi pi-sparkles" /> Feito por IA a partir das mensagens — confira antes de agir.</p>
    </div>
  );
}

/** Botão de IA do chat: pergunta o período e o que a pessoa precisa, gera o quadro e o mostra. */
export function DialogResumirConversa({ uid, nome, visible, onHide, abrirPedido }: {
  uid: number; nome: string; visible: boolean; onHide: () => void; abrirPedido?: (id: number) => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoResumo>('semana');
  const [foco, setFoco] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<ConteudoQuadro | null>(null);
  const fechar = () => { setRes(null); setErro(null); onHide(); };
  const gerar = async () => {
    setGerando(true); setErro(null);
    try { const { data } = await resumirConversa(uid, periodo, foco.trim()); setRes(data); }
    catch (e: any) { setErro(e?.response?.data?.error ?? 'Não consegui resumir agora. Tente de novo.'); }
    finally { setGerando(false); }
  };
  return (
    <Dialog header={res ? `Quadro de tarefas — ${nome}` : `Resumir conversa com ${nome}`} visible={visible} onHide={fechar}
      style={{ width: res ? '44rem' : '30rem', maxWidth: '96vw' }} modal className="qt-dialog">
      {!res ? (
        <div className="qt-form">
          <label>De quando?</label>
          <SelectButton value={periodo} options={PERIODOS_RESUMO} onChange={(e) => e.value && setPeriodo(e.value)} allowEmpty={false} />
          <label htmlFor="qt-foco">O que você precisa? <span className="qt-opcional">(opcional)</span></label>
          <InputText id="qt-foco" value={foco} onChange={(e) => setFoco(e.target.value)} maxLength={300}
            placeholder="ex.: o que ficou pendente comigo · tarefas da Carol sobre anexos" />
          <p className="qt-ajuda">A IA lê as mensagens do período, resume, diz em que ponto cada um está e monta as tarefas.
            O quadro fica salvo em <strong>Quadro de tarefas</strong>, no menu.</p>
          {erro && <p className="qt-erro" role="alert">{erro}</p>}
          <div className="qt-botoes">
            <Button label="Cancelar" text onClick={fechar} />
            <Button label={gerando ? 'Lendo a conversa…' : 'Resumir com IA'} icon="pi pi-sparkles" loading={gerando} onClick={gerar} />
          </div>
        </div>
      ) : (
        <>
          <QuadroTarefasView c={res} abrirPedido={abrirPedido} />
          <div className="qt-botoes"><Button label="Novo resumo" text icon="pi pi-refresh" onClick={() => setRes(null)} />
            <Button label="Fechar" onClick={fechar} /></div>
        </>
      )}
    </Dialog>
  );
}
