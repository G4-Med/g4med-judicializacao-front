import { useEffect, useState } from 'react';
import { ETAPAS, DONOS } from '../../pages/processoOperacional/conteudo';
import { readAuthProfile } from '../../access/authProfile';
import './PrimeiraVisitaInfo.css';

/**
 * PRIMEIRA VISITA — o lembrete que só aparece uma vez.
 *
 * POR QUE: cada tela do fluxo (Jurídico → Selecionar Médico → Orçamento →
 * Protocolar → Protocolados → Segredo de Justiça) já tem seu texto completo
 * dentro do Processo Operacional (`ETAPAS`, conteudo.ts) — mas aquilo é um
 * manual que só quem procura acha. O que falta é o lembrete NA PRÓPRIA tela,
 * na primeira vez que a pessoa abre: quem é dono (G4MED ou Instituto), qual
 * o prazo/SLA, e o que a página espera dela. Depois da 1ª vez, some — vira
 * ruído repetir o óbvio para quem já sabe.
 *
 * FONTE: reusa `ETAPAS` (SSOT) — nunca duplica o texto, só resume + linka
 * para o manual completo em /processo-operacional.
 */

const EXPLICACAO_DONO: Record<'INSTITUTO' | 'G4MED', string> = {
  INSTITUTO:
    'Instituto Mateus — o escritório jurídico parceiro. Cuida da triagem dos pedidos, do protocolo nos autos e do acompanhamento até a decisão do juiz.',
  G4MED:
    'G4MED — a plataforma que recebe o pedido depois da triagem jurídica, escolhe o médico e cobra o orçamento dentro do prazo combinado com a Secretaria.',
};

function chaveVisto(etapaId: string, usuario: string) {
  return `mc_1a_visita_${etapaId}_${usuario || 'anonimo'}`;
}

export function PrimeiraVisitaInfo({ etapaId }: { etapaId: string }) {
  const [visivel, setVisivel] = useState(false);

  const etapa = ETAPAS.find((e) => e.id === etapaId);
  const usuario = readAuthProfile()?.username ?? '';
  const chave = chaveVisto(etapaId, usuario);

  useEffect(() => {
    if (!etapa) return;
    try {
      if (!localStorage.getItem(chave)) setVisivel(true);
    } catch {
      setVisivel(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaId]);

  if (!etapa || !visivel) return null;

  const fechar = () => {
    setVisivel(false);
    try {
      localStorage.setItem(chave, '1');
    } catch {
      /* sem storage, só fecha nesta sessão */
    }
  };

  const cor = DONOS[etapa.dono].cor;

  return (
    <div className="pvi" style={{ borderColor: cor }}>
      <div className="pvi__cabecalho">
        <span className="pvi__dono" style={{ background: cor }}>
          {DONOS[etapa.dono].rotulo}
        </span>
        <strong>{etapa.titulo}</strong>
        <button type="button" className="pvi__fechar" onClick={fechar} aria-label="Fechar">
          ✕
        </button>
      </div>

      <p className="pvi__quemedono">{EXPLICACAO_DONO[etapa.dono]}</p>

      <p>{etapa.oQueFaz}</p>

      {etapa.prazo && (
        <p className="pvi__sla">
          <strong>SLA desta etapa:</strong> {etapa.prazo}
        </p>
      )}

      {etapa.atencao && <p className="pvi__atencao">⚠ {etapa.atencao}</p>}

      <div className="pvi__rodape">
        <a href="/processo-operacional">Ver o manual completo do processo</a>
        <button type="button" className="pvi__entendi" onClick={fechar}>
          Entendi, não mostrar de novo
        </button>
      </div>
    </div>
  );
}

export default PrimeiraVisitaInfo;
