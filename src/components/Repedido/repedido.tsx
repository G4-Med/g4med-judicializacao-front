import { Column } from 'primereact/column';
import { cabecalhoComHint, filtroOpcoes, OPCOES_REPEDIDO }
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
export const colunaRepedido = () => (
  <Column
    key="vezesPedido"
    field="vezesPedido"
    header={<span className="mc-repedido-cab"><i className="pi pi-exclamation-triangle" aria-hidden="true" />{cabecalhoComHint('Re-pedido', 'Quantas vezes este mesmo paciente foi pedido. Mais de 1 = urgência: o pedido voltou e ninguém respondeu. A linha fica marcada em todas as telas. Vazio = pedido único, nada a fazer.')}</span>}
    sortable
    filter
    showFilterMenu={false}
    filterMatchMode="custom"
    filterFunction={(valor: any, escolha: any) => {
      if (escolha === null || escolha === undefined || escolha === '') return true;
      const temRepeticao = (valor ?? 1) > 1;
      return escolha === 'sim' ? temRepeticao : !temRepeticao;
    }}
    filterElement={filtroOpcoes(OPCOES_REPEDIDO, 'Todos')}
    style={{ width: '9rem' }}
    bodyStyle={{ textAlign: 'center' }}
    body={(r: any) => {
      const nivel = nivelRepedido(r);
      if (nivel === 'nenhum') return null;   // ¬"—": o normal é não ter (@R 17/09)

      const n = r?.vezesPedido ?? 1;
      const manuais = r?.repedidosManuais ?? 0;
      const porTelefone = manuais > 0;

      const titulo = [
        `Pedido ${n} vez${n > 1 ? 'es' : ''}`,
        porTelefone ? `${manuais} por telefone — urgência máxima` : null,
        r?.ultimoPedidoEm ? `último em ${fmt(r.ultimoPedidoEm)}` : null,
      ].filter(Boolean).join(' · ');

      return (
        <span className={`mc-repedido-badge mc-repedido-badge--${nivel}`} title={titulo}
          aria-label={`Urgência: ${titulo}`}>
          <i className={porTelefone ? 'pi pi-phone' : 'pi pi-exclamation-triangle'} aria-hidden="true" />
          Urgência {n}×
        </span>
      );
    }}
  />
);
