import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getFichaPrestador, type FichaPrestador } from '../../services/api/fichaPrestador';

/* Central do médico — FASE A (GO @R 22/09, especificação da comercial). Responde 4 perguntas antes
   de mandar a solicitação: o que ele já cotou · o que aconteceu com cada · o que o processo trazia ·
   quanto costuma demorar. Regras: nunca ranking, nunca nome de concorrente, nunca a nossa margem;
   o que não existe aparece como "não registrado", nunca como zero. */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const corDesfecho = { GANHOU: '#067647', NAO_SEGUIU: '#b54708', EM_ANDAMENTO: '#475467' } as const;

export function FichaPrestadorDialog({ medicoId, pedido, onClose }: { medicoId: number | null; pedido?: number; onClose: () => void }) {
  const [ficha, setFicha] = useState<FichaPrestador | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setFicha(null); setErro(null);
    if (!medicoId) return;
    getFichaPrestador(medicoId, pedido)
      .then((r) => setFicha(r.data))
      .catch((e) => setErro(e?.response?.data?.error || 'Não foi possível abrir a ficha agora (erro de rede) — nada foi concluído sobre o prestador.'));
  }, [medicoId, pedido]);

  return (
    <Dialog header="Ficha do prestador" visible={!!medicoId} onHide={onClose} style={{ width: 'min(820px, 96vw)' }}>
      {erro && <div style={{ color: '#b42318' }}>{erro}</div>}
      {!ficha && !erro && <div className="text-600">Carregando…</div>}
      {ficha && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <strong style={{ fontSize: 17 }}>{ficha.prestador.nome}</strong>
            <span style={{ marginLeft: 8, fontSize: 12, background: '#f2f4f7', borderRadius: 10, padding: '2px 8px' }}>{ficha.prestador.rotulo}</span>
            <div className="text-600" style={{ fontSize: 13 }}>
              {[ficha.prestador.categoria, ficha.prestador.especialidade].filter(Boolean).join(' · ') || 'Especialidade não registrada'}
            </div>
            <div className="text-600" style={{ fontSize: 12, marginTop: 4 }}>{ficha.aviso}</div>
          </div>

          {ficha.pedidoAtual && (
            <div style={{ borderRadius: 8, padding: '10px 12px', fontWeight: 600,
              background: ficha.pedidoAtual.temOrcamento ? '#ecfdf3' : '#fffaeb',
              border: `1px solid ${ficha.pedidoAtual.temOrcamento ? '#abefc6' : '#fedf89'}`,
              color: ficha.pedidoAtual.temOrcamento ? '#067647' : '#b54708' }}>
              Pedido #{ficha.pedidoAtual.pedido}: {ficha.pedidoAtual.texto}
              {ficha.pedidoAtual.valor !== null ? ` (${brl(ficha.pedidoAtual.valor)})` : ''}
            </div>
          )}

          <section style={{ border: '1px solid #eaecf0', borderRadius: 8, padding: 12 }}>
            <b>Quanto costuma demorar a responder</b>
            <div style={{ marginTop: 4 }}>
              {ficha.tempoResposta.medianaDias !== null
                ? <>Em geral <b>{ficha.tempoResposta.medianaDias.toLocaleString('pt-BR')} dia(s)</b> <span className="text-600">(mediana de {ficha.tempoResposta.n} casos)</span></>
                : <span>{ficha.tempoResposta.texto}{ficha.tempoResposta.n ? <span className="text-600"> ({ficha.tempoResposta.n} caso(s))</span> : null}</span>}
            </div>
            <div className="text-600" style={{ fontSize: 12 }}>Contado {ficha.tempoResposta.fonte}.</div>
          </section>

          <section>
            <b>O que ele já cotou conosco</b>
            <span className="text-600"> — {ficha.cotacoesTotal} cotação(ões){ficha.cotacoesTotal > ficha.cotacoes.length ? `, mostrando as ${ficha.cotacoes.length} mais recentes` : ''}</span>
            {ficha.poucasCotacoes && <div className="text-600" style={{ fontSize: 13 }}>{ficha.poucasCotacoes}</div>}
            {ficha.cotacoes.length === 0 && <div className="text-600" style={{ marginTop: 6 }}>Nenhuma cotação registrada deste prestador.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {ficha.cotacoes.map((c) => (
                <div key={c.pedido} style={{ border: '1px solid #eaecf0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{c.valor !== null ? brl(c.valor) : 'valor não registrado'}</b>
                    <span className="text-600">{dataBR(c.data)} · pedido #{c.pedido}</span>
                    <span style={{ color: corDesfecho[c.desfecho], fontWeight: 600 }}>{c.desfechoRotulo}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.procedimento || 'procedimento não registrado'}</div>
                  <div className="text-600" style={{ fontSize: 12, marginTop: 2 }}>
                    {c.processo.existe && c.processo.menor !== null ? <>{brl(c.processo.menor)} · </> : null}{c.processo.texto}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
