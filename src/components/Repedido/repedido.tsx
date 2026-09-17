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
 * O nível de urgência de uma linha. Uma função só, para que coluna, cor e ficha nunca
 * discordem entre si — discordarem é como o usuário descobre que um dos três está errado.
 */
export const nivelRepedido = (r: any): NivelRepedido => {
  if ((r?.repedidosManuais ?? 0) > 0) return 'maximo';   // cobrado por telefone
  const n = r?.vezesPedido ?? 1;
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
function BotaoCobrouPorTelefone({ orderId, aoRegistrar }: { orderId?: number; aoRegistrar?: () => void }) {
  const [enviando, setEnviando] = useState(false);
  if (!orderId) return null;
  return (
    <button type="button" className="mc-repedido-ligou" disabled={enviando}
      title="Registrar que a secretária ligou cobrando este pedido — vai para urgência máxima"
      onClick={async (e) => {
        e.stopPropagation();
        if (!window.confirm('Registrar uma cobrança por telefone neste pedido?\n\nEle vai para urgência máxima na lista.')) return;
        setEnviando(true);
        try {
          await registrarRepedidoManual(orderId);
          aoRegistrar?.();
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

export const colunaRepedido = (dados?: any[], aoRegistrar?: () => void) => (
  <Column
    key="vezesPedido"
    field="vezesPedido"
    header={<span className="mc-repedido-cab"><i className="pi pi-exclamation-triangle" aria-hidden="true" />{cabecalhoComHint('Re-pedido', 'Quantas vezes este mesmo paciente foi pedido. Mais de 1 = urgência: o pedido voltou e ninguém respondeu. A linha fica marcada em todas as telas. \'Único pedido\' = chegou uma vez só, nada a fazer.')}</span>}
    sortable
    filter
    showFilterMenu={false}
    filterMatchMode="custom"
    /* @R 17/09: ⟦"repedido ainda está errado em 3"⟧ + ⟦"verificar todos os frontends
       para padronizar"⟧. As duas opções fixas ("Com urgência 2× ou +" · "Único pedido")
       escondiam a diferença entre o pedido que voltou UMA vez e o que voltou TRÊS — e é
       essa diferença que decide o que se atende primeiro. Agora o filtro lista as
       repetições que EXISTEM na tabela, cada uma com quantos pedidos, do maior para o
       menor: nada de opção que não devolve linha, nada de 2 e 3 no mesmo balaio. */
    filterFunction={casaOpcaoDosDados}
    filterElement={filtroOpcoesDosDados(dados, (r: any) => r?.vezesPedido ?? 1, 'Todos',
      (v) => (Number(v) > 1 ? `${v}× pedido — urgência` : 'Único pedido'))}
    style={{ width: '9rem' }}
    bodyStyle={{ textAlign: 'center' }}
    body={(r: any) => {
      const nivel = nivelRepedido(r);
      if (nivel === 'nenhum') {
        // @R 17/09, corrigindo a minha leitura: ⟦"eu disse para ela ganhar um valor, não
        // ficar como vazio — tipo 'Único Pedido'"⟧. Eu tinha entendido "sem re-pedido"
        // como "sem nada" e deixei a célula em branco. São coisas diferentes: célula vazia
        // é ambígua (não sei? não se aplica? a tela quebrou?), e "Único pedido" AFIRMA que
        // o pedido chegou uma vez só. O que incomodava no "—" nunca foi haver texto, era
        // o traço não dizer nada.
        return (
          <span className="mc-repedido-cel">
            <span className="mc-repedido-unico" title="Este paciente foi pedido uma única vez pela SES.">Único pedido</span>
            <BotaoCobrouPorTelefone orderId={r?.id} aoRegistrar={aoRegistrar} />
          </span>
        );
      }

      const n = r?.vezesPedido ?? 1;
      const manuais = r?.repedidosManuais ?? 0;
      const porTelefone = manuais > 0;

      const titulo = [
        `Pedido ${n} vez${n > 1 ? 'es' : ''}`,
        porTelefone ? `${manuais} por telefone — urgência máxima` : null,
        r?.ultimoPedidoEm ? `último em ${fmt(r.ultimoPedidoEm)}` : null,
      ].filter(Boolean).join(' · ');

      return (
        <span className="mc-repedido-cel">
        <span className={`mc-repedido-badge mc-repedido-badge--${nivel}`} title={titulo}
          aria-label={`Urgência: ${titulo}`}>
          <i className={porTelefone ? 'pi pi-phone' : 'pi pi-exclamation-triangle'} aria-hidden="true" />
          Urgência {n}×{manuais > 0 ? ` +${manuais}☎` : ''}
        </span>
        <BotaoCobrouPorTelefone orderId={r?.id} aoRegistrar={aoRegistrar} />
        </span>
      );
    }}
  />
);
