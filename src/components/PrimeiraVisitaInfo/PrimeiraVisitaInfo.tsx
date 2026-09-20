import { useEffect, useState } from 'react';
import { ETAPAS, DONOS } from '../../pages/processoOperacional/conteudo';
import { readAuthProfile } from '../../access/authProfile';
import { getPreferencia, salvarPreferencia } from '../../services/api/orders';
import './PrimeiraVisitaInfo.css';

/** @R 20/09 16:52: "quando a gente marca 'não mostrar de novo', tem que desmarcar para AQUELA
 *  rota, e tem que ter como reativar em Ajuda". Antes vivia só no localStorage (por navegador —
 *  voltava em outro computador e não tinha onde religar). Agora é preferência do usuário no
 *  servidor, uma lista de fases dispensadas, e a Ajuda → Avisos lista cada fase com um switch. */
export const CHAVE_FASES = 'fases_dispensadas';
export async function lerFasesDispensadas(): Promise<string[]> {
  const r = await getPreferencia(CHAVE_FASES);
  return (r.data?.valor?.ids as string[] | undefined) ?? [];
}
export async function salvarFasesDispensadas(ids: string[]) {
  await salvarPreferencia(CHAVE_FASES, { ids });
}

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
    let vivo = true;
    (async () => {
      try {
        const ids = await lerFasesDispensadas();
        if (!vivo) return;
        if (ids.includes(etapaId)) { setVisivel(false); return; }
        // migração: quem já dispensou no localStorage (antes de 20/09) não vê de novo — e o
        // servidor passa a saber, para a Ajuda poder religar.
        let noLocal = false;
        try { noLocal = !!localStorage.getItem(chave); } catch { /* sem storage */ }
        if (noLocal) {
          setVisivel(false);
          salvarFasesDispensadas(Array.from(new Set([...ids, etapaId]))).catch(() => {});
          return;
        }
        setVisivel(true);
      } catch {
        // servidor indisponível: cai no comportamento antigo (localStorage)
        try { setVisivel(!localStorage.getItem(chave)); } catch { setVisivel(true); }
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaId]);

  if (!etapa || !visivel) return null;

  const fechar = async () => {
    setVisivel(false);
    try { localStorage.setItem(chave, '1'); } catch { /* sem storage, só fecha nesta sessão */ }
    try {
      const ids = await lerFasesDispensadas();
      await salvarFasesDispensadas(Array.from(new Set([...ids, etapaId])));
    } catch { /* fica só no navegador; a Ajuda ainda religa quando o servidor voltar */ }
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
