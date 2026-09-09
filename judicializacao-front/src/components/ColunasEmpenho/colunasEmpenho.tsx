import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { getOrcamentoConsolidado } from '../../services/api/orders';

/**
 * Colunas de empenho/pagamento do Estado (base 548) — compartilhadas pelas telas
 * 5 Protocolados, 6 Enviado à SES, Perdas e Ganhos/Resultados (@R 28/08 02:2x:
 * "para quem tem pagamento em 5. e 6. e perdas e ganhos vamos colocar lá também
 * para cruzarmos"). Régua T2 da 548: o valor é do EMPENHO (favorecido costuma
 * ser o Tribunal — depósito judicial), nunca o que o prestador recebeu.
 *
 * A linha precisa ter: empenho548 {pago, empenhado, nEmpenhos, anoMax,
 * ultimoPagamento} | null · valorOrcamento (base da diferença).
 */

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataBr = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const ehExato = (r: any) =>
  (r.empenho548?.pago ?? 0) > 0 && (r.valorOrcamento ?? 0) > 0 &&
  Math.abs(r.empenho548.pago - r.valorOrcamento) / r.valorOrcamento < 0.005;

/** As 4 classes de pagamento (@R 28/08 08:34) — derivadas no backend em
 *  `classePagamento`, para a tabela poder FILTRAR por elas. */
export const OPCOES_CLASSE_PAGAMENTO = [
  { label: 'Pago = orçado (exato)', value: 'EXATO' },
  { label: 'Pago, valor diferente', value: 'NAO_EXATO' },
  { label: 'Empenhado, sem pagamento', value: 'EMPENHADO' },
  { label: 'Sem pagamento no CNJ', value: 'SEM_REGISTRO' },
];

/** Estado inicial do filtro — espalhe no `filters` da página:
 *  `const [filters] = useState({ ...FILTRO_PAGAMENTO, ... })` */
export const FILTRO_PAGAMENTO = {
  classePagamento: { value: null, matchMode: 'equals' as const },
};

