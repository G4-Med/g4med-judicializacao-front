import { marcarRetornoExameVisto } from '../../services/api/orders';

/** #708 (@R 24/09): pedido de exame e o retorno dele (back exame_solicitado.py). Usado nas telas 2 e 3 — medido 24/09,
 *  4 dos 5 pedidos com exame em aberto estavam na fase 2 (entre eles o #607, com retorno da SES desde 31/08). */
export interface ExameSolicitado {
  emailId: number;
  estado: 'NAO_SAIU' | 'AGUARDANDO' | 'RETORNO';
  rotulo: string;
  pedidoEm: string | null;
  enviadoEm: string | null;
  destinatario: string | null;
  diasEsperando: number | null;
  retornos: number;
  retornosNaoVistos: number;
  ultimoRetorno: { em: string | null; remetente: string | null; assunto: string | null; anexos: string[]; vistoPor: string | null } | null;
}

type ComExame = { id: number; paciente: string; exameSolicitado?: ExameSolicitado | null };

const _dm = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** O selo na linha do paciente. Vermelho = o e-mail não saiu (ninguém responde o que não chegou); azul = saiu e espera;
 *  verde = o retorno chegou e ninguém viu ainda (botão "vi"); cinza = retorno já visto. */
export function SeloExame({ r, onVisto }: { r: ComExame; onVisto: () => void }) {
  const x = r.exameSolicitado;
  if (!x) return null;
  const porVer = x.estado === 'RETORNO' && x.retornosNaoVistos > 0;
  const classe = x.estado === 'NAO_SAIU' ? 'selo-exame--nao-saiu' : porVer ? 'selo-exame--retorno'
    : x.estado === 'RETORNO' ? 'selo-exame--visto' : 'selo-exame--aguardando';
  const texto = x.estado === 'NAO_SAIU' ? `Exame pedido ${_dm(x.pedidoEm)} · e-mail NÃO saiu`
    : porVer ? `Retorno do exame ${_dm(x.ultimoRetorno?.em)}`
      : x.estado === 'RETORNO' ? `Retorno do exame visto`
        : `Exame pedido ${_dm(x.enviadoEm || x.pedidoEm)} · ${x.rotulo}${x.diasEsperando ? ` · ${x.diasEsperando}d` : ''}`;
  const u = x.ultimoRetorno;
  const dica = [
    `Pedido de exame: ${x.rotulo}.`,
    x.destinatario ? `Para: ${x.destinatario}` : null,
    x.estado === 'NAO_SAIU' ? 'O e-mail está na fila de E-mails pendentes: enquanto não sair, ninguém responde.' : null,
    u ? `Retorno em ${u.em ? new Date(u.em).toLocaleString('pt-BR') : '?'} de ${u.remetente ?? '?'}: ${u.assunto ?? ''}` : null,
    u && u.anexos.length ? `Anexos: ${u.anexos.join(', ')} (estão na caixa atendimento@)` : null,
    u?.vistoPor ? `Visto por ${u.vistoPor}` : null,
  ].filter(Boolean).join('\n');
  return (
    <span className={`selo-exame ${classe}`} title={dica}>
      {texto}
      {porVer && (
        <button type="button" className="selo-exame__visto" title="Marcar que você viu o retorno — o selo verde sai"
          onClick={(e) => { e.stopPropagation(); marcarRetornoExameVisto(r.id).then(onVisto).catch(() => window.alert('Não consegui marcar como visto. Tente de novo.')); }}>
          vi
        </button>
      )}
    </span>
  );
}

/** O aviso do topo: retornos que chegaram e ninguém viu, e pedidos de exame cujo e-mail não saiu. */
export function AvisoExames({ linhas, onAbrirEmails }: { linhas: ComExame[]; onAbrirEmails: () => void }) {
  const comExame = linhas.filter((p) => p.exameSolicitado);
  const chegaram = comExame.filter((p) => p.exameSolicitado!.estado === 'RETORNO' && p.exameSolicitado!.retornosNaoVistos > 0);
  const naoSairam = comExame.filter((p) => p.exameSolicitado!.estado === 'NAO_SAIU');
  if (!chegaram.length && !naoSairam.length) return null;
  const lista = (ps: ComExame[]) => ps.map((p) => `#${p.id} ${p.paciente}`).join(' · ');
  return (
    <div className="aviso-exames" role="status">
      {chegaram.length > 0 && (
        <div className="aviso-exames__linha aviso-exames__linha--retorno">
          <i className="pi pi-inbox" /> <b>{chegaram.length} retorno(s) de exame chegaram</b> e ninguém marcou visto: {lista(chegaram)}
        </div>
      )}
      {naoSairam.length > 0 && (
        <div className="aviso-exames__linha aviso-exames__linha--nao-saiu">
          <i className="pi pi-exclamation-triangle" /> <b>{naoSairam.length} pedido(s) de exame NÃO saíram</b> — o e-mail está parado em{' '}
          <a href="/emails" onClick={(e) => { e.preventDefault(); onAbrirEmails(); }}>E-mails pendentes</a>: {lista(naoSairam)}
        </div>
      )}
    </div>
  );
}
