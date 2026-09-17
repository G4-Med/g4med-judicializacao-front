import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getFichaPedido, getLogAuditoria, reverterHistorico, getConteudoEmail, moverSituacao } from '../../services/api/orders';
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

type Emails = {
  origem: 'COM_CONTEUDO' | 'SEM_ORIGINAL' | 'NAO_VEIO_POR_EMAIL';
  explicacao: string | null;
  recebidos: EmailRecebido[];
  originais: EmailOriginal[];
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

          {dados.emails && (
            <section className="fic__bloco fic__emails">
              <header className="fic__fase"><strong>E-mails deste pedido</strong></header>

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
