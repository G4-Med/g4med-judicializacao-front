import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { cabecalhoComHint } from '../ColunasIdentificacao/colunasIdentificacao';
import './colunasMatch.css';

/**
 * QUEM PRECISAMOS · PAGO PELO ESTADO (@R 24/09 01:13–01:30, tasks #7/#8). A coluna Oportunidade saiu
 * a pedido do @R (24/09 02:2x): ficam Pago pelo Estado e, ao lado, Quem precisamos, nas 2 primeiras.
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

export function colunaQuemPrecisamos(largura = '15rem') {
  return (
    <Column key="col-quem-precisamos" field="match.especialidade" sortable sortField="match.temos"
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
        if (!p) return <span className="ident-vazio" title="Ainda não calculado.">—</span>;
        if (!p.n) return <span className="ident-vazio" title={p.motivo || 'Sem pagamentos públicos para este procedimento.'}>sem pagamentos</span>;
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
