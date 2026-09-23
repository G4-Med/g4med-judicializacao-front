/** A COTAÇÃO CONCORRENTE NA TELA DE ORÇAMENTO MÉDICO (@R 18/09/2026).
 *
 *  ⟦"precisamos poder selecionar mais de um médico para mandar os orçamentos"⟧ — e, logo
 *  depois, ⟦"corrigir e validar para ficar 100%"⟧ sobre as duas pontas que faltavam:
 *  os convidados não apareciam nesta tela, e não havia como dizer qual orçamento valeu.
 *
 *  ═══ POR QUE NÃO VIRA UMA LINHA POR MÉDICO NA TABELA ═══
 *  A tabela é de PEDIDOS. Três convidados no mesmo pedido viram três linhas iguais em
 *  paciente, procedimento, prazo e valor de referência — e aí toda contagem da tela passa
 *  a mentir: "quantos pedidos aguardam orçamento" viraria 3 onde há 1, e o KPI do topo
 *  contaria o mesmo paciente três vezes. O pedido continua sendo uma linha; os convidados
 *  vivem DENTRO dela, num painel que abre.
 *
 *  ═══ O QUE O SISTEMA DECIDE E O QUE ELE NÃO DECIDE ═══
 *  Ele ordena por valor e DESTACA o menor. Não elege. As duas regras automáticas
 *  plausíveis erram: "menor valor" foi refutado pelo pedido 1235 (o mais barato estava
 *  incompleto — faltava a equipe cirúrgica, apontado pelo Dr. Lauro) e "primeiro que
 *  responde" premia pressa, não conteúdo. Quem escolhe é quem opera; o sistema registra
 *  quem escolheu, quando, e — quando não foi o mais barato — por quê.
 */
import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Tag } from 'primereact/tag';
import { Dropdown } from 'primereact/dropdown';
import { convidarCandidatoCotacao, elegerVencedorCotacao, trocarConvidadoCotacao } from '../../services/api/orders';
import './CotacaoConcorrente.css';

