/**
 * DICIONÁRIO DAS COLUNAS (@R 29/08 13:28: "um local em configurações para saber o que é cada
 * coluna e podermos marcar para cada usuário... uma área mais fácil e intuitiva para ajudar e
 * explicar"). Uma entrada por `field` das tabelas — é o que a tela de Configurações › Colunas lê.
 *
 * `padraoOculta: true` = coluna OPCIONAL: nasce DESMARCADA e o usuário liga quando precisa.
 */
export interface VerbeteColuna {
  id: string;            // o `field` da <Column>
  nome: string;          // como aparece no cabeçalho
  oQueE: string;         // o que a coluna mostra, em português de gente
  deOndeVem: string;     // a fonte do dado (para ninguém achar que é digitado à mão)
  grupo: 'Identidade' | 'Pedido' | 'Tempo' | 'Documentos' | 'Processo' | 'Dinheiro';
  padraoOculta?: boolean;
}

export const DICIONARIO_COLUNAS: VerbeteColuna[] = [
  { id: 'sequencial', nome: '#', grupo: 'Identidade', oQueE: 'Ordem da linha na lista que você está vendo.', deOndeVem: 'Contado na hora, muda com o filtro.' },
  { id: 'paciente', nome: 'Paciente', grupo: 'Identidade', oQueE: 'Nome do beneficiário, em MAIÚSCULAS sem acento (é o padrão de busca).', deOndeVem: 'Veio no pedido da SES.' },
  { id: 'origemRegistro', nome: 'Origem', grupo: 'Identidade', oQueE: 'Como o pedido entrou: E-mail (cadastro automático) ou Manual (alguém da equipe cadastrou).', deOndeVem: 'Marcado na criação do pedido.' },
  { id: 'vezesPedido', nome: 'Re-pedido', grupo: 'Identidade', oQueE: 'Quantas vezes a SES mandou o MESMO pedido. Mais de uma = atenção.', deOndeVem: 'Contado pelo robô de e-mails.' },
  { id: 'idade', nome: 'Idade', grupo: 'Pedido', oQueE: 'Idade do paciente hoje.', deOndeVem: 'Calculada da data de nascimento.' },
  { id: 'tipoPaciente', nome: 'Tipo', grupo: 'Pedido', oQueE: 'Recém-nascido (≤28 dias) · Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.', deOndeVem: 'Derivado da data de nascimento.' },
  { id: 'procedimento', nome: 'Procedimento', grupo: 'Pedido', oQueE: 'O que a decisão judicial determinou. É a chave para achar o preço histórico.', deOndeVem: 'Veio no pedido da SES.' },
  { id: 'area', nome: 'Área', grupo: 'Pedido', oQueE: 'Especialidade médica do procedimento.', deOndeVem: 'Classificação da equipe (ou sugestão do sistema).' },
  { id: 'subarea', nome: 'Subárea', grupo: 'Pedido', oQueE: 'Subespecialidade — afina a busca do médico.', deOndeVem: 'Classificação da equipe.', padraoOculta: true },
  { id: 'medico', nome: 'Médico', grupo: 'Pedido', oQueE: 'Profissional escolhido para cotar este pedido.', deOndeVem: 'Seleção na fase 2.' },
  { id: 'dias', nome: 'Dias', grupo: 'Tempo', oQueE: 'Dias corridos desde a entrada do pedido nesta fase.', deOndeVem: 'Calculado da data do pedido.' },
  { id: 'slaFaseHorasRestantes', nome: 'SLA fase', grupo: 'Tempo', oQueE: 'Quanto falta do prazo desta fase (1 dia útil; sexta fecha na segunda). Vermelho = vencido.', deOndeVem: 'Contado a partir do "Cotar" do jurídico.' },
  { id: 'dataPedido', nome: 'Chegou em', grupo: 'Tempo', oQueE: 'Quando o pedido entrou no sistema.', deOndeVem: 'Data do e-mail da SES ou do cadastro manual.' },
  { id: 'sesAnexos', nome: 'SES Anexos', grupo: 'Documentos', oQueE: 'O que a SES mandou de documento: com anexo · sem anexo · solicitado · recebido. Clique para ver, baixar e ler a thread.', deOndeVem: 'Anexos do e-mail + itens extraídos da peça pelo robô.' },
  { id: 'temInteiroTeor', nome: 'Inteiro teor', grupo: 'Documentos', oQueE: 'Se a peça judicial (inteiro teor) está anexada. "Sem peça (declarado)" = o jurídico declarou que não existe.', deOndeVem: 'Anexo do tipo peça; declaração fica registrada com quem/quando.' },
  { id: 'temOrcamentoPdf', nome: 'Orçamento', grupo: 'Documentos', oQueE: 'Se o PDF do orçamento do médico está no pedido.', deOndeVem: 'Anexo do tipo orçamento.' },
  { id: 'nprocesso', nome: 'Nº CNJ', grupo: 'Processo', oQueE: 'Número do processo judicial (padrão nacional). É a chave que liga ao pagamento do Estado.', deOndeVem: 'Extraído do e-mail/peça e confirmado pela equipe.' },
  { id: 'numeroSei', nome: 'Nº SEI', grupo: 'Processo', oQueE: 'Número do processo administrativo da SES.', deOndeVem: 'Extraído dos anexos do e-mail.' },
  { id: 'comarca', nome: 'Comarca', grupo: 'Processo', oQueE: 'Cidade do processo e a distância até Juiz de Fora — pesa na escolha do médico.', deOndeVem: 'Derivada do número CNJ.' },
  { id: 'cadastro', nome: 'Cadastro', grupo: 'Processo', oQueE: 'Quantos dos 4 dados-chave o pedido já tem (CNJ · SEI · comarca · anexo).', deOndeVem: 'Contado pelo sistema.', padraoOculta: true },
  { id: 'segredo', nome: 'Segredo', grupo: 'Processo', oQueE: 'Se o processo corre em segredo de justiça — muda o tratamento e o e-mail.', deOndeVem: 'Marcação da equipe + sinal da consulta ao CNJ.' },
  { id: 'solicitante', nome: 'Solicitante', grupo: 'Processo', oQueE: 'Quem pediu, do lado da SES (nome e e-mail).', deOndeVem: 'Remetente do e-mail do pedido.' },
  { id: 'refPreco', nome: 'Ref. Preço', grupo: 'Dinheiro', oQueE: 'Preço de referência do procedimento.', deOndeVem: 'Tabela de referência + histórico.', padraoOculta: true },
  { id: 'valorOrcamento', nome: 'Valor', grupo: 'Dinheiro', oQueE: 'Valor do orçamento enviado à SES.', deOndeVem: 'Orçamento do médico.' },
  { id: 'classePagamento', nome: 'Empenho Estado', grupo: 'Dinheiro', oQueE: 'O que o Estado empenhou/pagou neste processo. "PAGO após o pedido · pode dar baixa" é o sinal forte. O favorecido é o tribunal, não o prestador.', deOndeVem: 'API do 548 (base de empenhos do Estado), a cada 15 min.' },
  { id: 'empenho548.ultimoPagamento', nome: 'Pago em', grupo: 'Dinheiro', oQueE: 'Data do último pagamento registrado no processo.', deOndeVem: 'API do 548.', padraoOculta: true },
  { id: 'diferenca', nome: 'Diferença', grupo: 'Dinheiro', oQueE: 'Diferença entre o que orçamos e o que o Estado pagou.', deOndeVem: 'Calculada.', padraoOculta: true },
];

export const TELAS_COM_COLUNAS: { chave: string; nome: string }[] = [
  { chave: 'analise-juridica', nome: '1 · Análise Jurídica' },
  { chave: 'selecionar-medico', nome: '2 · Selecionar Médico' },
  { chave: 'orcamento-medico', nome: '3 · Orçamento Médico' },
  { chave: 'protocolar', nome: '4 · Para Protocolar' },
  { chave: 'enviado-ses', nome: '4b · Enviado à SES (sem protocolar)' },
  { chave: 'protocolados', nome: '5 · Protocolados' },
  { chave: 'resultados', nome: '6 · Resultados' },
  { chave: 'aguardando-cirurgia', nome: 'Aguardando Cirurgia' },
  { chave: 'segredo-justica', nome: 'Segredo de Justiça' },
  { chave: 'perdas', nome: 'Perdas' },
  { chave: 'base-processos', nome: 'Base de Processos' },
];

export const CHAVE_PADRAO = 'colunas_ocultas:__padrao__';
export const verbete = (id: string) => DICIONARIO_COLUNAS.find((v) => v.id === id);
