import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import { getResultadosFinanceiros } from '../../services/api/financeiro';
import type { ResultadoFinanceiroPendente } from '../../services/api/financeiro';

/**
 * ABA ② — A VERIFICAR: o dinheiro que é nosso e ninguém conferiu.
 *
 * POR QUE ESTA ABA EXISTE (o buraco medido em 08/09/2026, banco restaurado de produção):
 * a tela "Resultados Financeiros" lê a tabela `Financeiro`. Um processo GANHO que nunca
 * recebeu ficha financeira NÃO EXISTE para ela. Eram 7 ganhos somando R$ 827.885,67
 * (≈ R$ 82,8 mil de comissão a 10%) invisíveis na única tela que deveria mostrá-los.
 *
 * DE ONDE VÊM OS DADOS — e por que NÃO de um endpoint novo:
 * `GET /financeiro/resultados/` já devolve `itensPendentes` desde a FASE 1, com
 * `statusConferencia`, `acaoSugerida` e `motivoConferencia` prontos. O campo era
 * ÓRFÃO: definido no service, entregue pelo backend, renderizado por NINGUÉM
 * (`rg "itensPendentes" pages/` → 0 matches em 08/09). Esta aba é o consumidor que
 * faltava — não construção nova. A mesma chamada alimenta a aba ③.
 *
 * A REGRA QUE ESTA TELA NÃO PODE QUEBRAR (herdada do contrato do backend):
 * `itensPendentes` NÃO se mistura com `itens`. Um pendente não tem id de Financeiro
 * (só `orderId`) nem `statusCirurgia` — jogá-lo na tabela de `itens` mostraria todo
 * ganho como "Perda" (null é falsy) e o Ver Detalhes cairia em 404.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Cor por urgência de conferência — semântica, ¬decoração. */
function severidadeConferencia(status: string): 'danger' | 'warning' | 'info' | 'success' {
  const s = (status || '').toLowerCase();
  if (s.includes('cobr') || s.includes('receb')) return 'danger';
  if (s.includes('conferir') || s.includes('verific')) return 'warning';
  if (s.includes('ok') || s.includes('confirm')) return 'success';
  return 'info';
}

