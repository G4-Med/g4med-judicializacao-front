import { useEffect, useMemo, useState } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Tag } from 'primereact/tag';
import { ConfiguracoesEmailsPage } from '../configuracoesEmails/ConfiguracoesEmailsPage';
import { getCentralSaude, getCentralEmails, getCentralCaixa, postCentralReprocessar, getCentralRespostas } from '../../services/api/integracoes';
import { enviarEmailPendente, enviarEmailsPendentesLote } from '../../services/api/orders';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import './CentralEmailsPage.css';

/**
 * CENTRAL DE E-MAILS (@R 28/08 18:29): "ver a resposta que enviamos para cada email... cada
 * email recebido mesmo que lido ou não lido seja verificado... aba de saúde... a caixa por
 * dias... procurar por nome, email recebido ou assunto... conteúdo anexo... certificação que
 * a resposta de recebimento foi enviada e com o conteúdo".
 *
 * Três abas, nenhuma inventa: Saúde (o monitor está em dia?), Processados (o que o monitor
 * fez com cada e-mail, com anexos e a resposta que saiu) e Caixa (a INBOX inteira, lida ou
 * não, casada com o que foi processado — é onde aparece o e-mail que alguém leu à mão e o
 * monitor nunca viu).
 */

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const COR_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'secondary'> = {
  CRIADO: 'success', DUPLICADO_PACIENTE: 'warning', REMETENTE_INVALIDO: 'secondary', RESPOSTA: 'info', ERRO: 'danger',
};
const ROTULO_STATUS: Record<string, string> = {
  CRIADO: 'Virou pedido', DUPLICADO_PACIENTE: 'Re-pedido (contado)', REMETENTE_INVALIDO: 'Ignorado (remetente)',
  CONTINUACAO: 'Continuação (anexos entraram)', PROPOSTA_CONTINUACAO: 'Parece continuação — confirmar',
  RESPOSTA: 'Resposta a e-mail', ERRO: 'Falhou',
};

/** "Recuperar anexos" / "Processar agora": busca o e-mail na caixa pelo Message-ID e faz o que
 *  o monitor deveria ter feito. Idempotente no backend — clicar duas vezes não duplica. */
function BotaoReprocessar({ messageId, rotulo, aoTerminar, orderId }: { messageId: string; rotulo: string; aoTerminar: () => void; orderId?: number }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clicar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const { data } = await postCentralReprocessar(messageId, orderId);
      setMsg(data.jaFeito ? 'já feito' : data.processadoAgora ? `processado: ${data.status}` : data.jaProcessado ? 'já processado' : `${data.anexosSubidos ?? 0} anexo(s) subido(s)`);
      aoTerminar();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? 'falhou');
    } finally { setOcupado(false); }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Button label={rotulo} icon="pi pi-replay" size="small" outlined loading={ocupado} onClick={clicar} />
      {msg && <small className="ce-sub">{msg}</small>}
    </span>
  );
}

/** Cada indicador de saúde explicado: categoria, o que mede, como julgar, e para onde clicar
 *  para ver o detalhe. @R 28/08 20:54: "explicar cada um... tabela... clicar e entender o que é
 *  cada indicador... hint". A régua de cada um fica aqui, não na cabeça de quem lê. */
