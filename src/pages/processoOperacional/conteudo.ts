/**
 * O CONTEÚDO do Processo Operacional — separado do componente de propósito.
 *
 * POR QUE ESTE ARQUIVO EXISTE SOZINHO:
 *   O processo muda (prazo, dono de etapa, regra nova). Quem vai atualizar isso é
 *   quem conhece a operação, não quem mexe em React. Deixar o texto num arquivo de
 *   dados puro faz a atualização ser edição de texto, não alteração de tela.
 *
 * DE ONDE VEM CADA FALA:
 *   Transcrição integral da reunião @R × equipe do Instituto Mateus, 2026-08-24
 *   10:49-12:41 BRT (1089 linhas). As citações são VERBATIM — não foram reescritas
 *   nem "melhoradas". O valor delas está em serem a voz de quem explicou, e é isso
 *   que faz a regra parar de soar arbitrária.
 */

export interface Etapa {
  id: string;
  /** Número da etapa na régua. Sub-fase usa decimal: 5.1 é "dentro da 5", ¬depois dela
   *  (@R 17/09: "colocarmos ela como uma fase DENTRO de protocolados"). */
  numero: number;
  titulo: string;
  dono: 'INSTITUTO' | 'G4MED';
  rota?: string;
  oQueFaz: string;
  comoFazer: string[];
  prazo?: string;
  falaDoRapha?: string;
  atencao?: string;
  /** O que SAI desta etapa e faz o pedido entrar na seguinte. É esta frase que torna o
   *  fluxo legível como processo: cada fase entrega algo à próxima (@R 16/09). */
  entrega?: string;
  /** Exemplos concretos de cada decisão da etapa (@R 15/09: "temos que dar exemplo para parte
   *  cotar, não cotar e segredo de justiça"). Sem nome de paciente real. */
  exemplos?: { decisao: string; quando: string[] }[];
}

export const DONOS = {
  INSTITUTO: { rotulo: 'Instituto Mateus', cor: '#0F766E' },
  G4MED: { rotulo: 'G4MED', cor: '#7C3AED' },
} as const;

