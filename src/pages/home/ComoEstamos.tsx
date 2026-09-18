import { useMemo, useState } from 'react';
import './ComoEstamos.css';

/**
 * COMO ESTAMOS — três lentes sobre a mesma base (@R 17/09/2026).
 *
 * ⟦"eu teria uma visão do mês comparando com o mês do ano passado, e com o mês anterior;
 * preciso ter uma visão do ano, com os dados do ano; e preciso ter uma visão vida toda"⟧.
 *
 * ═══ A DECISÃO QUE IMPEDE ESTE PAINEL DE MENTIR: O MÊS CORRENTE ESTÁ PELA METADE ═══
 *
 * Hoje é dia 17. Setembro tem 33 pedidos; setembro do ano passado teve 66. Mostrar
 * "-50%" seria comparar meio mês com um mês inteiro e chamar de queda — o erro é
 * invisível porque o número é verdadeiro, só responde outra pergunta.
 *
 * Por isso toda comparação de mês é PRÓ-RATA: conta até o mesmo DIA nos dois lados
 * (1→17 de setembro de 2026 contra 1→17 de setembro de 2025). O rodapé diz isso em
 * palavras, porque quem lê precisa saber o que está sendo comparado sem abrir o código.
 * Mesma régua no ano: 2026 até hoje contra 2025 até a mesma data.
 *
 * ═══ POR QUE NÃO HÁ "META" NEM SETA VERDE/VERMELHA DE SUCESSO ═══
 *
 * Mais pedidos não é necessariamente melhor (depende de quantos viram ganho), e menos
 * não é necessariamente pior. A cor aqui diz DIREÇÃO (subiu/desceu), não JUÍZO — quem
 * julga é quem conhece o contexto do mês.
 *
 * A carga histórica (Histórico - Base Antiga / Sem Rastro, 566 de 1.158 em 17/09) entra
 * nas contagens por data porque ELA TEM data de pedido real e representa demanda que
 * existiu. O que ela não pode fazer é aparecer como trabalho em aberto — isso já foi
 * separado no painel de cima.
 */

type Linha = {
  dataPedido?: string | null;
  dataStatusOrcamento?: string | null;
  dataStatusPerda?: string | null;
  refPreco?: number | string | null;
  /** quando o ganho aconteceu — ¬quando o pedido entrou (ver `medir`) */
  dataResultado?: string | null;
  statusProcesso?: string | null;
  valorOrcamento?: number | string | null;
  valorGanho?: number | string | null;
};

type Lente = 'mes' | 'ano' | 'vida' | 'serie';

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};
const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const noPeriodo = (iso: string | null | undefined, dentro: (d: Date) => boolean) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && dentro(d);
};

/** Um recorte medido: quantos ENTRARAM e quantos GANHARAM — por datas diferentes.
 *
 *  ACHADO QUE MUDOU ESTE CÓDIGO (medido em produção, 17/09): eu contava o ganho pela
 *  data em que o pedido ENTROU. Resultado: "ganhos em setembro/2026" dava 0, e daria 0
 *  em quase todo mês — porque um pedido que entra hoje só vira ganho meses depois. O
 *  card ficaria eternamente zerado e alguém concluiria que não ganhamos nada.
 *
 *  Ganho tem data própria (`dataResultado`, preenchida em 19 de 19 casos). Pedido conta
 *  por `dataPedido`, ganho conta por `dataResultado` — são eventos diferentes e cada um
 *  pertence ao mês em que aconteceu.
 *
 *  A CONSEQUÊNCIA HONESTA: a taxa "ganhos ÷ pedidos do período" deixa de ser uma
 *  conversão de coorte (não são as mesmas pedidos), então ela sai do card. Fingir
 *  conversão cruzando dois períodos diferentes é o erro clássico — e o mais difícil de
 *  perceber depois, porque o número parece razoável. */
