import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { getPacoteExames, montarCotacaoMedico, montarCotacaoTodosCandidatos } from '../../services/api/orders';

type MensagemPorMedico = { idMedico: number; medico: string; assunto: string; mensagem: string; situacao?: string };

/**
 * PACOTE DE EXAMES + COTAÇÃO AO MÉDICO (@R 28/08, task #249).
 *
 * Junta num lugar só os exames/laudos do pedido — venham da peça de inteiro teor ou do
 * e-mail — e monta a mensagem de cotação com prazo de 24h e o enquadramento de
 * solicitação pública. Das 294 perdas medidas em produção, 148 são por falta de
 * especialista ou recusa do médico: médico recusa o que chega incompleto.
 *
 * Carrega só ao CLIQUE. As telas que usam este expansor já baixam muita coisa; um
 * fetch a mais por linha aberta multiplicaria por 50 numa tabela cheia.
 */
export function PacoteExamesCotacao({ orderId }: { orderId: number }) {
  const [pacote, setPacote] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [medico, setMedico] = useState('');
  const [cotacao, setCotacao] = useState<any | null>(null);
  const [montando, setMontando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const abrir = () => {
    setCarregando(true);
    getPacoteExames(orderId)
      .then(({ data }) => setPacote(data))
      .catch(() => setPacote({ itens: [], total: 0, resumo: 'Não foi possível carregar o pacote.' }))
      .finally(() => setCarregando(false));
  };

  const montar = () => {
    setMontando(true); setCopiado(false);
    montarCotacaoMedico(orderId, medico.trim() || undefined, true)
      .then(({ data }) => setCotacao(data))
      .catch(() => setCotacao({ mensagem: 'Não foi possível montar a mensagem.', assunto: '' }))
      .finally(() => setMontando(false));
  };

  const copiarTexto = async (texto: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Navegador sem permissão de área de transferência: o texto está na tela,
      // dá para selecionar à mão. Melhor falhar visível do que fingir que copiou.
      window.prompt('Copie o texto abaixo (Ctrl+C):', texto);
      return false;
    }
  };

  const copiar = async () => {
    if (!cotacao) return;
    setCopiado(await copiarTexto(`${cotacao.assunto}\n\n${cotacao.mensagem}`));
  };

  /* COBRAR TODOS OS CONVIDADOS (@R 19/09, task #477): uma mensagem por médico convidado,
     cada uma com o nome certo — nunca uma só com todos, porque os concorrentes não podem
     se ver (o valor de um ancoraria o do outro). Quem recusou não é cobrado; "SEM
     PROFISSIONAL" não é médico. O backend decide isso; aqui só se mostra e se copia. */
  const [mensagens, setMensagens] = useState<MensagemPorMedico[] | null>(null);
  const [montandoTodos, setMontandoTodos] = useState(false);
  const [copiadoId, setCopiadoId] = useState<number | null>(null);
  const [avisoTodos, setAvisoTodos] = useState<string | null>(null);

  const montarTodos = () => {
    setMontandoTodos(true); setCopiadoId(null); setAvisoTodos(null);
    montarCotacaoTodosCandidatos(orderId)
      .then(({ data }) => {
        const lista: MensagemPorMedico[] = data?.mensagens ?? [];
        if (!lista.length) {
          setAvisoTodos(data?.aviso ?? 'Nenhum médico convidado a cotar este pedido — convide na tela de Orçamento Médico primeiro.');
          setMensagens([]);
        } else {
          setMensagens(lista);
        }
      })
      .catch((e: any) => {
        setAvisoTodos(`Não consegui montar as mensagens (${e?.response?.status ?? 'sem resposta'}).`);
        setMensagens([]);
      })
      .finally(() => setMontandoTodos(false));
  };

  const copiarUma = async (m: MensagemPorMedico) => {
    setCopiadoId((await copiarTexto(`${m.assunto}\n\n${m.mensagem}`)) ? m.idMedico : null);
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 6px' }}>
        <i className="pi pi-file-check" /> Exames do processo e cotação ao médico
      </h4>

      {!pacote ? (
        <Button label="Ver os exames deste pedido" icon="pi pi-search" size="small" outlined
          loading={carregando} onClick={abrir} />
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '0.85rem', opacity: 0.8 }}>
            {pacote.resumo}
          </p>

          {pacote.itens?.length > 0 && (
            <ul style={{ margin: '0 0 10px', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
              {pacote.itens.map((i: any) => (
                <li key={i.id} style={{ marginBottom: 3 }}>
                  <a href={i.link} target="_blank" rel="noreferrer">{i.nome}</a>
                  {i.data ? ` — ${i.data}` : ''}{' '}
                  <span style={{ opacity: 0.6 }}>({i.origem}{i.pagina ? `, p. ${i.pagina}` : ''})</span>
                  {/* Só o ILEGÍVEL vira alerta. Medido em produção 28/08: 429 dos 609
                      documentos já trazem nome no próprio arquivo — marcar todos como
                      pendência faria o aviso aparecer sempre, e aviso que sempre aparece
                      ninguém lê. */}
                  {i.qualidade === 'ilegivel' && (
                    <Tag value="sem nome legível" severity="warning"
                      style={{ marginLeft: 6, fontSize: '0.7rem' }} />
                  )}
                  {i.qualidade === 'conferido' && (
                    <Tag value="conferido" severity="success"
                      style={{ marginLeft: 6, fontSize: '0.7rem' }} />
                  )}
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <InputText value={medico} onChange={(e) => setMedico(e.target.value)}
              placeholder="Nome do médico (opcional)" style={{ width: '16rem' }}
              aria-label="Nome do médico para a mensagem" />
            <Button label="Montar mensagem de cotação" icon="pi pi-envelope" size="small"
              loading={montando} onClick={montar} />
            <Button label="Cobrar todos os convidados" icon="pi pi-users" size="small" outlined
              loading={montandoTodos} onClick={montarTodos}
              tooltip="Uma mensagem para cada médico convidado a cotar — nunca uma só com todos"
              tooltipOptions={{ position: 'top' }} />
          </div>
        </>
      )}

      <Dialog header="Cotação ao médico — revise antes de enviar" visible={!!cotacao} modal
        style={{ width: '48rem', maxWidth: '96vw' }} onHide={() => setCotacao(null)}>
        {cotacao && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {cotacao.aviso && (
              <div style={{ padding: '.55rem .75rem', borderRadius: 8, border: '1px solid #fcd34d',
                            background: '#fffbeb', color: '#92400e', fontSize: '0.85rem' }}>
                <i className="pi pi-exclamation-triangle" /> {cotacao.aviso}
              </div>
            )}
            <div>
              <strong style={{ fontSize: '0.8rem', opacity: 0.7 }}>ASSUNTO</strong>
              <p style={{ margin: '2px 0 0' }}>{cotacao.assunto}</p>
            </div>
            <div>
              <strong style={{ fontSize: '0.8rem', opacity: 0.7 }}>MENSAGEM</strong>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.88rem',
                            background: 'var(--surface-ground, #f8fafc)', padding: '0.75rem',
                            borderRadius: 8, margin: '2px 0 0', maxHeight: '48vh', overflowY: 'auto' }}>
                {cotacao.mensagem}
              </pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button label={copiado ? 'Copiado!' : 'Copiar tudo'}
                icon={copiado ? 'pi pi-check' : 'pi pi-copy'} onClick={copiar} />
              <Button label="Fechar" outlined onClick={() => setCotacao(null)} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog header="Cobrar todos os convidados — uma mensagem por médico" visible={mensagens !== null} modal
        style={{ width: '52rem', maxWidth: '96vw' }} onHide={() => setMensagens(null)}>
        {avisoTodos && (
          <div role="alert" style={{ padding: '.55rem .75rem', borderRadius: 8, border: '1px solid #fcd34d',
                        background: '#fffbeb', color: '#92400e', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            <i className="pi pi-exclamation-triangle" /> {avisoTodos}
          </div>
        )}
        {mensagens && mensagens.length > 0 && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
              {mensagens.length} mensagem(ns), uma para cada médico convidado. Copie e envie cada uma
              separadamente — os concorrentes não devem ver que outro foi chamado.
            </p>
            {mensagens.map((m) => (
              <details key={m.idMedico} open={mensagens.length === 1}
                style={{ border: '1px solid var(--surface-border, #dfe7ef)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{m.medico}</strong>
                  {m.situacao && <Tag value={m.situacao} style={{ fontSize: '0.7rem' }} />}
                  <span style={{ marginLeft: 'auto' }}>
                    <Button label={copiadoId === m.idMedico ? 'Copiado!' : 'Copiar'} size="small"
                      icon={copiadoId === m.idMedico ? 'pi pi-check' : 'pi pi-copy'}
                      onClick={(e) => { e.preventDefault(); void copiarUma(m); }} />
                  </span>
                </summary>
                <div style={{ marginTop: '0.5rem' }}>
                  <strong style={{ fontSize: '0.8rem', opacity: 0.7 }}>ASSUNTO</strong>
                  <p style={{ margin: '2px 0 6px' }}>{m.assunto}</p>
                  <strong style={{ fontSize: '0.8rem', opacity: 0.7 }}>MENSAGEM</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.88rem',
                                background: 'var(--surface-ground, #f8fafc)', padding: '0.75rem',
                                borderRadius: 8, margin: '2px 0 0', maxHeight: '36vh', overflowY: 'auto' }}>
                    {m.mensagem}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <Button label="Fechar" outlined onClick={() => setMensagens(null)} />
        </div>
      </Dialog>
    </div>
  );
}
