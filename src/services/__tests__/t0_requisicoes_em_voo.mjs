// Rodar: npx tsx src/services/__tests__/t0_requisicoes_em_voo.mjs
// O modo de falha que este T0 caça é ESQUELETO ETERNO: se algum caminho (erro, 401+retry)
// não fechar a requisição, o contador nunca volta a zero e a tela fica carregando para sempre.
// T0: o contador SEMPRE volta a zero — senão o esqueleto fica eterno na tela.
import { entrou, saiu, quantasEmVoo, assinar } from '../requisicoesEmVoo';

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = real === esperado;
  if (!ok) falhas++;
  console.log(`  ${nome}: ${real} (esperado ${esperado}) ${ok ? '✓' : '✗ FALHOU'}`);
};

check('inicia em zero          ', quantasEmVoo(), 0);
entrou(); check('1 requisição aberta     ', quantasEmVoo(), 1);
saiu();   check('resposta OK fecha       ', quantasEmVoo(), 0);
entrou(); saiu(); check('erro também fecha       ', quantasEmVoo(), 0);
// 401 + refresh: erro fecha, o retry abre de novo, e a 2a resposta fecha
entrou(); saiu(); entrou(); check('durante o retry         ', quantasEmVoo(), 1);
saiu();   check('depois do retry         ', quantasEmVoo(), 0);
// concorrência: 3 telas pedindo juntas
entrou(); entrou(); entrou(); check('3 em paralelo           ', quantasEmVoo(), 3);
saiu(); saiu(); saiu(); check('todas fecham            ', quantasEmVoo(), 0);
// nunca negativo (saiu() a mais não pode "dever" uma requisição futura)
saiu(); saiu(); check('saiu() a mais não fica -2', quantasEmVoo(), 0);
entrou(); check('e a próxima ainda conta ', quantasEmVoo(), 1);
saiu();

// o aviso chega a quem assina (é o que faz o esqueleto sumir)
let ultimo = -1;
const cancelar = assinar((n) => { ultimo = n; });
entrou(); check('assinante recebe abertura', ultimo, 1);
saiu();   check('assinante recebe zero    ', ultimo, 0);
cancelar();
entrou(); check('cancelado não recebe mais', ultimo, 0);
saiu();

console.log('\nT0', falhas === 0 ? 'VERDE' : `VERMELHO (${falhas} falha(s))`);
process.exit(falhas === 0 ? 0 : 1);