export const ETAPAS: Etapa[] = [
  {
    id: 'juridico',
    entrega: 'O pedido marcado COTAR, com CNJ confirmado (ou marcado como segredo de justiça).',
    prazo: 'Teto: 5 dias no funil — acima disso está errado (@R 28/08). Ideal: a análise sai no dia seguinte ("libera para mim até meio-dia")',
    numero: 1,
    titulo: 'Jurídico — a triagem',
    dono: 'INSTITUTO',
    rota: '/juridico',
    oQueFaz:
      'Aqui chegam os pedidos que a Secretaria de Estado mandou por e-mail. O sistema cadastra sozinho. ' +
      'A análise decide se aquele pedido merece virar cotação.',
    comoFazer: [
      'Abra o pedido no lápis e leia o e-mail que a Secretaria enviou.',
      'Confira a peça processual pelo anexo e pegue o número do processo (CNJ).',
      'Chegou SEM CNJ? O pedido ainda pode ser um processo válido. Busque o nome do paciente no PJe (TJMG), no eproc (TJMG) e no eproc da Justiça Federal (TRF6) — os links estão no próprio modal. Achou: preencha o CNJ. Não achou: marque SEGREDO DE JUSTIÇA.',
      'Marque COTAR, NÃO COTAR ou SEGREDO DE JUSTIÇA.',
      'Se já houver orçamentos concorrentes nos autos, registre o nome do local completo e o valor — isso vira inteligência de preço.',
      'Se marcar NÃO COTAR, escreva o motivo. Sem motivo, não salva.',
      'Para COTAR, registre os orçamentos citados nos autos (ou "nenhum") e a observação — a fase de orçamento lê os dois.',
      'Falta algo para decidir? Marque PENDÊNCIA JURÍDICA (1.1) dizendo o que falta: o pedido fica aqui, com a pendência visível, até o escritório resolver.',
      'O 1.1 é um BILHETE DE IDA E VOLTA: fase 3 → 1,1 Pendências jurídicas → fase 3. Quando a Valéria responde, o pedido volta SOZINHO para a fila do médico, na mesma posição e com o mesmo médico — ninguém precisa mover nada. Quem pediu vê ↩ no nome do paciente e o texto da resposta; clica em "Li" para dar o ciclo por fechado.',
      'A aba "1.1 Pendências" traz o que a fase de orçamento devolveu para você: falta de peça de inteiro teor, achar médico, contato com paciente ou advogado, verificação ou recado. Resolva, escreva a resposta e clique em "Responder e devolver" — o pedido volta sozinho para onde estava.',
      'Sem a peça de inteiro teor ou sem o CNJ, o sistema avisa o que se perde e deixa você decidir: sem peça não dá para extrair exames e orçamentos que vêm dentro dela; sem CNJ não é possível protocolar.',
    ],
    exemplos: [
      {
        decisao: 'COTAR',
        quando: [
          'A decisão judicial manda o Estado fornecer um procedimento (ex.: artroplastia de joelho, cirurgia de hérnia) e o pedido tem CNJ — ou você localizou o processo na consulta pública.',
          'Os documentos permitem ao médico cotar: ofício ou decisão, relatório médico com a indicação e exames.',
        ],
      },
      {
        decisao: 'NÃO COTAR',
        quando: [
          'O procedimento já foi realizado, ou o mesmo pedido já está no sistema (pedido duplicado).',
          'O prazo que o juiz deu é impossível de cumprir, ou o processo está mal instruído e sem documentação para cotar.',
          'Não temos médico da especialidade, ou há risco jurídico ou valor incompatível.',
          'Escreva com suas palavras qual foi o caso — é esse texto que ensina o sistema a separar o "não cotar" certo do errado.',
        ],
      },
      {
        decisao: 'SEGREDO DE JUSTIÇA',
        quando: [
          'Paciente criança ou recém-nascido: na maioria das vezes o processo corre em segredo.',
          'O pedido chegou sem CNJ e o nome do paciente não aparece no PJe, no eproc do TJMG nem no eproc da Justiça Federal.',
          'A peça ou o e-mail dizem que o processo tramita em segredo de justiça.',
        ],
      },
    ],
    falaDoRapha:
      'A gente teve vários pedidos que a pessoa do jurídico escreveu não cotar e que era para cotar. ' +
      'Então cria realmente os critérios para não cotar.',
    atencao:
      'Assim que você salva, o pedido some da sua lista e vai para a G4MED. Na maioria das vezes as ' +
      'crianças serão segredo de justiça — marcar isso muda o tratamento do pedido daqui pra frente.',
  },
  {
    id: 'selecionar-medico',
    entrega: 'O pedido com um médico da rede responsável por cotar o procedimento.',
    prazo: '24h para o médico dizer SE vai cotar (sem data própria no sistema — o relógio medido é o das 96h do orçamento)',
    numero: 2,
    titulo: 'Selecionar médico',
    dono: 'G4MED',
    rota: '/selecionar-medico',
    oQueFaz:
      'A G4MED escolhe para qual médico o pedido vai. Esta etapa não aparece para o Instituto — ' +
      'mas é aqui que a rede de vocês entra.',
    comoFazer: [
      'O pedido vai primeiro para os médicos da G4MED.',
      'Se em 24h ninguém sinalizar, o @R pergunta no grupo do Instituto se vocês têm um profissional.',
      'Se vocês tiverem, o médico é cadastrado em Clientes (nome com "- Instituto" no fim, para separar) e o pedido é transferido para ele.',
      'Se nem vocês tiverem, aí sim vira perda — e a Secretaria é avisada.',
    ],
    falaDoRapha:
      'Primeiro eu mando pros nossos 26. Se depois de 24 horas o cara não me responder, eu vou trocar ' +
      'pro médico que vocês me indicarem. Se vocês falarem que não tem, aí eu vou dar perda nele por ' +
      'não termos o profissional, e vou responder à secretaria falando que a gente não tem.',
  },
  {
    id: 'orcamento-medico',
    entrega: 'O orçamento discriminado do médico, em um arquivo só, pronto para os autos.',
    prazo: 'SLA 4 dias (96 horas) — é o prazo que sustenta o contrato com o Estado',
    numero: 3,
    titulo: 'Orçamento médico — a cobrança',
    dono: 'G4MED',
    rota: '/orcamento-medico',
    oQueFaz:
      'Lista tudo que foi pedido ao médico e ainda não voltou. É a fila que mede se estamos ' +
      'cumprindo o prazo com o Estado.',
    comoFazer: [
      'Se o médico avisar que não consegue em 4 dias, pergunte a ele até que dia consegue.',
      'Precisa de algo do jurídico para cotar (peça de inteiro teor, um médico, um contato, uma verificação)? Use "Devolver ao jurídico (1.1)" no pedido ou na Ficha: escolha o tipo, escreva o que precisa. O pedido sai desta fila, vai para a Valéria e volta sozinho com a resposta; o selo verde ↩ fica no nome do paciente até você clicar em "Li".',
      'Sinalize esse prazo à G4MED — o @R avisa a Secretaria por e-mail e pergunta se pode aguardar.',
      'A VOLTA: quando o jurídico responde, o pedido reaparece nesta fila sozinho, com o selo ↩ e a resposta. Se o jurídico indicou um médico, o pedido já chega com ele e o relógio da cobrança recomeça hoje. Se disse que não achou ninguém, o pedido volta para Selecionar Médico (fase 2), não para cá.',
      'Dar "não faço" quando OUTRO médico convidado ainda está cotando não é perda do pedido: o sistema avisa quem ainda cota e só dá a perda do pedido inteiro se você confirmar. Recusa de um médico se marca em "Por médico" (✗).',
    ],
    falaDoRapha:
      'A gente não pode é mentir no prazo. Se a gente tiver que mudar 96 horas, a gente muda. ' +
      'Porque aí a funcionária pública fala: eu vou aguardar o Rafa me responder até eu fechar o contrato.',
    atencao:
      'Pedido parado aqui é dinheiro perdido. O @R mostrou casos com 59 dias — a essa altura a ' +
      'Secretaria já conseguiu com outro e o nosso orçamento não serve mais.',
  },
  {
    id: 'para-protocolar',
    entrega: 'O orçamento juntado ao processo, com a data do protocolo registrada.',
    prazo: 'SLA 1 dia — "esta é a área que você ZERA todo dia"',
    numero: 4,
    titulo: 'Para protocolar — juntar aos autos',
    dono: 'INSTITUTO',
    rota: '/para-protocolar',
    oQueFaz:
      'O orçamento voltou. Agora ele entra no processo judicial como terceiro interessado. ' +
      'Esta é a área que você ZERA todo dia.',
    comoFazer: [
      'Baixe o orçamento — vem um PDF único, com honorário, OPME e hospital juntos, mesmo que o médico tenha mandado arquivos separados.',
      'LEIA o orçamento procurando erro. Se achar algo grave, devolva à G4MED antes de protocolar.',
      'Confira se o médico tem procuração assinada.',
      'Estruture a peça, protocole no PJe ou eproc.',
      'Volte aqui, informe a data, anexe a petição e confirme no ícone de avião.',
    ],
    falaDoRapha:
      'Vamos supor que você achou algum erro muito grave no orçamento. Você deveria voltar para mim ' +
      'e falar: Rafa, não dá para mandar o orçamento assim. Então tem que ter um trabalho do jurídico ' +
      'para revisar essa parte.',
    atencao:
      'NÃO juntamos laudo médico. O Estado pede só a cotação do valor — o laudo já está no processo. ' +
      'E é UM orçamento por pedido, de um médico só, nunca três.',
  },
  {
    id: 'protocolados',
    entrega: 'A decisão judicial registrada — deferida (vira ganho) ou indeferida (vira perda).',
    prazo: 'A decisão é do juiz (sem prazo nosso), mas o acompanhamento tem: atualizar a cada 15 dias',
    numero: 5,
    titulo: 'Protocolados — acompanhar até a decisão',
    dono: 'INSTITUTO',
    rota: '/protocolados',
    oQueFaz:
      'Tudo que já foi protocolado fica aqui até sair a decisão. É onde o processo jurídico termina.',
    comoFazer: [
      'Registre o andamento com uma anotação: "acompanhei hoje, segue aguardando decisão".',
      'Saiu GANHO: marque o valor. O sistema computa a comissão.',
      'Saiu PERDA: registre quais orçamentos concorreram, por quanto, e quem ganhou.',
      'Depois de marcar ganho ou perda, o pedido sai da sua lista.',
    ],
    falaDoRapha:
      'Isso vai me dar uma inteligência para eu entender o que que tá levando cada médico a perder ' +
      'e a gente poder ajustar com cada médico.',
    atencao:
      'A análise da perda não é burocracia: é o que ensina o sistema quais procedimentos e quais ' +
      'médicos convertem.',
  },
  // Task #238 (@R 28/08 01:43): "o canal 6 não existe" — segredo de justiça não é fase,
  // é marca do pedido. Segredo que mata a cotação vira PERDA com o motivo
  // 'Perda por segredo de justiça'; segredo enviado à SES vive na etapa 6 abaixo.
  {
    id: 'enviado-ses',
    entrega: 'O retorno técnico da Secretaria sobre o que foi enviado sem protocolo.',
    prazo: 'A resposta é do Estado; nossa verificação tem prazo: checar em 120 dias, cobrar em 180',
    /* ERA A FASE 6, VIROU 5.1 (@R 17/09: "a fase 6, temos que colocar ela como uma fase
       dentro de protocolados, que é Enviados Sem Protocolar; no menu temos que mudar o
       nome dela e o número para ficar lógico").

       POR QUE ELA NÃO ERA UMA FASE PRÓPRIA: numerada como 6, ela parecia o passo SEGUINTE
       a Protocolados — como se todo pedido protocolado fosse depois para lá. É o
       contrário: são caminhos IRMÃOS a partir do mesmo ponto. Protocolado é quem entrou
       nos autos e acompanhamos; este é quem foi entregue sem protocolo (prazo perdido ou
       segredo) e só se aguarda. Quem lia o menu em ordem entendia uma sequência que não
       existe.

       O QUE NÃO MUDOU, DE PROPÓSITO: o `statusProcesso` no banco continua 'Enviado à SES
       - Sem Protocolo'. Este arquivo governa RÓTULO e NAVEGAÇÃO; o vocabulário de dados
       é o `status_canon.py` do backend, lido por funil, relatórios e e-mails. Renomear lá
       mudaria número em todo lugar ao mesmo tempo — e isso não é ajuste de menu, é
       migração, com o seu GO. */
    numero: 5.1,
    titulo: 'Enviados sem protocolar — aguardando retorno técnico',
    dono: 'G4MED',
    rota: '/enviado-ses',
    oQueFaz:
      'O orçamento já foi ao Estado, mas NÃO acompanhamos nos autos: os sem-protocolo (o prazo de ' +
      'protocolar passou) e os segredos de justiça. Aqui só se aguarda o retorno técnico da SES.',
    comoFazer: [
      'Nada a fazer proativamente — a fase é de espera declarada.',
      'Chegou o retorno técnico: clique Registrar e marque GANHO (com o valor) ou PERDA (com o motivo).',
      'Perda sem motivo escrito não salva — é esse texto que ensina o sistema.',
    ],
    falaDoRapha:
      'Não temos que acompanhar e só podemos aguardar um retorno técnico para sabermos se ganhos.',
    atencao:
      'Não confundir com Protocolados (fase 5): lá nós estamos DENTRO do processo e acompanhamos; ' +
      'aqui o orçamento foi entregue e a bola está com o Estado.',
  },
];

