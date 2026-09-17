import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './AcoesTabela.css';

/**
 * Frame reutilizável para os botões de ação de TODA tabela (Baixar Excel · Colunas
 * · o que vier depois) — @R 27/08 21:05: "vamos criar um container para eles...
 * para botões de ações para todas as tabelas para melhorarmos o frontend".
 *
 * Por que existe: sem um dono único do tamanho, cada página herdava CSS diferente
 * (`.orcamento-table .p-button.p-button-outlined` deixava o Excel com 41px; o
 * Colunas tinha padding próprio de 33px — mesma fileira, alturas desiguais,
 * flagrado no print @R). Este container passa a ser ESSE dono: todo `.p-button`
 * direto dentro dele nasce do mesmo tamanho, sem depender de CSS de página.
 *
 * MODO DE EXIBIÇÃO (@R 28/08 10:5x: "um botão para colunas justificadas para
 * tela, com medida padrão, e uma para o método que usamos hoje"): a escolha é
 * UMA para o sistema inteiro (classe no <body>, lembrada no navegador), porque
 * quem prefere ver tudo na tela prefere em toda tabela — não faz sentido
 * decidir 12 vezes. O CSS do modo vive em App.css (`body.mc-tabelas-justificadas`).
 */

const CHAVE = 'mc:tabelas:modo';
type Modo = 'rolagem' | 'justificada';

function lerModo(): Modo {
  try { return localStorage.getItem(CHAVE) === 'justificada' ? 'justificada' : 'rolagem'; }
  catch { return 'rolagem'; }
}

function aplicarModo(m: Modo) {
  document.body.classList.toggle('mc-tabelas-justificadas', m === 'justificada');
  try { localStorage.setItem(CHAVE, m); } catch { /* navegador sem storage: só não lembra */ }
}

// Aplica o modo lembrado no primeiro paint (antes de qualquer tabela montar).
aplicarModo(lerModo());

export function BotaoModoTabela() {
  const [modo, setModo] = useState<Modo>(lerModo);
  useEffect(() => { aplicarModo(modo); }, [modo]);
  const justificada = modo === 'justificada';
  // <button> cru, não <Button> do PrimeReact: regras de página (.juridico-page .p-button…)
  // engoliam o rótulo e o botão virava um quadrado escuro (print @R 28/08 11:2x).
  return (
    <button type="button" className="mc-modo-tabela"
      onClick={() => setModo(justificada ? 'rolagem' : 'justificada')}
      title={justificada
        ? 'Voltar ao modo de rolagem: cada coluna com sua largura padrão, arraste ou use as barras para ver as demais'
        : 'Ajustar à tela: todas as colunas visíveis cabem na largura da janela (o texto quebra em linhas)'}
      aria-pressed={justificada}
      aria-label="Alternar modo de exibição da tabela">
      <i className={justificada ? 'pi pi-arrows-h' : 'pi pi-window-maximize'} aria-hidden="true" />
      <span>{justificada ? 'Rolagem' : 'Ajustar à tela'}</span>
    </button>
  );
}


/**
 * AVISO DE COLUNAS À DIREITA (@R 29/08 17:45, print de /enviado-ses: "Status Médico"
 * cortado na borda e mais colunas escondidas, sem NADA avisando).
 *
 * Verbatim: "se tiver colunas a direita temos que criar um aviso e um botao para andar
 * para lado" + "algo que ajude a pessoa entender que tem colunas para direita com
 * informação, clique e ela anda SEM IR PARA BAIXO".
 *
 * A última frase é o requisito de verdade: a barra de rolagem do PrimeReact fica no RODAPÉ
 * da tabela. Numa tabela de 30 linhas, descobrir que existe coluna escondida exige rolar a
 * página inteira para baixo primeiro — ou seja, a informação existe e ninguém encontra.
 * Por isso o aviso mora AQUI, na barra de ações do TOPO, junto de "Colunas"/"Ajustar à tela".
 *
 * Conta as colunas cujo fim passa da borda visível (ignora as congeladas, que acompanham a
 * rolagem e nunca estão "escondidas"). Cada clique anda ~85% da largura visível.
 *
 * CICATRIZ 29/08 (loop "Maximum update depth" do PrimeReact 10.9): só chama setState quando
 * algum dos 3 campos MUDOU. Recalcular a cada scroll e setar objeto novo sempre = re-render
 * infinito, exatamente o bug que acabamos de curar nas colunas.
 */
