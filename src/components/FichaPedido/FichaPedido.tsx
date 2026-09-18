import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { conferirOrcamentoPeca, getFichaPedido, getLogAuditoria, reverterHistorico, getConteudoEmail, moverSituacao } from '../../services/api/orders';
import { criarStatusOrcamentoPersonalizado } from '../../services/api/client';
import { EscreverEmail } from '../EscreverEmail/EscreverEmail';
import { Dropdown } from 'primereact/dropdown';
import './FichaPedido.css';

/**
 * FICHA DO PEDIDO — a rastreabilidade numa tela só.
 *
 * Mandato @R 16/09/2026: "uma ficha que vai atualizando a cada fase para sabermos o que
 * foi feito em cada pedido... para ela poder consultar informações inseridas e arquivos
 * inseridos em cada etapa... isso é a rastreabilidade".
 *
 * Nasceu de um acidente: 7 pedidos avançaram da fase 1 para a 2 em 31 minutos, um por
 * engano, e quem trabalhava a fase 2 não tinha como ver o que fora decidido na fase 1 —
 * havia observação jurídica escrita e campo de orçamentos invisíveis ali.
 *
 * SÓ LEITURA, com uma exceção deliberada: o botão de voltar fase. Está aqui porque é
 * aqui que a pessoa DESCOBRE que a fase está errada — mandá-la para outra tela para
 * corrigir é onde o erro sobrevive.
 *
 * AUSÊNCIA É DECLARADA: campo vazio mostra "não preenchido nesta fase". Branco mudo faz
 * a pessoa achar que a tela quebrou e perguntar no WhatsApp — que é o que queremos parar.
 */

type Campo = { rotulo: string; valor: unknown; preenchido: boolean };
type Arquivo = { id: number; tipo: string; nome: string; quando: string; link: string; confirmadoPor?: string };
type Rastro = { por: string | null; em: string | null; de?: string; para?: string; medido: boolean };
type Bloco = { fase: string; quando: string | null; campos: Campo[]; arquivos: Arquivo[]; rastro: Rastro };
type Trilha = { campo: string; de: string; para: string; por: string; em: string; historico_id: number };
type Urgencia = { vezesPedido: number; ultimoPedidoEm: string | null; repedidosManuais: number; ultimoRepedidoManualEm: string | null };
type EmailRecebido = { id: number; remetente: string | null; assunto: string | null; quando: string; status: string; detalhe: string | null };
type EmailOriginal = { anexoId: number; nome: string; quando: string; link: string };
type Situacao = {
  statusProcesso: string | null;
  statusJuridico: string | null;
  statusOrcamento: string | null;
  statusPerda: string | null;
  dataStatusPerda?: string | null;
};
type SituacaoOpcoes = Record<string, string[]>;

interface OrcamentoDaPeca {
  id: number; valorTotal: number | null; prestador?: string | null;
  /** etiqueta canonizada (agrupa as grafias); o `prestador` acima continua sendo o
   *  texto CRU como estava na peça — decisão @R 18/09 */
  prestadorExibicao?: string | null; grupoPrestador?: number | null;
  procedimento?: string | null; categoria?: string | null; dataOrcamento?: string | null;
  anexoOrigemId?: number | null; anexoOrigemNome?: string | null; paginaOrigem?: number | null;
  linkArquivo?: string | null; fonte?: string; confirmado?: boolean; confirmadoPor?: string | null;
}
interface PecaLida {
  anexoId: number; nome?: string | null; status?: string | null; mensagem?: string | null;
}

type Emails = {
  origem: 'COM_CONTEUDO' | 'SEM_ORIGINAL' | 'NAO_VEIO_POR_EMAIL';
  explicacao: string | null;
  recebidos: EmailRecebido[];
  originais: EmailOriginal[];
  /** para quem a ficha escreve — o mesmo endereço que recebeu o que está listado */
  solicitante?: string | null;
};

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const ROTULO_CAMPO: Record<string, string> = {
  statusProcesso: 'a fase',
  statusJuridico: 'o status jurídico',
  statusOrcamento: 'o status do orçamento',
  statusPerda: 'o motivo da perda',
};
const rotuloCampo = (c: string) => ROTULO_CAMPO[c] ?? c;

