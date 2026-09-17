/** A versão que está NO AR, na barra de menu (@R 17/09/2026).
 *
 *  POR QUE EXISTE: hoje, para saber se a tela é a nova, a única saída era comparar o
 *  comportamento com o que se lembrava do anterior — e quando a publicação falha calada
 *  (o Netlify parou de publicar em 17/09 e ninguém soube por horas), a tela ANTIGA continua
 *  respondendo normalmente. Sem carimbo, "não atualizou" e "atualizou e não mudou nada" são
 *  indistinguíveis do lado de cá. Este selo separa os dois em 1 olhada.
 *
 *  POR QUE O DADO VEM DO BUILD, ¬do código: qualquer número escrito à mão aqui seria uma
 *  PROMESSA (alguém lembrar de incrementar), e promessa é exatamente o que falha sob pressa.
 *  O `publicar_front.sh` injeta o commit e o horário no ato de gerar o pacote, então o selo
 *  só pode mentir se o pacote inteiro for outro — e aí ele denuncia isso também.
 *
 *  Sem as variáveis (rodando em desenvolvimento) ele diz "dev", que é a verdade, em vez de
 *  inventar um número.
 */
const VERSAO = import.meta.env.VITE_APP_VERSION ?? 'dev';
const MOMENTO = import.meta.env.VITE_APP_BUILD_TIME ?? '';

function horaCurta(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  // No mesmo dia, a hora basta e ocupa menos barra. Em outro dia, a data importa mais
  // que os minutos — "subiu hoje às 19h" e "subiu dia 12" respondem perguntas diferentes.
  return mesmoDia
    ? `${hh}:${mm}`
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`;
}

export function VersaoDoSistema() {
  const hora = horaCurta(MOMENTO);
  const detalhe = MOMENTO
    ? `Versão ${VERSAO}, publicada em ${new Date(MOMENTO).toLocaleString('pt-BR')}.\n` +
      'Se este horário não mudou depois de uma atualização, o que você está vendo é a versão antiga — ' +
      'recarregue a página; se continuar igual, a publicação não chegou.'
    : 'Ambiente de desenvolvimento — este pacote não veio de uma publicação.';

  return (
    <span className="mc-versao" title={detalhe} aria-label={detalhe}>
      <span className="mc-versao__num">v{VERSAO}</span>
      {hora && <span className="mc-versao__hora">{hora}</span>}
    </span>
  );
}