export interface Regra {
  titulo: string;
  texto: string;
  fala?: string;
}

export const PRAZOS: { prazo: string; oQue: string; deQuem: string }[] = [
  { prazo: '24 horas', oQue: 'o médico responde SE vai cotar', deQuem: 'médico' },
  { prazo: '96 horas', oQue: 'o orçamento completo é entregue', deQuem: 'médico (4 dias)' },
  { prazo: '1 dia', oQue: 'avisar que NÃO temos profissional', deQuem: 'G4MED' },
  { prazo: '5 a 10 dias', oQue: 'o prazo que o Estado tem no processo — é dele que os nossos derivam', deQuem: 'Estado' },
];

/** O que mudou no processo, do mais recente para o mais antigo (@R 21/09: "adicionar a atualização ao final
 *  para manter o processo operacional atualizado"). Cada linha diz O QUE mudou e ONDE — a data é a da entrada no ar. */
export interface Atualizacao { data: string; onde: string; oQue: string }
export const ATUALIZACOES: Atualizacao[] = [
  { data: '21/09/2026', onde: 'Menu → 1,2 E-mails e ofícios', oQue: 'Ponto de corte: só conta como NOVO o que chegou a partir de 01/09/2026. Tudo que é anterior foi marcado como VISTO (aparece no filtro "Tratados") — a fila começa limpa para a equipe jurídica.' },
  { data: '21/09/2026', onde: 'Menu → 1,2 E-mails e ofícios', oQue: 'Coluna "Idade": há quantos dias a mensagem chegou (hoje, ontem, N dias) — verde até 2 dias, âmbar até 7, cinza depois.' },
  { data: '21/09/2026', onde: 'Barra do topo (todas as telas)', oQue: 'Data e hora de agora, no horário de Brasília, ao lado da versão do sistema.' },
  { data: '21/09/2026', onde: 'Orçamento médico → Enviar Orçamento', oQue: 'O e-mail do orçamento à SES sai na hora do Confirmar (com o PDF anexado) e a tela diz "ENVIADO à SES". Se a leitura do PDF apontar algo grave, se não houver PDF ou se o envio falhar, ele fica na fila da Central com o motivo.' },
  { data: '21/09/2026', onde: 'Orçamento médico → Enviar Orçamento', oQue: 'A leitura do PDF de orçamento passou a ler o documento INTEIRO (até 12 páginas, sempre incluindo a última) e aceita vários arquivos de uma vez, unindo tudo num PDF só — é esse PDF que vai à SES.' },
  { data: '21/09/2026', onde: 'Orçamento médico → Não faço', oQue: 'Se outro médico convidado ainda está cotando, "não faço" não dá mais a perda do pedido direto: a tela avisa quem cota e pede confirmação para a perda do pedido inteiro.' },
  { data: '21/09/2026', onde: 'Menu → 1,1 Pendências jurídicas', oQue: 'O 1.1 ganhou entrada própria no menu, abaixo de "1. Análise Jurídica". A aba mostra as pendências paradas há mais de 2 dias primeiro.' },
  { data: '21/09/2026', onde: 'Central de E-mails → Respostas', oQue: 'Cada linha mostra o status do pedido e do jurídico, o botão Ficha, "Ver e-mail" (o texto que foi ou vai ser enviado) e "Editar antes de enviar" para o que ainda está na fila. Perda na fila de pedido que não está em perda aparece em vermelho.' },
  { data: '21/09/2026', onde: 'Base de Processos', oQue: 'Coluna "Movido por": quem mudou o status por último, dia e hora, com o botão dos registros de alteração.' },
  { data: '21/09/2026', onde: 'Todas as tabelas', oQue: 'Ordenar pela coluna passou a funcionar nas telas que "travavam"; Enviados à SES abre do mais recente; filtros de texto refiltram ao terminar de digitar.' },
  { data: '20/09/2026', onde: 'Fase 1 e fase 3', oQue: 'Nasceu o 1.1 de retorno: a fase 3 devolve o pedido ao jurídico com um bilhete (peça de inteiro teor, achar médico, contato, verificação, recado) e ele volta sozinho quando o jurídico responde.' },
];