function valorLegivel(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function FichaPedido({
  orderId,
  aberto,
  aoFechar,
  podeVoltarFase = false,
  aoMudarSituacao,
}: {
  orderId: number | null;
  aberto: boolean;
  aoFechar: () => void;
  podeVoltarFase?: boolean;
  /** Avisa a tela QUE ABRIU a ficha que o pedido mudou de fase. Sem isto, a ficha se
   *  atualiza sozinha e a tabela atrás continua mostrando a fase antiga — a pessoa fecha
   *  a ficha e conclui que não funcionou (@R 17/09: "atualizar a página corretamente,
   *  para garantir que moveu o item para a fase"). */
  aoMudarSituacao?: () => void;
}) {
  const [dados, setDados] = useState<{
    blocos: Bloco[]; trilha: Trilha[]; statusAtual: string; totalArquivos: number;
    urgencia?: Urgencia; emails?: Emails;
    orcamentosDaPeca?: OrcamentoDaPeca[]; pecasLidas?: PecaLida[];
    situacao?: Situacao; situacaoOpcoes?: SituacaoOpcoes;
  } | null>(null);
  const [mudandoCampo, setMudandoCampo] = useState<string | null>(null);
  // conteúdo de e-mail carregado SOB DEMANDA: abrir a ficha não deve baixar .eml do R2
  // que ninguém vai ler — a ficha é consultada o tempo todo, o e-mail raramente.
  const [corpos, setCorpos] = useState<Record<number, { carregando?: boolean; texto?: string; vazio?: boolean; erro?: string }>>({});
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  useEffect(() => {
    if (!aberto || !orderId) return;
    setCarregando(true);
    setErro('');
    setCorpos({});   // ¬carregar o e-mail do pedido ANTERIOR nesta ficha
    getFichaPedido(orderId)
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.detail ?? 'Não foi possível carregar a ficha deste pedido.'))
      .finally(() => setCarregando(false));
  }, [aberto, orderId]);

  const voltarFase = async () => {
    if (!orderId) return;
    try {
      setRevertendo(true);
      // a última mudança de fase é o que se desfaz — buscada na hora, ¬deduzida da tela
      // excluir_origem=reversao: sem isto o botão vira GANGORRA — depois de desfazer, a
      // "última mudança" passa a ser o PRÓPRIO desfazer, e o 2º clique refaz o que o 1º
      // tinha desfeito. O @R gerou 4 registros alternados no pedido #1248 tentando, e no
      // #1243 o diálogo chegou a oferecer "voltar para Perda" — o oposto do que ele queria.
      const log = await getLogAuditoria({
        order_id: String(orderId),
        campo: 'statusProcesso',
        excluir_origem: 'reversao',
      });
      const ultima = (log.data?.itens ?? [])[0];
      if (!ultima) {
        alert('Este pedido não tem mudança de fase registrada para desfazer.');
        return;
      }
      const ok = window.confirm(
        `Voltar este pedido de "${ultima.valorNovo}" para "${ultima.valorAnterior}"?\n\n` +
          `Quem mudou: ${ultima.usuario ?? 'automático'}\nQuando: ${dataHora(ultima.createDate)}\n\n` +
          'A volta fica registrada no histórico com o seu nome.',
      );
      if (!ok) return;
      const resp = await reverterHistorico(ultima.id);
      const r = await getFichaPedido(orderId);
      setDados(r.data);
      aoMudarSituacao?.();   // a tabela atrás também precisa saber
      const campos: string[] = resp?.data?.camposRevertidos ?? [];
      // Diz QUANTOS campos voltaram: dar perda mexe em três, e a versão antiga desfazia
      // um só — o pedido voltava para a fase certa ainda marcado como perdido.
      alert(campos.length > 1
        ? `Pedido devolvido para a fase anterior (${campos.length} campos restaurados: ${campos.join(', ')}).`
        : 'Pedido devolvido para a fase anterior.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      // o 409 do backend tem mensagem própria e ela é melhor que qualquer genérica:
      // diz que o pedido andou de novo desde aquele registro.
      alert(err?.response?.data?.error ?? 'Não foi possível voltar a fase deste pedido.');
    } finally {
      setRevertendo(false);
    }
  };

  // MOVER a situação (@R 17/09). Distinto do "voltar fase": aquele DESFAZ o que
  // aconteceu; este COLOCA o pedido onde ele deveria estar. Não dispara e-mail — se
  // disparasse, corrigir um cadastro mandaria a cotação de novo ao órgão público.
  const mudarSituacao = async (campo: string, valor: string | null) => {
    if (!orderId) return;
    const atual = (dados?.situacao as Record<string, unknown> | undefined)?.[campo] ?? null;
    if (atual === valor) return;
    const ok = window.confirm(
      `Mudar ${rotuloCampo(campo)} de "${atual ?? '(vazio)'}" para "${valor ?? '(vazio)'}"?\n\n` +
      'Isto corrige o cadastro e fica registrado no histórico com o seu nome.\n' +
      'Nenhum e-mail é enviado por esta mudança.',
    );
    if (!ok) return;
    try {
      setMudandoCampo(campo);
      await moverSituacao(orderId, campo, valor);
      // relê do servidor em vez de assumir: o backend pode ter mexido em mais de um campo
      // (limpar statusPerda também limpa a data da perda).
      const r = await getFichaPedido(orderId);
      setDados(r.data);
      aoMudarSituacao?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error ?? 'Não foi possível mudar este campo.');
    } finally {
      setMudandoCampo(null);
    }
  };

  /**
   * CRIAR UM STATUS NOVO PARA A FASE (@R 17/09: "ao lado de status podemos ter um lápis
   * para criarmos um novo status para a fase, ou trocar o status possível naquela fase").
   *
   * POR QUE SÓ AQUI, NO ORÇAMENTO: os status das outras linhas são o VOCABULÁRIO do
   * funil — cada um dispara (ou marca) um fluxo do sistema, e um nome inventado na tela
   * criaria um estado que nenhum código sabe tratar, aparecendo como fase fantasma nos
   * relatórios. O status de orçamento já tinha, desde 26/08, um cadastro de ETIQUETA
   * MANUAL: rótulo sem automação nenhuma. É esse cadastro que o botão alimenta — nada
   * novo é inventado, o que era uma tela separada passou a caber no lugar onde a decisão
   * acontece.
   *
   * A etiqueta nasce PRESA À FASE em que foi criada, porque foi ali que ela fez sentido;
   * quem quiser uma que valha em todas cadastra pela tela de cadastro, sem fase.
   */
  const criarStatusDaFase = async () => {
    const nome = window.prompt(
      'Nome do novo status de orçamento (é só uma etiqueta — não dispara e-mail nem automação):',
    )?.trim();
    if (!nome) return;
    try {
      setMudandoCampo('statusOrcamento');
      // a tela conhece a FASE pelo rótulo que o usuário vê (statusProcesso); o servidor
      // traduz para a chave do canon. Mandar o rótulo daqui evita a tela ter a sua
      // própria cópia do vocabulário de fases — a cópia é que envelhece calada.
      const faseAtual = (dados?.situacao as Record<string, string | null> | undefined)?.statusProcesso ?? undefined;
      await criarStatusOrcamentoPersonalizado(nome, faseAtual ?? undefined);
      await moverSituacao(orderId!, 'statusOrcamento', nome);
      const r = await getFichaPedido(orderId!);
      setDados(r.data);
      aoMudarSituacao?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; nome?: string[] } } };
      alert(
        err?.response?.data?.error
        ?? (err?.response?.data?.nome?.[0] ? `Status: ${err.response.data.nome[0]}` : null)
        ?? 'Não foi possível criar este status.',
      );
    } finally {
      setMudandoCampo(null);
    }
  };

  const abrirEmail = async (anexoId: number) => {
    if (!orderId || corpos[anexoId]?.texto !== undefined || corpos[anexoId]?.carregando) return;
    setCorpos((c) => ({ ...c, [anexoId]: { carregando: true } }));
    try {
      const r = await getConteudoEmail(orderId, anexoId);
      setCorpos((c) => ({ ...c, [anexoId]: { texto: r.data.corpo ?? '', vazio: !!r.data.vazio } }));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      // a CAUSA vai para a tela: "não foi possível" sem motivo faz a pessoa concluir que o
      // e-mail não existe, quando o que houve foi o armazenamento não responder.
      setCorpos((c) => ({ ...c, [anexoId]: { erro: err?.response?.data?.detail ?? 'Não consegui ler este e-mail.' } }));
    }
  };

  return (
    <Dialog
      header={`Ficha do pedido #${orderId ?? ''}`}
      visible={aberto}
      style={{ width: 'min(920px, 96vw)' }}
      onHide={aoFechar}
    >
      {carregando && <p>Carregando a ficha…</p>}
      {erro && <p className="fic__erro">{erro}</p>}

      {dados && (
        <>
          {/* SITUAÇÃO COMPLETA (@R 17/09: "na ficha não mostra a fase e os status, é
              importante também para podermos ver e alterar corretamente caso precise").
              Os quatro juntos porque é a COMBINAÇÃO que conta a história: "Perda" com
              "Perda pelo Medico" é o médico que recusou; "Perda" com "Perda Pelo
              Juridico" é decisão nossa. Ver um sem o outro fez o #1248 parecer
              consertado quando só um dos três campos tinha voltado. */}
          <section className="fic__situacao">
            <header className="fic__situacao-cab">
              <strong>Situação do pedido</strong>
              {podeVoltarFase
                ? <small>Alterar aqui corrige o cadastro e fica no histórico — nenhum e-mail é enviado.</small>
                : <small>Somente leitura — seu perfil não altera a situação.</small>}
            </header>
            <div className="fic__situacao-grade">
              {(['statusProcesso', 'statusJuridico', 'statusOrcamento', 'statusPerda'] as const).map((campo) => {
                const atual = (dados.situacao as Record<string, string | null> | undefined)?.[campo] ?? null;
                const opcoes = dados.situacaoOpcoes?.[campo] ?? [];
                return (
                  <div className="fic__situacao-item" key={campo}>
                    <label>{rotuloCampo(campo).replace(/^(a|o) /, '')}</label>
                    {podeVoltarFase && opcoes.length > 0 ? (
                      <Dropdown
                        value={atual}
                        options={opcoes.map((o) => ({ label: o, value: o }))}
                        onChange={(e) => mudarSituacao(campo, e.value)}
                        placeholder="— não definido"
                        // só statusPerda pode ficar vazio: pedido que deixou de ser perda
                        // não tem motivo de perda. Fase vazia não é um estado que exista.
                        showClear={campo === 'statusPerda'}
                        disabled={mudandoCampo !== null}
                        loading={mudandoCampo === campo}
                        className="fic__situacao-drop"
                      />
                    ) : (
                      <strong>{atual ?? '— não definido'}</strong>
                    )}
                    {podeVoltarFase && campo === 'statusOrcamento' && (
                      <button
                        type="button"
                        className="fic__situacao-novo"
                        onClick={criarStatusDaFase}
                        disabled={mudandoCampo !== null}
                        title="Criar um status novo para esta fase e aplicá-lo agora"
                      >
                        <i className="pi pi-pencil" /> novo status
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {dados.situacao?.dataStatusPerda && (
              <small className="fic__situacao-nota">
                Perda registrada em {new Date(dados.situacao.dataStatusPerda).toLocaleDateString('pt-BR')}
                {' '}— limpar o motivo da perda também limpa esta data.
              </small>
            )}
          </section>

          <div className="fic__topo">
            <span>
              Fase atual: <strong>{dados.statusAtual}</strong>
            </span>
            <span>{dados.totalArquivos} arquivo(s) no pedido</span>
            {(dados.urgencia?.vezesPedido ?? 1) > 1 && (
              <span className={`fic__urgencia fic__urgencia--${(dados.urgencia?.repedidosManuais ?? 0) > 0 ? 'max' : (dados.urgencia!.vezesPedido >= 3 ? 'tres' : 'dois')}`}>
                <i className="pi pi-exclamation-triangle" aria-hidden="true" /> Urgência {dados.urgencia!.vezesPedido}×
                {dados.urgencia?.ultimoPedidoEm && <> — último pedido em {dataHora(dados.urgencia.ultimoPedidoEm)}</>}
                {(dados.urgencia?.repedidosManuais ?? 0) > 0 && (
                  <> · {dados.urgencia!.repedidosManuais} cobrança(s) por telefone</>
                )}
              </span>
            )}
            {podeVoltarFase && (
              <button type="button" className="fic__voltar" onClick={voltarFase} disabled={revertendo}>
                {revertendo ? 'Voltando…' : '↩ Voltar para a fase anterior'}
              </button>
            )}
          </div>

          {dados.blocos.map((b) => (
            <section className="fic__bloco" key={b.fase}>
              <header className="fic__fase">
                <strong>{b.fase}</strong>
                <span className="fic__quando">{dataHora(b.quando)}</span>
                {b.rastro.medido && (
                  <span className="fic__rastro">
                    por {b.rastro.por} em {dataHora(b.rastro.em)}
                  </span>
                )}
              </header>

              <dl className="fic__campos">
                {b.campos.map((c, i) => (
                  <div key={`${b.fase}-${i}`} className={c.preenchido ? '' : 'fic__vazio'}>
                    <dt>{c.rotulo}</dt>
                    <dd>{c.preenchido ? valorLegivel(c.valor) : 'não preenchido nesta fase'}</dd>
                  </div>
                ))}
              </dl>

              {b.arquivos.length > 0 && (
                <ul className="fic__arquivos">
                  {b.arquivos.map((a) => (
                    <li key={a.id}>
                      <a href={a.link} target="_blank" rel="noreferrer">
                        {a.nome}
                      </a>
                      <span className="fic__tipo">{a.tipo}</span>
                      <span className="fic__quando">{dataHora(a.quando)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* ═══ O QUE AS PEÇAS DISSERAM SOBRE PREÇO (@R 18/09) ═══
              ⟦"processamento das peças para ganhar a área na ficha técnica e dos
              orçamentos, para termos os orçamentos para enviar corretamente"⟧

              A extração já rodava e já gravava — 683 orçamentos vindos de peça de inteiro
              teor na base (medido 18/09). O que faltava era exatamente isto: aparecer.
              Enquanto não aparecia, a equipe reabria o PDF de 300 páginas para procurar
              um número que o sistema já tinha lido e guardado.

              CADA LINHA CARREGA DE ONDE VEIO (documento + página). Valor sem origem é
              boato: quem for usá-lo para julgar uma cotação precisa poder abrir a página
              e ver com os próprios olhos. */}
          {dados.orcamentosDaPeca && dados.orcamentosDaPeca.length > 0 && (
            <section className="fic__bloco fic__orcpeca">
              <header className="fic__fase">
                <strong>Orçamentos encontrados nas peças ({dados.orcamentosDaPeca.length})</strong>
                <small>
                  Lidos automaticamente da decisão de inteiro teor — são <em>proposta de
                  leitura</em>, não valor conferido. Servem para julgar a cotação que chegar
                  e montar o que vai à SES; não são enviados ao médico que vai cotar (o
                  número ancoraria o preço dele).
                </small>
              </header>
              <ul className="fic__orcpeca-lista">
                {dados.orcamentosDaPeca.map((o) => (
                  <li key={o.id} className="fic__orcpeca-item">
                    <span className="fic__orcpeca-valor">
                      {o.valorTotal != null
                        ? o.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'valor não lido'}
                    </span>
                    <span className="fic__orcpeca-quem"
                      title={o.prestador && o.prestadorExibicao !== o.prestador
                        ? `na peça está escrito: ${o.prestador}`
                        : undefined}>
                      {o.prestadorExibicao || o.prestador || 'prestador não identificado'}
                    </span>
                    {o.procedimento && <span className="fic__orcpeca-proc">{o.procedimento}</span>}
                    <span className="fic__orcpeca-origem">
                      {o.anexoOrigemNome || 'peça'}
                      {o.paginaOrigem != null ? ` · pág. ${o.paginaOrigem}` : ''}
                      {o.linkArquivo && (
                        <>
                          {' · '}
                          <a href={o.linkArquivo} target="_blank" rel="noreferrer">abrir</a>
                        </>
                      )}
                      {o.confirmado
                        ? <em className="fic__orcpeca-ok"> · conferido por {o.confirmadoPor}</em>
                        : <em className="fic__orcpeca-prop"> · não conferido</em>}
                      {/* O GESTO DE CONFERIR (@R 18/09): ⟦"quem for usar o número abre a
                          página do link, confere e marca. Sem mutirão"⟧. Fica aqui, ao
                          lado do link, porque é aqui que a pessoa acabou de abrir a
                          fonte — pedir que ela vá a outra tela marcar seria garantir
                          que ninguém marca. */}
                      {!o.confirmado && (
                        <button type="button" className="fic__orcpeca-conferir"
                          title="Abri a página do documento e confirmei que este valor está certo"
                          onClick={async () => {
                            try {
                              await conferirOrcamentoPeca(o.id);
                              // relê a ficha: a marca precisa aparecer no MESMO clique,
                              // senão a pessoa clica de novo achando que não funcionou
                              if (orderId) {
                                const r = await getFichaPedido(orderId);
                                setDados(r.data);
                              }
                            } catch {
                              alert('Não foi possível registrar a conferência.');
                            }
                          }}>conferi</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {/* A COBERTURA anda junto: "3 orçamentos" parece o total da peça quando
                  pode ser o total das páginas que deu para ler. A frase honesta é a do
                  processador, com os números dele. */}
              {dados.pecasLidas && dados.pecasLidas.length > 0 && (
                <ul className="fic__orcpeca-cobertura">
                  {dados.pecasLidas.map((p) => (
                    <li key={p.anexoId}>
                      <strong>{p.nome}</strong> · {p.status || 'não processada'}
                      {p.mensagem ? ` — ${p.mensagem}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {dados.emails && (
            <section className="fic__bloco fic__emails">
              <header className="fic__fase fic__fase--com-acao">
                <strong>E-mails deste pedido</strong>
                {/* @R 17/09: escrever ao solicitante "em qualquer fase, em ações em cada
                    parte do pedido". O lugar natural é aqui, ao lado do que já foi dito
                    a ele — quem vai escrever precisa ver o histórico antes, senão repete
                    ou contradiz o que o sistema já mandou. */}
                {orderId && (
                  <EscreverEmail
                    orderId={orderId}
                    destinatarioPadrao={dados.emails?.solicitante ?? null}
                    aoEnviar={async () => {
                      const r = await getFichaPedido(orderId);
                      setDados(r.data);
                    }}
                  />
                )}
              </header>

              {/* AUSÊNCIA DECLARADA, e com o MOTIVO: medido 17/09, só 3,2% dos pedidos têm
                  o e-mail original — não porque a captura falhe (ela pega 90% dos que vêm
                  por e-mail), mas porque a maioria é cadastro manual. Sem dizer isso, a
                  equipe leria branco e concluiria que a tela quebrou. */}
              {dados.emails.explicacao && <p className="fic__vazio-msg">{dados.emails.explicacao}</p>}

              {dados.emails.recebidos.length > 0 && (
                <ul className="fic__emails-lista">
                  {dados.emails.recebidos.map((e) => (
                    <li key={e.id}>
                      <strong>{e.assunto || '(sem assunto)'}</strong>
                      <span className="fic__de">{e.remetente || '(remetente desconhecido)'}</span>
                      <span className="fic__quando">{dataHora(e.quando)}</span>
                      <span className="fic__tipo">{e.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {dados.emails.originais.map((o) => (
                <details key={o.anexoId} className="fic__email" onToggle={(ev) => {
                  if ((ev.target as HTMLDetailsElement).open) abrirEmail(o.anexoId);
                }}>
                  <summary>{o.nome} · {dataHora(o.quando)} — abrir o conteúdo</summary>
                  {corpos[o.anexoId]?.carregando && <p>Lendo o e-mail…</p>}
                  {corpos[o.anexoId]?.erro && <p className="fic__erro">{corpos[o.anexoId].erro}</p>}
                  {corpos[o.anexoId]?.vazio && (
                    <p className="fic__vazio-msg">Este e-mail não tem texto — só anexos ou imagem.</p>
                  )}
                  {corpos[o.anexoId]?.texto && !corpos[o.anexoId]?.vazio && (
                    <pre className="fic__corpo-email">{corpos[o.anexoId].texto}</pre>
                  )}
                  <a href={o.link} target="_blank" rel="noreferrer" className="fic__baixar">
                    baixar o e-mail original (.eml)
                  </a>
                </details>
              ))}
            </section>
          )}

          <details className="fic__trilha">
            <summary>Trilha completa ({dados.trilha.length} mudanças)</summary>
            <ul>
              {dados.trilha.map((t, i) => (
                <li key={i}>
                  <span className="fic__campo">{t.campo}</span>: {t.de || '(vazio)'} → <strong>{t.para}</strong> · {t.por} ·{' '}
                  {dataHora(t.em)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Dialog>
  );
}

export default FichaPedido;
