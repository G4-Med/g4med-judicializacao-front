#!/usr/bin/env node
/**
 * CORRIGE UM BUG DO PRIMEREACT 10.9.7 QUE TRAVA TODA TABELA EM LOOP DE RENDER.
 *
 * O QUE ACONTECE (medido ao vivo no navegador em 29/08/2026, ¬deduzido):
 *   O HeaderCell define `getColumnProp(name)` — UM argumento, que lê de `props.column`.
 *   Mas `updateSortableDisabled` a chama com DOIS:
 *        getColumnProp(prevColumn, 'sortable')
 *   Então `prevColumn` entra no lugar do NOME da propriedade procurada (medido:
 *   typeof = string) e o `'sortable'` é descartado. A busca nunca acha nada:
 *        lado anterior = undefined   ×   lado atual = false (defaultProps)
 *   `undefined !== false` é SEMPRE verdadeiro → chama setState → re-render →
 *   o useEffect não tem lista de dependências → dispara de novo → loop eterno.
 *   Sintoma: "Maximum update depth exceeded" ~1×/3s em QUALQUER tabela que tenha
 *   coluna sem `sortable` declarado (expander, seleção, Ações — ou seja, todas as nossas).
 *
 * A CORREÇÃO: usar `ColumnBase.getCProp(prevColumn, name)` — exatamente a função que o
 * lado atual usa por dentro — tornando a comparação SIMÉTRICA; e ignorar o primeiro
 * render, onde não existe "anterior" para comparar.
 *
 * POR QUE UM SCRIPT E NÃO `patch-package`: o patch gerado aqui saiu com 236 KB e 2.952
 * linhas de mudança de PERMISSÃO (WSL sobre NTFS marca tudo 100755) para 33 linhas úteis
 * — um diff assim não aplica num Linux limpo e derrubaria o build do Netlify. Este script
 * casa por TEXTO, é idempotente e não depende de contexto de diff.
 *
 * FALHA ALTO por desenho: se o padrão não casar (ex.: upgrade do PrimeReact), o script
 * avisa e sai com 0 — o build segue, o loop volta, e o aviso aparece no log do deploy.
 * Silêncio seria pior: a correção sumiria sem ninguém notar.
 *
 * REMOVER QUANDO: subirmos para PrimeReact 11+, se lá o bug estiver corrigido — conferir
 * `updateSortableDisabled` no datatable.esm.js da versão nova antes de apagar este arquivo.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = join(process.cwd(), 'node_modules', 'primereact', 'datatable');
const MARCA = 'CORRECAO-SUPERMENTE-LOOP-SORTABLE';

const ALVO = /var updateSortableDisabled = function updateSortableDisabled\(prevColumn\) \{\s*\n\s*if \(getColumnProp\(prevColumn, 'sortableDisabled'\) !== getColumnProp\('sortableDisabled'\) \|\| getColumnProp\(prevColumn, 'sortable'\) !== getColumnProp\('sortable'\)\) \{/;

const NOVO = `var updateSortableDisabled = function updateSortableDisabled(prevColumn) {
    /* ${MARCA}: o original chamava getColumnProp com 2 args numa funcao de 1 arg,
       comparando undefined contra false para sempre -> setState -> loop de render. */
    if (!prevColumn) return;
    if (ColumnBase.getCProp(prevColumn, 'sortableDisabled') !== getColumnProp('sortableDisabled') || ColumnBase.getCProp(prevColumn, 'sortable') !== getColumnProp('sortable')) {`;

let aplicados = 0, jaOk = 0, naoCasou = [];
for (const nome of ['datatable.esm.js', 'datatable.cjs.js', 'datatable.js']) {
  const caminho = join(BASE, nome);
  if (!existsSync(caminho)) { naoCasou.push(`${nome} (ausente)`); continue; }
  const texto = readFileSync(caminho, 'utf8');
  if (texto.includes(MARCA)) { jaOk++; continue; }
  if (!ALVO.test(texto)) { naoCasou.push(nome); continue; }
  writeFileSync(caminho, texto.replace(ALVO, NOVO));
  aplicados++;
}

if (aplicados) console.log(`[primereact] correcao do loop de render aplicada em ${aplicados} arquivo(s)`);
else if (jaOk && !naoCasou.length) console.log('[primereact] correcao do loop ja presente');

if (naoCasou.length) {
  console.warn(`[primereact] ⚠ ATENCAO: a correcao do loop NAO foi aplicada em: ${naoCasou.join(', ')}`);
  console.warn('[primereact]   O padrao mudou (upgrade da lib?). O "Maximum update depth" pode voltar.');
  console.warn('[primereact]   Confira scripts/corrigir-primereact.mjs — ele explica o bug e a cura.');
}