export const REGRAS: Regra[] = [
  {
    titulo: 'Um orçamento só, de um médico só',
    texto: 'Nunca três. A Secretaria pede um orçamento nosso — ela busca os outros dois em outros lugares.',
  },
  {
    titulo: 'Não fazemos laudo médico',
    texto:
      'O Estado pede a cotação do valor, não um parecer clínico. O laudo já está no processo. ' +
      'Fazer laudo é trabalho não remunerado e cria expectativa errada.',
    fala:
      'Nós não somos solicitados pro estado para fazer um relatório médico. O que a gente é ' +
      'solicitado é da cotação do valor do orçamento.',
  },
  {
    titulo: 'O orçamento vem discriminado, num arquivo só',
    texto:
      'Honorário médico, OPME e hospital separados por item, tudo num PDF. O formato padrão é ' +
      'definido pela Valéria. Validade de 60 dias, preço à vista, tabela particular.',
    fala: 'O médico tem que jogar na regra que a gente quer, não na regra que é melhor para ele.',
  },
  {
    titulo: 'Responder rápido vale mais que responder bem',
    texto:
      'Dizer "não temos médico" em um dia preserva o cliente. Ficar em silêncio tentando resolver é ' +
      'o que faz a Secretaria parar de mandar pedidos.',
    fala:
      'Eu não tenho profissional, já respondo com um dia, acabou. Ela sabe que não pode contar comigo ' +
      'naquele pedido. Agora, se eu falo que eu vou cotar, eu tenho que falar para ela até quando eu vou mandar.',
  },
  {
    titulo: 'Volume alto é sinal bom — a resposta é contratar',
    texto:
      'Se chegar mais pedido do que a equipe dá conta, avise a Valéria para contratar. Baixar a régua ' +
      'do prazo é o caminho errado.',
    fala:
      'Se chegar a 30 pedidos num dia, a gente tem que contratar uma outra pessoa. Se chegou 30 pedidos, ' +
      'nós estamos fazendo o trabalho certo. Se não chegar, é porque tem alguma coisa muito errada.',
  },
  {
    titulo: 'Como reportar um problema no sistema',
    texto:
      'Mande a URL da página + um print com o F12 aberto (a telinha de erro do navegador). ' +
      'E diga o nome da tela: "estou na home e está com pau".',
  },
];

