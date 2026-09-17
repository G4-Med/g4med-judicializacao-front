import { useState } from 'react';
import type { ReactNode } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { useSearchParams } from 'react-router-dom';
import { ResultadosPage } from '../resultados/ResultadosPage';
import { AguardandoCirurgiaPage } from '../aguardandoCirurgia/AguardandoCirurgiaPage';
import { ResultadosFinanceirosPage } from '../resultadosFinanceiros/ResultadosFinanceirosPage';
import { PerdasPage } from '../perdas/PerdasPage';
import { AbaVerificar } from './AbaVerificar';
import { AbaPerdaComPagamento } from './AbaPerdaComPagamento';
import './PainelResultadosPage.css';

/**
 * PAINEL DE RESULTADOS — 4 telas viram 1, na ordem do fluxo real da G4MED.
 *
 * POR QUE (mandato @R 08/09/2026): ⟦as telas antigas de resultados podem deixar de
 * existir para existir a lógica melhorada com os dados que temos⟧. O grupo "Resultados"
 * tinha 4 entradas de menu que somavam ~1.850 linhas e, juntas, NÃO respondiam a
 * pergunta que importa — "quanto é nosso e ainda não recebemos".
 *
 * AS ABAS SÃO OS ELOS DO FLUXO, ¬categorias arbitrárias:
 *   protocolado → desfecho → cirurgia → comissão
 * A G4MED nunca recebe do Estado: o Estado paga ao MÉDICO (alvará), e o médico deve a
 * comissão do fechamento da cirurgia. Por isso "ganhou" e "recebemos" são elos
 * DIFERENTES, e a aba ② existe exatamente para o vão entre os dois.
 *
 * AGUARDANDO CIRURGIA ENTRA TAMBÉM (revisão @R 08/09, olhando a tela): eu tinha deixado
 * de fora porque ela ESCREVE (confirmarCirurgia / registrarPerdaCirurgia) e temia esconder
 * a ação atrás de mais um clique. O @R apontou o óbvio — ⟦não era melhor tirar resultados,
 * aguardando cirurgia, resultados financeiros e perdas e ter tudo ali uma coisa só⟧ — e ele
 * está certo: a página é renderizada INTEIRA dentro da aba, com seus diálogos e botões
 * intactos. Nada é escondido; só deixa de ter entrada própria no menu. O receio custava
 * mais que o problema: 5 entradas de menu para 1 assunto.
 *
 * POR QUE REUSA AS PÁGINAS INTEIRAS em vez de reescrever as tabelas: elas funcionam e
 * carregam os próprios dados. Reescrever 1.850 linhas para mudar o invólucro é como
 * refazer a fiação da casa para trocar o interruptor. O `<h1>` duplicado de cada uma é
 * escondido por CSS (`.painel-resultados .p-tabview-panels .page-header`) — uma linha,
 * zero mudança em código que já roda em produção, reversível apagando a regra.
 */

// Ordem = ordem do funil real: desfecho → o vão → cirurgia → comissão → perdas.
// 'perda-paga' entra ANTES de 'perdas' (@R 09/09): 192 pedidos marcados como perda em que o
// Estado pagou alguem no mesmo CNJ nao tinham lugar em aba nenhuma. A ordem importa — a aba
// nasce ao lado do dinheiro, ¬enterrada depois das perdas.
const ABAS = ['desfechos', 'verificar', 'cirurgia', 'dinheiro', 'perda-paga', 'perdas'] as const;

export function PainelResultadosPage() {
  const [params, setParams] = useSearchParams();
  // A aba vive na URL para que os redirects das rotas antigas (/perdas,
  // /resultados-financeiros) caiam na aba certa, e para que um link colado no
  // WhatsApp abra onde quem mandou estava olhando.
  const inicial = Math.max(0, ABAS.indexOf(params.get('aba') as typeof ABAS[number]));
  const [ativa, setAtiva] = useState(inicial);

  // ── CARREGA UMA VEZ, DEPOIS FICA (@R 08/09: ⟦carregue uma vez, carregado em cache
  // para facilitar o reacesso⟧) ────────────────────────────────────────────────────
  // O TabView do PrimeReact desmonta o painel inativo por padrão (`renderActiveOnly`),
  // então cada volta a uma aba REMONTA a página e refaz TODAS as chamadas de API.
  // Com 5 abas, quem circula entre elas 3 vezes dispara ~15 buscas para ver os mesmos
  // dados.
  //
  // A cura tem DUAS metades, e uma sozinha não serve:
  //   `renderActiveOnly={false}`  → os painéis montados PERMANECEM montados (é o cache:
  //                                 volta à aba = zero requisição, estado e rolagem intactos)
  //   gate `visitadas`            → mas isso sozinho montaria as 5 de uma vez na abertura,
  //                                 disparando as buscas de todas as telas para ver uma só.
  //                                 Por isso a aba só entra em `visitadas` quando é aberta.
  // Resultado: cada aba custa 1 carregamento, na primeira vez que você a abre — e nunca mais.
  const [visitadas, setVisitadas] = useState<ReadonlySet<number>>(() => new Set([inicial]));

  const trocar = (indice: number) => {
    setAtiva(indice);
    setVisitadas((atual) => (atual.has(indice) ? atual : new Set(atual).add(indice)));
    setParams({ aba: ABAS[indice] }, { replace: true });
  };

  /** Monta o conteúdo só depois da 1ª visita; depois disso ele nunca é desmontado. */
  const seVisitada = (indice: number, conteudo: ReactNode) =>
    visitadas.has(indice) ? conteudo : null;

  return (
    <div className="painel-resultados">
      <div className="painel-resultados__cabecalho">
        <h1>Resultados</h1>
        <p>
          Do protocolo à comissão — ganhar o processo e receber a comissão são{' '}
          <strong>elos diferentes</strong>, e a aba <em>A verificar</em> mostra o vão entre eles.
        </p>
      </div>

      <TabView activeIndex={ativa} onTabChange={(e) => trocar(e.index)} renderActiveOnly={false}>
        <TabPanel header="Desfechos" leftIcon="pi pi-flag mr-2">
          {seVisitada(0, <ResultadosPage />)}
        </TabPanel>
        <TabPanel header="A verificar" leftIcon="pi pi-exclamation-triangle mr-2">
          {seVisitada(1, <AbaVerificar />)}
        </TabPanel>
        <TabPanel header="Aguardando cirurgia" leftIcon="pi pi-calendar-plus mr-2">
          {seVisitada(2, <AguardandoCirurgiaPage />)}
        </TabPanel>
        <TabPanel header="Nosso dinheiro" leftIcon="pi pi-wallet mr-2">
          {seVisitada(3, <ResultadosFinanceirosPage />)}
        </TabPanel>
        <TabPanel header="Perda com pagamento" leftIcon="pi pi-search-dollar mr-2">
          {seVisitada(4, <AbaPerdaComPagamento />)}
        </TabPanel>
        <TabPanel header="Perdas" leftIcon="pi pi-times-circle mr-2">
          {seVisitada(5, <PerdasPage />)}
        </TabPanel>
      </TabView>
    </div>
  );
}
