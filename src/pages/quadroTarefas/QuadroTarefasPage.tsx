/**
 * Quadro de tarefas (menu) — @R 23/09 15:14: ⟦"um botão chamado modal de tarefas no menu ... podemos deletar
 * um modal ou ver o modal e copiar as tarefas"⟧. Lista os quadros que a IA gerou a partir do chat (os que eu
 * criei e os que foram criados sobre conversa comigo). Ver, copiar as tarefas, excluir (com confirmação; só
 * quem criou exclui — o servidor garante). Só os 4 do chat enxergam (403 para os demais).
 */
import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { excluirQuadroTarefas, getQuadrosTarefas, type QuadroTarefas } from '../../services/api/mensagens';
import { QuadroTarefasView, copiarTexto, textoTarefas } from '../../components/QuadroTarefas/QuadroTarefas';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import './QuadroTarefasPage.css';

const PER: Record<string, string> = { dia: 'Último dia', semana: 'Última semana', mes: 'Último mês' };
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function QuadroTarefasPage() {
  const [lista, setLista] = useState<QuadroTarefas[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<QuadroTarefas | null>(null);
  const [excluir, setExcluir] = useState<QuadroTarefas | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [copiadoId, setCopiadoId] = useState<number | null>(null);
  const { abrir: abrirPedido } = useFichaPedido();

  const carregar = () => getQuadrosTarefas().then(({ data }) => setLista(data)).catch((e) =>
    setErro(e?.response?.status === 403 ? 'O quadro de tarefas é só para quem usa o chat interno.' : 'Não consegui carregar os quadros.'));
  useEffect(() => { void carregar(); }, []);

  const copiar = async (q: QuadroTarefas) => {
    if (q.conteudo && await copiarTexto(textoTarefas(q.conteudo, `Tarefas — ${q.com} (${quando(q.criadoEm)})`))) {
      setCopiadoId(q.id); setTimeout(() => setCopiadoId(null), 1800);
    }
  };
  const confirmarExclusao = async () => {
    if (!excluir) return;
    setExcluindo(true);
    try { await excluirQuadroTarefas(excluir.id); setExcluir(null); await carregar(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Não foi possível excluir.'); }
    finally { setExcluindo(false); }
  };

  return (
    <div className="qtp">
      <header className="qtp__topo">
        <h1><i className="pi pi-check-square" /> Quadro de tarefas</h1>
        <p>Resumos que a IA fez das conversas do chat, com as tarefas de cada um. Para criar um novo, abra uma conversa
          no chat e clique em <strong>Resumir com IA</strong>.</p>
      </header>
      {erro && <div className="qtp__erro" role="alert">{erro}</div>}
      {lista && lista.length === 0 && <div className="qtp__vazio">Nenhum quadro ainda.</div>}
      <div className="qtp__grade">
        {(lista ?? []).map((q) => (
          <article key={q.id} className="qtp__cartao">
            <div className="qtp__cartao-topo">
              <strong>{q.meu ? `Com ${q.com}` : `${q.criadoPor} com você`}</strong>
              <span className="qtp__quando">{quando(q.criadoEm)}</span>
            </div>
            <div className="qtp__tags"><span>{PER[q.periodo] ?? q.periodo}</span><span>{q.nTarefas} tarefa{q.nTarefas === 1 ? '' : 's'}</span>
              {q.foco && <span title={q.foco}>foco: {q.foco}</span>}</div>
            <p className="qtp__resumo">{q.resumo}</p>
            <div className="qtp__acoes">
              <Button label="Ver" icon="pi pi-eye" size="small" onClick={() => setAberto(q)} />
              <Button label={copiadoId === q.id ? 'Copiado!' : 'Copiar tarefas'} icon={copiadoId === q.id ? 'pi pi-check' : 'pi pi-copy'}
                size="small" outlined disabled={!q.nTarefas} onClick={() => copiar(q)} />
              {q.meu && <Button icon="pi pi-trash" size="small" text severity="danger" aria-label="Excluir"
                title="Excluir este quadro" onClick={() => setExcluir(q)} />}
            </div>
          </article>
        ))}
      </div>

      <Dialog header={aberto ? `Quadro de tarefas — ${aberto.meu ? aberto.com : aberto.criadoPor}` : ''} visible={!!aberto}
        onHide={() => setAberto(null)} style={{ width: '44rem', maxWidth: '96vw' }} modal>
        {aberto?.conteudo && <QuadroTarefasView c={aberto.conteudo} abrirPedido={abrirPedido} />}
      </Dialog>

      <Dialog header="Excluir quadro?" visible={!!excluir} onHide={() => setExcluir(null)} style={{ width: '26rem', maxWidth: '96vw' }} modal
        footer={<><Button label="Cancelar" text onClick={() => setExcluir(null)} />
          <Button label="Excluir" icon="pi pi-trash" severity="danger" loading={excluindo} onClick={confirmarExclusao} /></>}>
        <p>O quadro de <strong>{excluir && quando(excluir.criadoEm)}</strong> ({excluir?.nTarefas} tarefa(s)) some para os dois
          da conversa. As mensagens do chat não são apagadas.</p>
      </Dialog>
    </div>
  );
}