/** A tese que sustenta todos os prazos acima. É o PORQUÊ — vem antes do COMO. */
export const PORQUE = {
  titulo: 'Por que o prazo é tão importante',
  paragrafos: [
    'Nosso cliente é um só: a Secretaria de Estado de Saúde de Minas Gerais. Ela foi condenada ' +
      'judicialmente e precisa levar três orçamentos ao juiz, dentro de um prazo de 5 a 10 dias.',
    'Ela tem cerca de 110 hospitais para consultar. Se a G4MED sempre responde em dois dias, um dos ' +
      'três orçamentos que ela leva ao juiz é o nosso — e o problema dela fica resolvido pela metade.',
    'Se a gente não responde, ela marca "G4MED não respondeu". Depois de algumas vezes, ela conclui ' +
      'que não vale a pena mandar. E aí paramos de receber pedidos.',
  ],
  fechamento:
    'Você continuaria comprando papel de alguém que nunca te responde o pedido?',
  proposito:
    'Quando chega um orçamento de uma criança de 8, 9 meses, eu de verdade não estou preocupado com ' +
    'nada financeiro. Eu quero ajudar aquela pessoa. Eu quero que nessa nossa fase a empresa tenha ' +
    'propósito — e realmente não pode ser mentira.',
};

export const FONTE =
  'Reunião de treinamento com a equipe do Instituto Mateus · 24/08/2026 · as falas são transcrição literal.';


