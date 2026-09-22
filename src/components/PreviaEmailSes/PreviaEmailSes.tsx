import { useEffect, useState } from 'react';
import api from '../../services/api';

/* PRÉVIA DO E-MAIL À SES (#538, @R 21/09/2026): ⟦"aparecer para ela confirmar"⟧.
   Mostra, ANTES do clique de perda, exatamente o e-mail que o pedido vai gerar — o servidor monta a
   prévia com a mesma fonte única que cria o e-mail, então o que aparece aqui é o que sai.
   O e-mail nasce PENDENTE: ainda dá para editar ou cancelar em Central de E-mails → Respostas.

   Três estados distintos, nunca confundidos: carregando · prévia · FALHA DE LEITURA. Falha não vira
   "sem e-mail" — dizer que não haverá e-mail sem ter conseguido perguntar seria afirmar o que não se sabe. */

interface Previa {
  assunto: string;
  corpo: string;
  para: string | null;
  destinatarioOk: boolean;
}

export function PreviaEmailSes({ orderId, motivo }: { orderId: number; motivo?: string | null }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [falhou, setFalhou] = useState(false);
  const jaOperado = motivo === 'JA_OPERADO';

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setFalhou(false);
    api.get(`/orders/${orderId}/previa-email-negativa/`, { params: jaOperado ? { motivo: 'JA_OPERADO' } : {} })
      .then((r) => { if (vivo) setPrevia(r.data); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [orderId, jaOperado]);

  const caixa: React.CSSProperties = {
    border: '1px solid #e3eaef', borderRadius: 8, background: '#f5f7f9', padding: '10px 12px',
    margin: '4px 0 12px', fontSize: 13, lineHeight: 1.45,
  };

  if (falhou) {
    return <div style={{ ...caixa, color: '#8a5a00' }}>Não consegui carregar a prévia do e-mail agora. A perda continua
      criando o e-mail pendente na Central de E-mails — confira o texto lá antes de enviar.</div>;
  }
  if (!previa) return <div style={{ ...caixa, color: '#5b6b7a' }}>Carregando o e-mail que vai para a SES…</div>;

  return (
    <div style={caixa} aria-label="Prévia do e-mail que vai para a SES">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>E-mail que vai para a SES</div>
      {previa.destinatarioOk
        ? <div><span style={{ color: '#5b6b7a' }}>Para:</span> {previa.para}</div>
        : <div style={{ color: '#b42318', fontWeight: 600 }}>
            O e-mail do solicitante está vazio ou inválido — o e-mail à SES NÃO será criado. Corrija o e-mail do
            solicitante na Ficha do Pedido.</div>}
      <div><span style={{ color: '#5b6b7a' }}>Assunto:</span> {previa.assunto}</div>
      <div style={{ whiteSpace: 'pre-wrap', marginTop: 6, background: '#fff', border: '1px solid #e3eaef',
        borderRadius: 6, padding: '8px 10px' }}>{previa.corpo}</div>
      <div style={{ color: '#5b6b7a', marginTop: 6 }}>Nada é enviado neste clique: o e-mail fica pendente e pode ser
        editado em Central de E-mails → Respostas antes de sair.</div>
    </div>
  );
}