function medir(linhas: Linha[], dentro: (d: Date) => boolean, vidaToda = false) {
  const entraram = linhas.filter((l) => noPeriodo(l.dataPedido, dentro));
  const ganhos = linhas.filter(
    (l) => l.statusProcesso === 'Ganho' && noPeriodo(l.dataResultado, dentro));

  /* DINHEIRO — três eventos, três datas (@R 18/09: "valor em oportunidades recebidas,
     valor enviado em orçamento, valor perdido, e a média do valor da oportunidade").

     ⚠ O ACHADO QUE MUDOU ESTE CÓDIGO: 308 dos 603 orçamentos (51%) NÃO têm
     `dataStatusOrcamento` preenchida. Filtrar por data do evento na lente VIDA TODA
     esconderia R$ 21,6 milhões — o total cairia de R$ 46,5 mi para R$ 24,9 mi sem
     ninguém perceber, porque o número menor também parece plausível.
     Por isso: nas lentes de período, filtra pela data do evento (é o que "neste mês"
     significa); em VIDA TODA, não filtra — vida toda é tudo, e exigir uma data que
     metade dos registros não tem transformaria a lente mais ampla na mais cega. */
  const recebidos = entraram.filter((l) => num(l.refPreco) > 0);
  const enviados = linhas.filter((l) => num(l.valorOrcamento) > 0
    && (vidaToda || noPeriodo(l.dataStatusOrcamento, dentro)));
  const perdidos = linhas.filter((l) => l.statusProcesso === 'Perda' && num(l.valorOrcamento) > 0
    && (vidaToda || noPeriodo(l.dataStatusPerda, dentro)));

  const soma = (lista: Linha[], campo: (l: Linha) => number) =>
    lista.reduce((a, l) => a + campo(l), 0);
  const valorRecebido = soma(recebidos, (l) => num(l.refPreco));

  /* A COORTE — "o valor em setembro tem que contabilizar só os processos ENTRADOS em
     setembro" (@R 18/09). Aqui a pergunta muda: não é "o que aconteceu no mês", é "o que
     foi feito de quem chegou no mês". Os mesmos pedidos do começo ao fim.

     ⚠ A TERCEIRA SAÍDA É OBRIGATÓRIA. Medido em 18/09: dos 33 que entraram em setembro,
     3 foram orçados, 0 ganharam, 3 perderam — e 30 AINDA NÃO FORAM DECIDIDOS. Sem
     mostrar os 30, setembro parece um desastre; com eles, aparece o que é: cedo demais
     para julgar. Em 2025 o efeito é o mesmo em escala: 579 entraram, 481 seguem abertos.
     É a mesma razão por que a tela de Funil mostra três saídas em vez de duas. */
  const coorteGanho = entraram.filter((l) => l.statusProcesso === 'Ganho');
  const coortePerda = entraram.filter((l) => l.statusProcesso === 'Perda');
  const coorteAberto = entraram.filter(
    (l) => l.statusProcesso !== 'Ganho' && l.statusProcesso !== 'Perda');
  const valorDe = (l: Linha) => num(l.valorOrcamento) || num(l.refPreco);

  return {
    pedidos: entraram.length,
    ganhos: ganhos.length,
    coorte: {
      ganho: { n: coorteGanho.length, valor: coorteGanho.reduce((a, l) => a + (num(l.valorGanho) || valorDe(l)), 0) },
      perda: { n: coortePerda.length, valor: coortePerda.reduce((a, l) => a + valorDe(l), 0) },
      aberto: { n: coorteAberto.length, valor: coorteAberto.reduce((a, l) => a + valorDe(l), 0) },
    },
    valorGanho: ganhos.reduce((a, l) => a + (num(l.valorGanho) || num(l.valorOrcamento)), 0),
    valorRecebido,
    // o denominador é quem TEM referência, ¬todos os pedidos: dividir por quem não tem
    // preço rebaixaria a média por ausência de dado, ¬por oportunidade menor
    nComReferencia: recebidos.length,
    mediaOportunidade: recebidos.length ? valorRecebido / recebidos.length : 0,
    valorEnviado: soma(enviados, (l) => num(l.valorOrcamento)),
    nEnviados: enviados.length,
    // o que NUNCA aparece numa soma por mês, porque não tem data de envio — declarado
    // para que "soma dos meses + isto = total" feche (@R 18/09: "tem que somar, senão
    // não batem"). Medido: R$ 21.658.350 em 308 orçamentos.
    enviadoSemData: soma(
      linhas.filter((l) => num(l.valorOrcamento) > 0 && !l.dataStatusOrcamento),
      (l) => num(l.valorOrcamento)),
    nEnviadoSemData: linhas.filter((l) => num(l.valorOrcamento) > 0 && !l.dataStatusOrcamento).length,
    valorPerdido: soma(perdidos, (l) => num(l.valorOrcamento)),
    nPerdidos: perdidos.length,
  };
}

