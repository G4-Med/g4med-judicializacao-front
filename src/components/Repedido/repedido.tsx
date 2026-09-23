import { useState } from 'react';
import { Column } from 'primereact/column';
import { registrarRepedidoManual } from '../../services/api/orders';
import { cabecalhoComHint, casaOpcaoDosDados, filtroOpcoesDosDados }
  from '../ColunasIdentificacao/colunasIdentificacao';

/**
 * RE-PEDIDO (@R 28/08 17:17): "pedidos duplicados sao contados para o pedido para dar a
 * devida urgencia no pedido em qualquer fase... clicar uma exclamação para numero de
 * pedidos e deixar a cor da linha mais escura nas tabelas".
 *
 * Um lugar só para as telas de fase: a coluna e a classe da linha. Medido em produção
 * 28/08: 29 pedidos tinham sido pedidos 2-3× pela SES sem ninguém saber — 17 em Perda.
 *
 * ── REVISÃO 17/09 (@R): "se não tem, vamos deixar SEM re-pedido; se tem, Urgência e o
 * número de vezes, para mudar a cor da linha para sabermos".
 *
 * As duas mudanças e por que cada uma:
 *
 * 1. CÉLULA VAZIA quando não houve repetição. Antes vinha um "—" acinzentado — e medido
 *    em produção 17/09 isso era 1.124 de 1.154 linhas (97,4%) gastando espaço para dizer
 *    que nada aconteceu. O "—" só se justifica onde a ausência É informação (um campo que
 *    deveria estar preenchido); aqui o normal é não ter.
 *
 * 2. NÍVEIS, ¬um estado só. Antes qualquer n>1 pintava a linha igual: um pedido cobrado 3×
 *    ficava idêntico a um cobrado 2×. Quem varre a tela precisa ver a diferença sem contar.
 *    Hoje isso separa 27 linhas (2×) de 3 linhas (3×) — pequeno o bastante para agir.
 *
 * O nível MÁXIMO (cobrança por telefone) está previsto aqui e a coluna já sabe exibi-lo,
 * mas o campo que o alimenta depende de migration em produção, escalada ao @R
 * (decisão 8b9806bf99). Enquanto não existir, `repedidosManuais` chega undefined e o
 * código simplesmente não entra nesse ramo — ¬quebra, ¬mente.
 */

const fmt = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export type NivelRepedido = 'nenhum' | 'dois' | 'tres' | 'maximo';

/**
 * QUANTAS VEZES ESTE PEDIDO FOI FEITO — e-mails que chegaram (`vezesPedido`) + pedidos
 * manuais registrados pelo telefone (`repedidosManuais`). #640 (@R 22/09): "recebemos uma
 * ligação ou solicitação novamente... ele deveria alterar na tabela o valor". Antes a
 * ligação ficava de fora da conta: 1 e-mail + 1 ligação aparecia "Urgência 1×". O servidor
 * guarda os dois contadores separados de propósito (e-mail lido × ligação anotada); a
 * soma mora AQUI, num lugar só, para coluna, cor e filtro nunca discordarem.
 */
export const vezesTotal = (r: any): number => (r?.vezesPedido ?? 1) + (r?.repedidosManuais ?? 0);

/**
 * O nível de urgência de uma linha. Uma função só, para que coluna, cor e ficha nunca
 * discordem entre si — discordarem é como o usuário descobre que um dos três está errado.
 */
export const nivelRepedido = (r: any): NivelRepedido => {
  if ((r?.repedidosManuais ?? 0) > 0) return 'maximo';   // cobrado por telefone
  const n = vezesTotal(r);
  if (n >= 3) return 'tres';
  if (n === 2) return 'dois';
  return 'nenhum';
};

const CLASSE: Record<NivelRepedido, string> = {
  nenhum: '',
  dois: 'mc-linha-repedido-2',
  tres: 'mc-linha-repedido-3',
  maximo: 'mc-linha-repedido-max',
};

/** Linha colorida conforme a urgência — âmbar (2×), laranja (3×+), vermelho (telefone). */
export const rowClassRepedido = (r: any) => CLASSE[nivelRepedido(r)];

/** Coluna de urgência — só mostra algo quando há repetição; o resto da linha fica limpo.
 *
 *  FILTRO (@R 17/09): o dado é um NÚMERO (`vezesPedido`) e a tela mostra "Urgência 2×".
 *  Filtrar por número exigiria a pessoa saber que 1 significa "sem repetição" — conhecimento
 *  que só quem escreveu o código tem. O dropdown pergunta o que ela quer saber (tem urgência
 *  ou não) e o `filterFunction` traduz a escolha para a régua do dado. */
/**
 * "A SECRETÁRIA LIGOU COBRANDO" (@R 17/09, autorizado via /sc:perguntas --rapha).
 *
 * `vezesPedido` conta o que o sistema LÊ — o e-mail que chega de novo. A cobrança por
 * telefone não deixava rastro em lugar nenhum, e é o sinal MAIS forte de urgência que
 * existe aqui: alguém parou o dia para ligar.
 *
 * INCREMENTA, não edita: cobrança é EVENTO. Quem ligou em dois dias diferentes cobrou
 * duas vezes, e um campo que se digita perderia a segunda — porque quem edita
 * sobrescreve. Por isso o botão pergunta antes (registro que não se desfaz por clique
 * errado deve custar 1 confirmação).
 */