type Indicador = {
  categoria: string; nome: string; valor: number | string; mede: string; regua: string;
  situacao: 'ok' | 'atencao' | 'info'; statusFiltro?: string | null; abrir?: 'processados' | 'templates' | 'respostas';
};
function montarIndicadores(s: any): Indicador[] {
  const esperado = Math.round((24 * 60) / (s.intervaloEsperadoMinutos || 10));
  const st = (k: string) => (s.emails24hPorStatus || {})[k] ?? 0;
  return [
    { categoria: 'Monitor', nome: 'Última execução', valor: `${s.idadeMinutos ?? '—'} min atrás`,
      mede: 'Há quanto tempo o robô leu a caixa pela última vez.',
      regua: `Esperado a cada ${s.intervaloEsperadoMinutos} min. Acima do dobro = monitor parado.`,
      situacao: s.idadeMinutos != null && s.idadeMinutos > 2 * s.intervaloEsperadoMinutos ? 'atencao' : 'ok' },
    { categoria: 'Monitor', nome: 'Execuções 24 h', valor: s.execucoes24h ?? 0,
      mede: 'Quantas vezes o robô rodou no último dia.',
      regua: `Esperado ~${esperado}. Bem abaixo disso = houve buracos sem leitura da caixa.`,
      situacao: (s.execucoes24h ?? 0) < esperado * 0.8 ? 'atencao' : 'ok' },
    { categoria: 'Monitor', nome: 'Com erro 24 h', valor: s.erros24h ?? 0,
      mede: 'Execuções que terminaram em erro (a caixa não foi lida até o fim).',
      regua: 'Zero é o normal. Qualquer erro merece abrir o log da execução.',
      situacao: s.erros24h ? 'atencao' : 'ok' },
    { categoria: 'Captura', nome: 'Virou pedido', valor: st('CRIADO'),
      mede: 'E-mails do dia que viraram pedido novo no sistema.',
      regua: 'Informativo — é o volume de entrada. Clique para ver cada um.',
      situacao: 'info', statusFiltro: 'CRIADO', abrir: 'processados' },
    { categoria: 'Captura', nome: 'Re-pedido (contado)', valor: st('DUPLICADO_PACIENTE'),
      mede: 'E-mails de paciente que já tinha pedido: somam no contador "!" do pedido em vez de criar outro.',
      regua: 'Informativo. Re-pedido alto num mesmo pedido = urgência — a linha fica escura nas telas.',
      situacao: 'info', statusFiltro: 'DUPLICADO_PACIENTE', abrir: 'processados' },
    { categoria: 'Captura', nome: 'Ignorado (remetente)', valor: st('REMETENTE_INVALIDO'),
      mede: 'E-mails de quem não está na lista de remetentes válidos (propaganda, respostas automáticas).',
      regua: 'Normal ter alguns. Se um remetente legítimo aparece aqui, é a lista que precisa de ajuste.',
      situacao: 'info', statusFiltro: 'REMETENTE_INVALIDO', abrir: 'processados' },
    { categoria: 'Captura', nome: 'Resposta a e-mail', valor: st('RESPOSTA'),
      mede: 'E-mails que são resposta a algo nosso ("Re:") — não geram pedido.',
      regua: 'Informativo. Clique para ler o que responderam.',
      situacao: 'info', statusFiltro: 'RESPOSTA', abrir: 'processados' },
    { categoria: 'Captura', nome: 'Falhou', valor: st('ERRO'),
      mede: 'E-mails que o robô leu mas não conseguiu processar (extração falhou, anexo corrompido).',
      regua: 'Zero é o normal. Cada um aqui é um pedido que pode ter se perdido — use "Processar agora".',
      situacao: st('ERRO') ? 'atencao' : 'ok', statusFiltro: 'ERRO', abrir: 'processados' },
    { categoria: 'Conversão', nome: 'Capturados sem converter', valor: s.pendentesConversao ?? 0,
      mede: 'Pedidos que o robô capturou mas ainda não viraram pedido na tela (fila entre a leitura e a criação).',
      regua: 'O cron converte no próximo ciclo. Se o número não zera em 20 min, a conversão travou.',
      situacao: s.pendentesConversao ? 'atencao' : 'ok', statusFiltro: 'CRIADO', abrir: 'processados' },
    { categoria: 'Conversão', nome: 'Aguardando documentos', valor: s.aguardandoDocumentos?.n ?? 0,
      mede: 'Pedidos que chegaram sem nenhum documento e a SES ainda não devolveu (o pedido de documentos sai na confirmação; 1 lembrete após 3 dias úteis).',
      regua: s.aguardandoDocumentos?.n
        ? `O mais antigo espera há ${s.aguardandoDocumentos.maisAntigoDias ?? '?'} dia(s). Pedidos: ${(s.aguardandoDocumentos.ids || []).map((i: number) => '#' + i).join(' ')}. Coluna "SES Anexos" nas telas mostra cada um.`
        : 'Nenhum pedido esperando documento.',
      situacao: (s.aguardandoDocumentos?.maisAntigoDias ?? 0) > 5 ? 'atencao' : 'info' },
    { categoria: 'Resposta', nome: 'Pedidos de documentos que voltaram', valor: s.solicitacoes ? `${s.solicitacoes.respondidas7d} de ${s.solicitacoes.enviadas}` : '—',
      mede: 'Das confirmações que pediram documentos à SES, quantas voltaram com arquivo (continuação na thread) em até 3 e 7 dias — o número do "o que funcionou".',
      regua: s.solicitacoes?.enviadas
        ? `≤3 dias: ${s.solicitacoes.respondidas3d} · ≤7 dias: ${s.solicitacoes.respondidas7d} · por solicitante: ${(s.solicitacoes.porSolicitante || []).slice(0, 4).map((x: any) => `${x.solicitante.split('@')[0]} ${x.respondidas}/${x.enviadas}`).join(' · ') || '—'}`
        : 'Nenhum pedido de documentos enviado ainda (últimos 30 dias).',
      situacao: 'info', abrir: 'respostas', statusFiltro: null },
    { categoria: 'Resposta', nome: 'Pedidos pediátricos de exames que voltaram', valor: s.pediatrico ? `${s.pediatrico.respondidas7d} de ${s.pediatrico.enviadas}` : '—',
      mede: 'Dos e-mails automáticos a pedidos de criança/recém-nascido pedindo exames além dos do processo, quantos voltaram com arquivo em até 3 e 7 dias. Pediátricos perdem 65% hoje (40 de 62) — é o número que diz se o e-mail muda isso.',
      regua: s.pediatrico?.enviadas
        ? `≤3 dias: ${s.pediatrico.respondidas3d} · ≤7 dias: ${s.pediatrico.respondidas7d} · por solicitante: ${(s.pediatrico.porSolicitante || []).slice(0, 4).map((x: any) => `${x.solicitante.split('@')[0]} ${x.respondidas}/${x.enviadas}`).join(' · ') || '—'}`
        : 'Nenhum pedido pediátrico de exames enviado ainda (últimos 30 dias).',
      situacao: 'info', abrir: 'respostas', statusFiltro: null },
    { categoria: 'Resposta', nome: 'Respostas na fila', valor: s.respostasPendentes ?? 0,
      mede: 'Confirmações de recebimento (normal, segredo de justiça ou sem anexo) montadas e ainda não enviadas. Saem sozinhas a cada ciclo do robô (10 min).',
      regua: s.respostaPendenteMaisAntigaMin != null
        ? `A mais antiga espera há ${s.respostaPendenteMaisAntigaMin} min. Acima de 30 min = o envio automático falhou — abra Respostas, veja o erro e reenvie.`
        : 'Fila vazia: tudo o que foi montado já saiu.',
      situacao: (s.respostaPendenteMaisAntigaMin ?? 0) > 30 ? 'atencao' : 'info', abrir: 'respostas', statusFiltro: 'PENDENTE' },
    { categoria: 'Resposta', nome: 'Respostas com erro', valor: s.respostasComErro ?? 0,
      mede: 'Confirmações que tentaram sair e falharam no envio.',
      regua: 'Zero é o normal. O remetente não recebeu nada — reenviar em Respostas.',
      situacao: s.respostasComErro ? 'atencao' : 'ok', abrir: 'respostas', statusFiltro: 'ERRO' },
    { categoria: 'Configuração', nome: 'Monitor ativo', valor: s.monitorAtivo ? 'sim' : 'NÃO',
      mede: 'A chave geral: desligada, o robô roda mas não faz nada.',
      regua: 'Tem que estar "sim".', situacao: s.monitorAtivo ? 'ok' : 'atencao' },
    { categoria: 'Configuração', nome: 'Remetentes válidos', valor: s.remetentesValidos || '—',
      mede: 'Domínios/endereços que o robô aceita como pedido.',
      regua: 'Pedido legítimo ignorado? O remetente precisa entrar aqui.', situacao: 'info' },
    { categoria: 'Configuração', nome: 'Templates de resposta', valor: 'normal · segredo · sem anexo',
      mede: 'Os textos que o sistema devolve automaticamente ao remetente, por situação.',
      regua: 'Editáveis na aba Templates desta Central.', situacao: 'info', abrir: 'templates' },
  ];
}