export function colunaEmpenhoEstado() {
  return (
    <Column key="empenho548" field="classePagamento" header="Empenho Estado" sortable
      style={{ minWidth: '11rem' }} filter showFilterMenu={false}
      filterElement={(o: any) => (
        <Dropdown value={o.value} options={OPCOES_CLASSE_PAGAMENTO}
          onChange={(e) => o.filterApplyCallback(e.value)}
          placeholder="Pagamento" showClear className="p-column-filter"
          style={{ minWidth: '11rem' }} />
      )}
      sortFunction={(e: any) => {
        const v = (r: any) => r.empenho548?.pago ?? -1;
        return [...e.data].sort((a: any, b: any) => (v(a) - v(b)) * (e.order ?? 1));
      }}
      body={(r: any) => (r.empenho548?.fonte === 'api548' && (r.empenho548.podeDarBaixa || r.empenho548.revisarManual)
        // Veredito VIVO da API do 548 (#258): "pode dar baixa" só no sinal forte; amarelo = conferir.
        ? (r.empenho548.podeDarBaixa
          ? <Tag value={`PAGO após o pedido · pode dar baixa ${fmtBRL(r.empenho548.pago)}`} severity="success" icon="pi pi-check-circle"
              title={`${r.empenho548.porque ?? ''} Fonte: API do 548 (${String(r.empenho548.atualizadoEm ?? '').slice(0, 16).replace('T', ' ')}). O favorecido é o TRIBUNAL (depósito judicial), não o prestador.${r.empenho548.ancoraSuspeita ? ' ⚠ Data do pedido parece backfill — confira antes de baixar.' : ''}`} />
          : <Tag value={`Revisar · pagou antes, valor bate ${fmtBRL(r.empenho548.pago)}`} severity="warning" icon="pi pi-search"
              title={`${r.empenho548.porque ?? ''} Fonte: API do 548. Pagamento anterior ao pedido com valor entre 60% e 140% do orçado — pode ser este item ou outro do mesmo processo. Favorecido = tribunal, não o prestador.`} />)
        : r.empenho548
        ? (r.empenho548.pago > 0
          ? (ehExato(r)
            ? <Tag value={`PAGO = ORÇADO ${fmtBRL(r.empenho548.pago)}`} icon="pi pi-star-fill"
                style={{ background: '#7c3aed', color: '#fff' }}
                title="O valor pago pelo Estado BATE com o orçamento enviado (±0,5%) — evidência forte de que é ESTE item. Conferência prioritária." />
            : r.empenho548.sinal === 'DEPOSITO_NO_PROCESSO'
            // Pedido AINDA NÃO PROTOCOLADO com depósito no CNJ: o Estado já pagou
            // ALGO nesse processo antes de nós entrarmos — alerta estratégico, não desfecho.
            ? <Tag value={`Depósito no processo ${fmtBRL(r.empenho548.pago)}`} severity="warning" icon="pi pi-exclamation-circle"
                title="ATENÇÃO: o Estado JÁ depositou em juízo neste CNJ e nós ainda NEM protocolamos — provavelmente outro orçamento venceu ou é outro item. Conferir se ainda vale protocolar. NÃO significa que este pedido foi pago." />
            : r.empenho548.sinal === 'PAGAMENTO_SEM_DATA'
            // ── "SEM DATA" ¬É "DE OUTRA COISA" (08/09, GO do @R pelo cartão) ────────
            // Até hoje estes 61 caíam no rótulo cinza "Histórico" abaixo, com o tooltip
            // dizendo "ANTERIOR ao pedido... não é sinal de baixa" — e saíam da fila.
            // Medido: a API do 548 os marca PAGO_ANTES_DO_PEDIDO, mas 61 de 61 têm data
            // NULA e o texto da própria API diz "0 pagamento(s) anteriores (último em
            // None)". Nunca soubemos quando pagaram; o rótulo é que afirmava.
            // Âmbar e não cinza porque a ação é CONFERIR, ¬arquivar: 12 destes têm valor
            // idêntico ao orçado. Cinza é a cor de quem já foi resolvido.
            ? <Tag value={`Sem data ${fmtBRL(r.empenho548.pago)}`} severity="warning" icon="pi pi-question-circle"
                title="O Estado PAGOU neste CNJ, mas a base do 548 não traz a DATA do pagamento — então não dá para saber se foi antes ou depois do nosso pedido. Não é histórico nem baixa: é indeterminado, e continua na fila até a data aparecer. Favorecido = tribunal, não o prestador." />
            : r.empenho548.sinal === 'PROVAVEL_OUTRO_ITEM'
            // Régua da 548: pagamento ANTERIOR ao pedido (COM data) e valor distante = o
            // mesmo processo pagou OUTRO item — não conta como "este pedido pago".
            ? <Tag value={`Histórico ${fmtBRL(r.empenho548.pago)}`} severity="secondary" icon="pi pi-history"
                title="Este CNJ tem pagamento no Estado com data ANTERIOR ao pedido e valor distante do orçado — provavelmente OUTRO item do mesmo processo. Não é sinal de baixa." />
            : <Tag value={`PAGO ${fmtBRL(r.empenho548.pago)}`} severity="success" icon="pi pi-check-circle"
                title={`O Estado PAGOU ${r.empenho548.nEmpenhos} empenho(s) neste CNJ (${r.empenho548.sinal === 'PAGO_APOS_O_PEDIDO' ? 'depois do pedido — candidato a baixa' : 'valor compatível com o orçado — conferir'}). Valor do EMPENHO, não do prestador.`} />)
          : <Tag value="Empenhado" severity="info" icon="pi pi-wallet"
              title="Há empenho no Estado para este CNJ, ainda sem pagamento registrado." />)
        : <span title="Nenhum empenho localizado para este CNJ na base do Estado (548).">—</span>)} />
  );
}

export function colunaPagoEm() {
  return (
    <Column key="ultimoPagamento" field="empenho548.ultimoPagamento" header="Pago em" sortable style={{ minWidth: '9rem' }}
      sortFunction={(e: any) => {
        const v = (r: any) => r.empenho548?.ultimoPagamento ?? '';
        return [...e.data].sort((a: any, b: any) => v(a).localeCompare(v(b)) * (e.order ?? 1));
      }}
      body={(r: any) => {
        const dt = r.empenho548?.ultimoPagamento;
        if (!dt) {
          return (r.empenho548?.pago ?? 0) > 0
            ? <span style={{ opacity: 0.6 }} title="O portal registra o valor pago mas não expõe a data deste pagamento">sem data na fonte</span>
            : <span style={{ opacity: 0.5 }}>—</span>;
        }
        const dias = Math.floor((Date.now() - new Date(`${dt}T00:00:00`).getTime()) / 86400000);
        const ehEmpenho = r.empenho548?.ultimoPagamentoTipo === 'empenho';
        return <span title={ehEmpenho
            ? `O portal não expõe a data do pagamento — esta é a data do EMPENHO (o depósito judicial sai junto), há ${dias} dia(s)`
            : `Último pagamento do Estado neste CNJ há ${dias} dia(s)`}>
          {fmtDataBr(dt)} <small style={{ opacity: 0.7 }}>({dias}d{ehEmpenho ? ' · empenho' : ''})</small>
        </span>;
      }} />
  );
}

