/**
 * REQUISIÇÕES EM VOO — quantas chamadas à API estão abertas neste instante.
 *
 * POR QUE EXISTE: os indicadores (PainelKpis) e o contador de registros apareciam
 * com o número já pronto, vindo do nada. Enquanto a API não respondia, a tela
 * mostrava zeros — e zero é uma AFIRMAÇÃO ("não há nada"), não um "ainda não sei".
 * Com a rota de pedidos levando ~10s, a equipe lia a tela como travada.
 *
 * POR QUE NO INTERCEPTOR, E NÃO NAS 19 TELAS: são 19 telas usando esses dois
 * componentes. Passar uma prop `carregando` em cada uma é 19 edições que envelhecem
 * separadas, e a próxima tela nasce sem. Aqui o sinal é FATO medido na única camada
 * por onde todas passam — o mesmo lugar onde o CAIXA ALTA do procedimento já foi
 * resolvido de uma vez para 12 páginas.
 *
 * LIMITE HONESTO: isto conta requisições, não sabe QUAL tela pediu o quê. Por isso
 * quem consome só usa o sinal na PRIMEIRA carga (ver usePrimeiraCarga) — depois
 * disso, uma chamada de fundo faria o painel piscar sem motivo.
 */

let emVoo = 0;
const ouvintes = new Set<(n: number) => void>();

function avisar() {
  for (const f of ouvintes) f(emVoo);
}

export function entrou() {
  emVoo += 1;
  avisar();
}

export function saiu() {
  emVoo = Math.max(0, emVoo - 1);
  avisar();
}

export function quantasEmVoo() {
  return emVoo;
}

export function assinar(f: (n: number) => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}
