import { useEffect, useRef, useState } from 'react';
import { usePrimeiraCarga } from '../usePrimeiraCarga';
import './ContadorRegistros.css';

/**
 * Contador de registros da tabela (task #208, 27/08/2026 — mandato @R).
 *
 * POR QUE: o @R abriu a tela de Orçamento Médico esperando ~100 pedidos, viu 16 e leu
 * aquilo como defeito. Os 16 estavam certos — mas a tela não dizia nem quantos tinha nem
 * de que fase eram, então o número virou dúvida. Tabela que não declara o próprio tamanho
 * transfere ao usuário o trabalho de conferir no banco.
 *
 * O QUE MOSTRA: total da visualização, quanto sobrou depois dos filtros, e a quebra por
 * fase — para saber tecnicamente o que está em cada etapa sem sair da tela.
 *
 * ACESSIBILIDADE: o bloco é role="status" + aria-live="polite" — quando o filtro muda, o
 * leitor de tela ANUNCIA o novo número sem roubar o foco de quem está digitando no filtro.
 * O texto anunciado é uma frase inteira ("Mostrando 5 de 16 registros…"), não os números
 * soltos que aparecem visualmente. A animação de troca respeita prefers-reduced-motion, e
 * as cores das fases nunca são o único sinal — cada chip traz o nome escrito.
 */

export interface FaseContada {
  rotulo: string;
  quantidade: number;
  /** classe de cor opcional; a cor NUNCA é o único portador de informação */
  tom?: 'neutro' | 'atencao' | 'alerta' | 'ok';
}

interface Props {
  /** quantos registros a tela carregou (antes de qualquer filtro) */
  total: number;
  /** quantos sobraram depois dos filtros aplicados */
  visiveis: number;
  /** quebra por fase/status DA VISUALIZAÇÃO ATUAL (já filtrada) */
  fases?: FaseContada[];
  /** o que está sendo contado, no plural: "pedidos", "processos", "usuários" */
  substantivo?: string;
}

export function ContadorRegistros({ total, visiveis, fases = [], substantivo = 'registros' }: Props) {
  const carregando = usePrimeiraCarga();
  const filtrado = visiveis !== total;
  const [pulsando, setPulsando] = useState(false);
  const anterior = useRef(visiveis);

  // Pulso curto quando o número muda — sinaliza "isto acabou de mudar" sem piscar a tela.
  useEffect(() => {
    if (anterior.current === visiveis) return;
    anterior.current = visiveis;
    setPulsando(true);
    const t = setTimeout(() => setPulsando(false), 420);
    return () => clearTimeout(t);
  }, [visiveis]);

  const fasesComRegistro = fases.filter((f) => f.quantidade > 0);

  // Frase completa para o leitor de tela — números soltos não fazem sentido em áudio.
  const anuncio = [
    filtrado
      ? `Mostrando ${visiveis} de ${total} ${substantivo} após os filtros.`
      : `${total} ${substantivo} no total.`,
    fasesComRegistro.length
      ? `Por fase: ${fasesComRegistro.map((f) => `${f.rotulo}, ${f.quantidade}`).join('. ')}.`
      : '',
  ].join(' ').trim();

  // "0 registros" durante a carga é uma resposta errada com cara de certa — a tabela
  // ainda não sabe quantos tem. O esqueleto ocupa esse intervalo sem afirmar nada.
  if (carregando) {
    return (
      <div className="contador-registros" role="status" aria-live="polite">
        <span className="sr-only">Carregando os registros…</span>
        <span className="mc-esqueleto-linha" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="contador-registros" role="status" aria-live="polite">
      <span className="sr-only">{anuncio}</span>

      <span className={`cr-total${pulsando ? ' cr-total--pulso' : ''}`} aria-hidden="true">
        {filtrado ? (
          <>
            <strong className="cr-numero">{visiveis}</strong>
            <span className="cr-de">de {total}</span>
          </>
        ) : (
          <strong className="cr-numero">{total}</strong>
        )}
        <span className="cr-substantivo">{substantivo}</span>
      </span>

      {filtrado && (
        <span className="cr-badge-filtro" aria-hidden="true">
          <i className="pi pi-filter" /> filtrado
        </span>
      )}

      {fasesComRegistro.length > 0 && (
        <span className="cr-fases" aria-hidden="true">
          {fasesComRegistro.map((f) => (
            <span key={f.rotulo} className={`cr-fase cr-fase--${f.tom ?? 'neutro'}`} title={`${f.rotulo}: ${f.quantidade}`}>
              {f.rotulo}
              <b>{f.quantidade}</b>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Conta ocorrências de um campo na lista visível — a quebra por fase de qualquer tabela. */
export function contarPorCampo<T>(
  itens: T[],
  campo: (item: T) => string | null | undefined,
  tons: Record<string, FaseContada['tom']> = {},
): FaseContada[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const chave = campo(item) || 'Sem status';
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, quantidade]) => ({ rotulo, quantidade, tom: tons[rotulo] ?? 'neutro' }));
}
