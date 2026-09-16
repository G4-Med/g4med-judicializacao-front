import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getFichaPedido, getLogAuditoria, reverterHistorico } from '../../services/api/orders';
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

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

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
}: {
  orderId: number | null;
  aberto: boolean;
  aoFechar: () => void;
  podeVoltarFase?: boolean;
}) {
  const [dados, setDados] = useState<{ blocos: Bloco[]; trilha: Trilha[]; statusAtual: string; totalArquivos: number } | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  useEffect(() => {
    if (!aberto || !orderId) return;
    setCarregando(true);
    setErro('');
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
      const log = await getLogAuditoria({ order_id: String(orderId), campo: 'statusProcesso' });
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
      await reverterHistorico(ultima.id);
      const r = await getFichaPedido(orderId);
      setDados(r.data);
      alert('Pedido devolvido para a fase anterior.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      // o 409 do backend tem mensagem própria e ela é melhor que qualquer genérica:
      // diz que o pedido andou de novo desde aquele registro.
      alert(err?.response?.data?.error ?? 'Não foi possível voltar a fase deste pedido.');
    } finally {
      setRevertendo(false);
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
          <div className="fic__topo">
            <span>
              Fase atual: <strong>{dados.statusAtual}</strong>
            </span>
            <span>{dados.totalArquivos} arquivo(s) no pedido</span>
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
