import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { FichaPrestadorDialog } from '../../components/FichaPrestador/FichaPrestadorDialog';
import { adicionarEspecialidadeDestino, previaLinkDocumentos, gerarLinkDocumentos, gerarRelatorioMedico, registrarCotacaoPedida, montarCotacaoMedico } from '../../services/api/orders';

/* ═══ COPIAR O PEDIDO COM O LINK SEGURO (@R 21/09 18:27 → 18:45) ═══
   ⟦"registrar quem abriu, e o momento que o item foi aberto ... o link ali não pode ser baixado"⟧
   ⟦"o link pode ser mandado para mais de um médico então nenhuma informação vaza para nenhum dos
   dois ... mas a mensagem tem que informar o que temos ali dentro do link e dizer que ali é um
   ambiente seguro ... de acordo com a LGPD"⟧
   ⟦"o operador confirma no ok se quer incluir os valores de orçamento ou não"⟧

   ANTES: a mensagem levava N links públicos do R2 — quem tivesse o link abria e baixava, e nada
   registrava. AGORA: 1 link da G4MED; os documentos abrem como imagem com marca d'água, cada
   abertura fica registrada, e o link pode ser encerrado na Ficha do Pedido.

   O QUE QUEM COPIA VÊ ANTES (e o médico NÃO vê): o valor real de cada orçamento do processo,
   o valor com deflator que vai aparecer, quem são os prestadores e a média do que o Estado já
   pagou em pedidos parecidos. A escolha "incluir valores" gera um link PRÓPRIO: quem recebeu um
   link sem valores nunca passa a vê-los depois.

   SE O LINK NÃO PUDER SER GERADO, NADA É COPIADO. Voltar aos links públicos "para não travar"
   seria desfazer em silêncio exatamente o que esta tela existe para garantir. */

export interface PedidoParaCopiar {
  id: number;
  paciente?: string;
  idade?: number | string | null;
  procedimento?: string;
  area?: string;
  subarea?: string | null;
  idMedico?: number | null;
  medico?: string | null;
}

// singular → plural, para a frase "3 laudos médicos, 1 exame…" (chaves = rótulos do servidor)
const PLURAL: Record<string, string> = {
  'Laudo médico': 'laudos médicos',
  'Exame': 'exames',
  'Relatório médico': 'relatórios médicos',
  'Receita': 'receitas',
  'Prescrição': 'prescrições',
  'Decisão judicial (inteiro teor)': 'decisões judiciais (inteiro teor)',
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function descreverDocumentos(porTipo: Record<string, number>): string {
  const partes = Object.entries(porTipo).map(([rotulo, n]) =>
    n > 1 ? `${n} ${PLURAL[rotulo] || rotulo.toLowerCase()}` : `1 ${rotulo.charAt(0).toLowerCase()}${rotulo.slice(1)}`);
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

export function montarTextoPedido(p: PedidoParaCopiar, url: string, porTipo: Record<string, number>,
                                  total: number, comValores: boolean, codigo?: string | null,
                                  extras: { pagamentos?: boolean; relatorio?: boolean } = {}): string {
  const oQueTem = total > 0
    ? `No link abaixo estão ${descreverDocumentos(porTipo)}, extraídos do processo e em ordem de leitura clínica.`
    : 'Os documentos clínicos deste processo ainda estão sendo reunidos; o link abaixo mostra o que já temos.';
  const valores = (comValores ? '\nTambém está lá a referência de preço total por procedimento.' : '')
    + (extras.pagamentos ? '\nE o que o Estado já pagou recentemente por procedimento parecido.' : '')
    + (extras.relatorio ? '\nNo topo, um resumo médico feito por IA para leitura rápida, com a página de cada documento citado.' : '');
  const hoje = new Date();
  const data = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  return `*G4MED · SOLICITAÇÃO DE ORÇAMENTO*
Processo judicial de saúde — Secretaria de Estado de Saúde de MG

*PACIENTE:* ${p.paciente || ''}${p.idade ? ` · ${p.idade} anos` : ''}
*PROCEDIMENTO:* ${p.procedimento || ''}
*ESPECIALIDADE:* ${p.area || ''}${p.subarea ? ` · ${p.subarea}` : ''}

Doutor(a), este paciente aguarda decisão judicial para o procedimento acima e precisamos
do seu orçamento para dar seguimento.

*DOCUMENTOS DO PROCESSO*${total ? ` (${total})` : ''}
${oQueTem}${valores}

🔒 ${url}${codigo ? `\n*Código de acesso:* ${codigo}` : ''}
*Validade:* 72 horas a partir deste envio.

Ambiente seguro da G4MED, conforme a LGPD e a política de informação: os arquivos abrem
só para leitura (sem download) e cada acesso é registrado (data, hora, IP, localização e
aparelho) — a G4MED e a entidade responsável guardam o registro de todos os acessos a
estes documentos. Uso restrito ao médico para cotação; proibida a reprodução. Não repasse:
o código é exclusivo deste envio.

*O QUE PRECISAMOS*
Valor do procedimento, com a composição (equipe, hospitalar e OPME quando houver). Se
faltar algum exame para você fechar o valor, responda dizendo qual — nós buscamos.

A Secretaria de Estado de Saúde de Minas Gerais será notificada do status deste pedido
para acompanhamento da cotação, conforme a transparência acordada junto à entidade e ao
órgão solicitante.

_Pedido #${p.id} · G4MED · ${data}_`;
}

/* Devolve se REALMENTE copiou (¬se "não lançou exceção"). Achado @R 21/09 23:27: entre o clique
   em "Gerar link e copiar" e o navigator.clipboard.writeText existem 2 awaits de rede
   (gerarLinkDocumentos + o histórico da prévia já carregado antes) — em alguns navegadores/abas
   isso perde a ativação transitória exigida pela Clipboard API, e writeText RESOLVE sem escrever
   nada (¬lança erro — por isso o alert "Não foi possível copiar" nunca aparecia e a tela seguia
   como se tivesse dado certo: marcava "pedido ao médico" e recarregava a tabela com a área de
   trabalho vazia no clipboard). document.execCommand('copy') tem essa vantagem: devolve um
   boolean SÍNCRONO de sucesso — é o único sinal confiável que temos sem pedir permissão de leitura
   do clipboard (que o usuário pode nunca ter concedido). */
async function copiarTexto(texto: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // cai para o fallback abaixo em vez de desistir
    }
  }
  const t = document.createElement('textarea');
  t.value = texto;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.focus();
  t.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(t);
  return ok;
}

