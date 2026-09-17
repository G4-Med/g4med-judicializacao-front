import { useEffect, useState } from 'react';
import './BotaoCopiar.css';

/**
 * Botão de copiar (task #213, @R 27/08 13:06: "coloca um botão para copiar CNJ, SEI e nome").
 * Sem dependência de Toast: o próprio botão vira "✓" por 1,5 s — feedback no lugar onde o
 * olho está. Acessível: aria-label diz o que copia; o estado "copiado" é anunciado por
 * aria-live. Fail-soft: clipboard indisponível (http sem HTTPS em rede) cai para seleção
 * do texto via execCommand, nunca erro na tela.
 */
export function BotaoCopiar({ valor, rotulo }: { valor: string | null | undefined; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);

  if (!valor) return null;

  const copiar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = valor; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopiado(true);
  };

  return (
    <button type="button" className={`botao-copiar${copiado ? ' botao-copiar--ok' : ''}`}
      onClick={copiar} aria-label={`Copiar ${rotulo}`} title={`Copiar ${rotulo}`}>
      <i className={copiado ? 'pi pi-check' : 'pi pi-copy'} aria-hidden="true" />
      <span className="sr-only" aria-live="polite">{copiado ? `${rotulo} copiado` : ''}</span>
    </button>
  );
}