const variacao = (agora: number, antes: number): number | null =>
  antes > 0 ? Math.round(((agora - antes) / antes) * 100) : null;

function Comparacao({ rotulo, atual, base }: { rotulo: string; atual: number; base: number }) {
  const v = variacao(atual, base);
  return (
    <span className="ce-comp">
      <span className="ce-comp__rotulo">{rotulo}</span>
      <strong>{base}</strong>
      {v !== null && (
        <span className={`ce-comp__delta ${v > 0 ? 'ce-sobe' : v < 0 ? 'ce-desce' : ''}`}>
          {v > 0 ? '+' : ''}{v}%
        </span>
      )}
    </span>
  );
}

/** Uma linha por mês, cada evento no mês em que aconteceu (@R 18/09: "temos que ver a
 *  visão dos meses, consolidado para não misturar meses").
 *
 *  POR QUE A SÉRIE RESOLVE O QUE O TOTAL ESCONDE: no painel de cima, uma perda de
 *  setembro vinha de um pedido que entrou em abril, e os dois números apareciam lado a
 *  lado como se falassem do mesmo trabalho. Aqui cada mês é uma linha fechada: dá para
 *  ver o RITMO (isto sobe? aquilo caiu?) sem ninguém precisar subtrair coisas que não se
 *  subtraem.
 *
 *  ⚠ O QUE A SÉRIE REVELOU, E QUE O TOTAL NUNCA MOSTRARIA (medido 18/09): abril/2026 tem
 *  R$ 16,4 milhões em "enviado" — 6× qualquer outro mês. Não foi um mês excepcional: são
 *  92 orçamentos digitados em 17/04 e 60 em 16/04, logo depois de o sistema nascer
 *  (primeiro registro 09/04). É a carga inicial, e ela não está marcada como histórico —
 *  por isso a tela MARCA o mês em vez de escondê-lo. Apagar seria decidir sozinho o que
 *  é operação e o que é digitação; marcar deixa quem sabe decidir.
 */
const MES_DE_CARGA = '2026-04';

