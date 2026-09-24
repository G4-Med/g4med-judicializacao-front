import { useCallback, useEffect, useState } from 'react';
import { getEmailsPendentes } from '../../services/api/orders';
import { RevisarEmail, type EmailRevisao } from './RevisarEmail';
import './RevisarEmail.css';

/** #712: faixa nas fases 1, 2 e 3 com os e-mails de PERDA e de PEDIDO DE EXAMES parados na fila (pendentes ou com erro).
 *  Mostra todos — são poucos (medido 24/09: 15 perdas e 14 pedidos de exame em 30 dias) e a perda tira o pedido da tabela
 *  da fase, então filtrar pela tabela esconderia justamente o e-mail que o @R quer revisar. Clicar abre o modal de revisão. */
const TIPOS = new Set(['DAR_PERDA', 'PEDIR_EXAMES', 'PEDIDO_EXAMES_PEDIATRICO']);
const ROTULO: Record<string, string> = { DAR_PERDA: 'perda', PEDIR_EXAMES: 'exames', PEDIDO_EXAMES_PEDIATRICO: 'exames' };

export function EmailsARevisar({ onMudou }: { onMudou?: () => void }) {
  const [itens, setItens] = useState<EmailRevisao[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(() => {
    Promise.all([getEmailsPendentes({ status: 'PENDENTE' }), getEmailsPendentes({ status: 'ERRO' })])
      .then((rs) => {
        const lista = rs.flatMap((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? [])));
        setItens(lista.filter((e: EmailRevisao) => TIPOS.has(e.tipoEmail)));
      })
      .catch(() => setItens([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (!itens.length && aberto == null) return null;
  return (
    <>
      {itens.length > 0 && (
        <div className="emails-a-revisar" role="status">
          <i className="pi pi-envelope" /> <b>{itens.length} e-mail(s) de perda/exames esperando você revisar e enviar:</b>
          {itens.map((e) => {
            const problema = e.podeEnviar === false || (e.checagem ?? []).some((c) => c.estado === 'PROBLEMA');
            return (
              <button type="button" key={e.id} className={`emails-a-revisar__item${problema ? ' emails-a-revisar__item--problema' : ''}`}
                title={problema ? 'Tem problema na checagem — abra para ver como corrigir' : 'Abrir para revisar, editar e enviar'}
                onClick={() => setAberto(e.id)}>
                {ROTULO[e.tipoEmail] ?? e.tipoEmail} · #{e.orderId} {e.paciente}{e.status === 'ERRO' ? ' · deu erro' : ''}{problema ? ' ⚠' : ''}
              </button>
            );
          })}
        </div>
      )}
      <RevisarEmail emailId={aberto} onClose={() => setAberto(null)} onMudou={() => { carregar(); onMudou?.(); }} />
    </>
  );
}

export default EmailsARevisar;
