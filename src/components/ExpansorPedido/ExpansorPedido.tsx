import { Tag } from 'primereact/tag';
import { PainelPrecos } from '../PainelPrecos/PainelPrecos';
import { PacoteExamesCotacao } from '../PacoteExames/PacoteExamesCotacao';

/**
 * O que abre ABAIXO de cada pedido, em QUALQUER fase (@R 28/08 03:37: "colocar
 * esse hover embaixo de cada tabela de cada pedido para sabermos e entendermos
 * cada um corretamente").
 *
 * Três blocos, na ordem em que a decisão acontece:
 *  1. PREÇO — quanto o Estado paga por este procedimento (histórico) + nossos
 *     envios e a concorrência. É o que decide se vale cotar e por quanto.
 *  2. PAGAMENTO DESTE CNJ — empenhos com nº de referência e data (base 548).
 *     Régua da 548: valor do EMPENHO (favorecido = Tribunal), nunca repasse.
 *  3. MÉDICO E ANEXOS — quem cotou e o que dá para baixar, quando a fase tem.
 *
 * Cada bloco só aparece se a linha traz o dado — fase sem médico não mostra
 * caixa vazia. Uma fonte só para as 8 telas: mudou aqui, mudou em todas.
 */

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDataBr = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const NOMES_TIPO_ANEXO: Record<string, string> = {
  ORCAMENTO: 'Orçamento', EMAIL_ORIGINAL: 'E-mail original', PROCESSO: 'Processo',
  RELATORIO: 'Relatório', PROTOCOLO: 'Protocolo', ACOMPANHAMENTO: 'Acompanhamento',
  DECISAO_INTEIRO_TEOR: 'Decisão — inteiro teor', OUTRO: 'Outro',
};

export function ExpansorPedido({ linha }: { linha: any }) {
  const r = linha ?? {};
  const empenhos: any[] = r.empenhos ?? [];
  const anexos: any[] = r.anexos ?? [];
  const orcamentos = anexos.filter((a) => a.tipo === 'ORCAMENTO');
  const demais = anexos.filter((a) => a.tipo !== 'ORCAMENTO');
  const nossoPreco = r.valorOrcamento || r.refPreco || null;

  return (
    <div style={{ padding: '10px 20px', display: 'grid', gap: '14px' }}>
      {/* 1. Preço do procedimento — o mesmo painel da Análise Jurídica */}
      {r.procedimento && (
        <PainelPrecos orderId={r.id} procedimento={r.procedimento} nossoPreco={nossoPreco} />
      )}

      {/* 2. Exames do processo + cotação ao médico (task #249) — carrega ao clique */}
      {r.id && <PacoteExamesCotacao orderId={r.id} />}

      {/* 3. Pagamento DESTE processo */}
      <div>
        <h4 style={{ margin: '0 0 6px' }}>
          <i className="pi pi-wallet" /> Pagamentos do Estado neste CNJ (base 548)
        </h4>
        {empenhos.length === 0 ? (
          <p style={{ opacity: 0.6, margin: 0, fontSize: '0.85rem' }}>
            Nenhum empenho localizado para este CNJ.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', opacity: 0.75 }}>
                    <th style={{ padding: '3px 8px' }}>Nº referência</th>
                    <th style={{ padding: '3px 8px' }}>Data empenho</th>
                    <th style={{ padding: '3px 8px' }}>Data pagamento</th>
                    <th style={{ padding: '3px 8px', textAlign: 'right' }}>Empenhado</th>
                    <th style={{ padding: '3px 8px', textAlign: 'right' }}>Pago</th>
                    <th style={{ padding: '3px 8px' }}>Favorecido</th>
                  </tr>
                </thead>
                <tbody>
                  {empenhos.map((e, i) => (
                    <tr key={`${e.numEmpenho}-${e.ano}-${i}`}
                        style={{ borderTop: '1px solid var(--surface-border, #e2e8f0)' }}>
                      <td style={{ padding: '3px 8px', fontFamily: 'monospace' }}>
                        {e.numEmpenho}/{e.ano ?? '—'}
                      </td>
                      <td style={{ padding: '3px 8px' }}>{fmtDataBr(e.dataEmpenho)}</td>
                      <td style={{ padding: '3px 8px' }}>
                        {e.dataPagamento
                          ? <Tag value={fmtDataBr(e.dataPagamento)} severity="success" />
                          : <Tag value="Não pago" severity="warning" />}
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.valorEmpenhado ? fmtBRL(e.valorEmpenhado) : '—'}
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.valorPago ? fmtBRL(e.valorPago) : '—'}
                      </td>
                      <td style={{ padding: '3px 8px', fontSize: '0.8em' }}>{e.favorecido ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.78rem', opacity: 0.7, margin: '6px 0 0' }}>
              ⚠ Valor do EMPENHO do Estado (o favorecido costuma ser o Tribunal — depósito
              judicial), não o que o prestador recebeu. Sinal para investigar o desfecho,
              nunca valor de repasse.
            </p>
          </>
        )}
      </div>

      {/* 3. Médico e anexos — só onde a fase já tem */}
      {(r.medico || anexos.length > 0) && (
        <div style={{ display: 'grid', gap: '14px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div>
            <h4 style={{ margin: '0 0 6px' }}><i className="pi pi-user" /> Médico e orçamento</h4>
            <p style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>
              <strong>{r.medico ?? 'Sem médico designado'}</strong>
              {r.valorOrcamento ? <> · enviado {fmtBRL(r.valorOrcamento)}</> : null}
            </p>
            {orcamentos.length === 0
              ? <p style={{ opacity: 0.6, margin: 0, fontSize: '0.85rem' }}>Nenhum PDF de orçamento anexado.</p>
              : orcamentos.map((a) => (
                <p key={a.id} style={{ margin: '2px 0', fontSize: '0.85rem' }}>
                  <a href={a.link} target="_blank" rel="noreferrer">
                    <i className="pi pi-download" /> Baixar orçamento ({fmtDataBr(a.data)})
                  </a>
                </p>
              ))}
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}><i className="pi pi-paperclip" /> E-mail e anexos</h4>
            {demais.length === 0
              ? <p style={{ opacity: 0.6, margin: 0, fontSize: '0.85rem' }}>Sem outros anexos.</p>
              : demais.map((a) => (
                <p key={a.id} style={{ margin: '2px 0', fontSize: '0.85rem' }}>
                  <a href={a.link} target="_blank" rel="noreferrer">
                    <i className="pi pi-file" /> {NOMES_TIPO_ANEXO[a.tipo] ?? a.tipo} ({fmtDataBr(a.data)})
                  </a>
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
