import React, { useState } from 'react';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { BotaoCopiar } from '../BotaoCopiar/BotaoCopiar';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import { uploadAnexoOrder, decidirCnjSugerido, extrairNumerosDosAnexos, baixarAnexoDoTipo, salvarBlob, reprocessarDocumentos } from '../../services/api/orders';
import { MarcadorAnotacao } from '../Anotacoes/MarcadorAnotacao';
import { SeloPendencia } from '../PendenciaJuridica/PendenciaJuridica';
import './colunasIdentificacao.css';


/**
 * Colunas de IDENTIFICAÇÃO do pedido, reutilizáveis em toda tabela (task #214, @R 27/08 13:23:
 * "para todas as tabelas: CNJ/SEI com botões de copiar e a comarca").
 *
 * Contrato: o endpoint da tabela devolve, por linha, os campos que `_identificacao_por_order`
 * (backend/views.py) anexa — nprocesso, numeroSei, familiaSei, comarca, distanciaKm, esfera,
 * geoMotivo. São FUNÇÕES que devolvem <Column> (¬componentes): o DataTable do PrimeReact só
 * enxerga Column como filho direto; um wrapper React o esconderia.
 *
 * Uso:  <DataTable ...>{colunaCnj()}{colunaSei()}{colunaComarca()}...</DataTable>
 *       + no estado `filters`: ...FILTROS_IDENTIFICACAO
 */

export interface ItemCadastro {
  ok: boolean;
  fonte: string | null;
  tom: 'ok' | 'acao' | 'humano';
  acao: string | null;
  dono: string | null;
}

export interface Cadastro {
  cnj: ItemCadastro; sei: ItemCadastro; comarca: ItemCadastro; anexo: ItemCadastro;
  completos: number; total: number; faltas: string[]; completo: boolean;
}

export interface LinhaIdentificada {
  cadastro?: Cadastro | null;
  id?: number;
  segredo?: 'sim' | 'possivel' | 'nao' | null;
  temInteiroTeor?: boolean | null;
  semPecaInteiroTeor?: boolean | null;
  semPecaDeclaracao?: string | null;
  solicitante?: string | null;
  segredoFonte?: string | null;
  nprocesso?: string | null;
  /** Números de processo LIDOS do documento que ainda esperam a escolha do jurídico.
   *  Vem preenchido quando a peça trazia MAIS DE UM CNJ — decisão @R 17/09/2026: nesse
   *  caso o sistema não escolhe, mostra os dois e quem decide é pessoa. */
  cnjsSugeridos?: { id: number; cnj: string; pagina?: number | null;
                    documento?: string | null; anexoId?: number | null;
                    /** classe · partes · autuação · vara · movimentação — o que permite
                     *  decidir sem abrir o processo no PJe. Vazio quando veio de documento. */
                    contexto?: string | null; fonte?: string | null }[] | null;
  /** O estado da busca automática do processo. Existe para a tela NUNCA ficar muda:
   *  quando nenhuma via achou o número, a pessoa precisa saber POR QUE — e o porquê
   *  muda o que ela faz em seguida. */
  buscaProcesso?: { status: string; mensagem?: string | null;
                    pedeBuscaManual?: boolean;
                    /** achou processos, mas NENHUM parece ser de saúde (@R 17/09: mostrar
                     *  as opções E o aviso — nunca esconder processo real da pessoa). */
                    semPistaSaude?: boolean } | null;
  numeroSei?: string | null;
  familiaSei?: string | null;
  comarca?: string | null;
  distanciaKm?: number | null;
  esfera?: 'estadual' | 'federal' | 'trabalhista' | 'stf' | 'stj' | 'outra' | null;
  geoMotivo?: string | null;
  /** 'manual' quando não há registro de origem E nenhum vestígio de e-mail. Inferência
   *  declarada — o banco continua sem o dado, e isso é proposital. */
  origemInferida?: string | null;
}

export const FILTROS_IDENTIFICACAO = {
  // 'custom' e NÃO 'contains': o matchMode do objeto `filters` VENCE o da coluna em
  // tabela controlada. Deixar 'contains' aqui faria a coluna declarar filtro de opções e
  // o PrimeReact filtrar por texto — a lista mostraria "Fulano (12)" e a tabela
  // devolveria zero, que é o jeito mais fácil de confundir com "não há nada aqui".
  solicitante: { value: '', matchMode: 'custom' as const },
  nprocesso: { value: '', matchMode: 'contains' as const },
  numeroSei: { value: '', matchMode: 'contains' as const },
  comarca: { value: '', matchMode: 'contains' as const },
};

/* ── FILTROS DE COLUNA (@R 17/09) ───────────────────────────────────────────────────
   ⟦"a coluna Re-pedido, Origem, Segredo precisam ter filtros para os valores ali
   exibidos... SES Anexos que tenham anexos ou não tenham... e o filtro de dias ele filtra
   dias com MAIS DE e aí o usuário escolhe"⟧.

   O QUE ESTAVA ERRADO: essas colunas simplesmente não tinham filtro, e a de Dias tinha um
   de TEXTO (matchMode CONTAINS) — digitar "100" trazia 100, 1002, 210... qualquer número
   que CONTENHA "100", que não é o que ninguém quer de um campo de dias.

   POR QUE DROPDOWN E NÃO CAIXA DE TEXTO: o valor que a pessoa vê na tela é uma etiqueta
   ("Segredo", "E-mail", "Com anexo") e o valor no dado é outro ('sim', 'email', true).
   Caixa de texto filtraria pelo dado, e ninguém digita 'sim' esperando ver "Segredo".
   O dropdown mostra a ETIQUETA e filtra pelo DADO — é a única forma de os dois baterem. */

/** Só as opções que EXISTEM nos dados carregados (@R 17/09: "só vamos aparecer aqueles
 *  que temos ativos em cada tabela... de acordo com o banco de dados").
 *
 *  POR QUE ISTO IMPORTA: oferecer "Recém-nascido" numa tela que não tem nenhum faz a
 *  pessoa filtrar, ver zero linhas e concluir que o filtro está quebrado. Opção que
 *  devolve vazio treina a desconfiar da ferramenta — e a desconfiança não fica só naquela
 *  opção, contamina o filtro inteiro.
 *
 *  `dados` ausente devolve TODAS as opções: página que ainda não carregou não deve
 *  esconder opção nenhuma (durante o carregamento, "não tem" é indistinguível de "ainda
 *  não chegou", e esconder no primeiro seria mentir no segundo). */
/**
 * Combobox de coluna montado A PARTIR DOS DADOS: os valores que existem naquela tabela,
 * cada um com QUANTOS são, do maior para o menor.
 *
 * @R 17/09: ⟦"em area eu preciso que ele liste quantos temos por cada area do maior para
 * o menor combobox"⟧ + ⟦"só vamos aparecer aqueles que temos ativos em cada tabela"⟧ +
 * ⟦"tem que verificar todos os frontends para padronizar"⟧.
 *
 * POR QUE SUBSTITUI A CAIXA "Buscar": digitar exige saber COMO o valor está escrito no
 * banco ("Ortopedia" · "ORTOPEDIA" · "Ortopedia e Traumatologia"). Quem digita o nome
 * quase-certo recebe uma tabela vazia e conclui que não há nada naquela área — o erro
 * silencioso mais caro de uma lista, porque parece resposta.
 *
 * E a CONTAGEM não é enfeite: ela responde antes do clique "vale a pena filtrar isto?".
 * Ordenado por quantidade porque a pergunta real quase sempre começa pelo maior bolo.
 *
 * Valor vazio/nulo vira a opção "(sem preenchimento)" em vez de desaparecer — some da
 * lista é exatamente como se esconde um buraco de cadastro.
 */