export function colunaDiferenca() {
  return (
    <Column key="difEmpenho" header="Diferença" sortable field="empenho548.pago" style={{ minWidth: '10rem' }}
      sortFunction={(e: any) => {
        const v = (r: any) => ((r.empenho548?.pago ?? 0) > 0 && (r.valorOrcamento ?? 0) > 0)
          ? r.empenho548.pago - r.valorOrcamento : Number.NEGATIVE_INFINITY;
        return [...e.data].sort((a: any, b: any) => (v(a) - v(b)) * (e.order ?? 1));
      }}
      body={(r: any) => {
        const pago = r.empenho548?.pago ?? 0;
        const orcado = r.valorOrcamento ?? 0;
        if (pago <= 0 || orcado <= 0) return <span style={{ opacity: 0.5 }}>—</span>;
        const dif = pago - orcado;
        const pct = (dif / orcado) * 100;
        const cor = Math.abs(pct) < 0.5 ? '#7c3aed' : dif < 0 ? '#dc2626' : '#0891b2';
        return <span style={{ color: cor, fontVariantNumeric: 'tabular-nums' }}
          title="Pago pelo Estado MENOS o orçamento que enviamos. Valor do empenho, não do prestador.">
          {dif >= 0 ? '+' : ''}{fmtBRL(dif)} <small>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</small>
        </span>;
      }} />
  );
}

/** Agregados p/ indicadores das telas: soma do pago, soma do orçado e contagens. */
export function kpisEmpenho(linhas: any[]) {
  const pagos = linhas.filter((l) => (l.empenho548?.pago ?? 0) > 0);
  // Régua da 548: só sinal FORTE (pago depois do pedido, ou valor compatível)
  // conta como "este pedido pago"; o resto é histórico não atribuível.
  const fortes = pagos.filter((l) => ['PAGO_APOS_O_PEDIDO', 'REVISAR_VALOR_BATE'].includes(l.empenho548.sinal));
  const abertos = linhas.filter((l) => !fortes.includes(l));
  return {
    nPagos: fortes.length,
    somaPago: fortes.reduce((acc, l) => acc + l.empenho548.pago, 0),
    nHistorico: pagos.length - fortes.length,
    nAbertos: abertos.length,
    somaAberto: abertos.reduce((acc, l) => acc + (l.valorOrcamento || 0), 0),
    somaValor: linhas.reduce((acc, l) => acc + (l.valorOrcamento || 0), 0),
    nExatos: pagos.filter(ehExato).length,
  };
}

/** Baixar o orçamento CONSOLIDADO enviado ao Estado (@R 28/08 02:44: "todas
 * temos que ter o orçamento enviado ao estado para baixar"). */
export function colunaBaixarOrcamento() {
  const baixar = async (r: any) => {
    try {
      const { data } = await getOrcamentoConsolidado(r.id);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orcamento_${r.id}_${(r.paciente || '').replace(/\s+/g, '_').slice(0, 30)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Este pedido não tem PDF de orçamento anexado.');
    }
  };
  // 3 estados: PDF anexado (baixar) · cotamos-sem-PDF (baixar tenta mesmo assim)
  // · nunca cotamos ("não enviado" — ausência REAL: 52/52 cotadas têm PDF).
  return (
    <Column key="baixarOrc" header="Orçamento" sortable field="temOrcamentoPdf"
      style={{ minWidth: '8rem' }} bodyStyle={{ textAlign: 'center' }}
      body={(r: any) => (r.temOrcamentoPdf
        ? <Button icon="pi pi-file-pdf" size="small" severity="success"
            tooltip="TEM orçamento anexado — clique para baixar o PDF enviado ao Estado"
            onClick={() => baixar(r)} aria-label="Baixar orçamento" />
        : <Tag value="não enviado" severity="secondary"
            title="Este pedido não tem orçamento anexado — nunca chegou a ser cotado (não é falha de upload: toda cotação tem o PDF)." />)} />
  );
}

export const fmtBRLEmpenho = fmtBRL;
