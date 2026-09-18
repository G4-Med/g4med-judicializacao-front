/** A versão que está NO AR, na barra de menu (@R 17/09/2026 · ampliado 18/09/2026).
 *
 *  POR QUE EXISTE: para saber se a tela é a nova, a única saída era comparar o
 *  comportamento com o que se lembrava do anterior — e quando a publicação falha calada
 *  (o Netlify parou de publicar em 17/09 e ninguém soube por horas), a tela ANTIGA continua
 *  respondendo normalmente. Sem carimbo, "não atualizou" e "atualizou e não mudou nada" são
 *  indistinguíveis do lado de cá.
 *
 *  POR QUE AGORA SÃO DOIS (@R 18/09: "toda vez que atualizarmos, mesmo que seja backend,
 *  a versão tem que mudar"): a primeira versão deste selo carregava só o commit do FRONT,
 *  injetado no build. Deploy de backend não reconstrói o front — então o selo ficava idêntico
 *  enquanto o sistema no ar já era outro. Medido em 18/09: front publicado às 14:17 e DOIS
 *  deploys de backend depois, com o selo parado no mesmo número. O comentário antigo aqui
 *  dizia "o selo só pode mentir se o pacote inteiro for outro" — faltava o terceiro caso:
 *  o pacote é o mesmo e o SISTEMA mudou.
 *
 *  POR QUE O BACKEND VEM EM RUNTIME, ¬do build: a alternativa era reconstruir o front a cada
 *  deploy de backend, o que acopla dois deploys e depende de alguém lembrar — e lembrar é o
 *  que falha sob pressa. Aqui a tela PERGUNTA ao servidor, então o selo se corrige sozinho.
 *
 *  Se a pergunta falhar, mostra só o front e diz isso no tooltip — nunca inventa um número.
 */
import { useEffect, useState } from 'react';
import api from '../../services/api';

const VERSAO_FRONT = import.meta.env.VITE_APP_VERSION ?? 'dev';
const MOMENTO_FRONT = import.meta.env.VITE_APP_BUILD_TIME ?? '';

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
  const [back, setBack] = useState<{ versao: string; publicadoEm: string } | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .get('versao/')
      .then((r) => vivo && setBack(r.data))
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
    };
  }, []);

  // O horário que importa é o da ÚLTIMA mudança, venha de onde vier — é ele que responde
  // "o que estou vendo já tem a correção?". Mostrar o do front quando o backend subiu depois
  // reproduziria exatamente o erro que este componente existe para impedir.
  const maisRecente =
    back?.publicadoEm && MOMENTO_FRONT
      ? new Date(back.publicadoEm) > new Date(MOMENTO_FRONT)
        ? back.publicadoEm
        : MOMENTO_FRONT
      : back?.publicadoEm || MOMENTO_FRONT;

  const hora = horaCurta(maisRecente);
  const selo = back ? `${VERSAO_FRONT}·${back.versao}` : VERSAO_FRONT;

  const detalhe = !MOMENTO_FRONT
    ? 'Ambiente de desenvolvimento — este pacote não veio de uma publicação.'
    : [
        `Tela (front): ${VERSAO_FRONT}, publicada em ${new Date(MOMENTO_FRONT).toLocaleString('pt-BR')}.`,
        back
          ? `Servidor (backend): ${back.versao}${
              back.publicadoEm ? `, publicado em ${new Date(back.publicadoEm).toLocaleString('pt-BR')}` : ''
            }.`
          : falhou
            ? 'Servidor: não consegui perguntar a versão — o número ao lado é só o da tela.'
            : 'Servidor: perguntando…',
        '',
        'O horário mostrado é o da última mudança, venha do front ou do servidor.',
        'Se ele não mudou depois de uma atualização, o que você está vendo é a versão antiga —',
        'recarregue a página; se continuar igual, a publicação não chegou.',
      ].join('\n');

  return (
    <span className="mc-versao" title={detalhe} aria-label={detalhe}>
      <span className="mc-versao__num">v{selo}</span>
      {hora && <span className="mc-versao__hora">{hora}</span>}
    </span>
  );
}
