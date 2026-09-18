import { useEffect, useRef, useState } from 'react';
import { assinar, quantasEmVoo } from '../../services/requisicoesEmVoo';
import './BarraDeCarregamento.css';

/**
 * A BARRA FINA NO TOPO — "o sistema está buscando, não travou" (@R 17/09).
 *
 * A DOR: abrir uma rota com tabela grande deixa a tela montada e vazia por vários
 * segundos. Cabeçalho, filtros e paginação já aparecem; o corpo não. Visualmente isso é
 * idêntico a uma tela quebrada, e quem está esperando não tem como distinguir "está
 * vindo" de "não veio". O esqueleto dos indicadores já cobria o topo da página, mas ele
 * vive DENTRO do painel — quem está olhando a tabela não o vê.
 *
 * POR QUE NO LAYOUT, E NÃO EM CADA TELA: o sinal já existe medido na única camada por
 * onde todas as chamadas passam (`requisicoesEmVoo`, do interceptor). Uma peça aqui
 * cobre as ~30 rotas de uma vez, inclusive as que ainda nem foram escritas. Repetir isso
 * por tela seriam 30 edições que envelhecem separadas.
 *
 * O ATRASO DE 250ms É DELIBERADO: chamada rápida não deve piscar uma barra na cara de
 * ninguém — piscar a cada clique treina o olho a ignorar o aviso, e aí ele não serve
 * para o caso de 10 segundos, que é o que importa. Abaixo de 250ms, silêncio.
 *
 * O PROGRESSO É HONESTO ATÉ ONDE PODE: não existe "quantos % faltam" (o servidor não
 * diz), então a barra avança rápido no começo e vai desacelerando, sem NUNCA chegar a
 * 100% sozinha — só a resposta real a completa. Barra que chega a 100% e fica parada
 * mente duas vezes: diz que acabou e continua lá.
 */
export function BarraDeCarregamento() {
  const [visivel, setVisivel] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const timerAtraso = useRef<number | null>(null);
  const timerAvanco = useRef<number | null>(null);

  useEffect(() => {
    const limpar = () => {
      if (timerAtraso.current) { clearTimeout(timerAtraso.current); timerAtraso.current = null; }
      if (timerAvanco.current) { clearInterval(timerAvanco.current); timerAvanco.current = null; }
    };

    const reagir = (n: number) => {
      if (n > 0) {
        if (timerAtraso.current || visivel) return;
        timerAtraso.current = window.setTimeout(() => {
          setVisivel(true);
          setProgresso(8);
          // desacelera conforme avança: o que falta sempre "custa mais" que o já andado
          timerAvanco.current = window.setInterval(() => {
            setProgresso((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) / 14)));
          }, 180);
        }, 250);
      } else {
        limpar();
        if (visivel) {
          setProgresso(100);                       // só a resposta real completa a barra
          window.setTimeout(() => { setVisivel(false); setProgresso(0); }, 260);
        }
      }
    };

    reagir(quantasEmVoo());
    const cancelar = assinar(reagir);
    return () => { cancelar(); limpar(); };
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div className="mc-carregando" role="status" aria-live="polite">
      <div className="mc-carregando__barra" style={{ width: `${progresso}%` }} />
      <span className="sr-only">Buscando dados no servidor…</span>
    </div>
  );
}