function SerieMensal({ linhas, moeda }: { linhas: Linha[]; moeda: (v: number) => string }) {
  const meses = new Map<string, { rec: number; env: number; per: number; gan: number; n: number }>();
  const zero = () => ({ rec: 0, env: 0, per: 0, gan: 0, n: 0 });
  const chave = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const por = (iso: string | null | undefined, campo: 'rec' | 'env' | 'per' | 'gan', v: number) => {
    const k = chave(iso);
    if (!k || !v) return;
    if (!meses.has(k)) meses.set(k, zero());
    meses.get(k)![campo] += v;
  };

  /* CONTAR O PEDIDO É SEPARADO DE SOMAR O VALOR (@R 18/09: "tá faltando pedidos, a base
     de processos tem 1156 uai").
     Estava errado: a contagem vinha junto da soma do valor, então um pedido SEM valor de
     referência não era contado como pedido. Resultado: a coluna Pedidos somava 716 (os
     que têm refPreco) quando a base tem 1.158 — 442 pedidos existiam e não apareciam em
     lugar nenhum. Pedido sem preço continua sendo um pedido; o que falta nele é o preço. */
  const contar = (iso: string | null | undefined) => {
    const k = chave(iso);
    if (!k) return;
    if (!meses.has(k)) meses.set(k, zero());
    meses.get(k)!.n += 1;
  };

  for (const l of linhas) {
    contar(l.dataPedido);
    por(l.dataPedido, 'rec', num(l.refPreco));
    por(l.dataStatusOrcamento, 'env', num(l.valorOrcamento));
    if (l.statusProcesso === 'Perda') por(l.dataStatusPerda, 'per', num(l.valorOrcamento));
    if (l.statusProcesso === 'Ganho') por(l.dataResultado, 'gan', num(l.valorGanho) || num(l.valorOrcamento));
  }

  const ordenados = [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 18);

  // soma de TODOS os meses (¬só dos 18 exibidos — o total não pode depender de quantas
  // linhas cabem na tela)
  const totais = [...meses.values()].reduce(
    (a, m) => ({ rec: a.rec + m.rec, env: a.env + m.env, per: a.per + m.per,
                 gan: a.gan + m.gan, n: a.n + m.n }),
    { rec: 0, env: 0, per: 0, gan: 0, n: 0 });

  const semDataLinhas = linhas.filter((l) => num(l.valorOrcamento) > 0 && !l.dataStatusOrcamento);
  const semData = {
    env: semDataLinhas.reduce((a, l) => a + num(l.valorOrcamento), 0),
    nEnv: semDataLinhas.length,
  };
  const rotulo = (k: string) => {
    const [ano, mes] = k.split('-');
    return new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  };

  return (
    <div className="ce-serie">
      <table>
        <thead>
          <tr>
            <th>Mês</th><th>Pedidos</th><th>Recebido</th><th>Enviado</th>
            <th title="Enviado ÷ recebido no mesmo mês. Pode passar de 100%: o orçamento enviado em setembro costuma ser de pedido que entrou antes — não é a mesma coorte.">Taxa envio</th>
            <th>Perdido</th><th>Ganho</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map(([k, m]) => (
            <tr key={k} className={k === MES_DE_CARGA ? 'ce-serie__carga' : ''}>
              <td>
                {rotulo(k)}
                {k === MES_DE_CARGA && (
                  <span className="ce-serie__aviso"
                    title="152 orçamentos foram digitados em 16 e 17/04, logo após o sistema nascer (09/04). É a carga inicial — trabalho de meses anteriores lançado de uma vez, ¬um mês excepcional.">
                    {' '}⚠ carga inicial
                  </span>
                )}
              </td>
              <td className="ce-num">{m.n || '—'}</td>
              <td className="ce-num">{m.rec ? moeda(m.rec) : '—'}</td>
              <td className="ce-num">{m.env ? moeda(m.env) : '—'}</td>
              {/* @R 18/09: "a taxa de orçamento enviado". Enviado ÷ recebido no MESMO
                  mês — e por isso pode passar de 100%: o que se orça em setembro entrou
                  meses antes. O título da coluna diz isso, porque um 630% sem explicação
                  parece erro de conta. */}
              <td className="ce-num">
                {m.rec && m.env ? `${Math.round((m.env / m.rec) * 100)}%` : '—'}
              </td>
              <td className="ce-num ce-perda">{m.per ? moeda(m.per) : '—'}</td>
              <td className="ce-num ce-ganho">{m.gan ? moeda(m.gan) : '—'}</td>
            </tr>
          ))}
        </tbody>
        {/* O TOTAL FECHA COM OS INDICADORES (@R 18/09: "tem que somar a base toda e
            verificar para o número bater com os números exibidos nos indicadores").
            Sem esta linha, quem somasse a tabela na mão chegaria a um número diferente
            do painel e não saberia qual dos dois está errado — a resposta é "nenhum,
            são réguas diferentes", e isso precisa estar VISÍVEL, ¬explicado em nota.
            A linha "sem data" é o que existe mas não cabe em mês nenhum: soma dos meses
            + sem data = total. */}
        <tfoot>
          {semData.env > 0 && (
            <tr className="ce-serie__semdata">
              <td>
                sem data do evento
                <span className="ce-serie__aviso"
                  title="Orçamentos sem data de envio preenchida. Existem e valem, mas não pertencem a mês nenhum — por isso aparecem aqui, e não somem.">
                  {' '}⚠ {semData.nEnv} orçamento{semData.nEnv === 1 ? '' : 's'}
                </span>
              </td>
              <td className="ce-num">—</td>
              <td className="ce-num">—</td>
              <td className="ce-num">{moeda(semData.env)}</td>
              <td className="ce-num">—</td>
              <td className="ce-num">—</td>
              <td className="ce-num">—</td>
            </tr>
          )}
          <tr className="ce-serie__total">
            <td>TOTAL (vida toda)</td>
            <td className="ce-num">{totais.n}</td>
            <td className="ce-num">{moeda(totais.rec)}</td>
            <td className="ce-num">{moeda(totais.env + semData.env)}</td>
            <td className="ce-num">
              {totais.rec ? `${Math.round(((totais.env + semData.env) / totais.rec) * 100)}%` : '—'}
            </td>
            <td className="ce-num ce-perda">{moeda(totais.per)}</td>
            <td className="ce-num ce-ganho">{moeda(totais.gan)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="ce__regua">
        Cada valor no mês do SEU evento: pedido pela entrada, orçamento pelo envio, perda e
        ganho pela data em que foram decididos. Uma linha não é uma coorte — o que foi perdido
        em setembro entrou meses antes. Para seguir o destino de quem entrou num mês
        específico, é outra conta (coorte), e ela ainda não existe aqui.
      </p>
    </div>
  );
}

