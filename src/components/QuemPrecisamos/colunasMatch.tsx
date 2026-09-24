import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { FilterService } from 'primereact/api';
import { cabecalhoComHint, casaOpcaoDosDados, filtroOpcoesDosDados } from '../ColunasIdentificacao/colunasIdentificacao';
import './colunasMatch.css';

/**
 * OPORTUNIDADE · PAGO PELO ESTADO · QUEM PRECISAMOS (@R 24/09, tasks #7/#8). A Oportunidade saiu às 02:2x
 * e voltou às 02:4x com valor próprio: mediana do Estado, senão média da chegada, senão projetado.
 *
 * ⟦"quando um pedido chega nós já fazemos um match da sugestão ... para saber o que tenho que
 * priorizar para achar, com o que temos de ativo"⟧ + ⟦"o valor da oportunidade na primeira coluna
 * ... e do lado a faixa média e o maior valor pago"⟧.
 *
 * O cálculo NÃO acontece aqui: o servidor faz na chegada do pedido (ia/match_pedido.py) e a listagem
 * só traz o resultado (`match`, `pagoEstado`, `valorOportunidade`, via _identificacao_por_order).
 * Célula vazia tem 3 leituras diferentes, e cada uma é dita na tela: não calculado (pedido anterior
 * ou fora das fases 1-3) · a leitura falhou (erro) · calculado.
 */

