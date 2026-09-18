import { useEffect, useRef, useState } from 'react';
import { assinar, quantasEmVoo } from '../../services/requisicoesEmVoo';
import './EstadoDaBusca.css';

/**
 * "O sistema está buscando" — na barra, onde o olho já vai (@R 17/09).
 *
 * A BARRA FINA no topo diz que ALGO acontece, mas não diz O QUÊ nem HÁ QUANTO TEMPO —
 * e numa rota que leva 10 segundos, "algo acontece" vira dúvida na metade do caminho.
 * Este chip fica ao lado da versão, no lugar em que a pessoa já olha para saber em que
 * estado o sistema está, e responde as duas coisas.
 *
 * O CONTADOR DE SEGUNDOS É O QUE MAIS IMPORTA: espera com relógio é espera; espera sem
 * relógio é suspeita de travamento. Depois de 8s o tom muda para âmbar — não porque algo
 * quebrou, mas porque aí já é honesto avisar que está demorando mais que o normal.
 *
 * Mesmo atraso de 250ms da barra: chamada rápida não acende nada. Um indicador que pisca
 * a cada clique deixa de ser lido — e aí não serve para o caso em que é necessário.
 */
export function EstadoDaBusca() {
  const [visivel, setVisivel] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const atraso = useRef<number | null>(null);
  const relogio = useRef<number | null>(null);

  useEffect(() => {
    const limpar = () => {
      if (atraso.current) { clearTimeout(atraso.current); atraso.current = null; }
      if (relogio.current) { clearInterval(relogio.current); relogio.current = null; }
    };

    const reagir = (n: number) => {
      if (n > 0) {
        if (atraso.current || visivel) return;
        atraso.current = window.setTimeout(() => {
          setVisivel(true);
          setSegundos(0);
          relogio.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
        }, 250);
      } else {
        limpar();
        setVisivel(false);
        setSegundos(0);
      }
    };

    reagir(quantasEmVoo());
    const cancelar = assinar(reagir);
    return () => { cancelar(); limpar(); };
  }, [visivel]);

  if (!visivel) return null;

  const demorando = segundos >= 8;
  return (
    <span
      className={`mc-busca ${demorando ? 'mc-busca--demora' : ''}`}
      role="status"
      aria-live="polite"
      title={demorando
        ? 'A consulta está levando mais que o normal — telas com muitos registros demoram. Nada travou.'
        : 'Buscando os dados no servidor.'}
    >
      <span className="mc-busca__ponto" aria-hidden="true" />
      <span className="mc-busca__texto">
        {demorando ? 'ainda buscando' : 'buscando'}
        {segundos > 0 && <span className="mc-busca__tempo"> {segundos}s</span>}
      </span>
    </span>
  );
}