function Saude({ onVer }: { onVer: (abrir: 'processados' | 'templates' | 'respostas', status?: string | null) => void }) {
  const [s, setS] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const carregar = () => { setLoading(true); getCentralSaude().then(({ data }) => setS(data)).finally(() => setLoading(false)); };
  useEffect(carregar, []);
  if (loading && !s) return <p>Medindo…</p>;
  if (!s) return <p>Não foi possível medir a saúde do monitor.</p>;
  const indicadores = montarIndicadores(s);
  const atencao = indicadores.filter((i) => i.situacao === 'atencao').length;
  return (
    <div className="ce-saude">
      <div className={`ce-semaforo ${s.emDia ? 'ok' : 'alerta'}`}>
        <i className={`pi ${s.emDia ? 'pi-check-circle' : 'pi-exclamation-triangle'}`} />
        <div>
          <strong>{s.emDia ? 'Monitor em dia' : 'Monitor precisa de atenção'}</strong>
          <div className="ce-sub">Última execução {fmt(s.ultimaExecucao)} ({s.idadeMinutos} min atrás · esperado a cada {s.intervaloEsperadoMinutos} min) · {s.ultimaExecucaoStatus}</div>
        </div>
        <Button icon="pi pi-refresh" text rounded onClick={carregar} aria-label="Medir de novo" />
      </div>
      {s.alertas?.length > 0 && (
        <ul className="ce-alertas">{s.alertas.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      )}
      <p className="ce-sub ce-saude-intro">
        <strong>O que é "saúde" aqui:</strong> o caminho do e-mail tem 4 estações — o <em>Monitor</em> lê a caixa,
        a <em>Captura</em> decide o que cada e-mail é, a <em>Conversão</em> transforma em pedido e a <em>Resposta</em> devolve
        a confirmação ao remetente. Cada linha abaixo vigia uma estação; {atencao ? `${atencao} pede(m) atenção` : 'nenhuma pede atenção'} agora.
        Passe o mouse no ícone para a régua; clique na linha para ver o detalhe.
      </p>
      <DataTable value={indicadores} dataKey="nome" rowGroupMode="subheader" groupRowsBy="categoria" size="small"
        className="ce-indicadores" selectionMode="single"
        rowGroupHeaderTemplate={(r: Indicador) => <span className="ce-grupo">{r.categoria}</span>}
        onRowClick={(e) => { const r = e.data as Indicador; if (r.abrir) onVer(r.abrir, r.statusFiltro ?? null); }}
        rowClassName={(r: Indicador) => (r.abrir ? 'ce-linha-clicavel' : '')} aria-label="Indicadores de saúde">
        <Column field="nome" header="Indicador" style={{ minWidth: '13rem' }}
          body={(r: Indicador) => <span className="ce-ind-nome">{r.nome} <i className="pi pi-info-circle ce-hint" title={`${r.mede} ${r.regua}`} /></span>} />
        <Column field="valor" header="Agora" style={{ width: '11rem' }}
          body={(r: Indicador) => <strong className={`ce-ind-valor ${r.situacao === 'atencao' ? 'ruim' : ''}`}>{r.valor}</strong>} />
        <Column header="Situação" style={{ width: '8rem' }}
          body={(r: Indicador) => <Tag value={r.situacao === 'ok' ? 'ok' : r.situacao === 'atencao' ? 'atenção' : 'informativo'}
            severity={r.situacao === 'ok' ? 'success' : r.situacao === 'atencao' ? 'warning' : 'info'} />} />
        <Column field="mede" header="O que mede" style={{ minWidth: '18rem' }} />
        <Column field="regua" header="Como ler" style={{ minWidth: '18rem' }} body={(r: Indicador) => <span className="ce-sub">{r.regua}</span>} />
        <Column header="" style={{ width: '6rem' }}
          body={(r: Indicador) => (r.abrir ? <span className="ce-ver"><i className="pi pi-external-link" /> ver</span> : null)} />
      </DataTable>
    </div>
  );
}

function Processados({ statusInicial }: { statusInicial: string | null }) {
  const [dia, setDia] = useState<Date | null>(new Date());
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(statusInicial);
  useEffect(() => { setStatus(statusInicial); }, [statusInicial]);
  const [dados, setDados] = useState<any>({ itens: [], total: 0, diasComMovimento: {} });
  const [loading, setLoading] = useState(false);
  const [expandidas, setExpandidas] = useState<any>(null);

  const carregar = () => {
    setLoading(true);
    const params: any = {};
    if (q.trim()) params.q = q.trim();
    else if (dia) params.dia = dia.toISOString().slice(0, 10);
    if (status) params.status = status;
    getCentralEmails(params).then(({ data }) => setDados(data)).finally(() => setLoading(false));
  };
  useEffect(carregar, [dia, status]);

  const opcoesStatus = Object.keys(ROTULO_STATUS).map((k) => ({ label: ROTULO_STATUS[k], value: k }));

  const expansor = (r: any) => (
    <div className="ce-expansor">
      <div className="ce-bloco">
        <h4><i className="pi pi-search" /> O que aconteceu</h4>
        <p>{r.depuracao}</p>
        {r.erro && <p className="ruim">Erro: {r.erro}</p>}
        {r.status === 'DUPLICADO_PACIENTE' && r.pedido && !(r.detalhe || '').includes('anexos recuperados') && (
          <p><BotaoReprocessar messageId={r.messageId} rotulo="Recuperar anexos deste e-mail no pedido" aoTerminar={carregar} /></p>
        )}
        {r.status === 'PROPOSTA_CONTINUACAO' && r.pedido && (
          <p><BotaoReprocessar messageId={r.messageId} orderId={r.pedido.id} rotulo={`Confirmar: é continuação do pedido #${r.pedido.id} (anexos entram)`} aoTerminar={carregar} /></p>
        )}
        {r.status === 'RESPOSTA' && (
          <p className="ce-sub">Resposta sem pedido reconhecido. Se for continuação de um pedido, use "Recuperar" na Caixa informando o pedido — ou peça que a SES responda ao e-mail de confirmação (o assunto leva o código [MC-nº]).</p>
        )}
        <p className="ce-sub">Message-ID <code>{r.messageId}</code> · execução #{r.execucaoId}
          {r.pedido && <> · pedido <strong>#{r.pedido.id}</strong> ({r.pedido.status}{r.pedido.vezesPedido > 1 ? `, pedido ${r.pedido.vezesPedido}×` : ''}{r.pedido.naLixeira ? ', na lixeira' : ''})</>}
        </p>
      </div>
      <div className="ce-bloco">
        <h4><i className="pi pi-paperclip" /> Anexos no pedido ({r.anexos?.length ?? 0})</h4>
        {r.anexos?.length ? (
          <ul>{r.anexos.map((a: any) => (
            <li key={a.id}><a href={a.link} target="_blank" rel="noreferrer">{a.nome || a.tipo}</a> <span className="ce-sub">({a.tipo})</span></li>
          ))}</ul>
        ) : <p className="ce-sub">Nenhum anexo gravado.</p>}
      </div>
      <div className="ce-bloco">
        <h4><i className="pi pi-send" /> Resposta de recebimento</h4>
        {r.resposta ? (
          <>
            <p>
              <Tag value={r.resposta.status} severity={r.resposta.status === 'ENVIADO' ? 'success' : r.resposta.status === 'ERRO' ? 'danger' : 'warning'} />{' '}
              {r.resposta.tipo === 'RECEBIMENTO_PEDIDO_SEGREDO' ? 'template segredo de justiça' : 'template comum'} · para {r.resposta.destinatario}
              {r.resposta.dataEnvio && <> · enviada {fmt(r.resposta.dataEnvio)}</>}
              {r.resposta.aberto && <> · <i className="pi pi-eye" /> aberta</>}
              {r.resposta.rejeitado && <> · <span className="ruim">rejeitada</span></>}
            </p>
            {r.resposta.erroEnvio && <p className="ruim">Erro de envio: {r.resposta.erroEnvio}</p>}
            <details>
              <summary>Ver o conteúdo enviado — {r.resposta.assunto}</summary>
              <pre className="ce-corpo">{r.resposta.corpo}</pre>
            </details>
          </>
        ) : <p className="ce-sub">{r.status === 'CRIADO' ? 'Nenhuma resposta gerada ainda para este pedido.' : 'Não gera resposta (não virou pedido novo).'}</p>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="ce-filtros">
        <Calendar value={dia} onChange={(e) => setDia(e.value as Date)} dateFormat="dd/mm/yy" showIcon placeholder="Dia" disabled={!!q.trim()} />
        <IconField iconPosition="left" style={{ flex: 1 }}>
          <InputIcon className="pi pi-search" />
          <InputText value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }}
            placeholder="Buscar por nome do paciente, remetente ou assunto (ignora o dia)" style={{ width: '100%' }} />
        </IconField>
        <Dropdown value={status} options={opcoesStatus} onChange={(e) => setStatus(e.value)} placeholder="Todos os status" showClear style={{ minWidth: '13rem' }} />
        <Button label="Buscar" icon="pi pi-search" onClick={carregar} />
      </div>
      <p className="ce-sub">{dados.total} e-mail(s) · dias com movimento nos últimos 60: {Object.keys(dados.diasComMovimento || {}).length}</p>
      <DataTable value={dados.itens} loading={loading} dataKey="id" paginator rows={25} rowsPerPageOptions={[25, 50, 100]}
        expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)} rowExpansionTemplate={expansor}
        rowClassName={(r: any) => (r.falhou ? 'ce-linha-falha' : r.status === 'DUPLICADO_PACIENTE' ? 'ce-linha-repedido' : '')}
        emptyMessage="Nenhum e-mail neste filtro." aria-label="E-mails processados">
        <Column expander style={{ width: '3rem' }} />
        <Column field="recebidoEm" header="Processado em" sortable body={(r) => fmt(r.recebidoEm)} style={{ minWidth: '10rem' }} />
        <Column field="status" header="Resultado" sortable body={(r) => <Tag value={ROTULO_STATUS[r.status] ?? r.status} severity={COR_STATUS[r.status] ?? 'secondary'} />} />
        <Column field="paciente" header="Paciente" sortable style={{ minWidth: '13rem' }} body={(r) => r.paciente || <span className="ce-sub">—</span>} />
        <Column field="remetente" header="Remetente" sortable style={{ minWidth: '14rem' }} body={(r) => (r.remetente || '').replace(/<.*>/, '').trim() || r.remetente} />
        <Column field="assunto" header="Assunto" style={{ minWidth: '18rem' }} />
        <Column header="Pedido" body={(r) => r.pedido ? <>#{r.pedido.id}{r.pedido.vezesPedido > 1 && <span className="mc-repedido-badge" style={{ marginLeft: 6 }}>{r.pedido.vezesPedido}×</span>}</> : '—'} />
        <Column field="vezesChegou" header={cabecalhoComHint('Chegou', 'Quantas vezes um e-mail deste paciente chegou (pedido + re-pedidos)')} sortable style={{ width: '6rem' }} bodyStyle={{ textAlign: 'center' }}
          body={(r) => (r.vezesChegou ?? 1) > 1 ? <span className="mc-repedido-badge">{r.vezesChegou}×</span> : <span className="ce-sub">1×</span>} />
        <Column header={cabecalhoComHint('Resposta', 'A resposta de recebimento que o sistema mandou ao solicitante — abra a linha para ver o conteúdo')}
          body={(r) => r.resposta ? <Tag value={r.resposta.status} severity={r.resposta.status === 'ENVIADO' ? 'success' : r.resposta.status === 'ERRO' ? 'danger' : 'warning'} /> : <span className="ce-sub">—</span>} />
      </DataTable>
    </div>
  );
}