export function filtroOpcoesDosDados(
  dados: any[] | undefined,
  extrai: (linha: any) => unknown,
  placeholder = 'Todos',
  rotulo?: (valor: any) => string,
) {
  const contagem = new Map<string, number>();
  for (const linha of dados ?? []) {
    const v = extrai(linha);
    const chave = v === null || v === undefined || v === '' ? SEM_VALOR : String(v);
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const opcoes = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))  // maior→menor; empate em ordem alfabética
    .map(([valor, n]) => ({
      label: `${valor === SEM_VALOR ? '(sem preenchimento)' : (rotulo ? rotulo(valor) : valor)} (${n})`,
      value: valor,
    }));
  return filtroOpcoes(opcoes, placeholder);
}

/** Marcador do vazio — precisa ser um valor comparável pelo EQUALS do PrimeReact. */
export const SEM_VALOR = '__SEM_VALOR__';

/**
 * REGISTRO DOS FILTROS CUSTOM — sem isto, `filterMatchMode="custom"` filtra NADA.
 *
 * @R 17/09, print do Orçamento Médico: a opção dizia "2× pedido — urgência (3)" e a
 * tabela respondia "0 de 32 pedidos". A contagem estava certa (os 3 existem); quem
 * mentia era o filtro.
 *
 * O PORQUÊ, lido no fonte do PrimeReact 10.9 (datatable.cjs.js:6910-6922): ele registra
 * o `filterFunction` da coluna como `custom_<campo>` no FilterService **apenas dentro do
 * `else` de `if (filters)`** — ou seja, SÓ quando a tabela é não-controlada. Todas as
 * nossas telas passam `filters={filters}`, então esse ramo nunca roda, o registro nunca
 * acontece, e na hora de filtrar ele procura `custom_vezesPedido`, não encontra, e
 * devolve zero linha. Não é um bug nosso nem deles: é uma armadilha da combinação
 * `filterDisplay="row"` + estado controlado + matchMode custom.
 *
 * Por isso o registro vai aqui, no módulo que TODA página de tabela já importa — assim
 * ninguém precisa lembrar de registrar ao criar a próxima coluna custom. Quem esquecer
 * não vê erro: vê uma tabela vazia, que é o resultado mais fácil de confundir com
 * "não há nada aqui".
 */
import { FilterService } from 'primereact/api';

const CAMPOS_OPCAO = [
  'vezesPedido', 'segredo', 'origemRegistro', 'sesAnexos', 'tipoPaciente', 'area',
  'cadastro', 'temInteiroTeor', 'solicitante',
];
const CAMPOS_PERIODO = ['chegouEm', 'dataEnvio', 'dataStatusJuridico', 'dataPedido'];

for (const campo of CAMPOS_OPCAO) {
  FilterService.register(`custom_${campo}`, (valor: unknown, escolha: unknown) =>
    casaOpcaoDosDados(valor, escolha));
}
for (const campo of CAMPOS_PERIODO) {
  FilterService.register(`custom_${campo}`, (valor: unknown, escolha: unknown) =>
    casaPeriodo(valor, escolha));
}


/**
 * Casa a escolha do combobox contra o valor da linha, tratando o vazio.
 * Usar com `filterMatchMode="custom"` quando a coluna puder ter célula em branco.
 */
export const casaOpcaoDosDados = (valor: unknown, escolha: unknown): boolean => {
  if (escolha === null || escolha === undefined || escolha === '') return true;
  const vazio = valor === null || valor === undefined || valor === '';
  return escolha === SEM_VALOR ? vazio : String(valor) === String(escolha);
};

export function opcoesPresentes(
  todas: { label: string; value: unknown }[],
  dados: unknown[] | undefined,
  extrai: (linha: any) => unknown,
): { label: string; value: unknown }[] {
  if (!dados || dados.length === 0) return todas;
  const presentes = new Set<unknown>(
    dados.map(extrai).filter((v) => v !== null && v !== undefined));
  const filtradas = todas.filter((o) => presentes.has(o.value));
  // se NADA casou, algo está errado na régua de extração — devolver vazio deixaria o
  // filtro sem nenhuma opção, que é pior que oferecer demais
  return filtradas.length > 0 ? filtradas : todas;
}

/** Dropdown de filtro com as opções da própria coluna. `showClear` sempre: filtro sem
 *  como limpar é armadilha — a pessoa filtra, esquece, e jura que sumiram pedidos. */
export const filtroOpcoes = (opcoes: { label: string; value: unknown }[], placeholder = 'Todos') =>
  (options: any) => (
    <Dropdown
      value={options.value}
      options={opcoes}
      onChange={(e) => options.filterApplyCallback(e.value)}
      placeholder={placeholder}
      showClear
      className="p-column-filter ident-filtro-opcoes"
    />
  );

/** Filtro numérico "MAIS DE N" (@R 17/09, sobre a coluna Dias). Usa o matchMode `gte`,
 *  ¬texto: com CONTAINS, "100" trazia 1002 e 210. */
export const filtroMaiorQue = (placeholder = 'mais de…') => (options: any) => (
  <InputNumber
    value={options.value}
    onValueChange={(e) => options.filterApplyCallback(e.value)}
    placeholder={placeholder}
    min={0}
    className="p-column-filter"
    inputStyle={{ width: '6.5rem' }}
  />
);

/** Filtro de DATA por FAIXA DE TEMPO — nunca por data exata.
 *
 *  Ninguém procura "chegou em 14/03": procura "chegou esta semana" ou "está parado há mais
 *  de um mês". Filtro de data exata exige a pessoa saber o dia que ela está procurando, que
 *  é justamente o que ela não sabe quando abre o filtro.
 *
 *  `null` (sem data) NÃO entra em nenhuma faixa de tempo — tem opção própria. Não ter data
 *  é diferente de ter uma data antiga, e juntar os dois esconde o pedido que nunca andou. */
export const OPCOES_PERIODO = [
  { label: 'Últimos 7 dias', value: '7' },
  { label: 'Últimos 30 dias', value: '30' },
  { label: 'Últimos 90 dias', value: '90' },
  { label: 'Há mais de 90 dias', value: 'velho' },
  { label: 'Sem data', value: 'sem' },
];

/** O casamento da opção com o dado. Usar com `filterMatchMode="custom"`. */
export const casaPeriodo = (data: unknown, escolha: unknown): boolean => {
  if (!escolha) return true;
  if (!data) return escolha === 'sem';
  if (escolha === 'sem') return false;
  const dias = (Date.now() - new Date(data as string).getTime()) / 86400000;
  if (Number.isNaN(dias)) return false;        // data ilegível ¬entra em faixa nenhuma
  if (escolha === '7') return dias <= 7;
  if (escolha === '30') return dias <= 30;
  if (escolha === '90') return dias <= 90;
  if (escolha === 'velho') return dias > 90;
  return false;
};