function acharWrapper(el: HTMLElement | null): HTMLElement | null {
  let no: HTMLElement | null = el;
  for (let i = 0; no && i < 6; i++) {
    const w = no.querySelector<HTMLElement>('.p-datatable-wrapper');
    if (w && w.scrollWidth > 0) return w;
    no = no.parentElement;
  }
  return null;
}

export function AvisoColunasDireita() {
  const ancora = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLElement | null>(null);
  const [est, setEst] = useState({ ocultas: 0, esq: false, dir: false });

  useEffect(() => {
    let vivo = true;
    const medir = () => {
      const w = wrapRef.current;
      if (!w || !vivo) return;
      const fim = w.scrollLeft + w.clientWidth;
      // +2px de folga: sub-pixel de borda faria a última coluna "vazar" e contar como oculta.
      const ths = Array.from(w.querySelectorAll<HTMLElement>('.p-datatable-thead > tr > th'));
      const ocultas = ths.filter(th =>
        !th.classList.contains('p-frozen-column') &&
        th.offsetLeft + th.offsetWidth > fim + 2).length;
      const esq = w.scrollLeft > 2;
      const dir = w.scrollLeft + w.clientWidth < w.scrollWidth - 2;
      setEst(a => (a.ocultas === ocultas && a.esq === esq && a.dir === dir)
        ? a                       // nada mudou: devolver o MESMO objeto (¬re-render, ¬loop)
        : { ocultas, esq, dir });
      // A borda da tabela ganha o degradê só enquanto houver corte (affordance passiva).
      w.classList.toggle('mc-tem-mais-direita', dir);
      w.classList.toggle('mc-tem-mais-esquerda', esq);
    };

    // O PrimeReact monta as colunas depois do primeiro paint; sem estas remedições o
    // primeiro cálculo sai com scrollWidth=clientWidth e o aviso nasce escondido para sempre.
    const achar = () => {
      wrapRef.current = acharWrapper(ancora.current);
      if (wrapRef.current) {
        wrapRef.current.addEventListener('scroll', medir, { passive: true });
        ro.observe(wrapRef.current);
        medir();
      }
    };
    const ro = new ResizeObserver(medir);
    achar();
    const t1 = setTimeout(() => { if (!wrapRef.current) achar(); else medir(); }, 250);
    const t2 = setTimeout(() => { if (!wrapRef.current) achar(); else medir(); }, 900);
    window.addEventListener('resize', medir);

    return () => {
      vivo = false;
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('resize', medir);
      wrapRef.current?.removeEventListener('scroll', medir);
      wrapRef.current?.classList.remove('mc-tem-mais-direita', 'mc-tem-mais-esquerda');
      ro.disconnect();
    };
  }, []);

  const andar = (dir: 1 | -1) => {
    const w = wrapRef.current;
    if (!w) return;
    w.scrollBy({ left: dir * Math.round(w.clientWidth * 0.85), behavior: 'smooth' });
  };

  // Nada escondido (ou modo "Ajustar à tela"): o aviso não aparece — ruído zero.
  if (!est.dir && !est.esq) return <span ref={ancora} className="mc-aviso-colunas-ancora" />;

  return (
    <span ref={ancora} className="mc-aviso-colunas">
      {est.esq && (
        <button type="button" className="mc-aviso-colunas__seta" onClick={() => andar(-1)}
          title="Voltar às colunas da esquerda" aria-label="Rolar a tabela para a esquerda">
          <i className="pi pi-chevron-left" aria-hidden="true" />
        </button>
      )}
      {est.dir && (
        <button type="button" className="mc-aviso-colunas__ir" onClick={() => andar(1)}
          title="A tabela continua para o lado. Clique para ver as próximas colunas — sem descer até a barra de rolagem.">
          <i className="pi pi-arrow-right" aria-hidden="true" />
          <span>
            {est.ocultas > 0
              ? <>mais <strong>{est.ocultas}</strong> {est.ocultas === 1 ? 'coluna' : 'colunas'} →</>
              : <>ver o resto da tabela →</>}
          </span>
        </button>
      )}
    </span>
  );
}

export function AcoesTabela({ children }: { children: ReactNode }) {
  return (
    <div className="mc-acoes-tabela">
      {children}
      <BotaoModoTabela />
      <AvisoColunasDireita />
    </div>
  );
}
