/** Garante que todos vejam a versão publicada (@R 21/09/2026: "em cada atualização para garantir
 *  que estejam vendo o frontend correto").
 *
 *  POR QUE EXISTE: a tela é uma página que fica aberta o dia todo — ela só pede o pacote novo
 *  quando alguém recarrega. Medido em 21/09: o próprio @R estava na versão c8b5117 com a
 *  85dc7bd já publicada, e a Valéria precisou de Ctrl+F5 por WhatsApp. O servidor agora manda
 *  o index.html revalidar (nginx no-cache), mas isso só vale NO PRÓXIMO carregamento.
 *
 *  COMO: a cada 2 min e ao voltar para a aba, lê o index.html publicado (sem cache) e compara
 *  o pacote que ele aponta com o que está rodando. Mudou → se a aba está escondida, recarrega
 *  já; se está à vista, mostra a faixa e recarrega sozinho em 60 s, MAS só quando não há
 *  janela aberta nem campo em edição (recarregar no meio de um texto perderia o texto).
 */
import { useEffect, useRef, useState } from 'react';

const INTERVALO_MS = 2 * 60 * 1000;
const ESPERA_AUTO_S = 60;

function pacoteRodando(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  const m = s?.getAttribute('src')?.match(/assets\/index-[^/]+\.js/);
  return m ? m[0] : null;
}

async function pacotePublicado(): Promise<string | null> {
  const url = `${import.meta.env.BASE_URL}index.html?v=${Date.now()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  const m = (await r.text()).match(/assets\/index-[^"'/]+\.js/);
  return m ? m[0] : null;
}

function podeRecarregarSemPerder(): boolean {
  if (document.querySelector('.p-dialog-mask')) return false;
  const a = document.activeElement;
  return !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable));
}

export function AvisoNovaVersao() {
  const [nova, setNova] = useState(false);
  const [segundos, setSegundos] = useState(ESPERA_AUTO_S);
  const atual = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_APP_BUILD_TIME) return; // só no pacote publicado
    atual.current = pacoteRodando();
    if (!atual.current) return;
    let vivo = true;
    const checar = async () => {
      try {
        const pub = await pacotePublicado();
        if (!vivo || !pub || pub === atual.current) return;
        if (document.hidden) window.location.reload();
        else setNova(true);
      } catch {
        /* sem rede: tenta no próximo ciclo */
      }
    };
    const aoVoltar = () => { if (!document.hidden) void checar(); };
    const t = window.setInterval(() => void checar(), INTERVALO_MS);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    void checar();
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, []);

  useEffect(() => {
    if (!nova) return;
    const t = window.setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          if (podeRecarregarSemPerder()) window.location.reload();
          return ESPERA_AUTO_S; // tem algo aberto: espera mais um ciclo, ¬perde o que ela digitou
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [nova]);

  if (!nova) return null;
  return (
    <div className="mc-nova-versao" role="status">
      <span>
        <strong>Saiu uma versão nova do sistema.</strong> A página se atualiza sozinha em {segundos} s
        (espera você fechar o que estiver aberto).
      </span>
      <button type="button" onClick={() => window.location.reload()}>Atualizar agora</button>
    </div>
  );
}
