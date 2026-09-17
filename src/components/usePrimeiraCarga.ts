import { useEffect, useRef, useState } from 'react';
import { assinar, quantasEmVoo } from '../services/requisicoesEmVoo';

/**
 * "Esta tela ainda está na PRIMEIRA carga?"
 *
 * Verdadeiro desde a montagem até o primeiro instante em que não há nenhuma
 * requisição à API em voo. Depois disso é falso para sempre — é o que impede o
 * esqueleto de piscar a cada chamada de fundo (salvar, filtro, polling).
 *
 * Se a tela montar já sem requisição nenhuma (dado em cache), devolve falso na
 * hora: não há carga para esperar, e fingir que há seria mentir ao contrário.
 */
export function usePrimeiraCarga(): boolean {
  const [carregando, setCarregando] = useState(() => quantasEmVoo() > 0);
  const jaTerminou = useRef(quantasEmVoo() === 0);

  useEffect(() => {
    if (jaTerminou.current) return;
    return assinar((n) => {
      if (n === 0 && !jaTerminou.current) {
        jaTerminou.current = true;
        setCarregando(false);
      }
    });
  }, []);

  return carregando;
}