/**
 * DICAS — os erros que a operação mais comete, com a cura em uma linha.
 *
 * @R 16/09/2026: "no processo operacional o fluxo tem que estar claro processualmente
 * e ter ali as dicas para o usuário". Não é teoria: cada linha abaixo nasceu de um
 * acidente real ou de uma pergunta que a equipe já fez mais de uma vez.
 */
export const DICAS: { titulo: string; texto: string; icone: string }[] = [
  {
    icone: 'pi-history',
    titulo: 'Passou de fase sem querer? Dá para voltar',
    texto:
      'Em qualquer tela de fase, o botão ⟲ ao lado do paciente abre a FICHA DO PEDIDO: o que foi ' +
      'preenchido em cada etapa, por quem, quando, e os arquivos que entraram. É por ali que se ' +
      'volta o pedido para a fase anterior — o sistema mostra quem moveu, pede confirmação, e ' +
      'recusa se o pedido já tiver andado de novo.',
  },
  {
    icone: 'pi-search',
    titulo: 'Antes de perguntar "o que fizeram aqui?", abra a ficha',
    texto:
      'A observação, o orçamento e os anexos da fase anterior não somem quando o pedido avança — ' +
      'eles ficam na ficha. Abrir a ficha responde em 5 segundos o que hoje custa uma mensagem no grupo.',
  },
  {
    icone: 'pi-clock',
    titulo: 'Responder rápido vale mais que responder perfeito',
    texto:
      'O prazo do processo não espera a resposta ideal. Um orçamento simples dentro do prazo vale ' +
      'mais do que um completo depois que o juiz decidiu.',
  },
  {
    icone: 'pi-file',
    titulo: 'Sem a peça de inteiro teor, metade do trabalho fica cego',
    texto:
      'É de dentro dela que saem os exames pedidos e os orçamentos concorrentes. Sem o CNJ, não é ' +
      'possível protocolar. O sistema deixa seguir, mas avisa o que se perde.',
  },
  {
    icone: 'pi-exclamation-circle',
    titulo: 'Marcou NÃO COTAR? Escreva o motivo',
    texto:
      'Sem motivo, o sistema não salva — e não é burocracia: o motivo é o que permite saber depois ' +
      'quantos pedidos perdemos por falta de médico e quantos por decisão nossa.',
  },
];