function BotaoCobrouPorTelefone({ orderId, aoRegistrar }: { orderId?: number; aoRegistrar?: (manuais: number) => void }) {
  const [enviando, setEnviando] = useState(false);
  if (!orderId) return null;
  return (
    <button type="button" className="mc-repedido-ligou" disabled={enviando}
      title="Registrar que o pedido foi feito de novo (ligação ou nova solicitação) — soma +1 e vai para urgência máxima"
      onClick={async (e) => {
        e.stopPropagation();
        if (!window.confirm('Registrar que este pedido foi feito de novo (ligação ou nova solicitação)?\n\nConta +1 no Re-pedido e o pedido vai para urgência máxima em todas as telas.')) return;
        setEnviando(true);
        try {
          const { data } = await registrarRepedidoManual(orderId);
          aoRegistrar?.(Number(data?.repedidosManuais ?? 0));
        } catch (err) {
          console.error('Falha ao registrar cobrança por telefone:', err);
          window.alert('Não consegui registrar. Tente de novo — nada foi gravado.');
        } finally {
          setEnviando(false);
        }
      }}>
      <i className={enviando ? 'pi pi-spin pi-spinner' : 'pi pi-phone'} aria-hidden="true" />
    </button>
  );
}

/* A CÉLULA TEM ESTADO PRÓPRIO (#640): antes, o clique gravava no servidor mas a linha só
   mudava ao recarregar a página — nenhuma das 11 telas passava o "recarregar". Agora a
   própria célula atualiza a linha com o número que o servidor devolveu; as outras telas
   leem o valor novo do servidor quando abrem. */
function CelulaRepedido({ r, aoRegistrar }: { r: any; aoRegistrar?: () => void }) {
  const [, setVersao] = useState(0);
  const registrar = (manuais: number) => {
    if (r) { r.repedidosManuais = manuais; r.repedidoTotal = vezesTotal(r); }
    setVersao((v) => v + 1);
    aoRegistrar?.();
  };
  const nivel = nivelRepedido(r);
  if (nivel === 'nenhum') {
    // @R 17/09: "Único pedido" AFIRMA que chegou uma vez só — célula vazia seria ambígua.
    return (
      <span className="mc-repedido-cel">
        <span className="mc-repedido-unico" title="Este paciente foi pedido uma única vez.">Único pedido</span>
        <BotaoCobrouPorTelefone orderId={r?.id} aoRegistrar={registrar} />
      </span>
    );
  }
  const n = vezesTotal(r);
  const emails = r?.vezesPedido ?? 1;
  const manuais = r?.repedidosManuais ?? 0;
  const porTelefone = manuais > 0;
  const titulo = [
    `Pedido ${n} vez${n > 1 ? 'es' : ''}`,
    `${emails} por e-mail`,
    porTelefone ? `${manuais} registrado${manuais > 1 ? 's' : ''} manualmente (ligação/nova solicitação) — urgência máxima` : null,
    r?.ultimoPedidoEm ? `último e-mail em ${fmt(r.ultimoPedidoEm)}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="mc-repedido-cel">
      <span className={`mc-repedido-badge mc-repedido-badge--${nivel}`} title={titulo} aria-label={`Urgência: ${titulo}`}>
        <i className={porTelefone ? 'pi pi-phone' : 'pi pi-exclamation-triangle'} aria-hidden="true" />
        Urgência {n}×
      </span>
      <BotaoCobrouPorTelefone orderId={r?.id} aoRegistrar={registrar} />
    </span>
  );
}

export const colunaRepedido = (dados?: any[], aoRegistrar?: () => void) => {
  // O filtro e a ordenação leem um CAMPO; o total é derivado, então é gravado na própria
  // linha (idempotente) antes de a tabela ler.
  (dados ?? []).forEach((r: any) => { if (r) r.repedidoTotal = vezesTotal(r); });
  return (
  <Column
    key="vezesPedido"
    field="repedidoTotal"
    header={<span className="mc-repedido-cab"><i className="pi pi-exclamation-triangle" aria-hidden="true" />{cabecalhoComHint('Re-pedido', 'Quantas vezes este pedido foi feito: e-mails que chegaram + pedidos registrados à mão pelo telefone (ligação ou nova solicitação). Mais de 1 = urgência. O telefone ao lado soma +1. \'Único pedido\' = chegou uma vez só.')}</span>}
    sortable
    filter
    showFilterMenu={false}
    filterMatchMode="custom"
    filterFunction={casaOpcaoDosDados}
    filterElement={filtroOpcoesDosDados(dados, (r: any) => vezesTotal(r), 'Todos',
      (v) => (Number(v) > 1 ? `${v}× pedido — urgência` : 'Único pedido'))}
    style={{ width: '9rem' }}
    bodyStyle={{ textAlign: 'center' }}
    body={(r: any) => <CelulaRepedido r={r} aoRegistrar={aoRegistrar} />}
  />
  );
};