/** Tipo de paciente — os 4 valores que `tagTipoPaciente` renderiza. */
export const OPCOES_TIPO_PACIENTE = [
  { label: 'Recém-nascido', value: 'Recém-nascido' },
  { label: 'Pediátrico', value: 'Pediátrico' },
  { label: 'Adulto', value: 'Adulto' },
  { label: 'Idoso', value: 'Idoso' },
];

/** As opções de cada coluna, num lugar só — para a tela e o filtro nunca discordarem. */
export const OPCOES_SEGREDO = [
  { label: 'Segredo', value: 'sim' },
  { label: 'Possível', value: 'possivel' },
  { label: 'Sem segredo', value: 'nao' },
];

export const OPCOES_ORIGEM = [
  { label: 'E-mail', value: 'email' },
  { label: 'Manual', value: 'manual' },
  { label: 'Base antiga', value: 'base_antiga' },
];

export const OPCOES_REPEDIDO = [
  { label: 'Com urgência (2× ou +)', value: 'sim' },
  // o rótulo é o MESMO que a célula mostra (@R 17/09) — filtro que chama a coisa de um
  // jeito e a tela de outro obriga a pessoa a traduzir, e é aí que ela desiste do filtro
  { label: 'Único pedido', value: 'nao' },
];

export const OPCOES_CADASTRO = [
  { label: 'Completo', value: 'sim' },
  { label: 'Falta algo', value: 'nao' },
];

export const OPCOES_INTEIRO_TEOR = [
  { label: 'Tem a peça', value: 'sim' },
  { label: 'Sem a peça', value: 'nao' },
];

export const OPCOES_ANEXOS = [
  { label: 'Com anexo', value: 'sim' },
  { label: 'Sem anexo', value: 'nao' },
];

const filtro = (placeholder: string) => (options: any) => (
  <InputText value={options.value || ''} onChange={(e) => options.filterApplyCallback(e.target.value)}
    placeholder={placeholder} className="p-column-filter" />
);

/** Os números que a peça trazia, esperando a escolha do jurídico.
 *
 *  POR QUE ISTO EXISTE (decisão @R 17/09/2026, cartão perguntas_extracao_cnj): quando o
 *  documento traz MAIS DE UM número de processo — o caso de uma cópia integral, que cita
 *  apensos e precedentes — o sistema NÃO escolhe. ⟦"o sistema mostra os dois na tela do
 *  pedido e o jurídico escolhe qual é o certo. Nada é gravado sozinho"⟧.
 *
 *  Sem este seletor a decisão morria no banco: as sugestões existiam e ninguém as via.
 *  Caso real que fundou isto: pedido 1254, peça de 166 páginas com o número na página 1
 *  (capa) e outro na 164 — e a coluna Nº CNJ mostrando "—" como se não houvesse nada.
 */
