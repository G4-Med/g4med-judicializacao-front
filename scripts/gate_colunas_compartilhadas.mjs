#!/usr/bin/env node
/**
 * GATE — nenhuma tela declara por conta própria uma coluna que já é compartilhada.
 *
 * POR QUE ESTE GATE EXISTE (17/09/2026):
 *   Construí o seletor de números de CNJ dentro de `colunaCnj`, o componente compartilhado
 *   das colunas de identificação. Ele apareceu em 12 listagens — e NÃO apareceu na tela do
 *   jurídico, que é a que a equipe usa todo dia, porque ESSA tela tinha a sua própria
 *   <Column field="nprocesso">, cópia da compartilhada feita em algum momento.
 *
 *   O @R viu a coluna vazia três vezes seguidas antes de eu descobrir. A varredura depois
 *   mostrou que não era um caso: a mesma tela também tinha cópia própria de SEI e de Comarca.
 *
 *   A classe do erro: uma cópia não "quebra" nada — ela só deixa de receber as melhorias.
 *   O sintoma aparece meses depois, numa tela que "não atualizou", e ninguém liga uma coisa
 *   à outra. Por isso precisa de máquina, não de memória.
 *
 * O QUE CONTA COMO FALHA (declarado ANTES de rodar):
 *   Uma tela (fora do próprio componente compartilhado) declarar <Column field="X"> onde X
 *   é um campo que o ColunasIdentificacao já serve, sem estar em ISENTOS com razão escrita.
 *
 * FAIL-MODE: fail-closed. Arquivo ilegível vira rc=2 (INDETERMINADO), NUNCA rc=0 — "não
 *   consegui olhar" não pode passar por "está limpo", que é a classe de erro que originou
 *   este gate. Sem rede, sem escrita: só lê o próprio código-fonte.
 *   rc=0 limpo · rc=1 cópia própria encontrada · rc=2 indeterminado.
 *
 * KILL-SWITCH (AXIOMA 4): SUPERMENTE_MEDCHECK_GATE_COLUNAS_OFF=1 → sai rc=0 declarando que
 *   foi desligado e que nada foi verificado.
 *
 * Rodar:  node scripts/gate_colunas_compartilhadas.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KILL_SWITCH = 'SUPERMENTE_MEDCHECK_GATE_COLUNAS_OFF';
const FAIL_MODE = 'fail-closed';

const RAIZ = new URL('..', import.meta.url).pathname;
const SRC = join(RAIZ, 'src');
const COMPARTILHADO = 'src/components/ColunasIdentificacao/colunasIdentificacao.tsx';

// campo -> a função compartilhada que deveria ser usada no lugar
const CAMPOS = {
  nprocesso: 'colunaCnj()',
  numeroSei: 'colunaSei()',
  comarca: 'colunaComarca()',
  solicitante: 'colunaSolicitante()',
  procedimento: 'colunaProcedimento()',
};

// arquivo -> razão da isenção (sem razão, não há isenção)
const ISENTOS = {
  'src/pages/lixeira/LixeiraPage.tsx':
    'tela de ARQUIVO (pedidos excluídos): a coluna é só leitura de um registro morto, ' +
    'e o botão de copiar da compartilhada não faz sentido em algo que ninguém vai cotar.',
  'src/pages/perdas/PerdasPage.tsx':
    'mesma razão da lixeira: pedido já perdido, ninguém copia o procedimento para pedir orçamento.',
  'src/pages/orcamentosTerceiros/OrcamentosTerceirosPage.tsx':
    'a linha aqui NÃO é um pedido — é uma agregação por procedimento (demanda). O campo é a ' +
    'CHAVE do agrupamento, não o dado de um pedido; truncar mudaria o que a tabela significa.',
  'src/pages/enviadoSes/EnviadoSesPage.tsx':
    'DÍVIDA DECLARADA (@R 17/09: "nesses dois primeiro, se precisar de mais eu falo"). ' +
    'Migrar quando ele pedir — a coluna funciona, só não recebe as melhorias da compartilhada.',
  'src/components/CardCnjAConfirmar/CardCnjAConfirmar.tsx':
    'card compacto de 4 colunas: usa <small> com corte próprio porque a linha ali é um ' +
    'resumo para decidir, não a tabela operacional.',
  'src/pages/painelResultados/AbaVerificar.tsx':
    'painel de CONFERÊNCIA, só leitura: mostra o número do processo de linhas que ainda ' +
    'não são pedidos do funil (não têm id de Order nem sugestões). A coluna compartilhada ' +
    'espera uma LinhaIdentificada completa; aqui seria mais promessa que entrega.',
};

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (nome.endsWith('.tsx')) saida.push(caminho);
  }
  return saida;
}

function main() {
  if (process.env[KILL_SWITCH] === '1') {
    console.log(`gate DESLIGADO por ${KILL_SWITCH}=1 — nada foi verificado.`);
    return 0;
  }

  let lista;
  try {
    lista = arquivos(SRC);
  } catch (e) {
    console.log(`INDETERMINADO — não consegui ler ${SRC}: ${e.message}`);
    console.log(`rc=2 por desenho (${FAIL_MODE}): 'não consegui olhar' ¬vira 'está limpo'.`);
    return 2;
  }

  const achados = [];
  for (const caminho of lista) {
    const rel = relative(RAIZ, caminho);
    if (rel === COMPARTILHADO) continue;
    let texto;
    try {
      texto = readFileSync(caminho, 'utf8');
    } catch (e) {
      console.log(`INDETERMINADO — não consegui ler ${rel}: ${e.message}`);
      return 2;
    }
    for (const [campo, substituto] of Object.entries(CAMPOS)) {
      const re = new RegExp(`<Column[^>]*field=["']${campo}["']`);
      const linhas = texto.split('\n');
      const n = linhas.findIndex((l) => re.test(l));
      if (n >= 0) achados.push({ rel, campo, substituto, linha: n + 1 });
    }
  }

  const cegos = achados.filter((a) => !(a.rel in ISENTOS));
  const isentos = achados.filter((a) => a.rel in ISENTOS);

  console.log(`colunas próprias encontradas: ${achados.length}\n`);
  for (const a of isentos) {
    console.log(`  ISENTO  ${a.rel}:${a.linha}  (${a.campo})\n          razão: ${ISENTOS[a.rel]}`);
  }
  for (const a of cegos) {
    console.log(`  CÓPIA   ${a.rel}:${a.linha}  field="${a.campo}"  <-- use ${a.substituto}`);
  }

  console.log('');
  if (cegos.length) {
    console.log(`FALHA — ${cegos.length} coluna(s) própria(s) que deveriam ser a compartilhada.`);
    console.log('Toda melhoria feita no componente compartilhado NÃO chega nessas telas.');
    return 1;
  }
  console.log('OK — toda coluna de identificação vem do componente compartilhado.');
  return 0;
}

process.exit(main());
