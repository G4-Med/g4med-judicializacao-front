import { useEffect, useState } from 'react';
import api from '../../services/api';
import './AvisoCreditoIA.css';

/**
 * IA PAUSADA — SEM CRÉDITO NA OPENAI (@R 24/09 15:5x: ⟦"a plataforma tem que emitir um alerta na barra de menu
 * para dizer que falta crédito de API na OpenAI para fazer a recarga — plataforma pausada"⟧).
 *
 * Caso fundador: 24/09 15:2x a OpenAI respondeu 429 "no credits remaining"; a leitura de orçamento e o "Quem
 * precisamos" pararam e a equipe só soube porque uma sessão testou no servidor.
 *
 * O servidor decide (ia/uso.estado_credito): falha de crédito DEPOIS da última chamada que deu certo. Enquanto
 * estiver sem crédito, o ciclo do monitor testa 1 token a cada 10 min — o aviso some sozinho após a recarga.
 * Aqui só lê, a cada 5 min. Falha ao consultar = não mostra nada (o aviso nunca vira ruído por erro de rede).
 */
export function AvisoCreditoIA() {
  const [estado, setEstado] = useState<{ semCredito?: boolean | null; desde?: string | null; falhas?: number } | null>(null);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const { data } = await api.get('/ia/estado/');
        if (ativo) setEstado(data);
      } catch { /* rede fora: não inventa alerta */ }
    };
    void carregar();
    const id = window.setInterval(() => { void carregar(); }, 5 * 60 * 1000);
    return () => { ativo = false; window.clearInterval(id); };
  }, []);

  if (!estado?.semCredito) return null;
  const desde = estado.desde
    ? new Date(estado.desde).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <a className="mc-credito-ia" role="alert" href="https://platform.openai.com/settings/organization/billing/overview"
      target="_blank" rel="noreferrer"
      title={`A OpenAI está recusando as chamadas por falta de crédito${desde ? ` desde ${desde}` : ''} (${estado.falhas ?? 0} recusa(s)). `
        + 'Param enquanto isso: leitura de orçamento por IA, "Quem precisamos", sugestão de médico, filtro inteligente e redação de e-mail. '
        + 'Quem administra a conta recarrega em platform.openai.com (Settings › Billing). O aviso some sozinho em até 10 min depois da recarga.'}>
      <i className="pi pi-exclamation-triangle" />
      IA pausada: sem crédito na OpenAI — recarregar
    </a>
  );
}
