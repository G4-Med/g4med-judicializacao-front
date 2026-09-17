import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ETAPAS } from '../../pages/processoOperacional/conteudo';
import { GROUP_PERMISSIONS, type ScreenKey, type UserGroup } from '../../access/permissions';
import './CabecalhoFase.css';

/**
 * Cabeçalho padrão das telas de FASE do processo (task #211, @R 27/08 12:4x):
 * "a gente mudou a análise jurídica para o nome da fase mas ficou como Jurídico — corrigir
 * o título das janelas para ficar também o NÚMERO e o indicativo de QUEM tem que operar,
 * e o SLA ATIVO da fase".
 *
 * DERIVADO, não duplicado (a mesma disciplina do menu, menuConfigClean.ts):
 *  - número e rota vêm de ETAPAS (conteudo.ts) — o SSOT da regra numerada do processo;
 *  - quem opera vem de GROUP_PERMISSIONS: os grupos com `edit` da tela — se a permissão
 *    mudar, o cabeçalho acompanha sozinho (ADMIN é onipresente, por isso omitido do chip);
 *  - o SLA vem da constante que a própria página já usa (espelho de backend/funil.py).
 * Também grava o título da JANELA (aba do navegador) com o mesmo "N. Nome da fase".
 */

const ROTULO_GRUPO: Record<UserGroup, string> = {
  ADMIN: 'Admin',
  GERENTE: 'Gerente',
  JURIDICO: 'Jurídico',
  MEDICO: 'Médico',
  SUPERVISOR: 'Supervisor',
  SECRETARIA: 'Secretaria',
};

interface Props {
  /** nome curto da fase, como no menu ("Análise Jurídica") */
  nome: string;
  screen: ScreenKey;
  subtitulo?: string;
  /** meta em dias da fase (undefined = fase sem SLA simples) */
  slaDias?: number;
  /** SLA que não cabe em "N dias": cadência ou verificação escalonada.
   *  Ex.: "atualizar a cada 15 dias" (fase 5) · "verificar em 120d, cobrar em
   *  180d" (fase 6). Espelho de meta_atualizacao_dias/meta_verificacao_dias. */
  slaTexto?: string;
  /** conteúdo à direita (botões da página) */
  acoes?: React.ReactNode;
}

export function CabecalhoFase({ nome, screen, subtitulo, slaDias, slaTexto, acoes }: Props) {
  const { pathname } = useLocation();
  const etapa = ETAPAS.find((e) => e.rota === pathname);
  const titulo = etapa ? `${etapa.numero}. ${nome}` : nome;

  const opera = (Object.keys(GROUP_PERMISSIONS) as UserGroup[])
    .filter((g) => g !== 'ADMIN' && GROUP_PERMISSIONS[g].edit.includes(screen))
    .map((g) => ROTULO_GRUPO[g]);

  useEffect(() => {
    const anterior = document.title;
    document.title = `${titulo} · G4MED`;
    return () => { document.title = anterior; };
  }, [titulo]);

  return (
    <div className="cabecalho-fase">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
        <div className="cabecalho-fase__chips" aria-label="Contexto da fase">
          {opera.length > 0 && (
            <span className="cf-chip cf-chip--opera" title="Grupos que podem agir nesta fase">
              <i className="pi pi-user-edit" /> opera: <strong>{opera.join(' · ')}</strong>
            </span>
          )}
          {slaTexto ? (
            <span className="cf-chip cf-chip--sla" title="Meta desta fase — espelho de backend/funil.py">
              <i className="pi pi-clock" /> SLA ativo: <strong>{slaTexto}</strong>
            </span>
          ) : slaDias !== undefined ? (
            <span className="cf-chip cf-chip--sla" title="Meta desta fase — espelho de backend/funil.py">
              <i className="pi pi-clock" /> SLA ativo: <strong>{slaDias} {slaDias === 1 ? 'dia' : 'dias'}</strong>
            </span>
          ) : (
            <span className="cf-chip cf-chip--sem-sla" title="Fase sem meta de dias definida">
              <i className="pi pi-clock" /> sem SLA definido
            </span>
          )}
        </div>
      </div>
      {acoes && <div className="cabecalho-fase__acoes">{acoes}</div>}
    </div>
  );
}
