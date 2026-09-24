/* E-MAIL AO ÓRGÃO — chegou? foi aberto? (@R 24/09 00:2x: "em todas as fases (…) saber que o e-mail já foi aberto
   pelo órgão solicitante (…) uma coluna em toda a tabela para ver para cada paciente se o e-mail já foi aberto e
   recebido"). A regra mora no servidor (backend/email_rastreio.py); aqui só se MOSTRA, sem inventar.
   Honestidade: e-mail que saiu antes de o rastreio existir (23/09 22:18 entrega · 24/09 00:51 abertura) é "sem rastreio",
   nunca "não aberto". "Aberto" = abertura CONFIRMADA (o destinatário carregou as imagens) — não é o mesmo que lido.
   "Entregue" = o servidor do órgão aceitou (a pasta de spam também conta). */
import { useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { getEmailsOrgao } from '../../services/api/orders';
import './EmailOrgao.css';

export type EstadoEmailOrgao = 'NENHUM' | 'SEM_RASTREIO' | 'AGUARDANDO' | 'ENTREGUE' | 'ABERTO' | 'DEVOLVIDO' | 'SPAM';
export type ResumoEmailOrgao = {
  id: number; tipo: string; rotuloTipo: string; enviadoEm: string | null; dataEnvioAproximada?: boolean;
  quando: string | null; detalhe: string | null; total: number;
} | null;

const dia = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const diaHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

type Visual = { valor: string; severity: 'success' | 'info' | 'warning' | 'danger' | 'secondary'; icon: string; titulo: string };
export function visualDoEstado(estado: EstadoEmailOrgao, quando: string | null, aproximada?: boolean, detalhe?: string | null): Visual {
  switch (estado) {
    case 'ABERTO': return { valor: `Aberto ${diaHora(quando)}`, severity: 'success', icon: 'pi pi-eye',
      titulo: 'Abertura CONFIRMADA: o destinatário carregou as imagens do e-mail. Abertura confirmada não é o mesmo que lido.' };
    case 'ENTREGUE': return { valor: `Entregue ${diaHora(quando)}`, severity: 'info', icon: 'pi pi-check',
      titulo: 'O servidor do órgão ACEITOU o e-mail (a pasta de spam também conta como entregue). '
        + (detalhe?.startsWith('abertura fora de alcance')
          ? 'A abertura NÃO pode ser medida: o e-mail saiu antes de o rastreio de abertura existir (24/09 00:51).'
          : 'Sem sinal de abertura até agora — e-mail aberto com imagens bloqueadas também não dá sinal (sem sinal ≠ não abriu).') };
    case 'AGUARDANDO': return { valor: `Enviado ${diaHora(quando)} · aguardando`, severity: 'warning', icon: 'pi pi-clock',
      titulo: 'Enviado; o provedor ainda não confirmou a entrega.' };
    case 'DEVOLVIDO': return { valor: `Devolvido ${dia(quando)}`, severity: 'danger', icon: 'pi pi-times-circle',
      titulo: `O e-mail NÃO chegou (devolvido)${detalhe ? `: ${detalhe}` : ''}. Confira o endereço do órgão.` };
    case 'SPAM': return { valor: `Spam ${dia(quando)}`, severity: 'danger', icon: 'pi pi-ban',
      titulo: 'O destinatário marcou o e-mail como spam.' };
    case 'SEM_RASTREIO': return { valor: `Enviado ${dia(quando)}${aproximada ? '*' : ''} · sem rastreio`, severity: 'secondary', icon: 'pi pi-send',
      titulo: 'Enviado antes de o rastreio existir (23/09): não dá para saber se chegou ou se foi aberto. '
        + (aproximada ? '* data do registro (a data de envio não foi gravada na época).' : '') };
    default: return { valor: '—', severity: 'secondary', icon: '', titulo: 'Nenhum e-mail enviado ao órgão neste pedido.' };
  }
}

/* A célula da tabela: o estado do e-mail que representa o pedido (o do orçamento; sem ele, o último ao órgão).
   Clicar abre a lista de todos os e-mails do pedido ao órgão. */
export function CelulaEmailOrgao({ orderId, estado, resumo }: { orderId?: number; estado?: EstadoEmailOrgao | string | null; resumo?: ResumoEmailOrgao }) {
  const [aberto, setAberto] = useState(false);
  const est = (estado || 'NENHUM') as EstadoEmailOrgao;
  if (est === 'NENHUM' || !resumo) return <span className="ident-vazio" title="Nenhum e-mail enviado ao órgão neste pedido">—</span>;
  const v = visualDoEstado(est, resumo.quando, resumo.dataEnvioAproximada, resumo.detalhe);
  return (
    <span className="eo-celula">
      <button type="button" className="eo-botao" onClick={() => setAberto(true)}
        title={`${resumo.rotuloTipo}: ${v.titulo} — clique para ver os ${resumo.total} e-mail(s) ao órgão`}>
        <Tag value={v.valor} severity={v.severity} icon={v.icon} />
        <small className="eo-tipo">{resumo.rotuloTipo}{resumo.total > 1 ? ` · ${resumo.total} e-mails` : ''}
          {est === 'ENTREGUE' && (resumo.detalhe?.startsWith('abertura fora de alcance') ? ' · abertura fora de alcance' : ' · sem sinal de abertura')}</small>
      </button>
      {orderId && <DialogEmailsOrgao orderId={orderId} visible={aberto} onHide={() => setAberto(false)} />}
    </span>
  );
}

type LinhaEmail = { id: number; rotuloTipo: string; destinatario: string | null; enviadoEm: string | null; dataEnvioAproximada?: boolean;
  estado: EstadoEmailOrgao; quando: string | null; detalhe: string | null; entregueEm: string | null; abertoEm: string | null };

export function DialogEmailsOrgao({ orderId, visible, onHide }: { orderId: number; visible: boolean; onHide: () => void }) {
  const [lista, setLista] = useState<LinhaEmail[] | null>(null);
  const [erro, setErro] = useState('');
  const carregar = async () => {
    setLista(null); setErro('');
    try { const { data } = await getEmailsOrgao(orderId); setLista(data?.emails ?? []); }
    catch (e: any) { setErro(e?.response?.data?.error || 'Não consegui ler os e-mails deste pedido agora.'); setLista([]); }
  };
  return (
    <Dialog header={`E-mails ao órgão — pedido #${orderId}`} visible={visible} onShow={carregar} onHide={onHide}
      style={{ width: 'min(760px, 95vw)' }} modal dismissableMask>
      {lista === null ? <p><i className="pi pi-spin pi-spinner" /> Lendo os e-mails…</p> : (
        <>
          {erro && <p className="eo-erro">{erro}</p>}
          {!erro && lista.length === 0 && <p>Nenhum e-mail enviado ao órgão neste pedido.</p>}
          {lista.length > 0 && (
            <table className="eo-tabela">
              <thead><tr><th>E-mail</th><th>Enviado</th><th>Situação</th><th>Para</th></tr></thead>
              <tbody>
                {lista.map((e) => {
                  const v = visualDoEstado(e.estado, e.quando, e.dataEnvioAproximada, e.detalhe);
                  return (
                    <tr key={e.id}>
                      <td>{e.rotuloTipo}</td>
                      <td>{diaHora(e.enviadoEm)}{e.dataEnvioAproximada ? '*' : ''}</td>
                      <td title={v.titulo}><Tag value={v.valor} severity={v.severity} icon={v.icon} /></td>
                      <td className="eo-para">{e.destinatario || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="eo-nota">
            O rastreio existe desde 23/09: <strong>entrega</strong> a partir das 22:18 e <strong>abertura</strong> a partir
            de 24/09 00:51 (quando o provedor aprovou o domínio). E-mails anteriores aparecem como "sem rastreio" ou "abertura
            fora de alcance" (não dá para saber, o que é diferente de "não aberto").
            "Aberto" é abertura confirmada (as imagens foram carregadas); com imagens bloqueadas, o e-mail pode ter sido
            lido sem aparecer aqui. {lista.some((e) => e.dataEnvioAproximada) && '* data do registro (a de envio não foi gravada).'}
          </p>
        </>
      )}
    </Dialog>
  );
}