function Caixa() {
  const [dias, setDias] = useState(3);
  const [dados, setDados] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const carregar = () => {
    setLoading(true); setErro(null);
    getCentralCaixa(dias).then(({ data }) => setDados(data))
      .catch((e) => setErro(e?.response?.data?.erro ?? 'Não consegui ler a caixa.'))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [dias]);
  const linhas = useMemo(() => Object.entries(dados?.porDia || {}).flatMap(([d, its]: any) => its.map((i: any) => ({ ...i, diaGrupo: d }))), [dados]);
  return (
    <div>
      <div className="ce-filtros">
        <Dropdown value={dias} options={[1, 3, 7, 14, 30].map((n) => ({ label: `últimos ${n} dia(s)`, value: n }))} onChange={(e) => setDias(e.value)} />
        <Button icon="pi pi-refresh" label="Ler a caixa" outlined onClick={carregar} loading={loading} />
        {dados && (
          <span className="ce-sub">{dados.total} mensagem(ns) desde {dados.desde} · {dados.naoLidos} não lida(s) ·{' '}
            <strong className={dados.naoVistosPeloMonitor ? 'ruim' : ''}>{dados.naoVistosPeloMonitor} lida(s) que o monitor nunca processou</strong></span>
        )}
      </div>
      {erro && <p className="ruim">{erro}</p>}
      <p className="ce-sub">Lê a INBOX sem marcar nada como lido. O monitor só processa e-mail <em>não lido</em>: se alguém abrir um e-mail antes do ciclo, ele aparece aqui como "lida e não processada" — é o furo que esta aba existe para mostrar.</p>
      <DataTable value={linhas} loading={loading} dataKey="imapId" rowGroupMode="subheader" groupRowsBy="diaGrupo" sortField="data" sortOrder={-1}
        rowGroupHeaderTemplate={(r: any) => <strong>{r.diaGrupo}</strong>}
        rowClassName={(r: any) => (r.naoVistoPeloMonitor ? 'ce-linha-falha' : '')}
        emptyMessage="Nada na caixa neste período." aria-label="Caixa de entrada reconciliada">
        <Column field="data" header="Chegou" body={(r) => fmt(r.data)} style={{ minWidth: '9rem' }} />
        <Column field="lido" header="Lido?" body={(r) => r.lido ? <Tag value="lido" severity="secondary" /> : <Tag value="não lido" severity="info" />} />
        <Column field="de" header="De" style={{ minWidth: '14rem' }} body={(r) => (r.de || '').replace(/<.*>/, '').trim() || r.de} />
        <Column field="assunto" header="Assunto" style={{ minWidth: '20rem' }} />
        <Column header="Monitor" body={(r) => r.processado
          ? <Tag value={ROTULO_STATUS[r.status] ?? r.status} severity={COR_STATUS[r.status] ?? 'secondary'} />
          : <Tag value={r.lido ? 'LIDA, NÃO PROCESSADA' : 'aguardando o ciclo'} severity={r.lido ? 'danger' : 'info'} />} />
        <Column header="Pedido" body={(r) => r.pedidoId ? `#${r.pedidoId}` : '—'} />
        <Column field="chegouVezes" header={cabecalhoComHint('Chegou', 'Mesmo assunto (sem RE:/FW:) no período')} sortable style={{ width: '6rem' }} bodyStyle={{ textAlign: 'center' }}
          body={(r) => (r.chegouVezes ?? 1) > 1 ? <span className="mc-repedido-badge">{r.chegouVezes}×</span> : <span className="ce-sub">1×</span>} />
        <Column header="Ação" style={{ width: '12rem' }} body={(r) => r.naoVistoPeloMonitor && r.messageId
          ? <BotaoReprocessar messageId={r.messageId} rotulo="Processar agora" aoTerminar={carregar} /> : null} />
      </DataTable>
    </div>
  );
}

