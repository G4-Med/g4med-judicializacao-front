import { useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import './ComoEstamos.css';

/* ═══════════════════════════════════════════════════════════════════════════
   HINT TÉCNICO POR COLUNA (@R 19/09/2026 16:36):
   ⟦"marcar, tecnicamente, ao lado de cada coluna no mês a mês o significado de
   cada uma... um hint com um modal que indica o que é cada uma, para corrigirmos
   depois e saber que cada uma significa"⟧

   POR QUE UM MODAL E NÃO SÓ O `title`: o title some ao tirar o mouse, não abre
   no toque, e leitor de tela não o anuncia como conteúdo. O @R quer LER a régua
   para depois CORRIGIR — isso pede um texto que fique aberto.

   CADA DEFINIÇÃO ABAIXO FOI LIDA DO CÓDIGO DESTE ARQUIVO, não da memória. Se
   alguém mudar a conta e não mudar o texto, o hint passa a mentir — por isso o
   campo `campo` e `regua` são explícitos: é o que se confere contra o código.
   ═══════════════════════════════════════════════════════════════════════════ */
type DefColuna = {
  titulo: string;
  oQueE: string;        // em linguagem de quem usa
  campo: string;        // o campo do banco que manda
  regua: 'COORTE' | 'FLUXO' | 'CONTAGEM';
  reguaExplicada: string;
  cuidado?: string;     // o que engana ao ler
};

const DEFINICOES: Record<string, DefColuna> = {
  pedidos: {
    titulo: 'Pedidos',
    oQueE: 'Quantos pedidos ENTRARAM na G4MED naquele mês. Conta todos, com ou sem valor.',
    campo: 'Order.dataPedido (contagem)',
    regua: 'CONTAGEM',
    reguaExplicada: 'O pedido conta no mês em que entrou. Base completa: 1.163 pedidos, 1.163 com data.',
  },
  oportunidade: {
    titulo: 'Oportunidade',
    oQueE: 'Tudo que passou pela G4MED naquele mês, em valor — o que orçamos MAIS o que deixamos de orçar.',
    campo: 'orçado → Order.valorOrcamento · não-orçado → Order.refPreco',
    regua: 'COORTE',
    reguaExplicada: 'Cada pedido conta no mês em que ENTROU. Quem foi orçado entra pelo valor do orçamento; quem não foi, pelo preço de referência. Por isso Oportunidade = Orçamos + Deixamos de mandar, exato.',
    cuidado: 'Testei medir tudo pela referência: 3 meses davam "deixamos de mandar" NEGATIVO, porque 202 pedidos foram orçados ACIMA da referência. A régua atual é a única que fecha sem sobra.',
  },
  orcamos: {
    titulo: 'Orçamos',
    oQueE: 'Do que entrou naquele mês, quanto virou orçamento enviado ao solicitante.',
    campo: 'Σ Order.valorOrcamento dos pedidos com dataPedido no mês E valorOrcamento > 0',
    regua: 'COORTE',
    reguaExplicada: 'São os MESMOS pedidos da coluna Oportunidade — não é o orçamento assinado no mês, é o orçamento DAQUELES pedidos, mesmo que tenha sido feito meses depois.',
  },
  deixamos: {
    titulo: 'Deixamos de mandar',
    oQueE: 'Do que entrou naquele mês, quanto NÃO virou orçamento. É oportunidade que ficou na mesa.',
    campo: 'Σ Order.refPreco dos pedidos com dataPedido no mês E valorOrcamento = 0',
    regua: 'COORTE',
    reguaExplicada: 'Mesma coorte de Oportunidade e Orçamos. Um pedido está aqui OU em Orçamos, nunca nos dois.',
    cuidado: 'É PISO, não teto: 136 pedidos da base não têm preço de referência e entram como R$ 0 aqui. O valor real que ficou na mesa é MAIOR do que a coluna mostra. "sem preço" aparece quando há pedido sem orçamento mas nenhum tem referência.',
  },
  pctOrcado: {
    titulo: '% orçado',
    oQueE: 'Quanto da oportunidade do mês virou orçamento, em valor.',
    campo: 'Orçamos ÷ Oportunidade',
    regua: 'COORTE',
    reguaExplicada: 'Numerador e denominador são os mesmos pedidos, por isso nunca passa de 100%.',
    cuidado: 'A antiga "Taxa envio" dividia o orçado no mês (data do orçamento) pelo recebido no mês (data do pedido) — populações diferentes — e por isso dava 122%, 130%, 700%. Foi removida em 19/09.',
  },
  perdido: {
    titulo: 'Perdido',
    oQueE: 'Dos pedidos que ENTRARAM naquele mês, o valor dos que já viraram PERDA.',
    campo: 'Σ (Order.valorOrcamento ou refPreco) onde statusProcesso = "Perda", por Order.dataPedido',
    regua: 'COORTE',
    reguaExplicada: 'Mesma coorte de Oportunidade: Oportunidade = Ganho + Perdido + Em aberto, exato. Um pedido que entrou em maio e foi perdido em setembro conta em MAIO.',
    cuidado: 'Era FLUXO (mês da perda) até 20/09 e mostrava R$ 3,5 mi em set/26 — 39 dos 53 eram o lote de conciliação de pedidos antigos fechado em 08/09 (reunião 20/09: "não tem como ter 3 milhões perdidos recebendo 2,7"). Perdas decididas no período aparecem como nota no card, não como a coluna.',
  },
  pctPerdido: {
    titulo: '% perdido',
    oQueE: 'Dos pedidos que ENTRARAM naquele mês, quantos por cento já viraram perda.',
    campo: 'count(statusProcesso = "Perda") ÷ Pedidos, ambos por dataPedido',
    regua: 'COORTE',
    reguaExplicada: 'Mesma coorte de Oportunidade. Mês recente tende a mostrar pouco: a maior parte ainda não foi decidida — é cedo, não é bom.',
    cuidado: 'Régua DIFERENTE da coluna "Perdido" ao lado (que é por mês da perda). Ver o hint dela.',
  },
  ganho: {
    titulo: 'Ganho (marcado)',
    oQueE: 'Valor dos pedidos que alguém MARCOU como ganho na tela, no mês em que marcou.',
    campo: 'Σ (Order.valorGanho ou valorOrcamento) onde statusProcesso = "Ganho", por Order.dataResultado',
    regua: 'FLUXO',
    reguaExplicada: 'Conta no mês do resultado. Depende de alguém lembrar de marcar.',
    cuidado: 'Medido em 18/09: 19 ganhos MARCADOS contra 345 pedidos com pagamento de sinal forte no dado do Estado. A distância entre esta coluna e a "Pago (548)" É a informação: mede o atraso da marcação manual em relação ao dinheiro real.',
  },
  pago548: {
    titulo: 'Pago (548)',
    oQueE: 'EMPENHOS PAGOS pelo Estado nos nossos processos — dinheiro que de fato saiu do cofre público, no mês do pagamento.',
    campo: 'Σ EmpenhoPagamento548.valorPago com sinal PAGO_APOS_O_PEDIDO, por ultimoPagamento',
    regua: 'FLUXO',
    reguaExplicada: 'Fonte: portal de transparência do Estado (dado do 548), não marcação de tela. Só entra o pagamento POSTERIOR ao nosso pedido — pagamento anterior é de outro item do processo, e contá-lo nos daria crédito por dinheiro que não é nosso.',
    cuidado: 'Medido em 19/09 nos 544 processos nossos com empenho: empenhado R$ 31,49 mi, pago R$ 31,39 mi — sobram R$ 104 mil não pagos (0,3%). MAS o dado foi atualizado em 28/08: "não pago" pode ser "ainda não revisitado". Tempo mediano do protocolo ao pagamento: 30 dias (100 pagamentos medidos).',
  },
};

/** O "?" ao lado do cabeçalho: abre o modal com a definição técnica da coluna. */
function HintColuna({ chave }: { chave: keyof typeof DEFINICOES }) {
  const [aberto, setAberto] = useState(false);
  const d = DEFINICOES[chave];
  if (!d) return null;
  return (
    <>
      <button
        type="button"
        className="ce-hint"
        aria-label={`O que significa ${d.titulo}`}
        title={`O que significa ${d.titulo}`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}
      >?</button>
      <Dialog
        header={`${d.titulo} — o que esta coluna mede`}
        visible={aberto}
        onHide={() => setAberto(false)}
        style={{ width: 'min(560px, 94vw)' }}
        dismissableMask
      >
        <dl className="ce-hint__dl">
          <dt>O que é</dt><dd>{d.oQueE}</dd>
          <dt>Campo que manda</dt><dd><code>{d.campo}</code></dd>
          <dt>Régua</dt>
          <dd>
            <span className={`ce-hint__regua ce-hint__regua--${d.regua.toLowerCase()}`}>{d.regua}</span>
            {' '}{d.reguaExplicada}
          </dd>
          {d.cuidado && (<><dt>Cuidado ao ler</dt><dd>{d.cuidado}</dd></>)}
        </dl>
        <p className="ce-hint__legenda">
          <strong>COORTE</strong> = o pedido conta no mês em que ENTROU, do começo ao fim.{' '}
          <strong>FLUXO</strong> = o evento conta no mês em que ACONTECEU, venha de que pedido vier.
          Coorte e fluxo na mesma linha não se somam nem se dividem.
        </p>
      </Dialog>
    </>
  );
}

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
  /** veredito do 548 sobre o pagamento deste processo (já vem no listar_orders) */
  empenho548?: { pago?: number | null; sinal?: string | null; ultimoPagamento?: string | null } | null;
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
  /* Data pura ("2026-09-01") vira meia-noite LOCAL, não UTC: `new Date("2026-09-01")` é 31/08 às
     21h em Brasília e jogava os pedidos do dia 1º no mês anterior (22/09: 45 em vez de 48). */
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
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
  /* O VALOR DA OPORTUNIDADE, EM CASCATA (@R 18/09: "a estimativa dos pedidos que temos
     não está entrando para totalizar o recebido").
     ⚠ O QUE A MEDIÇÃO MOSTROU, e que muda o diagnóstico: dos 443 pedidos sem `refPreco`,
     307 TÊM `valorOrcamento` — valor REAL, R$ 20,7 milhões que a tela simplesmente não
     lia porque olhava um campo só. Não era falta de dado, era o campo errado medindo o
     construto "quanto vale esta oportunidade".
     A ordem importa: `refPreco` primeiro (é a referência do pedido, anterior à cotação);
     `valorOrcamento` como segunda fonte (o que de fato foi cotado). Nunca soma os dois —
     são o mesmo dinheiro visto em momentos diferentes.
     NÃO IMPLEMENTADO de propósito: estimar por mediana do procedimento cobriria mais 13
     pedidos (R$ 220.934 = 0,3% do total) e exigiria trazer `procedimento` ao payload.
     O ganho não paga misturar número estimado com número medido nesta tela. */
  /* ★ MESMA RÉGUA DO MÊS A MÊS (@R 19/09 16:40: "aqui em como estamos não tá batendo com o
     valor mês a mês de oportunidades"). Antes era `refPreco || valorOrcamento` e dava
     R$ 65,2 mi; o mês a mês dava R$ 72,97 mi. Duas réguas de "oportunidade" na mesma tela.
     Agora as duas contam igual: quem foi ORÇADO entra pelo orçamento; quem não foi, pela
     referência. Soma dos meses == este total, por construção. */
  const valorOportunidade = (l: Linha) =>
    num(l.valorOrcamento) > 0 ? num(l.valorOrcamento) : num(l.refPreco);
  const recebidos = entraram.filter((l) => valorOportunidade(l) > 0);
  const enviados = linhas.filter((l) => num(l.valorOrcamento) > 0
    && (vidaToda || noPeriodo(l.dataStatusOrcamento, dentro)));
  const perdidos = linhas.filter((l) => l.statusProcesso === 'Perda' && num(l.valorOrcamento) > 0
    && (vidaToda || noPeriodo(l.dataStatusPerda, dentro)));

  const soma = (lista: Linha[], campo: (l: Linha) => number) =>
    lista.reduce((a, l) => a + campo(l), 0);
  const valorRecebido = soma(recebidos, valorOportunidade);

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
    /* COORTE TAMBÉM AQUI (@R 22/09 14:01: "não pegar um pedido da competência anterior e ver
       ela na competência atual"). O número grande é dos pedidos que ENTRARAM no período e já
       têm orçamento; o total por DATA DE ENVIO (que inclui pedidos de meses atrás) continua
       visível embaixo, porque é ele que responde "quanto saiu de orçamento neste mês". */
    valorEnviado: entraram.reduce((a, l) => a + (num(l.valorOrcamento) > 0 ? num(l.valorOrcamento) : 0), 0),
    nEnviados: entraram.filter((l) => num(l.valorOrcamento) > 0).length,
    valorEnviadoNoPeriodo: soma(enviados, (l) => num(l.valorOrcamento)),
    nEnviadosNoPeriodo: enviados.length,
    // o que NUNCA aparece numa soma por mês, porque não tem data de envio — declarado
    // para que "soma dos meses + isto = total" feche (@R 18/09: "tem que somar, senão
    // não batem"). Medido: R$ 21.658.350 em 308 orçamentos.
    enviadoSemData: soma(
      linhas.filter((l) => num(l.valorOrcamento) > 0 && !l.dataStatusOrcamento),
      (l) => num(l.valorOrcamento)),
    nEnviadoSemData: linhas.filter((l) => num(l.valorOrcamento) > 0 && !l.dataStatusOrcamento).length,
    /* ★ REUNIÃO @R × FABRÍCIO 20/09 (00:11:48): "esse valor perdido, o indicador tá errado,
       porque não tem como eu ter 3 milhões [perdidos], sendo que eu só [recebi 2,7]".
       Medido no banco 20/09: 53 perdas DECIDIDAS em setembro somam R$ 3,57 mi — e 39 delas
       são "Perda (encontro de contas Wesley)", o lote de conciliação de pedidos antigos
       fechado em 08/09. O card ao lado de "recebido" (coorte) mostrava um fluxo de outra
       população. Agora o card é COORTE, como o recebido: quem entrou no período e virou
       perda, pelo mesmo valor de oportunidade — e recebido = ganho + perdido + em aberto
       fecha por construção. O fluxo (decididas no período) continua disponível como nota. */
    valorPerdido: coortePerda.reduce((a, l) => a + valorDe(l), 0),
    nPerdidos: coortePerda.length,
    valorPerdidoDecidido: soma(perdidos, (l) => num(l.valorOrcamento)),
    nPerdidosDecidido: perdidos.length,
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
  /* cEnv/cPer são COORTE: contam o pedido no mês em que ELE ENTROU, não no mês do
     evento. É o que permite um percentual que nunca passa de 100% — ver o comentário
     da tabela abaixo. */
  /* orc/gap são a TELA DO INVESTIDOR (@R 19/09): "o valor total que já passou pela
     g4med de oportunidades e o valor de orçamentos enviados, e quanto deixamos de
     mandar em cada mês e o percentual".
     Contam sempre no mês em que o PEDIDO ENTROU — ver o bloco da tabela. */
  const meses = new Map<string, { rec: number; env: number; per: number; gan: number; pago: number; n: number; cEnv: number; cPer: number; orc: number; gap: number; nGap: number; nSemValor: number }>();
  const zero = () => ({ rec: 0, env: 0, per: 0, gan: 0, pago: 0, n: 0, cEnv: 0, cPer: 0, orc: 0, gap: 0, nGap: 0, nSemValor: 0 });
  /* ⚠ NÃO troque por `new Date(iso)` — foi assim e estava ERRADO (medido 19/09).
     A API manda DateField puro ("2026-09-01", sem hora). `new Date("2026-09-01")` é
     interpretado como MEIA-NOITE UTC; em Brasília (UTC-3) isso é 31/08 às 21h, e o
     `getMonth()` devolve AGOSTO. Todo pedido do dia 1º caía no mês anterior.
     Medido em produção: 52 dos 1.163 pedidos (4,5%) têm dataPedido no dia 1 — e o
     mesmo valia para orçamento, perda e ganho, que também são DateField.
     A string ISO já começa com "AAAA-MM": ler os 7 primeiros caracteres não passa por
     fuso nenhum. Só cai no Date quando o formato não é o esperado. */
  const chave = (iso?: string | null) => {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    if (m) return `${m[1]}-${m[2]}`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const por = (iso: string | null | undefined, campo: 'rec' | 'env' | 'per' | 'gan' | 'pago', v: number) => {
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
    /* A COORTE, contada no mês de ENTRADA do pedido (@R 19/09 pediu "o percentual de
       envio e o percentual de perda"). Aqui o pedido é contado sempre no MESMO mês, do
       começo ao fim — por isso o percentual tem um denominador honesto e não estoura. */
    {
      const k = chave(l.dataPedido);
      if (k) {
        if (!meses.has(k)) meses.set(k, zero());
        const m = meses.get(k)!;
        if (num(l.valorOrcamento) > 0) m.cEnv += 1;
        if (l.statusProcesso === 'Perda') m.cPer += 1;
        /* ═══ A CONTA DO INVESTIDOR, e ela FECHA POR CONSTRUÇÃO ═══
           pedido ORÇADO   → entra pelo valor ORÇADO (oportunidade realizada)
           pedido SEM orçamento → entra pela REFERÊNCIA (oportunidade que ficou na mesa)
           logo: oportunidade = orçamos + deixamos de mandar, sempre, sem sobra.

           POR QUE NÃO pela referência nos dois casos: 202 pedidos foram orçados ACIMA da
           referência (o maior: referência R$ 187.332 → orçado R$ 950.000). Medindo tudo
           pela referência, 3 meses davam "deixamos de mandar" NEGATIVO — numa tela para
           investidor isso é incompreensível. E medindo por max(ref, orçado) sobravam
           R$ 1,15 milhão que não fechavam com nada. Só esta forma fecha: medido
           46.609.952 + 26.361.459 = 72.971.411, exato.

           ⚠ O GAP É PISO, NÃO TETO: 136 pedidos não têm valor de referência nenhum e
           entram como R$ 0. O que deixamos de mandar é MAIOR do que a coluna mostra. */
        if (num(l.valorOrcamento) > 0) {
          m.orc += num(l.valorOrcamento);
        } else {
          m.gap += num(l.refPreco);
          m.nGap += 1;
          if (num(l.refPreco) === 0) m.nSemValor += 1;
        }
      }
    }
    por(l.dataPedido, 'rec', num(l.refPreco));
    por(l.dataStatusOrcamento, 'env', num(l.valorOrcamento));
    /* Reunião 20/09: Perdido virou COORTE (mês em que o pedido ENTROU, pelo mesmo valor de
       oportunidade das outras colunas). Por fluxo, set/26 mostrava R$ 3,57 mi — 39 de 53 eram
       o lote de conciliação de pedidos antigos fechado em 08/09. Mesma régua do card. */
    if (l.statusProcesso === 'Perda') por(l.dataPedido, 'per', num(l.valorOrcamento) > 0 ? num(l.valorOrcamento) : num(l.refPreco));
    if (l.statusProcesso === 'Ganho') por(l.dataResultado, 'gan', num(l.valorGanho) || num(l.valorOrcamento));
    /* PAGO PELO ESTADO (@R 18/09: "os pagos temos que classificar com o que foi pago de
       orçamentos nossos, não vamos por ganhos, concorda").
       Concordo, e a medição sustenta: 19 ganhos MARCADOS na tela contra 345 pedidos com
       sinal PAGO_APOS_O_PEDIDO no 548 (R$ 18,8 mi), dos quais 240 têm orçamento nosso.
       'Ganho' depende de alguém lembrar de marcar; 'pago' é fato no dado do Estado.
       As duas colunas convivem de propósito: a distância entre elas É a informação —
       ela mede o quanto a marcação manual está atrasada em relação ao dinheiro real.
       SÓ o sinal forte entra: PAGO_APOS_O_PEDIDO. Pagamento anterior ao pedido é de
       outro item do processo, e contá-lo nos daria crédito por dinheiro que não é nosso. */
    if (l.empenho548?.sinal === 'PAGO_APOS_O_PEDIDO' && num(l.valorOrcamento) > 0) {
      por(l.empenho548.ultimoPagamento, 'pago', num(l.empenho548.pago));
    }
  }

  const ordenados = [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 18);

  // soma de TODOS os meses (¬só dos 18 exibidos — o total não pode depender de quantas
  // linhas cabem na tela)
  const totais = [...meses.values()].reduce(
    (a, m) => ({ rec: a.rec + m.rec, env: a.env + m.env, per: a.per + m.per,
                 gan: a.gan + m.gan, pago: a.pago + m.pago, n: a.n + m.n,
                 cEnv: a.cEnv + m.cEnv, cPer: a.cPer + m.cPer,
                 orc: a.orc + m.orc, gap: a.gap + m.gap,
                 nGap: a.nGap + m.nGap, nSemValor: a.nSemValor + m.nSemValor }),
    { rec: 0, env: 0, per: 0, gan: 0, pago: 0, n: 0, cEnv: 0, cPer: 0,
      orc: 0, gap: 0, nGap: 0, nSemValor: 0 });

  /* QUEM NÃO TEM VALOR (@R 18/09: "o valor recebido não tá somando todos os pedidos e
     enviados não tá somando todos os orçamentos, por quê").
     Resposta medida: 442 dos 1.158 não têm valor de REFERÊNCIA (421 deles são carga
     histórica) e 555 nunca foram COTADOS. Os totais estão certos — o que falta é dado
     nos pedidos. Sem esta linha, quem compara "1.158 pedidos" com um valor que soma 716
     conclui que a soma está quebrada, e a soma é justamente a parte que está certa. */
  // ¬"sem refPreco" (que contava 443 e incluía 307 com valor real), e sim SEM VALOR NENHUM:
  // é esse o conjunto que de fato não entra no Recebido. Medido 18/09: 136.
  const semReferencia = linhas.filter((l) => !num(l.refPreco) && !num(l.valorOrcamento)).length;
  const semOrcamento = linhas.filter((l) => !num(l.valorOrcamento)).length;

  /* semData/semDataLinhas removidos em 19/09 junto com a linha órfã do rodapé:
     a régua agora conta tudo pelo mês do PEDIDO, e não existe pedido sem dataPedido
     (1.163 de 1.163 medidos). Ver o comentário no <tfoot>. */
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
            <th>Mês</th><th>Pedidos <HintColuna chave="pedidos" /></th>
            <th title="Tudo que passou pela G4MED naquele mês, em valor. Quem foi orçado entra pelo valor do orçamento; quem não foi, pelo preço de referência. Por isso esta coluna é exatamente a soma das duas seguintes.">Oportunidade <HintColuna chave="oportunidade" /></th>
            <th title="Do que entrou naquele mês, quanto virou orçamento enviado. São os MESMOS pedidos da coluna anterior — não é o orçamento assinado no mês, é o orçamento DAQUELES pedidos.">Orçamos <HintColuna chave="orcamos" /></th>
            <th title="Do que entrou naquele mês, quanto NÃO virou orçamento. É oportunidade que ficou na mesa. ATENÇÃO: é PISO, não teto — 136 pedidos da base não têm preço de referência e entram como zero aqui, então o valor real é maior.">Deixamos de mandar <HintColuna chave="deixamos" /></th>
            <th title="Quanto da oportunidade do mês virou orçamento, em VALOR (orçamos ÷ oportunidade). Nunca passa de 100% porque numerador e denominador são os mesmos pedidos. A antiga 'Taxa envio' dividia o orçado no mês pelo recebido no mês — populações diferentes, e por isso dava 122%, 130%, 700%.">% orçado <HintColuna chave="pctOrcado" /></th>
            <th>Perdido <HintColuna chave="perdido" /></th>
            <th title="Dos pedidos que ENTRARAM neste mês, quantos % já viraram perda. Mesma coorte do % enviado. Mês recente tende a mostrar pouco: a maior parte ainda não foi decidida — é cedo, não é bom.">% perdido <HintColuna chave="pctPerdido" /></th>
            <th title="Ganho MARCADO na tela por alguém. Medido em 18/09: 19 marcados — contra 345 pedidos com pagamento de sinal forte no dado do Estado.">Ganho (marcado) <HintColuna chave="ganho" /></th>
            <th title="PAGO pelo Estado DEPOIS do nosso pedido, no dado do 548 (sinal PAGO_APOS_O_PEDIDO). É fato medido, não marcação de tela. Entra no mês do pagamento.">Pago (548) <HintColuna chave="pago548" /></th>
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
              <td className="ce-num">{(m.orc + m.gap) ? moeda(m.orc + m.gap) : '—'}</td>
              <td className="ce-num ce-ganho">{m.orc ? moeda(m.orc) : '—'}</td>
              <td className="ce-num ce-perda" title={m.nGap ? `${m.nGap} pedido(s) sem orçamento${m.nSemValor ? `, ${m.nSemValor} deles sem preço de referência (entram como zero)` : ''}` : undefined}>
                {m.gap ? moeda(m.gap) : (m.nGap ? 'sem preço' : '—')}
              </td>
              {/* @R 19/09: "o percentual de envio e o percentual de perda".
                  A versão anterior dividia DINHEIRO enviado por DINHEIRO recebido no
                  mesmo mês e dava 122%, 130%, 700% — não era erro de conta: numerador e
                  denominador eram populações diferentes (o orçado em setembro é de
                  pedido que entrou em junho). Agora o percentual é de PEDIDOS sobre a
                  COORTE: dos que entraram neste mês, quantos já foram orçados. Os mesmos
                  pedidos nos dois lados da divisão, logo o teto é 100% por construção. */}
              <td className="ce-num">
                {(m.orc + m.gap) ? `${Math.round((m.orc / (m.orc + m.gap)) * 100)}%` : '—'}
              </td>
              <td className="ce-num ce-perda">{m.per ? moeda(m.per) : '—'}</td>
              <td className="ce-num ce-perda">
                {m.n ? `${Math.round((m.cPer / m.n) * 100)}%` : '—'}
              </td>
              <td className="ce-num ce-ganho">{m.gan ? moeda(m.gan) : '—'}</td>
              <td className="ce-num ce-ganho">{m.pago ? moeda(m.pago) : '—'}</td>
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
          {/* A LINHA "sem data do evento" FOI REMOVIDA em 19/09, e a razão importa:
              ela existia porque a coluna de orçamento contava pelo mês do ORÇAMENTO
              (dataStatusOrcamento), e 308 orçamentos (R$ 21,6 milhões, 46% do total)
              não tinham essa data — ficavam órfãos num rodapé.
              Agora TUDO conta pelo mês em que o PEDIDO entrou, e dataPedido existe em
              1.163 de 1.163 registros (medido em produção). Não há mais órfão possível:
              a linha não foi escondida, ela deixou de ter conteúdo por construção. */}
          {(semReferencia > 0 || semOrcamento > 0) && (
            <tr className="ce-serie__semvalor">
              <td colSpan={9}>
                <strong>Por que o valor não acompanha a contagem:</strong>{' '}
                {semReferencia > 0 && (
                  <>{semReferencia} pedido{semReferencia === 1 ? '' : 's'} sem valor
                    nenhum — nem referência, nem orçamento (entram em Pedidos, não em Recebido)</>
                )}
                {semReferencia > 0 && semOrcamento > 0 && ' · '}
                {semOrcamento > 0 && (
                  <>{semOrcamento} nunca foram cotados (não entram em Enviado)</>
                )}
                . Os totais estão certos — o que falta é o valor nesses pedidos.
              </td>
            </tr>
          )}
          <tr className="ce-serie__total">
            <td>TOTAL (vida toda)</td>
            <td className="ce-num">{totais.n}</td>
            <td className="ce-num">{moeda(totais.orc + totais.gap)}</td>
            <td className="ce-num ce-ganho">{moeda(totais.orc)}</td>
            <td className="ce-num ce-perda">{moeda(totais.gap)}</td>
            <td className="ce-num">
              {(totais.orc + totais.gap) ? `${Math.round((totais.orc / (totais.orc + totais.gap)) * 100)}%` : '—'}
            </td>
            <td className="ce-num ce-perda">{moeda(totais.per)}</td>
            <td className="ce-num ce-perda">
              {totais.n ? `${Math.round((totais.cPer / totais.n) * 100)}%` : '—'}
            </td>
            <td className="ce-num ce-ganho">{moeda(totais.gan)}</td>
            <td className="ce-num ce-ganho">{moeda(totais.pago)}</td>
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
  const [aberto, setAberto] = useState(false);
  const foco = lente === 'mes' ? dados.mesAtual : lente === 'ano' ? dados.anoAtual : dados.vida;

  return (
    <section id="ce-conteudo" className={`ce ${aberto ? '' : 'ce--fechada'}`} aria-label="Como estamos">
      <header className="ce__topo">
        {/* @R 22/09 19:14: vinha sempre aberto; agora abre/fecha como os outros painéis da Início */}
        <button type="button" className="ce__toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
          aria-controls="ce-conteudo" aria-describedby="ce-sub">
          <i className={`pi ${aberto ? 'pi-chevron-down' : 'pi-chevron-right'}`} aria-hidden="true" />
          <span className="ce__titulos">
            <h2>Como estamos</h2>
            {/* @R 22/09 21:27: faltava dizer o que é a área e o que tem dentro (os outros painéis já diziam) */}
            <span id="ce-sub" className="home-panel__sub">
              O resultado do negócio: pedidos recebidos, ganhos decididos e os valores recebidos em oportunidade,
              enviados em orçamento, perdidos e ganhos — no mês (até hoje), no ano, na vida toda ou mês a mês,
              comparando com o mês anterior e com o mesmo mês do ano passado.
            </span>
          </span>
        </button>
        {aberto && <div className="ce__lentes" role="tablist">
          {([['mes', `${nomeMes} (até dia ${dados.dia})`], ['ano', `${dados.ano}`], ['vida', 'Vida toda'], ['serie', 'Mês a mês']] as const)
            .map(([chave, rotulo]) => (
              <button key={chave} type="button" role="tab" aria-selected={lente === chave}
                className={`ce__lente ${lente === chave ? 'is-ativa' : ''}`}
                onClick={() => setLente(chave as Lente)}>{rotulo}</button>
            ))}
        </div>}
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
          <span className="ce__nota">
            {foco.nEnviados} de {foco.pedidos} que entraram {lente === 'mes' ? 'no mês' : lente === 'ano' ? 'no ano' : 'na vida toda'}
            {lente !== 'vida' && foco.nEnviadosNoPeriodo > 0 && (
              <> · enviados no período: {moeda(foco.valorEnviadoNoPeriodo)} ({foco.nEnviadosNoPeriodo}, inclui pedidos antigos)</>
            )}
          </span>
        </div>

        <div className="ce__card">
          <span className="ce__rotulo">Valor perdido</span>
          <strong className="ce__valor ce__valor--perda">{moeda(foco.valorPerdido)}</strong>
          <span className="ce__nota">
            {foco.nPerdidos} de {foco.pedidos} que entraram {lente === 'mes' ? 'no mês' : lente === 'ano' ? 'no ano' : 'na vida toda'}
            {lente !== 'vida' && foco.nPerdidosDecidido > 0 && (
              <> · decididas no período: {moeda(foco.valorPerdidoDecidido)} ({foco.nPerdidosDecidido}, inclui pedidos antigos)</>
            )}
          </span>
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
            Toda a base, desde o primeiro pedido registrado. Oportunidade e orçamento contam
            pelo mês em que o <strong>pedido entrou</strong> — a mesma régua do mês a mês, então
            os totais daqui são <strong>exatamente</strong> a soma das linhas de lá.
            {foco.nEnviadoSemData > 0 && (
              <>
                {' '}({foco.nEnviadoSemData} orçamentos, {moeda(foco.enviadoSemData)}, não têm
                data de envio registrada — mas têm data de pedido, então contam normalmente.)
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