export function AbaVerificar() {
  const [linhas, setLinhas] = useState<ResultadoFinanceiroPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    getResultadosFinanceiros()
      .then((r) => {
        if (!vivo) return;
        // `?? []` de propósito: o campo é OPCIONAL no contrato ("telas antigas seguem
        // sem conhecê-lo"). Backend mais velho que este front devolve a tela vazia,
        // nunca um crash.
        setLinhas(r.data.itensPendentes ?? []);
      })
      .catch(() => { if (vivo) setErro('Não foi possível carregar a fila de verificação.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((l) =>
      [l.paciente, l.nprocesso, l.acaoSugerida, l.statusConferenciaRotulo]
        .some((c) => (c || '').toLowerCase().includes(q)));
  }, [linhas, busca]);

  // O VÃO — separado por desfecho de propósito. Somar ganho com perda dá um número
  // verdadeiro e inútil ("53 casos"); o que importa é quanto disso é NOSSO.
  const resumo = useMemo(() => {
    const ganhos = filtradas.filter((l) => l.resultado === 'Ganho');
    const valor = ganhos.reduce((s, l) => s + Number(l.valorGanho || 0), 0);
    // `comissaoEstimada`, NUNCA `valorComissao`. O segundo é o que foi LANÇADO — e num
    // caso sem ficha ele vale 0 por definição, então o card mostraria R$ 0,00 e mentiria
    // dizendo que não há nada a apurar. Achado na prova de 08/09: 7 ganhos, R$ 827.885,67,
    // `valorComissao` zerado nos 7.
    const comissao = ganhos.reduce((s, l) => s + Number(l.comissaoEstimada || 0), 0);
    return { total: filtradas.length, ganhos: ganhos.length, valor, comissao };
  }, [filtradas]);

  if (erro) return <div className="aba-verificar__erro">{erro}</div>;

  return (
    <div className="aba-verificar">
      <div className="aba-verificar__vao">
        <div className="vao-card vao-card--alerta">
          <span className="vao-card__rotulo">Ganhos sem ficha financeira</span>
          <strong className="vao-card__valor">{resumo.ganhos}</strong>
          <span className="vao-card__nota">{MOEDA.format(resumo.valor)} em causas ganhas</span>
        </div>
        <div className="vao-card">
          <span className="vao-card__rotulo">Comissão a apurar</span>
          <strong className="vao-card__valor">{MOEDA.format(resumo.comissao)}</strong>
          <span className="vao-card__nota">estimativa pelo take rate do médico — não é cobrança</span>
        </div>
        <div className="vao-card">
          <span className="vao-card__rotulo">Total na fila</span>
          <strong className="vao-card__valor">{resumo.total}</strong>
          <span className="vao-card__nota">decididos aguardando conferência</span>
        </div>
      </div>

      <div className="aba-verificar__barra">
        <span className="p-input-icon-left">
          <i className="pi pi-search" />
          <InputText
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Paciente, processo ou ação sugerida"
          />
        </span>
      </div>

      <DataTable
        value={filtradas}
        loading={carregando}
        dataKey="orderId"
        paginator
        rows={20}
        rowsPerPageOptions={[20, 50, 100]}
        emptyMessage="Nada a verificar — todo caso decidido já tem ficha financeira."
        sortField="valorGanho"
        sortOrder={-1}
        stripedRows
      >
        <Column field="orderId" header="Pedido" sortable style={{ width: '6rem' }} />
        <Column field="paciente" header="Paciente" sortable />
        <Column
          field="resultado"
          header="Desfecho"
          sortable
          style={{ width: '8rem' }}
          body={(l: ResultadoFinanceiroPendente) => (
            <Tag
              value={l.resultado}
              severity={l.resultado === 'Ganho' ? 'success' : l.resultado === 'Perda' ? 'danger' : 'info'}
            />
          )}
        />
        <Column
          field="nomeMedico"
          header="Médico"
          sortable
          style={{ minWidth: '11rem' }}
          body={(l: ResultadoFinanceiroPendente) => l.nomeMedico || '—'}
        />
        <Column
          field="valorOrcamento"
          header="Orçamos"
          sortable
          style={{ width: '9.5rem', textAlign: 'right' }}
          body={(l) => (Number(l.valorOrcamento) ? MOEDA.format(Number(l.valorOrcamento)) : '—')}
        />
        {/* AS DUAS COLUNAS QUE RESPONDEM "o que aconteceu com este": quanto o Estado
            pagou e QUANDO. Nenhuma delas sozinha decide — valor igual ao orçamento é
            forte indício, mas o dinheiro pode ter ido para outro prestador; data
            anterior ao pedido derruba a hipótese inteira. Por isso as duas ficam lado
            a lado, e o sinal explica a leitura. */}
        <Column
          field="empenho548.pago"
          header="Estado pagou"
          sortable
          style={{ width: '10rem', textAlign: 'right' }}
          body={(l: ResultadoFinanceiroPendente) => {
            const pago = Number(l.empenho548?.pago || 0);
            if (!pago) return <span className="sem-dado">—</span>;
            const orcado = Number(l.valorOrcamento || 0);
            // "bate ao centavo" é o sinal mais forte que temos de que o pagamento é do
            // NOSSO orçamento — merece destaque visual, sem virar afirmação de certeza.
            const exato = l.empenho548?.classe === 'EXATO';
            return (
              <span className={exato ? 'valor-bate' : undefined}
                    title={exato && orcado ? 'Valor idêntico ao que orçamos' : undefined}>
                {MOEDA.format(pago)}{exato ? ' ✓' : ''}
              </span>
            );
          }}
        />
        <Column
          field="empenho548.ultimoPagamento"
          header="Pago em"
          sortable
          style={{ width: '9rem' }}
          body={(l: ResultadoFinanceiroPendente) => {
            const d = l.empenho548?.ultimoPagamento;
            if (!d) return <span className="sem-dado">—</span>;
            const data = d.split('-').reverse().join('/');
            // Quando o portal não expõe a data do pagamento, o que se mostra é a do
            // EMPENHO. Dizer isso é obrigatório: senão a tela vende uma data como
            // sendo de pagamento quando ela é de outra coisa.
            return l.empenho548?.ultimoPagamentoTipo === 'empenho'
              ? <span title="Data do EMPENHO — o portal não expôs a data do pagamento">{data} <em>(emp.)</em></span>
              : <span>{data}</span>;
          }}
        />
        <Column
          field="comissaoEstimada"
          header="Comissão"
          sortable
          style={{ width: '9rem', textAlign: 'right' }}
          body={(l) => (Number(l.comissaoEstimada) ? MOEDA.format(Number(l.comissaoEstimada)) : '—')}
        />
        <Column
          field="statusConferenciaRotulo"
          header="Situação"
          sortable
          body={(l: ResultadoFinanceiroPendente) => (
            <Tag
              value={l.statusConferenciaRotulo || l.statusConferencia}
              severity={severidadeConferencia(l.statusConferencia)}
            />
          )}
        />
        {/* A coluna que transforma lista em trabalho: sem "o que fazer", a fila é
            um relatório que ninguém aciona. */}
        <Column
          field="acaoSugerida"
          header="O que fazer"
          body={(l: ResultadoFinanceiroPendente) => (
            <span title={l.motivoConferencia || ''}>{l.acaoSugerida || '—'}</span>
          )}
        />
        <Column field="nprocesso" header="Processo" style={{ width: '13rem' }} body={(l) => l.nprocesso || '—'} />
      </DataTable>
    </div>
  );
}