const ROTULO_TIPO: Record<string, string> = {
  RECEBIMENTO_PEDIDO: 'Recebimento', RECEBIMENTO_PEDIDO_SEGREDO: 'Recebimento (segredo)', RECEBIMENTO_PEDIDO_SEM_ANEXO: 'Recebimento (sem anexo)', PEDIDO_EXAMES_PEDIATRICO: 'Exames (pediátrico)',
  PEDIR_EXAMES: 'Pedir exames', ENVIAR_ORCAMENTO: 'Enviar orçamento', DAR_PERDA: 'Dar perda', SOLICITAR_COTACAO_MEDICO: 'Cotação ao médico',
};
const ROTULO_ENVIO: Record<string, string> = { PENDENTE: 'Na fila', ENVIADO: 'Enviada', ERRO: 'Falhou' };

/** Respostas por pessoa (@R 28/08 21:07: "como eu sei as mensagens que eu mandei para cada pessoa
 *  que mandou pedido? estamos mandando?"). Cada e-mail que o sistema montou para quem pediu, com
 *  o que aconteceu com ele — e o botão de enviar aqui mesmo, porque o envio é manual. */
function Respostas({ statusInicial }: { statusInicial: string | null }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(statusInicial);
  const [tipo, setTipo] = useState<string | null>(null);
  const [dados, setDados] = useState<any>({ itens: [], total: 0, porStatus: {}, porDestinatario: [] });
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState<number[] | 'lote' | null>(null);
  const [expandidas, setExpandidas] = useState<any>(null);
  useEffect(() => { setStatus(statusInicial); }, [statusInicial]);
  const carregar = () => {
    setLoading(true);
    const params: any = { dias: 60 };
    if (q.trim()) params.q = q.trim();
    if (status) params.status = status;
    if (tipo) params.tipo = tipo;
    getCentralRespostas(params).then(({ data }) => setDados(data)).finally(() => setLoading(false));
  };
  useEffect(carregar, [status, tipo]);
  const pendentes = (dados.itens as any[]).filter((i) => i.status === 'PENDENTE');
  const enviarUm = async (id: number) => {
    setEnviando([id]);
    try { await enviarEmailPendente(id); } finally { setEnviando(null); carregar(); }
  };
  const enviarTodas = async () => {
    if (!pendentes.length || !window.confirm(`Enviar agora as ${pendentes.length} resposta(s) na fila?`)) return;
    setEnviando('lote');
    try { await enviarEmailsPendentesLote(pendentes.map((p) => p.id)); } finally { setEnviando(null); carregar(); }
  };
  const fmtDt = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const entrega = (r: any) => {
    if (r.status === 'PENDENTE') return <Tag value={`na fila · ${r.idadeMin ?? '?'} min`} severity={(r.idadeMin ?? 0) > 60 ? 'warning' : 'info'} />;
    if (r.status === 'ERRO') return <Tag value="falhou" severity="danger" />;
    if (r.rejeitado) return <Tag value="devolvida" severity="danger" />;
    if (r.spam) return <Tag value="caiu em spam" severity="danger" />;
    if (r.clicado) return <Tag value="aberta · clicou" severity="success" />;
    if (r.aberto) return <Tag value="aberta" severity="success" />;
    return <Tag value="enviada" severity="success" />;
  };
  return (
    <div>
      <p className="ce-sub ce-saude-intro">
        Cada resposta que o sistema montou para quem mandou pedido, e o que aconteceu com ela. As <strong>confirmações de recebimento saem
        sozinhas</strong> a cada ciclo do robô, com o texto que a análise do pedido escolheu (normal · segredo de justiça · sem anexo); orçamento, perda e
        pedido de exames continuam sendo enviados pela equipe. "Aberta" e "clicou" vêm do rastreio do provedor (quando o destinatário permite). O botão
        Enviar serve para reenviar o que falhou.
      </p>
      <div className="ce-resumo-dest">
        {(dados.porDestinatario as any[]).slice(0, 8).map((d) => (
          <button key={d.destinatario} className="ce-dest" onClick={() => { setQ(d.destinatario); setTimeout(carregar, 0); }} title="Filtrar por este destinatário">
            <span className="ce-dest-nome">{d.destinatario}</span>
            <span className="ce-dest-n">{d.enviados} enviada(s){d.pendentes ? ` · ${d.pendentes} na fila` : ''}{d.abertos ? ` · ${d.abertos} aberta(s)` : ''}</span>
          </button>
        ))}
      </div>
      <div className="ce-filtros">
        <IconField iconPosition="left" style={{ flex: 1 }}>
          <InputIcon className="pi pi-search" />
          <InputText value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }}
            placeholder="Buscar por destinatário, paciente ou assunto" style={{ width: '100%' }} />
        </IconField>
        <Dropdown value={status} options={Object.keys(ROTULO_ENVIO).map((k) => ({ label: ROTULO_ENVIO[k], value: k }))} onChange={(e) => setStatus(e.value)} placeholder="Todas" showClear style={{ minWidth: '10rem' }} />
        <Dropdown value={tipo} options={Object.keys(ROTULO_TIPO).map((k) => ({ label: ROTULO_TIPO[k], value: k }))} onChange={(e) => setTipo(e.value)} placeholder="Todos os tipos" showClear style={{ minWidth: '13rem' }} />
        <Button label="Buscar" icon="pi pi-search" onClick={carregar} />
        <Button label={`Enviar as ${pendentes.length} na fila`} icon="pi pi-send" severity="warning" disabled={!pendentes.length} loading={enviando === 'lote'} onClick={enviarTodas} />
      </div>
      <p className="ce-sub">{dados.total} resposta(s) nos últimos {dados.dias ?? 60} dias · {Object.entries(dados.porStatus || {}).map(([k, v]) => `${ROTULO_ENVIO[k] ?? k}: ${v}`).join(' · ')}</p>
      <DataTable value={dados.itens} loading={loading} dataKey="id" paginator rows={25} rowsPerPageOptions={[25, 50, 100]}
        expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
        rowExpansionTemplate={(r: any) => (
          <div className="ce-expansor"><div className="ce-bloco">
            <h4><i className="pi pi-envelope" /> {r.assunto}</h4>
            <pre className="ce-corpo">{r.corpo}</pre>
            {r.erroEnvio && <p className="ce-sub ruim">Erro de envio: {r.erroEnvio} ({r.tentativas} tentativa(s))</p>}
            {r.motivoRejeicao && <p className="ce-sub ruim">Devolvida: {r.motivoRejeicao}</p>}
          </div></div>)}
        emptyMessage="Nenhuma resposta neste filtro." aria-label="Respostas por destinatário">
        <Column expander style={{ width: '3rem' }} />
        <Column field="destinatario" header="Para" sortable style={{ minWidth: '15rem' }} />
        <Column field="paciente" header="Paciente / pedido" sortable style={{ minWidth: '14rem' }}
          body={(r) => <span>{r.paciente || '—'}{r.orderId ? <span className="acv-pedido-id"> #{r.orderId}</span> : null}</span>} />
        <Column field="tipoEmail" header="Tipo" sortable style={{ width: '11rem' }} body={(r) => ROTULO_TIPO[r.tipoEmail] ?? r.tipoEmail} />
        <Column field="criadoEm" header="Montada em" sortable style={{ width: '8rem' }} body={(r) => fmtDt(r.criadoEm)} />
        <Column field="enviadoEm" header="Enviada em" sortable style={{ width: '8rem' }} body={(r) => fmtDt(r.enviadoEm)} />
        <Column header="Entrega" style={{ width: '11rem' }} body={entrega} />
        <Column header="" style={{ width: '9rem' }}
          body={(r) => (r.status === 'PENDENTE' || r.status === 'ERRO'
            ? <Button label="Enviar" icon="pi pi-send" size="small" outlined loading={Array.isArray(enviando) && enviando.includes(r.id)} onClick={() => enviarUm(r.id)} />
            : null)} />
      </DataTable>
    </div>
  );
}

