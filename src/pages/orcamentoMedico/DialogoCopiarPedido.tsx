import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { previaLinkDocumentos, gerarLinkDocumentos, registrarCotacaoPedida } from '../../services/api/orders';

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
                                  total: number, comValores: boolean): string {
  const oQueTem = total > 0
    ? `No link abaixo estão ${descreverDocumentos(porTipo)}, extraídos do processo e em ordem de leitura clínica.`
    : 'Os documentos clínicos deste processo ainda estão sendo reunidos; o link abaixo mostra o que já temos.';
  const valores = comValores ? '\nTambém estão lá os valores de referência encontrados no processo.' : '';
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

🔒 ${url}

Ambiente seguro da G4MED para visualização dos documentos, de acordo com a LGPD: os
arquivos abrem só para leitura (sem download), cada acesso é registrado e o link pode
ser encerrado a qualquer momento. Por favor, não repasse.

*O QUE PRECISAMOS*
Valor do procedimento, com a composição (equipe, hospitalar e OPME quando houver). Se
faltar algum exame para você fechar o valor, responda dizendo qual — nós buscamos.

A Secretaria de Estado de Saúde de Minas Gerais será notificada do status deste pedido
para acompanhamento da cotação, conforme a transparência acordada junto à entidade e ao
órgão solicitante.

_Pedido #${p.id} · G4MED · ${data}_`;
}

async function copiarTexto(texto: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const t = document.createElement('textarea');
  t.value = texto;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.focus();
  t.select();
  document.execCommand('copy');
  document.body.removeChild(t);
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

  useEffect(() => {
    setPrevia(null);
    setErro(null);
    setComValores(false);
    if (!pedido) return;
    previaLinkDocumentos(pedido.id)
      .then((r) => setPrevia(r.data))
      .catch((e) => setErro(e?.response?.data?.error || 'Não foi possível montar a prévia do link.'));
  }, [pedido]);

  const refs: any[] = previa?.referencias || [];
  const hist = previa?.historicoPago;
  const deflatorPct = previa ? `${(previa.deflator * 100).toFixed(2).replace('.', ',')}%` : '';

  const gerarECopiar = async () => {
    if (!pedido) return;
    setCopiando(true);
    try {
      let r: any;
      try {
        r = await gerarLinkDocumentos(pedido.id, {
          medicoId: pedido.idMedico ?? null, destino: pedido.medico || undefined, mostrarValores: comValores,
        });
      } catch (e: any) {
        alert(`${e?.response?.data?.error || 'Não foi possível gerar o link seguro.'}\n\nNada foi copiado.`);
        return;
      }
      const d = r.data;
      const texto = montarTextoPedido(pedido, d.url, d.documentosPorTipo || {}, d.documentos || 0, !!d.mostrarValores);
      try {
        await copiarTexto(texto);
      } catch {
        alert('Não foi possível copiar.');
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
          <Button label={copiando ? 'Gerando…' : 'Gerar link e copiar'} icon="pi pi-lock"
            onClick={gerarECopiar} disabled={!previa || copiando} />
        </div>
      )}>
      {erro && <div style={{ color: '#b91c1c' }}>{erro}<br />Nada será copiado.</div>}
      {!erro && !previa && <div>Montando a prévia…</div>}
      {previa && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
          <section>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>O que vai no link ({previa.documentos})</div>
            {previa.documentos
              ? <div>{descreverDocumentos(previa.documentosPorTipo)}</div>
              : <div style={{ color: '#92400e' }}>Nenhum documento clínico neste pedido ainda. O link abre vazio.</div>}
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <Checkbox inputId="incluirValores" checked={comValores} onChange={(e) => setComValores(!!e.checked)}
                disabled={!refs.length} />
              <span>
                <b>Incluir os valores de referência no link</b> (com deflator de {deflatorPct})<br />
                <span style={{ color: '#6b7280' }}>
                  {refs.length
                    ? 'O médico vê só o valor com deflator — nunca o valor original nem o prestador.'
                    : 'Nenhum orçamento foi encontrado no processo deste pedido.'}
                </span>
              </span>
            </label>
            {refs.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                      <th style={{ padding: '4px 6px' }}>Prestador (só você vê)</th>
                      <th style={{ padding: '4px 6px' }}>Tipo</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor real</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Médico vê</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((x, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '4px 6px' }}>{x.prestador || '—'}{x.conferido ? '' : ' ·  não conferido'}</td>
                        <td style={{ padding: '4px 6px' }}>{x.categoria}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{brl(x.valorOriginal)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                          {comValores ? brl(x.valorReferencia) : <span style={{ color: '#9ca3af' }}>não vai</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Quanto o Estado já pagou por procedimento parecido</div>
            {hist?.disponivel ? (
              <div>
                Média <b>{brl(hist.media)}</b> · mediana {brl(hist.mediana)} · {hist.n} pagamento(s) de{' '}
                {dataBR(hist.de)} a {dataBR(hist.ate)}
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                  Casado pelas palavras {hist.chave.join(', ')} — confira se os exemplos são o mesmo procedimento:{' '}
                  {hist.exemplos.join(' · ')}. {hist.aviso}
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>{hist?.motivo || 'Sem base para comparar.'}</div>
            )}
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Só para você decidir — não vai ao médico.</div>
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