interface Props {
  pedido: PedidoParaCopiar | null;
  onClose: () => void;
  onCopiado?: () => void;
}

export function DialogoCopiarPedido({ pedido, onClose, onCopiado }: Props) {
  const [previa, setPrevia] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comValores, setComValores] = useState(false);
  const [copiando, setCopiando] = useState(false);
  // @R 22/09 10:49: "marcar o que quer mandar no link... poder desmarcar algo que ele não queira mandar".
  // Guarda o que foi DESMARCADO (padrão = vai tudo, como antes). O servidor recusa id de outro pedido.
  const [docsFora, setDocsFora] = useState<Set<number>>(new Set());
  const [refsFora, setRefsFora] = useState<Set<number>>(new Set());
  // @R 22/09 ~11:10: "um check que vamos mandar os últimos pagamentos, os 5... e podemos desmarcar os
  // valores para enviar só os corretos". Padrão: NÃO vai (como antes); ligando, vão os 5 e desmarca-se.
  const [enviarPag, setEnviarPag] = useState(false);
  const [pagFora, setPagFora] = useState<Set<number>>(new Set());
  // @R 22/09 ~11:10: "enviar o relatório feito por IA da parte médica para leitura rápida do médico".
  const [relatorio, setRelatorio] = useState<any>(null);
  // @R 22/09 11:30: "já vir marcado... quando clicarmos para gerar o link o relatório será colocado dentro
  // do link". Vem marcado; a IA começa a ler assim que o diálogo abre (fica pronto até o clique).
  const [enviarRel, setEnviarRel] = useState(true);
  // #611 (@R 22/09 via comercial): as cotações que ESTE prestador já nos mandou para procedimento parecido.
  // Nasce DESLIGADO: a mensagem é colada à mão e o sistema não sabe se vai para um grupo com outros médicos —
  // quem cola sabe para onde mandou.
  const [enviarHist, setEnviarHist] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);   // central do médico, fase A
  const geracao = useRef<{ chave: string; p: Promise<any> } | null>(null);
  const [gerandoRel, setGerandoRel] = useState(false);
  const [erroRel, setErroRel] = useState<string | null>(null);
  const [addEsp, setAddEsp] = useState<'nao' | 'enviando' | 'feito' | string>('nao');
  const alternar = (set: Set<number>, id: number, fn: (s: Set<number>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n);
  };

  useEffect(() => {
    setPrevia(null);
    setErro(null);
    setComValores(false);
    setDocsFora(new Set());
    setRefsFora(new Set());
    setEnviarPag(false); setPagFora(new Set());
    setRelatorio(null); setEnviarRel(true); setErroRel(null); geracao.current = null; setAddEsp('nao');
    setEnviarHist(false);
    if (!pedido) return;
    previaLinkDocumentos(pedido.id)
      .then((r) => { setPrevia(r.data); setRelatorio(r.data?.relatorio ?? null); })
      .catch((e) => setErro(e?.response?.data?.error || 'Não foi possível montar a prévia do link.'));
  }, [pedido]);

  const refs: any[] = previa?.referencias || [];
  const docs: any[] = previa?.listaDocumentos || [];
  const docsVao = docs.filter((d) => !docsFora.has(d.id)).length;
  // só a referência que o médico PODE ver (conferida) conta como "vai"
  const refsVao = refs.filter((x) => !x.ocultoAoMedico && !refsFora.has(x.id)).length;
  const hist = previa?.historicoPago;
  const pagamentos: any[] = hist?.pagamentos || [];
  const pagVao = pagamentos.filter((p) => !pagFora.has(p.id));
  const cotacoesAnt: any[] = previa?.cotacoesAnteriores || [];
  // o relatório "serve" se leu exatamente os documentos marcados agora
  const marcadosChave = docs.filter((d) => !docsFora.has(d.id)).map((d) => d.id).sort((a, b) => a - b).join(',');
  const relServe = (r: any) => !!r && (r.meta?.documentos || []).map((d: any) => d.anexoId).sort((a: number, b: number) => a - b).join(',') === marcadosChave;
  /** Gera (ou reaproveita a geração em curso para a MESMA seleção). Devolve o relatório ou null. */
  const garantirRelatorio = (): Promise<any> => {
    if (!pedido || !marcadosChave) return Promise.resolve(null);
    if (relServe(relatorio)) return Promise.resolve(relatorio);
    if (geracao.current?.chave === marcadosChave) return geracao.current.p;
    setGerandoRel(true); setErroRel(null);
    const p = gerarRelatorioMedico(pedido.id, [...docsFora])
      .then((r) => { setRelatorio(r.data); return r.data; })
      .catch((e: any) => { setErroRel(e?.response?.data?.error || 'Não foi possível gerar o relatório agora.'); return null; })
      .finally(() => { if (geracao.current?.p === p) { geracao.current = null; setGerandoRel(false); } });
    geracao.current = { chave: marcadosChave, p };
    return p;
  };
  const gerarRelatorio = () => { void garantirRelatorio(); };
  // começa a ler logo que a prévia chega (e a caixa está marcada): quando clicar, já está pronto
  useEffect(() => {
    if (previa && enviarRel && docs.length && !relServe(relatorio)) void garantirRelatorio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa]);
  const deflatorPct = previa ? `${(previa.deflator * 100).toFixed(2).replace('.', ',')}%` : '';

  const gerarECopiar = async () => {
    if (!pedido) return;
    setCopiando(true);
    try {
      // relatório marcado: garante o que corresponde aos documentos marcados AGORA (espera se está gerando)
      const rel = enviarRel ? await garantirRelatorio() : null;
      if (enviarRel && !rel && !window.confirm('O relatório da IA não ficou pronto. Gerar o link sem ele?')) return;
      let r: any;
      try {
        r = await gerarLinkDocumentos(pedido.id, {
          medicoId: pedido.idMedico ?? null, destino: pedido.medico || undefined, mostrarValores: comValores,
          anexosExcluidos: [...docsFora], referenciasExcluidas: comValores ? [...refsFora] : [],
          pagamentosIncluidos: enviarPag ? pagVao.map((p) => p.id) : [],
          resumoId: enviarRel && rel ? rel.id : null,
          historicoIncluido: enviarHist && cotacoesAnt.length > 0,
        });
      } catch (e: any) {
        alert(`${e?.response?.data?.error || 'Não foi possível gerar o link seguro.'}\n\nNada foi copiado.`);
        return;
      }
      const d = r.data;
      const texto = montarTextoPedido(pedido, d.url, d.documentosPorTipo || {}, d.documentos || 0, !!d.mostrarValores, d.codigoAcesso,
        { pagamentos: enviarPag && pagVao.length > 0, relatorio: enviarRel && !!rel });
      const copiou = await copiarTexto(texto);
      if (!copiou) {
        // FALLBACK MANUAL — o link JÁ foi gerado (custou uma escrita no banco); perder o texto
        // aqui seria pior que um prompt feio. O prompt() vem com o valor pré-selecionado: 1 Ctrl+C.
        window.prompt('Não deu para copiar automaticamente — selecione e copie (Ctrl+C):', texto);
        return;
      }
      // mesma regra de antes: copiar conta como pedido; a marca vem DEPOIS do copiar dar certo
      // e a falha dela não desfaz o que já foi copiado (a marca é recuperável; a mensagem, não)
      try { await registrarCotacaoPedida(pedido.id); onCopiado?.(); } catch { /* ver acima */ }
      alert('Copiado! Cole no WhatsApp.\n\nO link registra cada abertura (veja na Ficha do Pedido). Registrado como pedido ao médico — se não for enviar, use o ✕ na coluna "Pedido ao médico".');
      onClose();
    } finally {
      setCopiando(false);
    }
  };

  return (
    <Dialog header={pedido ? `Copiar pedido #${pedido.id} com link seguro` : ''} visible={!!pedido}
      onHide={onClose} style={{ width: 'min(680px, 96vw)' }} modal
      footer={(
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button label="Cancelar" text onClick={onClose} disabled={copiando} />
          <Button label={copiando ? (gerandoRel ? 'IA lendo os documentos…' : 'Gerando…') : 'Gerar link e copiar'} icon="pi pi-lock"
            onClick={gerarECopiar} disabled={!previa || copiando} />
        </div>
      )}>
      {erro && <div style={{ color: '#b91c1c' }}>{erro}<br />Nada será copiado.</div>}
      {!erro && !previa && <div>Montando a prévia…</div>}
      {previa && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
          {!!pedido?.idMedico && Number(pedido.idMedico) > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f8ff', border: '1px solid #d1e0ff', borderRadius: 8, padding: '8px 10px' }}>
              <i className="pi pi-id-card" style={{ color: '#1d4ed8' }} />
              <span style={{ flex: 1 }}>Antes de mandar: o que <b>{pedido.medico || 'este prestador'}</b> já cotou conosco e quanto costuma demorar.</span>
              <Button label="Ficha do prestador" size="small" outlined onClick={() => setFichaAberta(true)} />
            </div>
          )}
          <FichaPrestadorDialog medicoId={fichaAberta && pedido?.idMedico ? Number(pedido.idMedico) : null}
            pedido={pedido?.id} onClose={() => setFichaAberta(false)} />
          {previa.especialidadeDestino && !previa.especialidadeDestino.consta && addEsp !== 'feito' && (
            <section style={{ background: '#fff7e6', border: '1px solid #f5d38a', borderRadius: 8, padding: 10 }}>
              <div>
                <i className="pi pi-exclamation-triangle" style={{ color: '#b54708' }} />{' '}
                <b>{previa.especialidadeDestino.destinoNome}</b> não tem <b>{previa.especialidadeDestino.area}</b> entre as
                especialidades cadastradas.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {previa.especialidadeDestino.especialidadeId ? (
                  <Button size="small" label={`Adicionar ${previa.especialidadeDestino.especialidadeNome} a ${previa.especialidadeDestino.destinoNome}`}
                    icon="pi pi-plus" loading={addEsp === 'enviando'}
                    onClick={async () => {
                      setAddEsp('enviando');
                      try { await adicionarEspecialidadeDestino(pedido!.id, previa.especialidadeDestino.destinoId); setAddEsp('feito'); }
                      catch (e: any) { setAddEsp(e?.response?.data?.error || 'Não foi possível adicionar.'); }
                    }} />
                ) : <span style={{ fontSize: 12 }}>Essa especialidade não existe no cadastro de especialidades — crie em Clientes antes.</span>}
                <span style={{ fontSize: 12, color: '#6b7280' }}>Só um aviso: dá para copiar mesmo assim.</span>
              </div>
              {addEsp !== 'nao' && addEsp !== 'enviando' ? <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{addEsp}</div> : null}
            </section>
          )}
          {addEsp === 'feito' && previa.especialidadeDestino && (
            <div style={{ color: '#067647' }}><i className="pi pi-check" /> {previa.especialidadeDestino.especialidadeNome} adicionada ao cadastro de {previa.especialidadeDestino.destinoNome}.</div>
          )}
          <section>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              O que vai no link ({docsVao} de {docs.length}) <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 12 }}>— desmarque o que não quer mandar</span>
            </div>
            {docs.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {docs.map((d) => (
                  <label key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <Checkbox inputId={`doc-${d.id}`} checked={!docsFora.has(d.id)}
                      onChange={() => alternar(docsFora, d.id, setDocsFora)} />
                    <span style={{ flex: 1, color: docsFora.has(d.id) ? '#9ca3af' : undefined,
                      textDecoration: docsFora.has(d.id) ? 'line-through' : undefined }}>
                      {d.rotulo}{d.nome ? ` — ${d.nome}` : ''}
                    </span>
                    {d.link ? <a href={d.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      <i className="pi pi-external-link" style={{ fontSize: 12 }} /> ver</a> : null}
                  </label>
                ))}
                {!docsVao && <div style={{ color: '#92400e' }}>Nenhum documento marcado: o link abre vazio.</div>}
              </div>
            ) : <div style={{ color: '#92400e' }}>Nenhum documento clínico neste pedido ainda. O link abre vazio.</div>}
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <Checkbox inputId="incluirValores" checked={comValores} onChange={(e) => setComValores(!!e.checked)}
                disabled={!refs.length} />
              <span>
                <b>Incluir os valores de referência no link</b> (com deflator de {deflatorPct}){comValores && refs.length ? ` — ${refsVao} marcado(s)` : ''}<br />
                <span style={{ color: '#6b7280' }}>
                  {refs.length
                    ? 'O médico vê a referência total por procedimento e o local — nunca o valor original nem que existe deflator.'
                    : 'Nenhum orçamento foi encontrado no processo deste pedido.'}
                </span>
              </span>
            </label>
            {refs.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                      <th style={{ padding: '4px 6px' }}>Vai</th>
                      <th style={{ padding: '4px 6px' }}>Prestador (só você vê)</th>
                      <th style={{ padding: '4px 6px' }}>Tipo</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor real</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Médico vê</th>
                      <th style={{ padding: '4px 6px' }}>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((x, i) => {
                      const bloqueada = !!x.ocultoAoMedico;       // a Conferência não validou: nunca vai
                      const vai = comValores && !bloqueada && !refsFora.has(x.id);
                      return (
                      <tr key={x.id ?? i} style={{ borderTop: '1px solid #f3f4f6', color: vai ? undefined : '#9ca3af' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <Checkbox inputId={`ref-${x.id}`} checked={vai} disabled={!comValores || bloqueada}
                            onChange={() => alternar(refsFora, x.id, setRefsFora)} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>{x.prestador || '—'}{x.conferido ? '' : ' ·  não conferido'}</td>
                        <td style={{ padding: '4px 6px' }}>{x.categoria}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{brl(x.valorOriginal)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                          {vai ? brl(x.valorReferencia)
                            : <span style={{ color: '#9ca3af' }} title={bloqueada ? x.ocultoAoMedico : undefined}>
                                {bloqueada ? 'não vai (não conferido)' : 'não vai'}</span>}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          {x.linkAbrir
                            ? <a href={x.linkAbrir} target="_blank" rel="noreferrer"
                                title={x.origemAbrir === 'PECA' && x.pagina ? `Abre o processo — o orçamento está na página ${x.pagina}` : 'Abre o documento de onde o valor foi lido'}>
                                <i className="pi pi-file-pdf" style={{ fontSize: 12 }} /> ver{x.pagina ? ` p.${x.pagina}` : ''}</a>
                            : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Quanto o Estado já pagou por procedimento parecido</div>
            {hist?.disponivel ? (
              <>
                <div>
                  Média <b>{brl(hist.media)}</b> · mediana {brl(hist.mediana)} · {hist.n} pagamento(s) de{' '}
                  {dataBR(hist.de)} a {dataBR(hist.ate)}
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    Casado pelas palavras {hist.chave.join(', ')}. {hist.aviso}
                  </div>
                </div>
                {pagamentos.length > 0 && (
                  <>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginTop: 10 }}>
                      <Checkbox inputId="enviarPag" checked={enviarPag} onChange={(e) => setEnviarPag(!!e.checked)} />
                      <span><b>Enviar os últimos pagamentos ao médico</b>{enviarPag ? ` — ${pagVao.length} de ${pagamentos.length} marcado(s)` : ''}<br />
                        <span style={{ color: '#6b7280' }}>O médico vê valor, mês e procedimento de cada um — nunca processo, paciente ou prestador. Desmarque o que não for o mesmo procedimento.</span>
                      </span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, marginLeft: 28 }}>
                      {pagamentos.map((p) => {
                        const vai = enviarPag && !pagFora.has(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: enviarPag ? 'pointer' : 'default',
                            color: vai ? undefined : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                            <Checkbox inputId={`pag-${p.id}`} checked={vai} disabled={!enviarPag}
                              onChange={() => alternar(pagFora, p.id, setPagFora)} />
                            <span style={{ width: 110, textAlign: 'right', fontWeight: 600 }}>{brl(p.valor)}</span>
                            <span style={{ width: 70 }}>{dataBR(p.data)?.slice(3) ?? ''}</span>
                            <span style={{ flex: 1, fontSize: 12 }}>{p.procedimento}</span>
                          </label>
                        );
                      })}
                      {enviarPag && !pagVao.length && <div style={{ color: '#92400e' }}>Nenhum marcado: nenhum pagamento vai.</div>}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ color: '#6b7280' }}>{hist?.motivo || 'Sem base para comparar.'}</div>
            )}
          </section>

          {cotacoesAnt.length > 0 && (
            <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <Checkbox inputId="enviarHist" checked={enviarHist} onChange={(e) => setEnviarHist(!!e.checked)} />
                <span><b>Mostrar ao prestador as cotações anteriores DELE</b> ({cotacoesAnt.length})<br />
                  <span style={{ color: '#6b7280' }}>Só as que ele mesmo nos mandou para procedimento parecido, com o desfecho ao lado, e ele pode abrir o orçamento dele. <b>Não marque se o link vai para um grupo com outros médicos</b> — ele veria preços de outro.</span>
                </span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, marginLeft: 28, color: enviarHist ? undefined : '#9ca3af' }}>
                {cotacoesAnt.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    <span style={{ width: 110, textAlign: 'right', fontWeight: 600 }}>{brl(c.valor)}</span>
                    <span style={{ width: 80 }}>{c.data ? dataBR(c.data) : ''}</span>
                    <span style={{ width: 170 }}>{c.desfechoRotulo}</span>
                    <span style={{ flex: 1, fontSize: 12 }}>{c.procedimento}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <Checkbox inputId="enviarRel" checked={enviarRel} onChange={(e) => { setEnviarRel(!!e.checked); if (e.checked) gerarRelatorio(); }}
                disabled={!docsVao} />
              <span><b>Enviar o relatório médico da IA no link</b><br />
                <span style={{ color: '#6b7280' }}>Resumo de leitura rápida para o médico (diagnóstico, procedimento, exames, urgência e o que pode faltar), cada ponto com o documento e a página de onde saiu — feito com os documentos marcados acima.</span>
              </span>
            </label>
            {enviarRel && (
              <div style={{ marginTop: 8, marginLeft: 28 }}>
                {gerandoRel && <div style={{ color: '#1d4ed8' }}><i className="pi pi-spin pi-spinner" style={{ fontSize: 12 }} /> A IA está lendo os documentos marcados (uns 30 segundos)…</div>}
                {erroRel && <div style={{ color: '#b91c1c' }}>{erroRel} <Button size="small" text label="Tentar de novo" onClick={gerarRelatorio} /></div>}
                {relatorio && !gerandoRel && (
                  <>
                    {!relServe(relatorio) && <div style={{ color: '#92400e', fontSize: 12 }}>
                      Você mudou os documentos marcados: o relatório será refeito com eles ao gerar o link.</div>}
                    <details>
                      <summary style={{ cursor: 'pointer', color: '#374151' }}>
                        Ver o relatório ({relatorio.meta?.paginasLidas} página(s) lida(s){relatorio.meta?.paginasSemTexto ? ` · ${relatorio.meta.paginasSemTexto} são imagem, não lidas` : ''})
                      </summary>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {relatorio.campos.map((c: any) => (
                          <div key={c.campo}>
                            <b>{c.rotulo}:</b> {c.valor}
                            {c.citacoes?.length ? <span style={{ color: '#6b7280', fontSize: 12 }}>
                              {' '}({c.citacoes.map((x: any) => `${x.documento}${x.nome ? ` ${x.nome}` : ''}, p. ${x.pagina}`).join('; ')})</span> : null}
                          </div>
                        ))}
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </section>

          {(previa.outrosParticipantes || []).length > 0 && (
            <section>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Links já gerados neste pedido</div>
              {previa.outrosParticipantes.map((o: any, i: number) => (
                <div key={i} style={{ color: '#374151' }}>
                  {o.destino || (o.medicoId ? `médico ${o.medicoId}` : 'sem destino')} · desde {dataBR(o.desde)}
                  {o.mostrarValores ? ' · com valores' : ' · sem valores'}
                </div>
              ))}
              <div style={{ color: '#6b7280', fontSize: 12 }}>Cada destino tem o seu link; nenhum vê o do outro.</div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Copiar mensagem: travas ANTES de abrir o diálogo (segredo de justiça, pedido sem CNJ, especialidade
 *  do prestador). Usada pela fase 3 e, desde 23/09, logo após confirmar o médico na fase 2. */
export const prepararCopiaPedido = async (
  // qualquer linha de fila com id/paciente/procedimento/area (fase 2 e fase 3 usam formatos próximos)
  rowData: any,
  abrirDialogo: (p: PedidoParaCopiar, recarregar?: () => void) => void,
  recarregar?: () => void,
) => {
  /* SEGREDO DE JUSTIÇA NÃO VAI A PRESTADOR (mandato @R via eliza-urgencia, 20/09 02:08): 7 pedidos em
     segredo foram disparados a canais de prestador nesta madrugada. O servidor também recusa
     (409 segredo_de_justica em cotacao-pedida e solicitar-cotacao-medico); aqui barramos ANTES de
     copiar, porque o texto copiado já é o vazamento. */
  // as filas trazem o segredo em `segredo` ('sim'|'possivel'|'nao'); algumas também em statusJuridico —
  // olhar os DOIS (23/09: na fase 2 só existe o primeiro, e a trava passaria calada).
  if ((rowData.statusJuridico || '').trim().toLowerCase() === 'segredo de justiça' || rowData.segredo === 'sim') {
    alert('Este processo está em SEGREDO DE JUSTIÇA e não pode ser enviado a prestador.\n\nNada foi copiado. Se o segredo caiu, desmarque em "Segredo de Justiça" antes.');
    return;
  }
  const cnjDaLinha = ((rowData as any).cnj ?? (rowData as any).nprocesso ?? '').toString().trim();
  if (!cnjDaLinha && !window.confirm('Este pedido está SEM número de processo (CNJ).\n\nEnviar ao prestador mesmo assim?')) return;
  /* #505 (20/09): a especialidade do pedido bate com o cadastro do prestador? O servidor
     compara (especialidade, subespecialidade, lista e grupos de WhatsApp) e devolve o aviso.
     Caso fundador: #1238, cabeça e pescoço enviado ao Santa Rita, que não opera isso — a
     recusa só apareceu depois. É AVISO com confirmação, não bloqueio: o cadastro é texto
     livre e incompleto; quem opera decide. Se a API falhar, o Copiar segue (ajuda ≠ gate). */
  try {
    const av: any = await montarCotacaoMedico(rowData.id)
    const avisosEsp: string[] = (av?.data?.avisos || []).filter((a: string) => a.startsWith('Especialidade'))
    if (avisosEsp.length && !window.confirm(avisosEsp.join('\n\n') + '\n\nCopiar mesmo assim?')) return
  } catch { /* aviso é ajuda, não gate */ }
  /* O TEXTO E OS DOCUMENTOS AGORA SAEM PELO DIÁLOGO DO LINK SEGURO (@R 21/09 18:27): em vez de N
     links públicos do R2, 1 link da G4MED que registra cada abertura e não deixa baixar — e quem
     copia vê antes os valores (real × deflacionado) e escolhe se vão. A lista branca de tipos, a
     ordem clínica e a frase da SES moraram aqui até hoje e foram para DialogoCopiarPedido.tsx
     (texto) e backend/link_documentos.py (lista branca, servidor). */
  const m = rowData as any
  abrirDialogo({
    id: rowData.id, paciente: rowData.paciente, idade: rowData.idade, procedimento: rowData.procedimento,
    area: rowData.area, subarea: rowData.subarea,
    idMedico: m.idMedico ?? m.medicoId ?? m.medico_id ?? null, medico: m.nomeMedico ?? m.medico ?? null,
  }, recarregar)
}