export function CentralEmailsPage() {
  const [aba, setAba] = useState(0);
  const [statusPreset, setStatusPreset] = useState<string | null>(null);
  const [respostaPreset, setRespostaPreset] = useState<string | null>(null);
  const ver = (abrir: 'processados' | 'templates' | 'respostas', status?: string | null) => {
    if (abrir === 'processados') { setStatusPreset(status ?? null); setAba(1); }
    else if (abrir === 'respostas') { setRespostaPreset(status ?? null); setAba(3); }
    else setAba(4);
  };
  return (
    <div className="ce-page">
      <div className="page-header">
        <h1><i className="pi pi-inbox" /> Central de E-mails</h1>
        <p className="ce-sub">O monitor está em dia? O que ele fez com cada e-mail? Que resposta saiu? A caixa inteira, lida ou não, conferida contra o que foi processado.</p>
      </div>
      <TabView activeIndex={aba} onTabChange={(e) => setAba(e.index)}>
        <TabPanel header="Saúde" leftIcon="pi pi-heart mr-2"><Saude onVer={ver} /></TabPanel>
        <TabPanel header="Processados" leftIcon="pi pi-list mr-2"><Processados statusInicial={statusPreset} /></TabPanel>
        <TabPanel header="Caixa (reconciliação)" leftIcon="pi pi-envelope mr-2"><Caixa /></TabPanel>
        <TabPanel header="Respostas" leftIcon="pi pi-send mr-2"><Respostas statusInicial={respostaPreset} /></TabPanel>
        <TabPanel header="Templates de resposta" leftIcon="pi pi-file-edit mr-2">
          <p className="ce-sub">Os textos que saem automaticamente para quem mandou o pedido: <strong>Recebimento normal</strong>, <strong>Segredo de justiça</strong> (menor de 18 — sem nome nem número do processo) e <strong>Sem anexo</strong> (pede o documento que faltou). Os demais são os e-mails enviados pela equipe nas fases seguintes.</p>
          <div className="ce-templates"><ConfiguracoesEmailsPage /></div>
        </TabPanel>
      </TabView>
    </div>
  );
}
