import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import {
  getResultadosFinanceiros,
  confirmarCirurgia,
  registrarPerdaCirurgia,
  confirmarDesfechoJuridico,
  ROTULO_CONFIRMACAO,
} from '../../services/api/financeiro';
import type { ResultadoFinanceiroPendente, ConfirmacaoJuridica } from '../../services/api/financeiro';

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

/** A linha da fila + o veredito Orç × Pago achatado (ver `carregar`). */
type LinhaVerificar = ResultadoFinanceiroPendente & {
  orcXpago: 'EXATO' | 'NAO_EXATO' | 'SEM_PAGAMENTO';
};

export function AbaVerificar() {
  const [linhas, setLinhas] = useState<LinhaVerificar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroBate, setFiltroBate] = useState<'' | 'EXATO' | 'NAO_EXATO' | 'SEM_PAGAMENTO'>('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await getResultadosFinanceiros();
      // `?? []` de propósito: o campo é OPCIONAL no contrato ("telas antigas seguem
      // sem conhecê-lo"). Backend mais velho que este front devolve a tela vazia,
      // nunca um crash.
      // `orcXpago` é ACHATADO aqui de propósito: filtro sobre campo aninhado
      // (`empenho548.classe`) devolve undefined quando não há empenho, e a opção
      // "sem pagamento" nunca casaria — o filtro pareceria funcionar e esconderia
      // justamente as linhas que ninguém olhou ainda.
      setLinhas(
        (r.data.itensPendentes ?? []).map((l) => ({
          ...l,
          orcXpago: !l.empenho548?.pago
            ? 'SEM_PAGAMENTO'
            : l.empenho548.classe === 'EXATO' ? 'EXATO' : 'NAO_EXATO',
        })),
      );
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a fila de verificação.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

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
    // Fonte C (o Estado pagou, ninguém decidiu) não é "decidido" — contar junto sem
    // dizer daria um "total" verdadeiro e enganoso na nota do card.
    const naoClassificados = filtradas.filter((l) => l.resultado === 'Em aberto').length;
    return { total: filtradas.length, ganhos: ganhos.length, valor, comissao, naoClassificados };
  }, [filtradas]);

  // ── REGISTRAR O QUE ACONTECEU (@R 08/09: ⟦não esqueça dos botões para atualizar as
  // informações em cada área de resultados⟧) ────────────────────────────────────────
  // Sem isto a aba é um relatório: mostra o problema e não deixa resolvê-lo. Com o
  // botão, ela é uma FILA DE TRABALHO — registrar tira o item da lista, e a lista
  // encolhendo é a prova de que o dinheiro está sendo apurado.
  // Reusa as DUAS ações que já existem (`/financeiro/<id>/confirmar/` e `/perda/`) —
  // nenhum endpoint novo. É o mesmo registro que a aba "Aguardando cirurgia" grava.
  const [emRegistro, setEmRegistro] = useState<ResultadoFinanceiroPendente | null>(null);
  const [comissao, setComissao] = useState<number | null>(null);
  const [dataConf, setDataConf] = useState('');
  const [motivoPerda, setMotivoPerda] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const abrirRegistro = (l: ResultadoFinanceiroPendente) => {
    setEmRegistro(l);
    // Pré-preenche com a comissão ESTIMADA — é uma sugestão para conferir, não um
    // valor confirmado; por isso o campo é editável e o rótulo diz "estimada".
    setComissao(Number(l.comissaoEstimada || 0) || null);
    setDataConf(new Date().toISOString().slice(0, 10));
    setMotivoPerda('');
    setErroSalvar(null);
  };

  const gravar = async (tipo: 'realizada' | 'nao-houve') => {
    if (!emRegistro) return;
    setSalvando(true);
    setErroSalvar(null);
    try {
      if (tipo === 'realizada') {
        await confirmarCirurgia(emRegistro.orderId, {
          valorComissao: Number(comissao || 0),
          dataConfirmacao: dataConf,
        });
      } else {
        await registrarPerdaCirurgia(emRegistro.orderId, {
          descCirurgiaPerda: motivoPerda.trim(),
          dataConfirmacao: dataConf,
        });
      }
      setEmRegistro(null);
      await carregar();   // a lista encolhe: a prova de que o registro entrou
    } catch {
      setErroSalvar('Não foi possível gravar. Nada foi alterado — tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  // ── A ÁREA DA ADVOGADA ────────────────────────────────────────────────────────────
  // Diálogo separado do financeiro de propósito: são DUAS perguntas diferentes, feitas
  // por pessoas diferentes. Ela responde "o desfecho é nosso?"; o @R responde "a cirurgia
  // aconteceu e o médico pagou?". Misturar os dois num formulário só faria cada um
  // preencher o campo do outro no chute.
  const [emJuridico, setEmJuridico] = useState<ResultadoFinanceiroPendente | null>(null);
  const [confEscolha, setConfEscolha] = useState<ConfirmacaoJuridica>('NOSSO');
  const [confObs, setConfObs] = useState('');

  const abrirJuridico = (l: ResultadoFinanceiroPendente) => {
    setEmJuridico(l);
    setConfEscolha((l.confirmacaoJuridica as ConfirmacaoJuridica) || 'NOSSO');
    setConfObs(l.confirmacaoJuridicaObs || '');
    setErroSalvar(null);
  };

  const gravarJuridico = async () => {
    if (!emJuridico) return;
    setSalvando(true);
    setErroSalvar(null);
    try {
      await confirmarDesfechoJuridico(emJuridico.orderId, {
        confirmacao: confEscolha,
        observacao: confObs.trim() || undefined,
      });
      setEmJuridico(null);
      await carregar();
    } catch {
      // O backend recusa NAO_NOSSO sem explicação — a mensagem diz por quê.
      setErroSalvar(
        confEscolha === 'NAO_NOSSO' && confObs.trim().length < 10
          ? 'Para marcar que o pagamento não foi nosso, escreva o que aconteceu (mín. 10 caracteres).'
          : 'Não foi possível gravar. Nada foi alterado — tente de novo.',
      );
    } finally {
      setSalvando(false);
    }
  };

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
          <span className="vao-card__nota">
            {resumo.naoClassificados > 0
              ? `${resumo.total - resumo.naoClassificados} decididos · ${resumo.naoClassificados} não classificados (o Estado pagou, ninguém decidiu)`
              : 'decididos aguardando conferência'}
          </span>
        </div>
      </div>

      <div className="aba-verificar__barra">
        {/* Filtro do Orç × Pago como CHIPS, não como dropdown escondido no cabeçalho:
            é por onde a investigação começa (bate exato = indício mais forte), então
            precisa estar visível sem procurar. Cada chip traz a contagem. */}
        <div className="aba-verificar__chips">
          {([
            ['', 'Todos'],
            ['EXATO', 'Bate exato'],
            ['NAO_EXATO', 'Não bate'],
            ['SEM_PAGAMENTO', 'Sem pagamento'],
          ] as const).map(([valor, rotulo]) => {
            const qtd = valor ? linhas.filter((l) => l.orcXpago === valor).length : linhas.length;
            return (
              <button
                type="button"
                key={valor || 'todos'}
                className={`chip-bate ${filtroBate === valor ? 'chip-bate--ativo' : ''} ${valor === 'EXATO' ? 'chip-bate--forte' : ''}`}
                onClick={() => setFiltroBate(valor)}
              >
                {rotulo} <span className="chip-bate__n">{qtd}</span>
              </button>
            );
          })}
        </div>
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
          body={(l: ResultadoFinanceiroPendente) =>
            // "Em aberto" é o que o backend manda para quem não tem Ganho nem Perda — mas
            // aqui isso não quer dizer "o processo ainda corre": quer dizer que o Estado
            // já pagou e NINGUÉM classificou (@R 08/09: "o que está sem ganho ou perda
            // deveria vir como não classificado"). O rótulo diz o que falta fazer.
            l.resultado === 'Em aberto' ? (
              <Tag
                value="Não classificado"
                severity="warning"
                icon="pi pi-question-circle"
                title="O Estado pagou depois do pedido e o desfecho (Ganho/Perda) nunca foi registrado — classificar"
              />
            ) : (
              <Tag value={l.resultado} severity={l.resultado === 'Ganho' ? 'success' : 'danger'} />
            )
          }
        />
        <Column
          field="nomeMedico"
          header="Médico"
          sortable
          style={{ minWidth: '11rem' }}
          body={(l: ResultadoFinanceiroPendente) => l.nomeMedico || '—'}
        />
        {/* A PALAVRA DA ADVOGADA (@R 08/09: "sempre fará") — a coluna que diz se alguém
            que sabe o estado de HOJE já olhou este caso. O banco guarda o que foi escrito
            até aquele dia; o processo continua depois, e essa continuação não está em
            campo nenhum. Foi o que quase custou o ord#182: eu li um acompanhamento antigo
            e ia reclassificar R$ 584.501 como não-nosso — o @R sabia que o nosso médico
            tinha pedido readequação do orçamento, e isso não estava escrito em lugar
            nenhum do sistema. Agora está, com nome e data. */}
        <Column
          field="confirmacaoJuridica"
          header="Jurídico"
          sortable
          style={{ width: '10rem' }}
          body={(l: ResultadoFinanceiroPendente) => {
            const c = l.confirmacaoJuridica;
            if (!c) {
              return (
                <Button
                  label="Confirmar"
                  icon="pi pi-gavel"
                  size="small"
                  text
                  onClick={() => abrirJuridico(l)}
                  tooltip="A advogada ainda não olhou este desfecho"
                />
              );
            }
            const cor = c === 'NOSSO' ? 'success' : c === 'NAO_NOSSO' ? 'danger' : 'warning';
            return (
              <Tag
                value={c === 'NOSSO' ? 'é nosso' : c === 'NAO_NOSSO' ? 'não é nosso' : 'em curso'}
                severity={cor}
                // A observação é o dado que realmente importa — fica no hover para não
                // ocupar coluna, mas nunca some.
                title={`${ROTULO_CONFIRMACAO[c]}${l.confirmacaoJuridicaObs ? ' — ' + l.confirmacaoJuridicaObs : ''}`}
                onClick={() => abrirJuridico(l)}
                style={{ cursor: 'pointer' }}
              />
            );
          }}
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
        {/* ORÇ × PAGO — binário e filtrável (@R 08/09: ⟦quem bate exato tem que ter uma
            coluna com valor binário para sabermos, e podemos filtrar ao lado do valor
            pago⟧). O "bate ao centavo" já vinha como cor no valor; cor não se filtra
            nem se ordena. Como COLUNA, permite isolar em 1 clique os casos em que o
            Estado pagou exatamente o que orçamos — o indício mais forte de que o
            pagamento é do nosso orçamento, e por onde a investigação deve começar. */}
        <Column
          field="orcXpago"
          header="Orç × Pago"
          sortable
          style={{ width: '8.5rem' }}
          body={(l: LinhaVerificar) =>
            l.orcXpago === 'SEM_PAGAMENTO' ? <Tag value="sem pagto" severity="secondary" />
            : l.orcXpago === 'EXATO' ? <Tag value="BATE" severity="success" icon="pi pi-check" />
            : <Tag value="não bate" severity="warning" />
          }
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
        <Column
          header="Registrar"
          frozen
          alignFrozen="right"
          style={{ width: '9rem' }}
          body={(l: ResultadoFinanceiroPendente) => (
            <Button
              label="Registrar"
              icon="pi pi-check-square"
              size="small"
              outlined
              onClick={() => abrirRegistro(l)}
            />
          )}
        />
      </DataTable>

      <Dialog
        header={emJuridico ? `Confirmação jurídica — pedido #${emJuridico.orderId}` : ''}
        visible={!!emJuridico}
        style={{ width: 'min(560px, 94vw)' }}
        modal
        onHide={() => setEmJuridico(null)}
      >
        {emJuridico && (
          <div className="reg-desfecho">
            <p className="reg-desfecho__paciente">
              <strong>{emJuridico.paciente}</strong>
              {emJuridico.nomeMedico ? ` · ${emJuridico.nomeMedico}` : ''}
            </p>
            <p className="reg-desfecho__nota">
              O sistema guarda o que foi escrito <em>até aquele dia</em>. O processo continua
              depois — e só quem acompanha sabe o estado de hoje.
            </p>

            <div className="reg-desfecho__opcoes">
              {(['NOSSO', 'NAO_NOSSO', 'EM_ANDAMENTO'] as ConfirmacaoJuridica[]).map((op) => (
                <button
                  type="button"
                  key={op}
                  className={`opcao-juridica ${confEscolha === op ? 'opcao-juridica--ativa' : ''} opcao-juridica--${op.toLowerCase()}`}
                  onClick={() => setConfEscolha(op)}
                >
                  {ROTULO_CONFIRMACAO[op]}
                </button>
              ))}
            </div>

            <label className="reg-desfecho__campo">
              <span>
                O que aconteceu no processo
                {confEscolha === 'NAO_NOSSO' && <strong> (obrigatório)</strong>}
              </span>
              <InputTextarea
                rows={3}
                value={confObs}
                onChange={(e) => setConfObs(e.target.value)}
                placeholder="ex.: o juiz negou o médico indicado pela paciente e mandou seguir pelo nosso orçamento"
              />
            </label>

            <Button
              label="Registrar confirmação"
              icon="pi pi-check"
              loading={salvando}
              disabled={confEscolha === 'NAO_NOSSO' && confObs.trim().length < 10}
              onClick={gravarJuridico}
            />
            {erroSalvar && <p className="reg-desfecho__erro">{erroSalvar}</p>}
          </div>
        )}
      </Dialog>

      <Dialog
        header={emRegistro ? `Registrar desfecho — pedido #${emRegistro.orderId}` : ''}
        visible={!!emRegistro}
        style={{ width: 'min(560px, 94vw)' }}
        modal
        onHide={() => setEmRegistro(null)}
      >
        {emRegistro && (
          <div className="reg-desfecho">
            <p className="reg-desfecho__paciente">
              <strong>{emRegistro.paciente}</strong>
              {emRegistro.nomeMedico ? ` · ${emRegistro.nomeMedico}` : ''}
            </p>

            {/* Os números na frente de quem decide — para não precisar voltar à
                tabela e decorar. */}
            <div className="reg-desfecho__fatos">
              <span>Orçamos <strong>{MOEDA.format(Number(emRegistro.valorOrcamento || 0))}</strong></span>
              <span>
                Estado pagou{' '}
                <strong>
                  {emRegistro.empenho548?.pago
                    ? MOEDA.format(Number(emRegistro.empenho548.pago))
                    : '—'}
                </strong>
                {emRegistro.empenho548?.ultimoPagamento
                  ? ` em ${emRegistro.empenho548.ultimoPagamento.split('-').reverse().join('/')}`
                  : ''}
              </span>
            </div>

            <label className="reg-desfecho__campo">
              <span>Data</span>
              <InputText type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} />
            </label>

            <div className="reg-desfecho__caminho">
              <h4>A cirurgia foi realizada</h4>
              <label className="reg-desfecho__campo">
                <span>Comissão (estimada — confira antes de gravar)</span>
                <InputNumber
                  value={comissao}
                  onValueChange={(e) => setComissao(e.value ?? null)}
                  mode="currency" currency="BRL" locale="pt-BR"
                />
              </label>
              <Button
                label="Confirmar cirurgia e lançar comissão"
                icon="pi pi-check"
                loading={salvando}
                disabled={!dataConf}
                onClick={() => gravar('realizada')}
              />
            </div>

            <div className="reg-desfecho__caminho reg-desfecho__caminho--perda">
              <h4>Não houve cirurgia</h4>
              <label className="reg-desfecho__campo">
                <span>O que aconteceu (obrigatório)</span>
                <InputTextarea
                  rows={2}
                  value={motivoPerda}
                  onChange={(e) => setMotivoPerda(e.target.value)}
                  placeholder="ex.: paciente desistiu · operou com outro prestador · pagamento era de outra demanda"
                />
              </label>
              <Button
                label="Registrar que não houve cirurgia"
                icon="pi pi-times"
                severity="danger"
                outlined
                loading={salvando}
                /* Motivo é obrigatório de propósito: perda sem razão registrada é
                   exatamente o buraco que nos fez perder o histórico das outras. */
                disabled={!motivoPerda.trim() || !dataConf}
                onClick={() => gravar('nao-houve')}
              />
            </div>

            {erroSalvar && <p className="reg-desfecho__erro">{erroSalvar}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