function SeletorCnj({ linha, aoDecidir }: {
  linha: LinhaIdentificada;
  aoDecidir?: (cnj: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const sugestoes = linha.cnjsSugeridos || [];

  async function escolher(sugeridoId: number, cnj: string) {
    if (!linha.id) return;
    setGravando(sugeridoId); setErro(null);
    try {
      await decidirCnjSugerido(linha.id, sugeridoId, 'aplicar');
      setAberto(false);
      aoDecidir?.(cnj);          // a tela recarrega; sem isto o número só aparece no F5
    } catch (e: any) {
      setErro(e?.response?.data?.error || 'Não consegui gravar. Tente de novo.');
    } finally {
      setGravando(null);
    }
  }

  return (
    <>
      <button type="button" className="ident-cnj-sugerido" onClick={() => setAberto(true)}
        title="O documento trazia mais de um número de processo — clique para escolher qual é o certo">
        {sugestoes.length} número{sugestoes.length > 1 ? 's' : ''} encontrado{sugestoes.length > 1 ? 's' : ''}
      </button>
      <Dialog visible={aberto} onHide={() => setAberto(false)} style={{ width: '34rem' }}
        header="Qual é o número deste processo?">
        <p className="ident-cnj-ajuda">
          {sugestoes.some((s) => s.fonte === 'pje_publico')
            ? 'Estes são os processos que a consulta pública do TJMG devolveu para esta pessoa. ' +
              'Nada foi gravado — o sistema não tem como saber qual é o nosso. Escolha o correto.'
            : 'Estes números foram lidos do documento anexado. Como havia mais de um, nada foi ' +
              'gravado — uma cópia integral costuma citar outros processos. Escolha o correto.'}
        </p>
        {sugestoes.map((s) => (
          <div key={s.id} className="ident-cnj-opcao">
            <div>
              <code className="ident-numero">{s.cnj}</code>
              <div className="ident-cnj-origem">
                {s.fonte === 'pje_publico'
                  ? 'consulta pública do TJMG'
                  : `${s.documento || 'documento'}${s.pagina ? ` · página ${s.pagina}` : ''}`}
              </div>
              {s.contexto && <div className="ident-cnj-contexto">{s.contexto}</div>}
            </div>
            <button type="button" className="ident-cnj-usar" disabled={gravando !== null}
              onClick={() => escolher(s.id, s.cnj)}>
              {gravando === s.id ? 'gravando…' : 'é este'}
            </button>
          </div>
        ))}
        {erro && <p className="ident-cnj-erro">{erro}</p>}
      </Dialog>
    </>
  );
}

/** O que a tela diz quando NENHUMA via achou o número.
 *
 *  POR QUE (@R 17/09): ⟦"dizer que cnj deve ser procurado manualmente caso todas falhem e
 *  se não for segredo de justiça"⟧. Célula vazia lê como "ninguém olhou ainda" — e aqui
 *  alguém olhou, tentou, e o resultado tem um motivo que muda o próximo passo da pessoa:
 *    · não identifiquei a pessoa  → conferir a grafia do nome
 *    · era menor na data          → procurar pelo responsável
 *    · nada público               → pode ser segredo; não adianta procurar no site
 *
 *  ⚠ FALHOU não chega aqui: erro técnico volta para a fila, nunca vira veredito.
 */
function AvisoBuscaManual({ busca }: { busca: LinhaIdentificada['buscaProcesso'] }) {
  if (!busca?.pedeBuscaManual) return null;
  const segredo = busca.status === 'NADA_PUBLICO';
  return (
    <span className={`ident-manual${segredo ? ' ident-manual-segredo' : ''}`}
      title={busca.mensagem || ''}>
      {segredo ? 'possível segredo' : 'buscar à mão'}
    </span>
  );
}

/** Botão "tentar extrair" — relê os documentos do pedido e popula o que achar.
 *
 *  POR QUE (@R 17/09/2026): ⟦"na coluna cnj e sei vamos criar um botao para tentar extrair
 *  dos documentos caso exista documentos SES Anexos para ter um botao que tenta buscar e
 *  popular para os registros"⟧.
 *
 *  A leitura automática só acontece quando o documento ENTRA. Mas a leitura MELHORA: só em
 *  17/09 ela aprendeu a ler metadados, a reconhecer o SEI escrito com "_" (a forma que
 *  aparece em nome de arquivo) e a usar OCR em qualquer tipo. Documento guardado antes
 *  disso não é relido sozinho. Este botão é a pessoa dizendo "tenta de novo agora".
 *
 *  Caso real que o fundou: o relatório do pedido 1261 tinha 2 páginas sem texto nenhum e o
 *  número SEI no TÍTULO do arquivo. O botão o encontrou em um clique.
 */
function BotaoExtrair({ orderId, aoConcluir }: { orderId?: number; aoConcluir?: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);

  if (!orderId) return null;

  async function tentar() {
    setRodando(true); setResposta(null);
    try {
      const { data } = await extrairNumerosDosAnexos(orderId!);
      setResposta(data?.mensagem || 'Pronto.');
      if ((data?.achados || []).length) aoConcluir?.();   // recarrega a lista: sem isto o
                                                          // número achado só aparece no F5
    } catch (e: any) {
      setResposta(e?.response?.data?.error || 'Não consegui ler os documentos agora.');
    } finally {
      setRodando(false);
    }
  }

  return (
    <span className="ident-extrair-wrap">
      <button type="button" className="ident-extrair" onClick={tentar} disabled={rodando}
        title="Ler os documentos anexados e preencher o número, se ele estiver lá">
        {rodando ? 'lendo…' : 'tentar extrair'}
      </button>
      {resposta && <small className="ident-extrair-msg" title={resposta}>{resposta}</small>}
    </span>
  );
}

export function colunaCnj(largura = '14rem', aoDecidirCnj?: (cnj: string) => void) {
  return (
    <Column key="col-cnj" field="nprocesso" header={cabecalhoComHint('Nº CNJ', EXPLICA.cnj)} sortable filter
      filterElement={filtro('Buscar CNJ')} style={{ minWidth: largura }}
      body={(r: LinhaIdentificada) => r.nprocesso
        ? <><code className="ident-numero" title="Número CNJ do processo">{r.nprocesso}</code><BotaoCopiar valor={r.nprocesso} rotulo="número CNJ" /></>
        // sem número gravado, mas a peça trazia candidatos: a coluna deixa de ser um traço
        // mudo e vira a porta da escolha (a decisão @R só existe se chegar à tela)
        : (r.cnjsSugeridos && r.cnjsSugeridos.length > 0)
          // @R 17/09: "mostrar as opções E um aviso ao lado". Esconder os processos seria
          // tirar da advogada um dado real — ela pode saber algo que o sistema não sabe.
          ? <><SeletorCnj linha={r} aoDecidir={aoDecidirCnj} />
              {r.buscaProcesso?.semPistaSaude && (
                <span className="ident-sem-saude" title={r.buscaProcesso.mensagem || ''}>
                  nenhum parece de saúde
                </span>)}
            </>
          // vazio E sem candidato: se a busca já rodou e não achou, DIZ o porquê; senão
          // oferece a ação que ainda pode resolver. Nunca um traço mudo.
          : r.buscaProcesso?.pedeBuscaManual
            ? <AvisoBuscaManual busca={r.buscaProcesso} />
            : <BotaoExtrair orderId={r.id} aoConcluir={aoDecidirCnj ? () => aoDecidirCnj('') : undefined} />} />
  );
}

export function colunaSei(largura = '12rem', aoRecarregar?: () => void) {
  return (
    <Column key="col-sei" field="numeroSei" header={cabecalhoComHint('Nº SEI', EXPLICA.sei)} sortable filter
      filterElement={filtro('Buscar SEI')} style={{ minWidth: largura }}
      body={(r: LinhaIdentificada) => {
        if (!r.numeroSei) return <BotaoExtrair orderId={r.id} aoConcluir={aoRecarregar} />;
        // O PAGADOR vai ETIQUETADO (@R 17/09): 1080.01.* é o protocolo administrativo do
        // pedido; 1320.01.* é o do empenho de pagamento. São chaves diferentes, e copiar
        // uma achando que é a outra manda a pessoa ao lugar errado. O backend já prefere
        // o administrativo quando existem os dois — quando chega um pagador aqui é porque
        // é o ÚNICO que temos, e dizer isso é melhor que mostrar o número mudo (ou, como
        // era antes, deixar a célula vazia e parecer que a SES não mandou nada).
        const pagador = r.familiaSei === 'PAGADOR';
        return (
          <>
            <code className="ident-numero"
              title={pagador
                ? 'SEI do PAGAMENTO (empenho do depósito judicial) — não é o protocolo administrativo do pedido. É o único SEI que temos deste pedido.'
                : r.familiaSei ? `Família ${r.familiaSei}` : 'Número SEI'}>{r.numeroSei}</code>
            {pagador && <Tag value="pagador" severity="warning" className="ident-sei-familia"
              title="Número do empenho de pagamento, ¬do protocolo do pedido" />}
            <BotaoCopiar valor={r.numeroSei} rotulo="número SEI" />
          </>
        );
      }} />
  );
}

export function colunaComarca(largura = '11rem') {
  return (
    <Column key="col-comarca" field="comarca" header={cabecalhoComHint('Comarca', EXPLICA.comarca)} sortable filter
      filterElement={filtro('Buscar comarca')} style={{ minWidth: largura }}
      body={(r: LinhaIdentificada) => {
        // @R 27/08: "federal não tem distância" — dito na cara, ¬célula vazia.
        if (r.esfera === 'federal') return <Tag value="Federal" severity="info" title="Justiça Federal — sem comarca estadual" />;
        if (!r.comarca) return <span className="ident-vazio" title={r.geoMotivo ?? ''}>
          {r.geoMotivo === 'sem_cnj' ? 'sem nº do processo' : 'comarca não mapeada'}</span>;
        return (
          <span className="ident-geo">
            <strong>{r.comarca}</strong>
            {r.distanciaKm !== null && r.distanciaKm !== undefined && (
              <small>{r.distanciaKm === 0 ? 'aqui (JF)' : `${r.distanciaKm.toLocaleString('pt-BR')} km`}</small>
            )}
          </span>
        );
      }} />
  );
}

/** Coluna Segredo × Sem segredo em TODA tabela (@R 27/08 16:52: "toda coluna tem se o
 *  processo é segredo de justiça ou sem segredo em cada página"). 3 estados do backend:
 *  sim = marca confirmada · possivel = API DataJud sinalizou, aguardando confirmação
 *  humana (aba Candidatos do Segredo) · nao = sem marca nem sinal. */
/** Torna uma etiqueta da tabela CLICÁVEL, abrindo a ficha do pedido (@R 17/09: "ao
 *  clicar em sem segredo ou segredo deveria abrir a ficha com a justificativa,
 *  observações e orçamentos e informações").
 *
 *  POR QUE ABRIR A FICHA E NÃO UM POPUP PRÓPRIO: a ficha JÁ mostra a decisão jurídica,
 *  as observações, o orçamento e os arquivos de cada fase — é literalmente o que ele
 *  pediu. Um popup novo ao lado seria uma segunda verdade para manter, e a próxima
 *  melhoria teria que ser feita duas vezes.
 *
 *  Precisa ser um COMPONENTE (¬uma função que retorna JSX dentro do body da coluna)
 *  porque `useFichaPedido` é um hook: chamá-lo dentro do `body={}` da coluna quebraria
 *  as regras de hooks — o body roda por linha, em ordem que muda com filtro e ordenação.
 */
function AbreFicha({ id, children, titulo }: { id?: number; children: React.ReactNode; titulo?: string }) {
  const { abrir, disponivel } = useFichaPedido();
  if (!id || !disponivel) return <>{children}</>;   // fora do provider, segue só exibindo
  return (
    <span
      className="ident-abre-ficha"
      role="button"
      tabIndex={0}
      title={titulo ?? 'Abrir a ficha deste pedido'}
      onClick={(e) => { e.stopPropagation(); abrir(id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(id); } }}
    >
      {children}
    </span>
  );
}

export function colunaSegredo(largura = '9rem', dados?: any[]) {
  return (
    <Column key="col-segredo" field="segredo" header={cabecalhoComHint('Segredo', EXPLICA.segredo)} sortable
      filter filterMatchMode="custom" filterFunction={casaOpcaoDosDados} showFilterMenu={false}
      filterElement={filtroOpcoesDosDados(dados, (r: any) => r?.segredo, 'Todos',
        (v) => ({ sim: 'Segredo', possivel: 'Possível', nao: 'Sem segredo' } as Record<string, string>)[v] ?? String(v))}
      style={{ minWidth: largura }}
      body={(r: LinhaIdentificada) => {
        // @R 17/09: "encurtar o nome Segredo de Justiça para não quebrar linha". O texto
        // completo vai para o hover — encurta o que ocupa espaço, ¬o que informa.
        if (r.segredo === 'sim') return <AbreFicha id={(r as any).id} titulo="Abrir a ficha: decisão jurídica, observações, orçamento e arquivos"><Tag value="Segredo" severity="danger" icon="pi pi-lock" title={`Segredo de Justiça — ${r.segredoFonte ?? 'marcado no sistema'}`} /></AbreFicha>;
        if (r.segredo === 'possivel') return <AbreFicha id={(r as any).id} titulo="Abrir a ficha: decisão jurídica, observações, orçamento e arquivos"><Tag value="Possível" severity="warning" icon="pi pi-question-circle" title={`Possível segredo de justiça: sinal da API, ainda não confirmado. Confirme na tela Segredo de Justiça. ${r.segredoFonte ?? ''}`} /></AbreFicha>;
        if (r.segredo === 'nao') return <AbreFicha id={(r as any).id} titulo="Abrir a ficha: decisão jurídica, observações, orçamento e arquivos"><Tag value="Sem segredo" severity="secondary" title={r.segredoFonte ?? 'Sem marca nem sinal da API'} /></AbreFicha>;
        return <span className="ident-vazio">—</span>;
      }} />
  );
}

/** Solicitante do Estado (@R 27/08 19:40: "coluna para sabermos quem pediu, o volume
 *  de pedidos e o e-mail de quem pediu"). Nome legível derivado do e-mail SES
 *  (aline.marques.goncalves@... → Aline Marques Goncalves) + botão ✉ abre o e-mail
 *  (mailto) + copiar. Volume por pessoa: filtre pela coluna ou exporte no Excel. */
function nomeDoEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.split(/[._-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/* Peça de inteiro teor (@R 27/08 20:27): a decisão do Jurídico exige a peça
   (equipe g4med pode passar sem), e ENQUANTO ESTIVER VAZIA qualquer fase pode
   anexá-la — esta célula é esse "qualquer momento": ✓ quando existe, botão
   Anexar quando falta. O upload vai pro bucket R2 (tipo DECISAO_INTEIRO_TEOR). */
/* REPROCESSAR (@R 19/09/2026): "ao lado de inteiro teor de cada item na coluna um botão
   reprocessar, que vai pedir a confirmação e vai reprocessar a extração de documentos caso eu
   precise corrigir alguma". Difere do "tentar extrair" (que nunca sobrescreve): aqui, com a
   confirmação, as peças voltam à fila de leitura e um CNJ único lido da peça CORRIGE o atual —
   o anterior fica no acompanhamento do pedido. A confirmação é exigida também pelo servidor. */
function BotaoReprocessar({ orderId }: { orderId: number }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);

  async function reprocessar() {
    const ok = window.confirm(
      'Reprocessar os documentos deste pedido?\n\n' +
      '• As peças voltam para a fila de leitura (a leitura anterior fica registrada).\n' +
      '• O número do processo (CNJ) e os SEI são relidos — se a peça trouxer um CNJ diferente do atual, ele SUBSTITUI o atual (o anterior fica no histórico).\n\n' +
      'Use quando precisar corrigir uma extração errada.');
    if (!ok) return;
    setRodando(true); setResposta(null);
    try {
      const { data } = await reprocessarDocumentos(orderId);
      setResposta(data?.mensagem || 'Reprocessamento pedido.');
    } catch (e: any) {
      setResposta(e?.response?.data?.error || 'Não consegui pedir o reprocessamento agora.');
    } finally {
      setRodando(false);
    }
  }

  return (
    <span className="ident-extrair-wrap">
      <button type="button" className="ident-extrair inteiro-teor-reprocessar" onClick={reprocessar}
        disabled={rodando} aria-label="Reprocessar os documentos deste pedido"
        title="Reprocessar: devolve as peças à fila de leitura e relê CNJ/SEI podendo corrigir (pede confirmação)">
        <i className={rodando ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} /> {rodando ? 'reprocessando…' : 'Reprocessar'}
      </button>
      {resposta && <small className="ident-extrair-msg" title={resposta}>{resposta}</small>}
    </span>
  );
}

function CelulaInteiroTeor({ linha }: { linha: LinhaIdentificada }) {
  const [enviado, setEnviado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (linha.temInteiroTeor || enviado) {
    /* O BADGE BAIXA (@R 18/09: "não estamos conseguindo baixar a peça clicando na tabela").
       Antes era um Tag informativo — ¬havia o que clicar. E o link direto do R2 também não
       resolveria: o bucket não manda Content-Disposition, então o Chrome ABRE o PDF (8,8 MB
       no #1252) em vez de baixar, e o atributo `download` é ignorado em cross-origin.
       Por isso aponta para a rota do backend, que força o attachment. */
    const tag = <Tag value="Inteiro teor ✓" severity="success" icon="pi pi-file-check"
      title="A peça de inteiro teor já está anexada a este pedido" />;
    if (!linha.id) return tag;
    /* ⚠ NÃO usar <a href>: navegação de browser não manda o header Authorization e a rota
       devolve 401 (foi o que aconteceu com o @R em 18/09). O download passa pelo axios. */
    return (
      <span className="inteiro-teor-wrap inteiro-teor-wrap--linha">
      <button type="button" className="inteiro-teor-baixar" disabled={baixando}
        title={baixando ? 'Baixando…' : 'Baixar a peça de inteiro teor (PDF)'}
        onClick={async () => {
          setBaixando(true);
          try {
            const { data } = await baixarAnexoDoTipo(linha.id as number, 'DECISAO_INTEIRO_TEOR');
            salvarBlob(data, `peca-inteiro-teor-${linha.id}.pdf`);
          } catch {
            alert('Não foi possível baixar a peça agora. Se o problema continuar, me avise.');
          } finally {
            setBaixando(false);
          }
        }}>
        {baixando ? <i className="pi pi-spin pi-spinner" /> : tag}
      </button>
      <BotaoReprocessar orderId={linha.id as number} />
      </span>
    );
  }
  if (!linha.id) return <span className="ident-vazio">—</span>;
  const declarado = !!linha.semPecaInteiroTeor;
  return (
    <span className="inteiro-teor-wrap">
    {declarado && <Tag value="Sem peça (declarado)" severity="warning" icon="pi pi-info-circle"
      title={`O jurídico declarou que este processo não tem peça de inteiro teor. ${linha.semPecaDeclaracao ?? ''}`} />}
    <label className="inteiro-teor-anexar" title={declarado ? 'Apareceu a peça? Anexe aqui — a declaração deixa de valer.' : 'Falta a peça de inteiro teor — anexe o PDF aqui (pode ser feito em qualquer fase)'}>
      <i className={enviando ? 'pi pi-spin pi-spinner' : 'pi pi-upload'} />
      {enviando ? ' Enviando…' : ' Anexar'}
      <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={enviando}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setEnviando(true);
          try {
            await uploadAnexoOrder(linha.id as number, f, 'DECISAO_INTEIRO_TEOR');
            setEnviado(true);
          } catch {
            alert('Não foi possível anexar a peça. Tente novamente.');
          } finally {
            setEnviando(false);
          }
        }} />
    </label>
    </span>
  );
}

export function colunaInteiroTeor(largura = '10rem') {
  return (
    <Column key="col-inteiro-teor" field="temInteiroTeor"
      header={cabecalhoComHint('Inteiro teor', EXPLICA.inteiroTeor)} sortable
      style={{ minWidth: largura }}
      {...{
        filter: true, showFilterMenu: false, filterMatchMode: 'custom',
        // TRÊS estados, ¬dois: "sem a peça" e "declarado sem peça" são coisas diferentes —
        // no segundo alguém já olhou e disse que a peça não existe. Juntá-los faria a
        // equipe procurar de novo o que já foi procurado.
        // ⚠ 2 ESTADOS, ¬3 — e o limite é do PrimeReact, ¬escolha de desenho.
        // Eu tinha escrito 3 ("declarado sem peça" separado), lendo a linha inteira via
        // `params.rowData`. O filterFunction do PrimeReact 10 recebe APENAS
        // (valorDoCampo, filtro, locale, {column}) — conferido no fonte do pacote. Com
        // `rowData` undefined, o filtro teria mostrado TUDO numa opção e NADA na outra,
        // em silêncio, e o build passa porque `any` não reclama.
        // Quem precisa separar "declarado sem peça" usa a tela Segredo/o hint da célula.
        filterFunction: (temPeca: any, escolha: any) => {
          if (!escolha) return true;
          return escolha === 'sim' ? !!temPeca : !temPeca;
        },
        filterElement: filtroOpcoes(OPCOES_INTEIRO_TEOR, 'Todos'),
      }}
      body={(r: LinhaIdentificada) => <CelulaInteiroTeor linha={r} />} />
  );
}

export function colunaSolicitante(largura = '13rem', dados?: any[]) {
  /* QUEM MAIS ENVIA (@R 17/09: "em buscar solicitante vamos classificar eles e o número
     de envios de cada um para sabermos quem mais envia").

     O campo de texto exigia saber o nome ANTES de procurar — e a pergunta que se faz aqui
     é justamente "quem são e quantos cada um manda?". A lista já vem ordenada do maior
     volume para o menor (o mesmo helper das outras colunas), com a contagem ao lado, e o
     rótulo usa o nome legível em vez do e-mail cru, que é como a coluna já se apresenta.

     Sem `dados` (tela que ainda não passou a lista) continua o campo de texto — degrada,
     não quebra. */
  const filtroDoSolicitante = dados
    ? filtroOpcoesDosDados(dados, (r: any) => r?.solicitante, 'Todos os solicitantes',
        (v) => `${nomeDoEmail(String(v))} · ${v}`)
    : filtro('Buscar solicitante');
  return (
    <Column key="col-solicitante" field="solicitante" header={cabecalhoComHint('Solicitante', EXPLICA.solicitante)}
      sortable filter showFilterMenu={!dados}
      {...(dados ? { filterMatchMode: 'custom' as const, filterFunction: casaOpcaoDosDados } : {})}
      filterElement={filtroDoSolicitante} style={{ minWidth: largura }}
      body={(r: LinhaIdentificada) => {
        if (!r.solicitante) return <span className="ident-vazio">—</span>;
        return (
          <span className="ident-geo">
            <strong>{nomeDoEmail(r.solicitante)}</strong>
            <small style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {r.solicitante}
              <a href={`mailto:${r.solicitante}`} title={`Abrir e-mail para ${r.solicitante}`}
                onClick={(e) => e.stopPropagation()} style={{ lineHeight: 1 }}>
                <i className="pi pi-envelope" style={{ fontSize: '0.75rem' }} />
              </a>
              <BotaoCopiar valor={r.solicitante} rotulo="e-mail do solicitante" />
            </small>
          </span>
        );
      }} />
  );
}

/** Tipo do paciente (@R 27/08 18:51 + 19:26): Recém-nascido ≤28 dias · Pediátrico <18 ·
 *  Adulto 18-59 · Idoso 60+ (Estatuto do Idoso). Sem data = "—". */
export function tagTipoPaciente(tipo?: string | null) {
  if (!tipo) return <span className="ident-vazio" title="Sem data de nascimento no pedido">—</span>;
  const sev = tipo === 'Recém-nascido' ? 'contrast'
    : tipo === 'Pediátrico' ? 'warning'
    : tipo === 'Idoso' ? 'danger' : 'info';
  return <Tag value={tipo} severity={sev as any}
    title={tipo === 'Recém-nascido' ? 'Até 28 dias de vida (neonato)' : undefined} />;
}

/** Célula de nome com botão de copiar — para a coluna Paciente que cada tela já tem. */
/** @R 20/09 (reunião Fabrício, Fase 5): "!" na frente do nome quando o pedido tem anotação
 *  interna. Ponto único: as 10 filas passam por aqui, então todas ganham o marcador de uma vez. */
export function nomeComCopiar(nome: string | null | undefined, orderId?: number | null) {
  return <>{orderId ? <SeloPendencia orderId={orderId} /> : null}{orderId ? <MarcadorAnotacao orderId={orderId} /> : null}{nome}<BotaoCopiar valor={nome} rotulo="nome do paciente" /></>;
}



/** Hint de coluna (@R 27/08 14:26: "ao lado de cada coluna um hint para abrir um modal
 *  explicando o que é"): ícone ? no cabeçalho → Dialog com a explicação em linguagem de
 *  operação. Reutilizável por qualquer tabela: header={cabecalhoComHint('Nº CNJ', <>...</>)} */
function HintColuna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="hint-coluna" aria-label={`O que é ${titulo}?`}
        title={`O que é ${titulo}?`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>?</button>
      <Dialog header={titulo} visible={aberto} modal style={{ width: '34rem', maxWidth: '94vw' }}
        onHide={() => setAberto(false)} dismissableMask>
        <div className="hint-coluna__corpo">{children}</div>
      </Dialog>
    </>
  );
}

export function cabecalhoComHint(titulo: string, explicacao: React.ReactNode) {
  return (
    <span className="cabecalho-hint">
      {titulo}
      <HintColuna titulo={titulo}>{explicacao}</HintColuna>
    </span>
  );
}

const EXPLICA = {
  inteiroTeor: <>
    <p>A <strong>peça de inteiro teor</strong> é o PDF da decisão judicial completa,
    guardado no servidor junto ao pedido.</p>
    <p>Ela é exigida na Análise Jurídica ao decidir Cotar ou Não Cotar (a equipe g4med
    pode seguir sem — o escritório jurídico não). Enquanto estiver faltando, o botão
    <em> Anexar</em> aparece aqui em qualquer fase.</p>
  </>,
  cnj: <>
    <p>O <strong>número CNJ</strong> é a identidade nacional do processo judicial (padrão do
    Conselho Nacional de Justiça): <code>NNNNNNN-DD.AAAA.J.TR.OOOO</code>.</p>
    <p>É por ele que cruzamos o pedido com os pagamentos do Estado. O sistema valida o
    dígito verificador — número com DV errado não entra.</p>
    <p><em>De onde vem:</em> lido automaticamente dos PDFs anexados ao e-mail, ou digitado
    pelo jurídico na análise. Um clique no número seleciona tudo para copiar.</p>
  </>,
  sei: <>
    <p>O <strong>número SEI</strong> é o protocolo do processo ADMINISTRATIVO no Estado
    (SEI-MG) — o par do CNJ: o CNJ acha o processo na Justiça, o SEI acha o pagamento
    dentro do Estado.</p>
    <p><em>De onde vem:</em> do carimbo do SEI-MG impresso nas páginas dos PDFs anexados
    (extraído automaticamente). A família PAGADOR é a que casa com o empenho do depósito
    judicial — aparece ao passar o mouse.</p>
  </>,
  comarca: <>
    <p>A <strong>comarca</strong> é onde o processo corre — derivada dos 4 últimos dígitos
    do próprio número CNJ, com a distância em linha reta até Juiz de Fora.</p>
    <p>Processo na <strong>Justiça Federal</strong> não tem comarca estadual (a etiqueta
    diz isso). "Comarca não mapeada" = código ainda sem tradução no nosso mapa — a aliança
    de dados completa aos poucos.</p>
  </>,
  segredo: <>
    <p>Diz se o processo corre em <strong>segredo de justiça</strong>:</p>
    <p><strong>Segredo de Justiça</strong> = confirmado no sistema (fluxo próprio: folha
    timbrada e e-mails específicos) · <strong>Possível segredo</strong> = a consulta
    automática ao DataJud/CNJ sinalizou (sigilo declarado ou classe protegida por lei,
    como Infância e Juventude), mas ninguém confirmou ainda — confirme na tela Segredo
    de Justiça · <strong>Sem segredo</strong> = processo comum.</p>
    <p><em>De onde vem:</em> consulta automática à base pública do CNJ na chegada do
    pedido + confirmação humana. Passe o mouse na etiqueta para ver a fonte.</p>
  </>,
  solicitante: <>
    <p>Quem, do lado do <strong>Estado (SES-MG)</strong>, enviou o pedido de orçamento —
    nome derivado do e-mail do remetente.</p>
    <p><em>Para que serve:</em> apurar o <strong>volume de pedidos por pessoa</strong>
    (filtre pela coluna ou baixe o Excel e conte) e responder direto: o ✉ abre um
    e-mail para o solicitante; o botão ao lado copia o endereço.</p>
  </>,
  cadastro: <>
    <p>O <strong>cadastro</strong> resume, em 4 pontos, o que este pedido tem e o que falta:
    CNJ · SEI · Comarca · Anexo.</p>
    <p><span style={{color:'#00a651'}}>●</span> <strong>verde</strong> = temos (o tooltip diz a fonte) ·{' '}
    <span style={{color:'#f59e0b'}}>●</span> <strong>âmbar</strong> = falta, mas há uma rota
    automática em curso (ex.: releitura dos anexos hoje à noite) ·{' '}
    <span style={{color:'#9aa7a1'}}>●</span> <strong>cinza</strong> = falta e depende de pessoa
    (o tooltip diz quem).</p>
    <p>Passe o mouse no chip para ver, item a item, a fonte de cada dado e a próxima ação
    com o responsável. Nenhuma falta fica sem rota.</p>
  </>,
};

const ROTULO_PONTO: Record<string, string> = { cnj: 'CNJ', sei: 'SEI', comarca: 'Comarca', anexo: 'Anexo' };

/** Chip "cadastro" (desenho af56e8f2, nota 94 — GO @R 27/08 14:19): 4 pontos, tooltip com
 *  fonte + próxima ação + dono. verde=tem · âmbar=falta com rota automática · cinza=fila
 *  humana. cadastro null (falha no cálculo) = "indisponível" — a tabela nunca cai (K6). */
/** Selo de ORIGEM (@R 29/08 13:24): "para sabermos que é um cadastro manual, e os que vieram por e-mail cadastro automático". */
export function colunaOrigem(dados?: any[]) {
  return (
    <Column key="col-origem" field="origemRegistro" sortable style={{ minWidth: '7.5rem' }}
      filter filterMatchMode="custom" filterFunction={casaOpcaoDosDados} showFilterMenu={false}
      filterElement={filtroOpcoesDosDados(dados, (r: any) => r?.origemRegistro, 'Todas',
        (v) => ({ email: 'E-mail (monitor)', email_ses: 'E-mail da SES', manual: 'Manual', base_antiga: 'Base antiga' } as Record<string, string>)[v] ?? String(v))}
      header={cabecalhoComHint('Origem', 'Como o pedido entrou: E-mail = cadastro automático a partir do e-mail da SES · Manual = alguém da equipe cadastrou à mão · — = pedido antigo, origem não registrada.')}
      body={(r: any) => r.origemRegistro === 'manual'
        ? <Tag value="Manual" severity="warning" icon="pi pi-user-edit" title="Cadastrado à mão pela equipe (sem e-mail de origem; nenhuma resposta automática saiu)." />
        : r.origemRegistro === 'email'
        // Clicar abre a ficha, que traz o e-mail original com o conteúdo (@R 17/09: "ao
        // clicar em email na coluna Origem deveria abrir o email"). A ficha já busca o
        // corpo sob demanda — só quem clica paga o download do .eml no R2.
        ? <AbreFicha id={r.id} titulo="Abrir a ficha e ler o e-mail que criou este pedido"><Tag value="E-mail" severity="info" icon="pi pi-envelope" title="Cadastro automático a partir do e-mail da SES. Clique para ler o e-mail." /></AbreFicha>
        // GRAVADO, ¬inferido (@R 17/09: "preencher a origem nos que têm e-mail, em todos
        // os registros no banco"). 546 pedidos vieram por e-mail da SES e foram DIGITADOS
        // a partir dele — o pedido não é manual, a digitação é. Ficou com valor próprio
        // em vez de 'email' porque gravar 'email' faria o banco afirmar que o monitor os
        // processou, e a taxa de captura dele passaria a incluir 546 que ele nunca viu.
        : r.origemRegistro === 'email_ses'
        ? <AbreFicha id={r.id} titulo="Abrir a ficha deste pedido">
            <Tag value="E-mail" severity="info" icon="pi pi-envelope"
              title={`Pedido recebido por e-mail da SES (${r.emailSolicitante ?? 'endereço registrado'}) e cadastrado pela equipe a partir dele. O e-mail original não ficou guardado porque o cadastro é anterior ao monitor automático.`} />
          </AbreFicha>
        : r.origemRegistro === 'base_antiga'
        ? <Tag value="Base antiga" severity="secondary" icon="pi pi-history" title={`Lançamento anterior ao sistema, importado da base histórica (30/08).${r.statusLegado ? ' Status original: ' + r.statusLegado : ''}`} />
        : r.origemRegistro ? <Tag value={String(r.origemRegistro)} severity="secondary" />
        // INFERÊNCIA CORRIGIDA 17/09 (@R: "tem Manual? mas tem o email"). A régua antiga
        // olhava só o .eml guardado e chamava de "provavelmente manual" 546 pedidos que
        // TODOS têm o endereço de quem pediu na SES — quem lia concluía que não havia
        // e-mail. Agora o "?" diz o que de fato sabemos: veio de e-mail, mas o original
        // não ficou guardado. "Manual?" sobrou para quem não tem sinal algum.
        : r.origemInferida === 'email'
        ? <AbreFicha id={r.id} titulo="Abrir a ficha deste pedido">
            <Tag value="E-mail?" severity="info" icon="pi pi-question-circle"
              title={`Veio de e-mail, mas o original não foi guardado — o cadastro foi feito à mão a partir dele (antes do monitor automático). Sabemos quem pediu: ${r.emailSolicitante ?? 'endereço da SES registrado'}.`} />
          </AbreFicha>
        : r.origemInferida === 'manual'
        ? <Tag value="Manual?" severity="warning" icon="pi pi-question-circle"
            title="Provavelmente cadastrado à mão: este pedido não tem vestígio nenhum de e-mail — nem o arquivo original, nem identificador de mensagem, nem o endereço de quem pediu. É uma inferência — o sistema não registrou a origem na época." />
        : <span className="ident-vazio" title="Pedido anterior ao registro de origem.">—</span>} />
  );
}

/** Procedimento que a decisão determinou — SEM quebrar a linha da tabela.
 *
 *  POR QUE (@R 17/09): ⟦"nomes de procedimentos grandes vamos encurtar e colocar um botão
 *  para copiar para não quebrar linhas"⟧. Medido: "TRATAMENTO CIRURGICO DE DEFORMIDADE DA
 *  COLUNA VIA POSTERIOR DOZE NIVEIS OU MAIS" tem 78 caracteres e empurra a tabela inteira.
 *
 *  O texto NÃO se perde em lugar nenhum: fica no hover e no botão de copiar. Encurta o que
 *  ocupa espaço, ¬o que informa — e copiar existe porque o nome do procedimento é o que se
 *  cola no pedido de orçamento, então ler na tela não basta.
 *
 *  Estava declarada à mão em 6 telas, cada uma com um corte diferente (70, 45, nenhum).
 *  Fonte única aqui — a próxima melhoria chega em todas de uma vez.
 */
export function colunaProcedimento(largura = '20rem', limite = 48) {
  return (
    <Column key="col-procedimento" field="procedimento" sortable filter
      header={cabecalhoComHint('Procedimento',
        'O que a decisão judicial determinou. É a chave para achar o preço histórico. ' +
        'Nome longo aparece cortado — passe o mouse para ler inteiro ou use o botão de copiar.')}
      filterElement={filtro('Buscar procedimento')}
      style={{ minWidth: largura, maxWidth: largura }}
      body={(r: any) => {
        const t = String(r?.procedimento ?? '').trim();
        if (!t) return <span className="ident-vazio">—</span>;
        const curto = t.length > limite ? `${t.slice(0, limite).trimEnd()}…` : t;
        return (
          <span className="ident-proc" title={t.length > limite ? t : undefined}>
            <span className="ident-proc-texto">{curto}</span>
            <BotaoCopiar valor={t} rotulo="procedimento" />
          </span>
        );
      }} />
  );
}

export function colunaCadastro(largura = '9rem') {
  return (
    <Column key="col-cadastro" field="cadastro" header={cabecalhoComHint('Cadastro', EXPLICA.cadastro)} sortable
      sortField="cadastro.completos" style={{ minWidth: largura }}
      {...{
        filter: true, showFilterMenu: false, filterMatchMode: 'custom',
        // o dado aqui é um OBJETO ({completo, cnj, sei, comarca, anexo}), ¬um valor: por
        // isso filterFunction, e não comparação direta. `null` é "falha ao calcular" e
        // NÃO conta como incompleto — não saber se falta algo ≠ faltar algo.
        filterFunction: (valor: any, escolha: any) => {
          if (!escolha) return true;
          if (valor === null || valor === undefined) return false;
          return escolha === 'sim' ? !!valor.completo : !valor.completo;
        },
        filterElement: filtroOpcoes(OPCOES_CADASTRO, 'Todos'),
      }}
      body={(r: LinhaIdentificada) => {
        const c = r.cadastro;
        if (c === null) return <span className="ident-vazio" title="Falha ao calcular — a análise segue normalmente">indisponível</span>;
        if (!c) return <span className="ident-vazio">—</span>;
        const titulo = (['cnj', 'sei', 'comarca', 'anexo'] as const).map((k) => {
          const i = c[k];
          if (i.ok) return `${ROTULO_PONTO[k]}: ok${i.fonte ? ` (${i.fonte})` : ''}`;
          return `${ROTULO_PONTO[k]}: FALTA — ${i.acao ?? ''}${i.dono ? ` · ${i.dono}` : ''}`;
        }).join('\n');
        return (
          <span className={`chip-cadastro${c.completo ? ' chip-cadastro--completo' : ''}`} title={titulo}
            aria-label={`Cadastro ${c.completos} de ${c.total} completos${c.faltas.length ? `; faltando ${c.faltas.join(', ')}` : ''}`}>
            {(['cnj', 'sei', 'comarca', 'anexo'] as const).map((k) => (
              <span key={k} className={`cc-ponto cc-ponto--${c[k].tom}`} aria-hidden="true" />
            ))}
            <small>{c.completos}/{c.total}</small>
          </span>
        );
      }} />
  );
}
