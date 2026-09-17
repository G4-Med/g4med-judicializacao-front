import { useEffect, useState } from 'react';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview';
import { cabecalhoComHint } from '../ColunasIdentificacao/colunasIdentificacao';
import { getThreadPedido, postThreadVista, patchDossie } from '../../services/api/integracoes';
import './anexosSES.css';

/**
 * SES ANEXOS (@R 28/08 22:09): "criar uma coluna com SES Anexos e colocar se veio com anexo /
 * sem anexo / solicitado anexo... um ícone que abre a parte dos anexos que vieram no pedido...
 * recebido anexos para quando ela devolve... um modalzinho com quantos anexos para poder ver
 * e baixar". Um lugar só para as 9 telas de fase, no mesmo molde da coluna "!" (repedido).
 *
 * O estado vem do backend (`sesAnexos`): COM_ANEXO · SEM_ANEXO · SOLICITADO (a confirmação
 * "sem anexo" já pediu) · RECEBIDO (a SES devolveu — a continuação entrou no pedido). A
 * caixinha com número (`emailsNovos`) diz que chegou coisa nova; abrir o modal zera.
 */

const ESTADO: Record<string, { rotulo: string; severity: 'success' | 'warning' | 'info' | 'danger' | undefined; hint: string }> = {
  COM_ANEXO: { rotulo: 'Com anexo', severity: 'success', hint: 'O pedido chegou com documentos.' },
  SEM_ANEXO: { rotulo: 'Sem anexo', severity: 'danger', hint: 'Chegou sem nenhum documento e ainda não pedimos.' },
  SOLICITADO: { rotulo: 'Solicitado', severity: 'warning', hint: 'Chegou sem documento; a resposta automática já pediu à SES. Aguardando.' },
  RECEBIDO: { rotulo: 'Recebido', severity: 'info', hint: 'A SES devolveu documentos por e-mail — entraram no pedido (continuação da thread).' },
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const TIPO_ANEXO: Record<string, string> = {
  RELATORIO: 'Relatório / documento', EXAME: 'Exame', LAUDO: 'Laudo / relatório médico', ORCAMENTO: 'Orçamento',
  ORCAMENTO_TERCEIRO: 'Orçamento de terceiro', PROCESSO: 'Processo', PROTOCOLO: 'Protocolo', OUTRO: 'Outro',
  DECISAO_INTEIRO_TEOR: 'Peça (inteiro teor)', EMAIL_ORIGINAL: 'E-mail original',
};
/** De onde o documento veio — a marcação que diz "isto o robô tirou de dentro da peça". */
const ORIGEM: Record<string, { rotulo: string; classe: string; hint: string }> = {
  PECA: { rotulo: 'da peça', classe: 'mc-ses-origem--peca', hint: 'O robô extraiu este documento de dentro da peça de inteiro teor.' },
  EMAIL: { rotulo: 'e-mail SES', classe: 'mc-ses-origem--email', hint: 'Chegou como anexo do e-mail da SES.' },
  MANUAL: { rotulo: 'manual', classe: 'mc-ses-origem--manual', hint: 'A equipe subiu este documento à mão.' },
};
const ehHash = (n?: string) => !!n && /^[0-9a-f]{24,}(\.\w+)?$/i.test(n.trim());
const fmtData = (iso?: string) => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '';
const TIPO_EMAIL: Record<string, string> = {
  RECEBIMENTO_PEDIDO: 'Confirmação de recebimento', RECEBIMENTO_PEDIDO_SEGREDO: 'Confirmação (segredo de justiça)',
  RECEBIMENTO_PEDIDO_SEM_ANEXO: 'Confirmação + pedido de documentos', PEDIR_EXAMES: 'Pedido de exames', PEDIDO_EXAMES_PEDIATRICO: 'Pedido de exames (pediátrico)',
  ENVIAR_ORCAMENTO: 'Envio de orçamento', DAR_PERDA: 'Perda', SOLICITAR_COTACAO_MEDICO: 'Cotação ao médico',
};
const STATUS_RECEBIDO: Record<string, string> = {
  CRIADO: 'e-mail do pedido', CONTINUACAO: 'continuação — documentos entraram', PROPOSTA_CONTINUACAO: 'parece continuação (confirmar)',
  DUPLICADO_PACIENTE: 're-pedido', RESPOSTA: 'resposta', ERRO: 'falhou',
};


/** O checklist do dossiê (v2 ①): o que o médico precisa para cotar. A máquina marca pelos anexos;
 *  a equipe manda por cima — OK (confirmado) · NA (não se aplica) · FALTA · auto (volta à máquina). */
const ITENS_DOSSIE: Array<{ k: 'oficio' | 'relatorio' | 'exames'; rotulo: string; quem: string }> = [
  { k: 'oficio', rotulo: 'Ofício / decisão judicial', quem: 'jurídico: nº do processo, comarca, prazo' },
  { k: 'relatorio', rotulo: 'Relatório médico com a indicação', quem: 'médico cotador' },
  { k: 'exames', rotulo: 'Exames da patologia', quem: 'médico cotador — sem isto ele não responde' },
];
function Dossie({ orderId, dossie, onChange }: { orderId: number; dossie: any; onChange: (d: any) => void }) {
  const [salvando, setSalvando] = useState<string | null>(null);
  if (!dossie) return null;
  const mudar = async (k: 'oficio' | 'relatorio' | 'exames', v: 'OK' | 'NA' | 'FALTA' | null) => {
    setSalvando(k);
    try { const { data } = await patchDossie(orderId, { [k]: v }); onChange(data.dossie); } finally { setSalvando(null); }
  };
  return (
    <div className={`mc-ses-dossie${dossie.suficiente ? ' mc-ses-dossie--ok' : ''}`}>
      <div className="mc-ses-dossie-cab">
        <strong>Dossiê para o médico cotar — {dossie.n} de {dossie.de}</strong>
        <span className="mc-ses-sub">{dossie.suficiente ? 'suficiente: o médico tem o que precisa' : `falta: ${(dossie.faltantes || []).join(' · ')}`}</span>
      </div>
      <ul className="mc-ses-dossie-lista">
        {ITENS_DOSSIE.map(({ k, rotulo, quem }) => {
          const ok = dossie[k]; const manual = dossie.manual?.[k]; const auto = dossie.auto?.[k];
          return (
            <li key={k} className={ok ? 'ok' : 'falta'}>
              <span className="mc-ses-dossie-marca"><i className={`pi ${ok ? 'pi-check-circle' : 'pi-circle'}`} /></span>
              <span className="mc-ses-dossie-txt">
                <span>{rotulo}</span>
                <span className="mc-ses-sub">{quem} · {manual ? `equipe: ${manual === 'OK' ? 'confirmado' : manual === 'NA' ? 'não se aplica' : 'falta'}` : auto ? 'máquina: achou nos anexos' : 'máquina: não achou'}</span>
              </span>
              <span className="mc-ses-dossie-acoes">
                <button type="button" className={manual === 'OK' ? 'on' : ''} disabled={salvando === k} onClick={() => mudar(k, manual === 'OK' ? null : 'OK')} title="Confirmar que este item existe">✓ ok</button>
                <button type="button" className={manual === 'NA' ? 'on' : ''} disabled={salvando === k} onClick={() => mudar(k, manual === 'NA' ? null : 'NA')} title="Não se aplica a este caso (ex.: exame não existe para a patologia)">n/a</button>
                <button type="button" className={manual === 'FALTA' ? 'on' : ''} disabled={salvando === k} onClick={() => mudar(k, manual === 'FALTA' ? null : 'FALTA')} title="Falta mesmo com anexo (a máquina marcou errado)">falta</button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** O modal: anexos (ver/baixar) + a thread de e-mails (enviados e recebidos) do pedido. */
function ModalAnexosSES({ orderId, paciente, aberto, fechar }: { orderId: number; paciente?: string; aberto: boolean; fechar: () => void }) {
  const [dados, setDados] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setLoading(true);
    getThreadPedido(orderId)
      .then(({ data }) => { setDados(data); if (data?.emailsNovos > 0) postThreadVista(orderId).catch(() => undefined); })
      .catch(() => setDados({ anexos: [], enviados: [], recebidos: [], erro: true }))
      .finally(() => setLoading(false));
  }, [aberto, orderId]);
  const anexos = dados?.anexos ?? [];
  return (
    <Dialog visible={aberto} onHide={fechar} style={{ width: 'min(62rem, 95vw)' }} dismissableMask className="mc-ses-modal"
      header={<span><i className="pi pi-paperclip" /> Anexos e e-mails da SES — pedido #{orderId}{paciente ? ` · ${paciente}` : ''}</span>}>
      {loading && !dados ? <p>Carregando…</p> : (<>
        <div className="mc-ses-resumo">
          <span>Documentos: <b>{anexos.length}</b></span>
          <span>Recebidos da SES: <b>{dados?.recebidos?.length ?? 0}</b></span>
          <span>Enviados por nós: <b>{dados?.enviados?.length ?? 0}</b></span>
          <span>Situação: <b>{dados?.statusDocumentos === 'AGUARDANDO' ? 'aguardando documentos' : dados?.statusDocumentos === 'COMPLETO' ? 'documentos recebidos' : anexos.length ? 'com documentos' : 'sem documentos'}</b></span>
        </div>
        <Dossie orderId={orderId} dossie={dados?.dossie} onChange={(d) => setDados({ ...dados, dossie: d })} />
        <TabView>
          <TabPanel header={`Anexos (${anexos.length})`} leftIcon="pi pi-file mr-2">
            {anexos.length === 0
              ? <p className="mc-ses-vazio">Nenhum documento neste pedido ainda. {dados?.statusDocumentos === 'AGUARDANDO' ? 'A SES foi avisada e estamos aguardando.' : ''}</p>
              : (
                <table className="mc-ses-tabela">
                  <thead><tr><th>Documento</th><th>Tipo</th><th>Chegou em</th><th>Processamento</th><th /></tr></thead>
                  <tbody>
                    {anexos.map((a: any) => (
                      <tr key={a.id} className={a.origem === 'PECA' ? 'mc-ses-linha--peca' : undefined}>
                        <td>
                          <div className="mc-ses-doc">
                            <span className={ehHash(a.nome) ? 'mc-ses-doc-nome mc-ses-doc-nome--semnome' : 'mc-ses-doc-nome'}>{ehHash(a.nome) ? 'Documento sem nome' : a.nome}</span>
                            <span className="mc-ses-doc-meta">
                              {a.origem && ORIGEM[a.origem] && <span className={`mc-ses-origem ${ORIGEM[a.origem].classe}`} title={ORIGEM[a.origem].hint}>{a.origem === 'PECA' && <i className="pi pi-sparkles" />}{ORIGEM[a.origem].rotulo}{a.origem === 'PECA' && a.paginaOrigem ? ` · pág. ${a.paginaOrigem}` : ''}</span>}
                              {a.dataDocumento && <span className="mc-ses-doc-data" title="Data que consta no documento">doc. de {fmtData(a.dataDocumento)}</span>}
                            </span>
                          </div>
                        </td>
                        <td>{TIPO_ANEXO[a.tipo] ?? a.tipo}</td>
                        <td>{fmt(a.criadoEm)}</td>
                        <td>{a.processamento ? <Tag value={String(a.processamento).toLowerCase()} severity={a.processamento === 'PROCESSADO' ? 'success' : 'info'} /> : <span className="mc-ses-vazio">—</span>}</td>
                        <td>{a.link ? <a href={a.link} target="_blank" rel="noreferrer" className="mc-ses-link"><i className="pi pi-download" /> ver / baixar</a> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </TabPanel>
          <TabPanel header={`E-mails da thread (${(dados?.enviados?.length ?? 0) + (dados?.recebidos?.length ?? 0)})`} leftIcon="pi pi-envelope mr-2">
            <p className="mc-ses-intro">O rastro completo desta conversa com a SES: o que recebemos (à esquerda) e o que enviamos (à direita), em ordem de tempo.</p>
            <ul className="mc-ses-thread">
              {[...(dados?.recebidos ?? []).map((r: any) => ({ ...r, _dir: 'in', _ts: r.recebidoEm })),
                ...(dados?.enviados ?? []).map((e: any) => ({ ...e, _dir: 'out', _ts: e.enviadoEm || e.montadoEm }))]
                .sort((a, b) => (a._ts || '').localeCompare(b._ts || ''))
                .map((m: any, i: number) => (
                  <li key={`${m._dir}-${m.id}-${i}`} className={`mc-ses-msg mc-ses-msg--${m._dir}`}>
                    <div className="mc-ses-msg-cab">
                      <strong>{m._dir === 'in' ? `↓ ${m.de || 'SES'}` : `↑ para ${m.para || 'SES'}`}</strong>
                      <span>{fmt(m._ts)}</span>
                      <Tag value={m._dir === 'in' ? (STATUS_RECEBIDO[m.status] ?? m.status) : `${TIPO_EMAIL[m.tipo] ?? m.tipo} · ${m.status === 'ENVIADO' ? 'enviada' : m.status === 'PENDENTE' ? 'na fila' : m.status?.toLowerCase()}`}
                        severity={m._dir === 'in' ? (m.status === 'CONTINUACAO' ? 'success' : 'info') : (m.status === 'ENVIADO' ? 'success' : m.status === 'ERRO' ? 'danger' : 'warning')} />
                    </div>
                    <div className="mc-ses-msg-assunto">{m.assunto}</div>
                    {m._dir === 'in' && m.detalhe ? <div className="mc-ses-msg-detalhe">{m.detalhe}</div> : null}
                    {m._dir === 'out' && m.corpo ? <details><summary>ver o texto enviado</summary><pre className="mc-ses-corpo">{m.corpo}</pre></details> : null}
                  </li>
                ))}
            </ul>
          </TabPanel>
        </TabView>
      </>)}
    </Dialog>
  );
}

/** A célula: badge do estado + caixinha com número de e-mails novos + clique abre o modal. */
function CelulaAnexosSES({ r }: { r: any }) {
  const [aberto, setAberto] = useState(false);
  const [novos, setNovos] = useState<number>(r?.emailsNovos ?? 0);
  const chave = r?.sesAnexos as string | undefined;
  const est = chave ? ESTADO[chave] : null;
  const n = r?.anexosN ?? 0;
  const processando = r?.laudo === 'PROCESSANDO';
  // Cronômetro: re-renderiza a cada 30 s para o "há N min" subir e a previsão descer sem recarregar a página
  // (@R 29/08 01:16 "o tempo não está diminuindo"). A previsão vem do backend com a hora em que foi calculada;
  // aqui desconta o que já passou desde então.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!processando) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, [processando]);
  const haMin = processando && r?.laudoDesde ? Math.max(0, Math.round((Date.now() - new Date(r.laudoDesde).getTime()) / 60000)) : null;
  const passouDesdeCalculo = r?.laudoCalculadoEm ? Math.max(0, (Date.now() - new Date(r.laudoCalculadoEm).getTime()) / 60000) : 0;
  const etaMin = processando && r?.laudoEtaMin != null ? Math.max(0, Math.round(r.laudoEtaMin - passouDesdeCalculo)) : null;
  const roboParado = processando && (r?.laudoRoboParadoMin ?? 0) > 0;
  const atrasado = haMin != null && etaMin != null && etaMin === 0 && passouDesdeCalculo > (r?.laudoEtaMin ?? 0) + 15;
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const subLaudo = processando
    ? (r?.laudoLendoAgora ? 'lendo a peça agora' : 'processando laudo…')
      + (haMin != null ? ` · há ${fmtMin(haMin)}` : '')
      + (roboParado ? ` · robô parado há ${fmtMin(r.laudoRoboParadoMin)}` : etaMin == null ? '' : etaMin > 0 ? ` · faltam ~${fmtMin(etaMin)}` : atrasado ? ' · demorando mais que o normal' : ' · termina a qualquer momento')
      + (r?.laudoNaFrente ? ` · ${r.laudoNaFrente} na frente` : '')
    : '';
  const classe = processando ? (atrasado || roboParado ? ' mc-ses-btn--processando mc-ses-btn--atrasado' : ' mc-ses-btn--processando') : chave === 'SEM_ANEXO' ? ' mc-ses-btn--alerta' : chave === 'SOLICITADO' ? ' mc-ses-btn--aguarda' : '';
  const dos = r?.dossieN != null ? `dossiê ${r.dossieN} de ${r.dossieDe ?? 3}` : null;
  const sub = processando ? subLaudo : chave === 'SEM_ANEXO' ? 'nenhum documento' : chave === 'SOLICITADO' ? 'pedimos à SES · aguardando' : (dos ? `${n} doc(s) · ${dos}${r?.dossieSuficiente ? ' ✓' : ''}` : `${n} documento(s)`);
  return (
    <>
      <button type="button" className={`mc-ses-btn${classe}`} onClick={() => setAberto(true)}
        title={`${est ? est.hint : 'Ver anexos e e-mails da SES'}${r?.dossieFaltantes?.length ? ` Falta: ${r.dossieFaltantes.join(' · ')}.` : ''} Clique para ver, baixar e ler a thread.`}
        aria-label={`Anexos da SES do pedido ${r?.id}: ${est?.rotulo ?? 'ver'}`}>
        <span className="mc-ses-icone"><i className={processando ? 'pi pi-spin pi-spinner' : 'pi pi-paperclip'} />{n > 0 && <span className="mc-ses-n">{n}</span>}</span>
        <span className="mc-ses-txt">
          <span className={`mc-ses-estado mc-ses-estado--${chave ?? ''}`}>{est ? est.rotulo : '—'}</span>
          <span className="mc-ses-sub">{sub}</span>
        </span>
        {novos > 0 && <span className="mc-ses-novos" title={`${novos} e-mail(s) novo(s) nesta thread`}><i className="pi pi-envelope" /> {novos}</span>}
      </button>
      {aberto && <ModalAnexosSES orderId={r.id} paciente={r.paciente} aberto={aberto} fechar={() => { setAberto(false); setNovos(0); }} />}
    </>
  );
}

/** Coluna "SES Anexos" — cola nas 9 telas ao lado da coluna "!". */
export const colunaAnexosSES = () => (
  <Column
    key="sesAnexos"
    field="sesAnexos"
    header={cabecalhoComHint('SES Anexos', 'O que a SES mandou de documento: com anexo · sem anexo · solicitado (pedimos) · recebido (devolveram) · processando laudo (o robô está lendo a peça de inteiro teor; mostra há quanto tempo e a previsão — ~7 min por peça mais a espera do robô, que passa a cada 10 min; os exames/relatório aparecem quando terminar). O número no clipe é quantos documentos; o envelope é quantos e-mails novos. Clique para ver, baixar e ler a thread.')}
    sortable
    style={{ width: '11rem' }}
    bodyStyle={{ textAlign: 'left' }}
    body={(r: any) => <CelulaAnexosSES r={r} />}
  />
);
