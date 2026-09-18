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
  /** quando o ganho aconteceu — ¬quando o pedido entrou (ver `medir`) */
  dataResultado?: string | null;
  statusProcesso?: string | null;
  valorOrcamento?: number | string | null;
  valorGanho?: number | string | null;
};

type Lente = 'mes' | 'ano' | 'vida';

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
function medir(linhas: Linha[], dentro: (d: Date) => boolean) {
  const entraram = linhas.filter((l) => noPeriodo(l.dataPedido, dentro));
  const ganhos = linhas.filter(
    (l) => l.statusProcesso === 'Ganho' && noPeriodo(l.dataResultado, dentro));
  return {
    pedidos: entraram.length,
    ganhos: ganhos.length,
    valorGanho: ganhos.reduce((a, l) => a + (num(l.valorGanho) || num(l.valorOrcamento)), 0),
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

    const vida = medir(linhas, () => true);
    return { mesAtual, mesAnterior, mesAnoPassado, anoAtual, anoPassado, vida, dia, ano };
  }, [linhas, hoje.getDate(), hoje.getMonth(), hoje.getFullYear()]);

  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const foco = lente === 'mes' ? dados.mesAtual : lente === 'ano' ? dados.anoAtual : dados.vida;

  return (
    <section className="ce">
      <header className="ce__topo">
        <h2>Como estamos</h2>
        <div className="ce__lentes" role="tablist">
          {([['mes', `${nomeMes} (até dia ${dados.dia})`], ['ano', `${dados.ano}`], ['vida', 'Vida toda']] as const)
            .map(([chave, rotulo]) => (
              <button key={chave} type="button" role="tab" aria-selected={lente === chave}
                className={`ce__lente ${lente === chave ? 'is-ativa' : ''}`}
                onClick={() => setLente(chave as Lente)}>{rotulo}</button>
            ))}
        </div>
      </header>

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
          <span className="ce__rotulo">Valor ganho</span>
          <strong className="ce__valor">{moeda(foco.valorGanho)}</strong>
          {lente === 'mes' && dados.mesAnoPassado.valorGanho > 0 && (
            <span className="ce__nota">
              {nomeMes}/{dados.ano - 1}: {moeda(dados.mesAnoPassado.valorGanho)}
            </span>
          )}
        </div>
      </div>

      <p className="ce__regua">
        {lente === 'vida'
          ? 'Toda a base, desde o primeiro pedido registrado. Conta pela data do pedido.'
          : `Comparação pró-rata: os dois lados contam do dia 1 ao dia ${dados.dia}, para não
             comparar um período pela metade com um período inteiro. Conta pela data do pedido;
             Pedido conta pela data de entrada; ganho conta pela data do resultado — são
             eventos diferentes, cada um no mês em que aconteceu. Por isso os dois não
             formam uma taxa de conversão: não se referem aos mesmos processos.`}
      </p>
    </section>
  );
}