export function ComoEstamos({ linhas }: { linhas: Linha[] }) {
  const [lente, setLente] = useState<Lente>('mes');
  const hoje = new Date();

  const dados = useMemo(() => {
    const dia = hoje.getDate();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();

    // pró-rata: os dois lados param no mesmo dia do mês
    const mesAtual = medir(linhas, (d) =>
      d.getFullYear() === ano && d.getMonth() === mes && d.getDate() <= dia);
    const anteriorRef = new Date(ano, mes - 1, 1);
    const mesAnterior = medir(linhas, (d) =>
      d.getFullYear() === anteriorRef.getFullYear() && d.getMonth() === anteriorRef.getMonth()
      && d.getDate() <= dia);
    const mesAnoPassado = medir(linhas, (d) =>
      d.getFullYear() === ano - 1 && d.getMonth() === mes && d.getDate() <= dia);

    const corte = new Date(ano, mes, dia, 23, 59, 59);
    const anoAtual = medir(linhas, (d) => d.getFullYear() === ano && d <= corte);
    const anoPassado = medir(linhas, (d) =>
      d.getFullYear() === ano - 1 && d <= new Date(ano - 1, mes, dia, 23, 59, 59));

    const vida = medir(linhas, () => true, true);
    return { mesAtual, mesAnterior, mesAnoPassado, anoAtual, anoPassado, vida, dia, ano };
  }, [linhas, hoje.getDate(), hoje.getMonth(), hoje.getFullYear()]);

  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const foco = lente === 'mes' ? dados.mesAtual : lente === 'ano' ? dados.anoAtual : dados.vida;

  return (
    <section className="ce">
      <header className="ce__topo">
        <h2>Como estamos</h2>
        <div className="ce__lentes" role="tablist">
          {([['mes', `${nomeMes} (até dia ${dados.dia})`], ['ano', `${dados.ano}`], ['vida', 'Vida toda'], ['serie', 'Mês a mês']] as const)
            .map(([chave, rotulo]) => (
              <button key={chave} type="button" role="tab" aria-selected={lente === chave}
                className={`ce__lente ${lente === chave ? 'is-ativa' : ''}`}
                onClick={() => setLente(chave as Lente)}>{rotulo}</button>
            ))}
        </div>
      </header>

      {lente === 'serie' ? <SerieMensal linhas={linhas} moeda={moeda} /> : (
      <>
      <div className="ce__grade">
        <div className="ce__card">
          <span className="ce__rotulo">Pedidos recebidos</span>
          <strong className="ce__valor">{foco.pedidos}</strong>
          {lente === 'mes' && (
            <div className="ce__comparacoes">
              <Comparacao rotulo="mês anterior" atual={foco.pedidos} base={dados.mesAnterior.pedidos} />
              <Comparacao rotulo={`${nomeMes}/${dados.ano - 1}`} atual={foco.pedidos} base={dados.mesAnoPassado.pedidos} />
            </div>
          )}
          {lente === 'ano' && (
            <div className="ce__comparacoes">
              <Comparacao rotulo={`${dados.ano - 1} até hoje`} atual={foco.pedidos} base={dados.anoPassado.pedidos} />
            </div>
          )}
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Ganhos decididos</span>
          <strong className="ce__valor">{foco.ganhos}</strong>
          <span className="ce__nota">processos ganhos NESTE período</span>
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Valor recebido em oportunidades</span>
          <strong className="ce__valor">{moeda(foco.valorRecebido)}</strong>
          <span className="ce__nota">
            média de {moeda(foco.mediaOportunidade)} por pedido
            {foco.nComReferencia !== foco.pedidos && (
              <> · {foco.nComReferencia} de {foco.pedidos} com valor de referência</>
            )}
          </span>
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Valor enviado em orçamento</span>
          <strong className="ce__valor">{moeda(foco.valorEnviado)}</strong>
          <span className="ce__nota">{foco.nEnviados} orçamento{foco.nEnviados === 1 ? '' : 's'}</span>
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Valor perdido</span>
          <strong className="ce__valor ce__valor--perda">{moeda(foco.valorPerdido)}</strong>
          <span className="ce__nota">{foco.nPerdidos} pedido{foco.nPerdidos === 1 ? '' : 's'} com orçamento</span>
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Valor ganho</span>
          <strong className="ce__valor">{moeda(foco.valorGanho)}</strong>
          {lente === 'mes' && dados.mesAnoPassado.valorGanho > 0 && (
            <span className="ce__nota">
              {nomeMes}/{dados.ano - 1}: {moeda(dados.mesAnoPassado.valorGanho)}
            </span>
          )}
        </div>
      </div>

      {/* DESTINO DE QUEM ENTROU NO PERÍODO (@R 18/09). Diferente dos cards acima: lá cada
          número é do evento que aconteceu no mês; aqui são SEMPRE os mesmos pedidos — os
          que chegaram — seguidos até onde estão hoje. Por isso estes três FECHAM: ganho +
          perda + em aberto = total que entrou. */}
      <div className="ce-coorte">
        <div className="ce-coorte__titulo">
          Destino dos {foco.pedidos} pedidos que entraram {lente === 'mes' ? 'neste mês'
            : lente === 'ano' ? 'neste ano' : 'na vida toda'}
          <small> — os mesmos pedidos, do começo ao fim</small>
        </div>
        <div className="ce-coorte__barras">
          <span className="ce-coorte__item ce-coorte__item--ganho">
            <strong>{foco.coorte.ganho.n}</strong> ganhos · {moeda(foco.coorte.ganho.valor)}
          </span>
          <span className="ce-coorte__item ce-coorte__item--perda">
            <strong>{foco.coorte.perda.n}</strong> perdas · {moeda(foco.coorte.perda.valor)}
          </span>
          <span className="ce-coorte__item ce-coorte__item--aberto">
            <strong>{foco.coorte.aberto.n}</strong> ainda em aberto · {moeda(foco.coorte.aberto.valor)}
          </span>
        </div>
        {foco.coorte.aberto.n > foco.coorte.ganho.n + foco.coorte.perda.n && (
          <small className="ce-coorte__cedo">
            A maior parte ainda não foi decidida — é cedo para julgar este período pelo
            resultado. Sem esta linha, ele pareceria um desastre.
          </small>
        )}
      </div>

      <p className="ce__regua">
        {lente === 'vida' ? (
          <>
            Toda a base, desde o primeiro pedido registrado. Aqui os valores <strong>não</strong>{' '}
            são filtrados por data do evento — exigir a data esconderia o que não a tem.
            {foco.nEnviadoSemData > 0 && (
              <>
                {' '}Por isso o total enviado <strong>não bate</strong> com a soma dos meses:{' '}
                <strong>{moeda(foco.enviadoSemData)}</strong> em {foco.nEnviadoSemData}{' '}
                orçamentos não têm data de envio e não aparecem em mês nenhum. Soma dos
                meses + esse valor = total. Recebido e perdido fecham (nenhum sem data).
              </>
            )}
          </>
        ) : (
          <>
            Comparação pró-rata: os dois lados contam do dia 1 ao dia {dados.dia}, para não
            comparar um período pela metade com um período inteiro. Cada número entra pela data
            do SEU evento — pedido pela entrada, orçamento pelo envio, perda pela data da perda,
            ganho pelo resultado. Por isso eles <strong>não se somam nem se subtraem entre si</strong>:
            uma perda deste mês costuma ser de um pedido que entrou meses atrás, e orçamento
            sem data de envio não aparece no recorte.
          </>
        )}
      </p>
      </>
      )}
    </section>
  );
}