const reais = (v?: number | null) => {
  if (v == null) return '—';
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString('pt-BR')} mil`;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const ROTULO_TIPO: Record<string, string> = {
  CIRURGIAO: 'Cirurgião', MEDICO_CLINICO: 'Médico clínico', EXAMES_DIAGNOSTICO: 'Empresa de exames',
  ONCOLOGIA_TRATAMENTO: 'Oncologia (radio/quimio)', HOME_CARE: 'Home care', HOSPITAL_INTERNACAO: 'Hospital',
  MEDICAMENTO_INSUMO: 'Medicamento/insumo', OUTRO: 'Outro',
};

/** Rótulo do filtro de Quem precisamos (@R 24/09 02:53: "filtrar o nome"). */
export const rotuloQuem = (m: any): string | null => {
  if (!m) return 'Não calculado';
  if (m.erro || m.temos == null) return 'Leitura falhou';
  // maiúsculas: a IA escreve "Cirurgia Geral" e "CIRURGIA GERAL" — é a mesma opção no filtro
  return m.temos ? `Temos: ${m.medicoNome}` : `Procurar · ${(m.especialidade || 'sem especialidade').toUpperCase()}`;
};

/** Rótulo do filtro de Link e acessos (@R 24/09 02:53: "com acessos, sem acessos"). */
export const rotuloAcessos = (l: any): string | null => {
  if (!l) return 'Sem link';                                 // nenhum link enviado deste pedido
  return l.acessos > 0 ? 'Com acessos' : 'Sem acessos';
};

// Tabela CONTROLADA (filters={filters}) não registra o filterFunction da coluna — ver o porquê em
// colunasIdentificacao.tsx (REGISTRO DOS FILTROS CUSTOM). Sem isto o filtro devolve zero linhas.
// O campo filtrado é o OBJETO (match / linkDocumentos) e o rótulo é derivado aqui.
FilterService.register('custom_match', (valor: unknown, escolha: unknown) => casaOpcaoDosDados(rotuloQuem(valor), escolha));
FilterService.register('custom_linkDocumentos', (valor: unknown, escolha: unknown) => casaOpcaoDosDados(rotuloAcessos(valor), escolha));

/** Chaves que a página precisa ter no estado `filters` (sem elas o dropdown quebra ao escolher). */
export const FILTROS_MATCH = {
  match: { value: null, matchMode: 'custom' as const },
  linkDocumentos: { value: null, matchMode: 'custom' as const },
};

/** Props de filtro "Com acessos / Sem acessos" para a coluna Link e acessos de uma página. */
export const filtroAcessos = (dados: any[] | undefined) => ({
  filter: true, filterField: 'linkDocumentos', filterMatchMode: 'custom' as const, showFilterMenu: false,
  filterFunction: (v: unknown, e: unknown) => casaOpcaoDosDados(rotuloAcessos(v), e),
  filterElement: filtroOpcoesDosDados(dados, (r: any) => rotuloAcessos(r?.linkDocumentos), 'Todos'),
});

const ORIGEM_OPORTUNIDADE: Record<string, string> = {
  estado: 'mediana do Estado', chegada: 'média na chegada', projetado: 'projetado',
};

/**
 * OPORTUNIDADE (@R 24/09 02:4x): ⟦"se tem valor pago pelo estado vem a mediana, se não tem vem o valor
 * projetado com base nos dados que temos"⟧. O servidor escolhe (ia/match_pedido._oportunidade) e diz a
 * origem; a tela mostra o valor e, embaixo, de onde ele veio — projetado nunca se passa por pago.
 */
export function colunaOportunidade(largura = '9rem') {
  return (
    <Column key="col-oportunidade" field="oportunidade.valor" sortable style={{ minWidth: largura }}
      header={cabecalhoComHint('Oportunidade',
        'Quanto este pedido vale, para priorizar a busca. Ordem: (1) mediana do que o Estado pagou por ' +
        'este procedimento; (2) sem isso, a média do Estado consultada quando o pedido chegou; (3) sem ' +
        'isso, valor projetado pela mediana dos pedidos da mesma especialidade. Embaixo do valor aparece ' +
        'de onde ele veio.')}
      body={(r: any) => {
        const o = r?.oportunidade;
        if (!o || o.valor == null) return <span className="ident-vazio match-motivo" title={o?.detalhe || 'Sem base de valor.'}>{o?.detalhe || 'sem base de valor'}</span>;
        return (
          <div className="match-pago" title={o.detalhe}>
            <span className="match-valor">{reais(o.valor)}</span>
            <span className={`match-origem match-origem-${o.origem}`}>{ORIGEM_OPORTUNIDADE[o.origem] ?? o.origem}</span>
          </div>
        );
      }} />
  );
}

/**
 * MENOR ORÇ. PROC. (@R 24/09 03:20): o menor orçamento do procedimento INTEIRO que está válido e APROVADO
 * pela IA para ir no pedido — o mesmo "valor de referência" da mensagem do Copiar (servidor:
 * ia/match_pedido._menores_orcamentos). Valor com o nome do orçamento; vazio diz o porquê.
 */
export function colunaMenorOrcamento(largura = '10rem') {
  return (
    <Column key="col-menor-orcamento" field="menorOrcamento.valor" sortable style={{ minWidth: largura, maxWidth: '14rem' }}
      header={cabecalhoComHint('Menor orç. proc.',
        'Menor orçamento do procedimento inteiro lido da peça, conferido e aprovado pela IA para ir no pedido ' +
        '(o mesmo valor de referência da mensagem do Copiar, já com o desconto do link). Embaixo, de quem é o ' +
        'orçamento. OPME, honorários, internação e taxas sozinhos não contam.')}
      body={(r: any) => {
        const m = r?.menorOrcamento;
        if (!m || m.valor == null) return <span className="ident-vazio match-motivo" title={m?.motivo || 'Não calculado.'}>{m?.motivo || 'não calculado'}</span>;
        return (
          <div className="match-pago" title={`${m.local || 'prestador não identificado'} · original ${reais(m.original)} · menor entre ${m.n} aprovado(s) pela IA${m.ressalva ? ' · a IA aprovou COM RESSALVA' : ''}`}>
            <span className="match-valor">{reais(m.valor)}</span>
            <span className="match-origem" style={{ whiteSpace: 'normal' }}>{m.local || 'prestador não identificado'}{m.ressalva ? ' · com ressalva' : ''}</span>
          </div>
        );
      }} />
  );
}

export function colunaQuemPrecisamos(largura = '15rem', dados?: any[]) {
  const filtro = dados ? {
    filter: true, filterField: 'match', filterMatchMode: 'custom' as const, showFilterMenu: false,
    filterFunction: (v: unknown, e: unknown) => casaOpcaoDosDados(rotuloQuem(v), e),
    filterElement: filtroOpcoesDosDados(dados, (r: any) => rotuloQuem(r?.match), 'Todos'),
  } : {};
  return (
    <Column key="col-quem-precisamos" field="match.especialidade" sortable sortField="match.temos" {...filtro}
      style={{ minWidth: largura, maxWidth: '20rem' }}
      header={cabecalhoComHint('Quem precisamos',
        'Calculado quando o pedido chega: a IA lê o procedimento e diz que tipo de profissional ou ' +
        'serviço realiza (especialidade e subespecialidade) e se algum dos nossos prestadores ATIVOS faz, ' +
        'pelo briefing de cada um. Sem "menos pior": se ninguém do time faz, aparece PROCURAR. ' +
        'É uma sugestão — quem decide o médico é a equipe.')}
      body={(r: any) => {
        const m = r?.match;
        if (!m) return <span className="ident-vazio" title="Ainda não calculado (pedido anterior ao cálculo ou fora das fases 1 a 3).">não calculado</span>;
        if (m.erro || m.temos == null) return <span className="ident-vazio" title={`A leitura falhou: ${m.erro ?? 'sem resultado'}. Não quer dizer que não temos.`}>não calculado</span>;
        const quem = [m.especialidade, m.subespecialidade].filter(Boolean).join(' · ');
        const dica = `${ROTULO_TIPO[m.tipo] ?? m.tipo}${quem ? ': ' + quem : ''}\n${m.motivo ?? ''}\nConfiança: ${m.confianca || '—'}`;
        return (
          <div className="match-celula" title={dica}>
            {m.temos
              ? <Tag severity="success" icon="pi pi-check" value={`Temos: ${m.medicoNome}`} />
              : <Tag severity="danger" icon="pi pi-search" value="Procurar" />}
            <span className="match-quem">
              {m.tipo && m.tipo !== 'CIRURGIAO' ? <strong>{ROTULO_TIPO[m.tipo] ?? m.tipo}: </strong> : null}
              {quem || '—'}
            </span>
          </div>
        );
      }} />
  );
}

export function colunaPagoEstado(largura = '12rem') {
  return (
    <Column key="col-pago-estado" field="pagoEstado.maximo" sortable style={{ minWidth: largura }}
      header={cabecalhoComHint('Pago pelo Estado',
        'O que o Estado de MG pagou em processos do MESMO procedimento (portal de pagamentos): faixa típica ' +
        '(25% a 75% dos casos), mediana e o maior valor pago. É o total pago no processo — não é o preço de ' +
        'um concorrente. Com menos de 4 casos não há faixa, só os valores.')}
      body={(r: any) => {
        const p = r?.pagoEstado;
        // Vazio SEMPRE diz o porquê na célula (@R 24/09 02:4x): não calculado · fonte fora · sem pagamentos.
        if (!p) return <span className="ident-vazio match-motivo" title="Pedido ainda não passou pelo cálculo (anterior a ele ou fora das fases 1 a 3).">não calculado</span>;
        if (p.n == null) {
          const fora = /sem resposta/i.test(p.motivo || '');
          return <span className="ident-vazio match-motivo" title={`${p.motivo || 'Ainda não consultado.'} O sistema tenta de novo sozinho a cada 10 minutos.`}>
            {fora ? 'fonte do Estado sem resposta · tentando de novo' : 'ainda não consultado'}</span>;
        }
        if (!p.n) return <span className="ident-vazio match-motivo" title={p.motivo || 'Sem pagamentos públicos para este procedimento.'}>
          {/oscila|descart/i.test(p.motivo || '') ? 'sem pagamentos estáveis na fonte' : 'o Estado não pagou este procedimento'}</span>;
        const janela = p.janelaDias ? `últimos ${p.janelaDias} dias` : 'todo o histórico';
        return (
          <div className="match-pago" title={`${p.n} pagamento(s) · ${janela}`}>
            {p.p25 != null && p.p75 != null
              ? <span>faixa {reais(p.p25)}–{reais(p.p75)}</span>
              : <span>mediana {reais(p.mediana)}</span>}
            <span className="match-pago-maior">maior {reais(p.maximo)} <small>({p.n})</small></span>
          </div>
        );
      }} />
  );
}