export interface CandidatoCotacao {
  id: number;
  idMedico: number;
  nomeMedico: string;
  situacao: 'CONVIDADO' | 'RESPONDEU' | 'RECUSOU' | 'SEM_RESPOSTA' | string;
  valorRespondido: number | null;
  observacao?: string | null;
  vencedor?: boolean;
  escolhidoPor?: string | null;
  escolhidoEm?: string | null;
  motivoEscolha?: string | null;
  convidadoEm?: string | null;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_SITUACAO: Record<string, { texto: string; severity: any }> = {
  CONVIDADO: { texto: 'aguardando', severity: 'warning' },
  RESPONDEU: { texto: 'respondeu', severity: 'success' },
  RECUSOU: { texto: 'não vai cotar', severity: 'danger' },
  SEM_RESPOSTA: { texto: 'sem resposta', severity: 'secondary' },
};

/** A célula na tabela: só o resumo. O detalhe abre, porque quem varre a fila quer ver
 *  de relance QUANTOS estão cobrados e quantos já voltaram — não os nomes. */
export function CelulaCotacaoConcorrente({
  candidatos,
  onAbrir,
}: {
  candidatos?: CandidatoCotacao[] | null;
  onAbrir: () => void;
}) {
  const lista = candidatos ?? [];
  if (lista.length === 0) {
    // Zero convidados NÃO é "nenhum médico": é "ninguém foi convidado a cotar em
    // paralelo". O pedido tem o médico responsável na coluna ao lado.
    return <span className="ident-vazio" title="Nenhum médico convidado a cotar em paralelo">—</span>;
  }
  const responderam = lista.filter((c) => c.situacao === 'RESPONDEU');
  const vencedor = lista.find((c) => c.vencedor);
  return (
    <button type="button" className="cc-celula" onClick={onAbrir}
      title="Ver quem foi convidado, o que cada um respondeu e escolher o orçamento que vale">
      <span className="cc-celula__n">{lista.length} convidado{lista.length > 1 ? 's' : ''}</span>
      <span className="cc-celula__sep">·</span>
      <span className={responderam.length ? 'cc-celula__ok' : 'cc-celula__esperando'}>
        {responderam.length} respond{responderam.length === 1 ? 'eu' : 'eram'}
      </span>
      {vencedor && (
        <Tag className="cc-celula__tag" value="escolhido" severity="success" icon="pi pi-check" />
      )}
      {!vencedor && responderam.length > 1 && (
        <Tag className="cc-celula__tag" value="decidir" severity="warning" icon="pi pi-exclamation-circle"
          title="Mais de um respondeu e ninguém escolheu ainda qual orçamento vale" />
      )}
    </button>
  );
}

export function DialogCotacaoConcorrente({
  visible,
  onHide,
  orderId,
  paciente,
  refPreco,
  candidatos,
  readOnly,
  onMudou,
  onCopiarPedido,
  idMedicoPedido,
  medicos,
}: {
  visible: boolean;
  onHide: () => void;
  orderId: number | null;
  paciente?: string;
  refPreco?: number | null;
  candidatos: CandidatoCotacao[];
  readOnly?: boolean;
  onMudou: () => Promise<void> | void;
  onCopiarPedido?: () => void;
  /** médico do pedido HOJE (o "principal"): trocar este convidado troca o médico do pedido */
  idMedicoPedido?: number | null;
  /** lista para escolher o médico novo na troca (@R 23/09 14:11) */
  medicos?: { id: number; nome: string }[];
}) {
  const [salvando, setSalvando] = useState<number | null>(null);
  const [valores, setValores] = useState<Record<number, number | null>>({});
  const [motivo, setMotivo] = useState('');
  const [trocando, setTrocando] = useState<number | null>(null);   // id do convidado com a troca aberta
  const [novoMedico, setNovoMedico] = useState<number | null>(null);

  const jaConvidados = new Set(candidatos.map((c) => c.idMedico));
  const opcoesMedico = (medicos ?? []).filter((m) => m.id !== 1 && !jaConvidados.has(m.id))
    .map((m) => ({ label: m.nome, value: m.id }));

  // Trocar convidado ERRADO (@R 23/09 14:11). Se é o médico do pedido, o pedido troca de médico junto
  // — mesma regra do lápis: o orçamento volta a "Solicitado ao Médico" e a recusa do anterior some.
  const confirmarTroca = async (c: CandidatoCotacao) => {
    if (!orderId || !novoMedico) return;
    const nomeNovo = opcoesMedico.find((o) => o.value === novoMedico)?.label ?? 'o médico escolhido';
    const principal = idMedicoPedido != null && c.idMedico === idMedicoPedido;
    if (principal && !window.confirm(`${c.nomeMedico} é o MÉDICO DO PEDIDO.\n\nTrocar por ${nomeNovo} muda o médico do pedido `
      + 'para ele: o orçamento volta a "Solicitado ao Médico" e a resposta/recusa anterior some.\n\nConfirmar?')) return;
    setSalvando(c.idMedico);
    try {
      await trocarConvidadoCotacao(orderId, c.id, { idMedico: novoMedico });
      setTrocando(null); setNovoMedico(null);
      await onMudou();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível trocar o convidado.');
    } finally {
      setSalvando(null);
    }
  };

  const tornarPrincipal = async (c: CandidatoCotacao) => {
    if (!orderId) return;
    if (!window.confirm(`Tornar ${c.nomeMedico} o médico do pedido?\n\nO nome na coluna Médico muda para ele, e o `
      + 'orçamento volta a "Solicitado ao Médico".')) return;
    setSalvando(c.idMedico);
    try {
      await trocarConvidadoCotacao(orderId, c.id, { principal: true });
      await onMudou();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível trocar o médico do pedido.');
    } finally {
      setSalvando(null);
    }
  };

  const respondidos = candidatos.filter(
    (c) => c.situacao === 'RESPONDEU' && c.valorRespondido != null);
  const menor = respondidos.length
    ? respondidos.reduce((a, b) => (a.valorRespondido! <= b.valorRespondido! ? a : b))
    : null;
  const vencedor = candidatos.find((c) => c.vencedor);

  const registrarResposta = async (c: CandidatoCotacao) => {
    const valor = valores[c.idMedico];
    if (!orderId || valor == null || valor <= 0) {
      alert('Informe o valor que este médico respondeu.');
      return;
    }
    setSalvando(c.idMedico);
    try {
      await convidarCandidatoCotacao(orderId, c.idMedico,
        { situacao: 'RESPONDEU', valorRespondido: valor });
      await onMudou();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível registrar a resposta.');
    } finally {
      setSalvando(null);
    }
  };

  const mudarSituacao = async (c: CandidatoCotacao, situacao: string) => {
    if (!orderId) return;
    setSalvando(c.idMedico);
    try {
      await convidarCandidatoCotacao(orderId, c.idMedico, { situacao });
      await onMudou();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível atualizar.');
    } finally {
      setSalvando(null);
    }
  };

  const eleger = async (c: CandidatoCotacao) => {
    if (!orderId) return;
    const naoEhOMenor = !!menor && menor.idMedico !== c.idMedico;
    // O motivo só é exigido quando a escolha NÃO é a mais barata — pedir justificativa
    // sempre transformaria o campo em formalidade que se preenche com "ok".
    const justificativa = naoEhOMenor ? motivo.trim() : '';
    if (naoEhOMenor && !justificativa) {
      alert('Este não é o menor valor. Escreva embaixo por que ele foi escolhido — '
        + 'é a pergunta que alguém vai fazer depois.');
      return;
    }
    setSalvando(c.idMedico);
    try {
      await elegerVencedorCotacao(orderId, c.idMedico, { motivo: justificativa });
      setMotivo('');
      await onMudou();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível registrar a escolha.');
    } finally {
      setSalvando(null);
    }
  };

  const desfazer = async (c: CandidatoCotacao) => {
    if (!orderId) return;
    setSalvando(c.idMedico);
    try {
      await elegerVencedorCotacao(orderId, c.idMedico, { desfazer: true });
      await onMudou();
    } catch {
      alert('Não foi possível desfazer.');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Dialog header="Cotação concorrente" visible={visible} onHide={onHide}
      style={{ width: '46rem', maxWidth: '96vw' }} className="cc-dialog">
      <div className="cc-cabecalho">
        <div><strong>{paciente}</strong> · pedido #{orderId}</div>
        {refPreco ? <div className="cc-ref">referência do pedido: {brl(refPreco)}</div> : null}
        {onCopiarPedido && (
          <Button label="Copiar a mensagem do pedido" icon="pi pi-copy" text size="small"
            onClick={onCopiarPedido}
            tooltip="A mensagem é a mesma para todos — copie e envie a cada médico convidado" />
        )}
      </div>

      {candidatos.length === 0 && (
        <p className="cc-vazio">
          Ninguém foi convidado a cotar este pedido em paralelo. Convites novos saem da
          tela <strong>Selecionar Médico</strong>, no modal da sugestão.
        </p>
      )}

      <ul className="cc-lista">
        {[...candidatos]
          // respondidos primeiro, e entre eles do mais barato ao mais caro: é a ordem em
          // que a decisão é tomada. Quem ainda não respondeu não disputa nada.
          .sort((a, b) => {
            const ra = a.situacao === 'RESPONDEU' ? 0 : 1;
            const rb = b.situacao === 'RESPONDEU' ? 0 : 1;
            if (ra !== rb) return ra - rb;
            return (a.valorRespondido ?? Infinity) - (b.valorRespondido ?? Infinity);
          })
          .map((c) => {
            const ehMenor = menor?.idMedico === c.idMedico;
            const rot = ROTULO_SITUACAO[c.situacao] ?? { texto: c.situacao, severity: 'secondary' };
            return (
              <li key={c.id} className={c.vencedor ? 'cc-item cc-item--vencedor' : 'cc-item'}>
                <div className="cc-item__topo">
                  <span className="cc-item__nome">{c.nomeMedico}</span>
                  {idMedicoPedido != null && c.idMedico === idMedicoPedido && (
                    <Tag value="médico do pedido" icon="pi pi-user" className="cc-item__principal"
                      title="É o médico que aparece na coluna Médico. Trocar este convidado troca o médico do pedido." />
                  )}
                  <Tag value={rot.texto} severity={rot.severity} />
                  {ehMenor && respondidos.length > 1 && !c.vencedor && (
                    <Tag value="menor valor" severity="info" icon="pi pi-arrow-down" />
                  )}
                  {c.vencedor && <Tag value="é o que vale" severity="success" icon="pi pi-check" />}
                </div>

                {c.valorRespondido != null && (
                  <div className="cc-item__valor">
                    {brl(c.valorRespondido)}
                    {refPreco ? (
                      <span className="cc-item__vsref">
                        {' '}({c.valorRespondido > refPreco ? '+' : ''}
                        {Math.round((c.valorRespondido / refPreco - 1) * 100)}% vs referência)
                      </span>
                    ) : null}
                  </div>
                )}

                {c.vencedor && (
                  <div className="cc-item__rastro">
                    escolhido por {c.escolhidoPor ?? '—'}
                    {c.escolhidoEm ? ` em ${new Date(c.escolhidoEm).toLocaleString('pt-BR')}` : ''}
                    {c.motivoEscolha ? ` · ${c.motivoEscolha}` : ''}
                  </div>
                )}

                {!readOnly && trocando === c.id && (
                  <div className="cc-item__troca">
                    <Dropdown value={novoMedico} options={opcoesMedico} onChange={(e) => setNovoMedico(e.value)}
                      placeholder="Trocar por qual médico?" filter className="cc-item__troca-dd" autoFocus />
                    <Button label="Confirmar troca" size="small" icon="pi pi-check" disabled={!novoMedico}
                      loading={salvando === c.idMedico} onClick={() => confirmarTroca(c)} />
                    <Button label="Cancelar" size="small" text onClick={() => { setTrocando(null); setNovoMedico(null); }} />
                  </div>
                )}

                {!readOnly && trocando !== c.id && (
                  <div className="cc-item__correcao">
                    <Button label="Trocar convidado" size="small" text icon="pi pi-sync"
                      title="O convidado está errado? Troque por outro médico"
                      onClick={() => { setTrocando(c.id); setNovoMedico(null); }} disabled={salvando != null} />
                    {idMedicoPedido != null && c.idMedico !== idMedicoPedido && (
                      <Button label="Tornar médico do pedido" size="small" text icon="pi pi-user"
                        onClick={() => tornarPrincipal(c)} disabled={salvando != null} />
                    )}
                  </div>
                )}

                {!readOnly && (
                  <div className="cc-item__acoes">
                    {c.situacao !== 'RESPONDEU' ? (
                      <>
                        <InputNumber
                          value={valores[c.idMedico] ?? null}
                          onValueChange={(e) =>
                            setValores((v) => ({ ...v, [c.idMedico]: e.value ?? null }))}
                          mode="currency" currency="BRL" locale="pt-BR"
                          placeholder="valor respondido" className="cc-item__input"
                          disabled={salvando === c.idMedico}
                        />
                        <Button label="Registrar resposta" size="small" icon="pi pi-save"
                          onClick={() => registrarResposta(c)}
                          loading={salvando === c.idMedico} />
                        <Button label="Não vai cotar" size="small" text severity="danger"
                          onClick={() => mudarSituacao(c, 'RECUSOU')}
                          disabled={salvando === c.idMedico} />
                      </>
                    ) : c.vencedor ? (
                      <Button label="Desfazer escolha" size="small" text severity="secondary"
                        onClick={() => desfazer(c)} loading={salvando === c.idMedico} />
                    ) : (
                      <Button label="Este orçamento é o que vale" size="small" icon="pi pi-check"
                        severity="success" onClick={() => eleger(c)}
                        loading={salvando === c.idMedico} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
      </ul>

      {!readOnly && respondidos.length > 1 && !vencedor && (
        <div className="cc-motivo">
          <label htmlFor="cc-motivo">
            Se escolher um que não é o mais barato, diga por quê
          </label>
          <InputText id="cc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex: o mais barato não inclui a equipe cirúrgica" />
        </div>
      )}

      {vencedor && (
        <p className="cc-nota">
          O pedido passou a ser deste médico — é o que a plataforma inteira lê como
          responsável. O valor oficial continua vindo do orçamento lançado na tela de
          sempre; aqui fica registrado qual cotação venceu e por quê.
        </p>
      )}
    </Dialog>
  );
}
