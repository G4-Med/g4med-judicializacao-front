import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import {
  cancelarEmailPendente, salvarEdicaoEmailPendente, editarEmailPendenteComIA, enviarEmailDireto,
  getAnexosOrder, getEmailsPendentes, getFichaPedido,
} from '../../services/api/orders';
import './RevisarEmail.css';

/** #712 (@R 24/09 15:41): ⟦"eu revisar o email, ver o motivo da perda que foi gerado e porque, ver o conteúdo do email...
 *  editar ou modificar e poder construir ou editar com IA dizendo o que quero editar... fácil ver o histórico do pedido,
 *  o porquê e como corrigir para ficar 100% certo"⟧. Um modal só, usado na tela de E-mails pendentes e nas fases 1, 2 e 3.
 *  O texto mostrado e enviado é o GRAVADO no servidor (nada de reaplicar modelo na tela: o modelo antigo sobrescrevia o
 *  corpo e podia apagar o motivo específico da perda). A checagem, o porquê e o bloqueio vêm do servidor. */

type Estado = 'OK' | 'ATENCAO' | 'PROBLEMA';
export type ItemChecagem = { item: string; estado: Estado; texto: string; comoCorrigir?: string | null };
export type Porque = {
  tipo: 'PERDA' | 'EXAMES' | 'ORCAMENTO' | 'OUTRO'; motivo: string | null; categoria: string | null;
  justificativa: string | null; faseAntes: string | null; geradoEm: string | null; geradoPor: string | null;
};
export type EmailRevisao = {
  id: number; orderId: number; paciente: string; procedimento?: string; tipoEmail: string; status: string;
  destinatario: string; assunto: string; corpo?: string; faseExibida?: string | null;
  porque?: Porque | null; checagem?: ItemChecagem[]; podeEnviar?: boolean; bloqueio?: string | null;
};
type Trilha = { campo: string; de: string | null; para: string | null; por: string; em: string };

const ROTULO_TIPO: Record<string, string> = {
  DAR_PERDA: 'Perda', PEDIR_EXAMES: 'Pedido de exames', PEDIDO_EXAMES_PEDIATRICO: 'Pedido de exames (pediátrico)',
  ENVIAR_ORCAMENTO: 'Orçamento à SES',
};
const ROTULO_CAMPO: Record<string, string> = {
  statusProcesso: 'Fase', statusJuridico: 'Jurídico', statusOrcamento: 'Orçamento', statusPerda: 'Perda', resultado: 'Resultado',
};
const ICONE: Record<Estado, string> = { OK: 'pi-check-circle', ATENCAO: 'pi-exclamation-triangle', PROBLEMA: 'pi-times-circle' };
const quando = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const erroDe = (e: any, padrao: string) =>
  e?.response?.data?.erro ?? e?.response?.data?.error ?? e?.response?.data?.message ?? e?.response?.data?.bloqueio ?? padrao;

export function RevisarEmail({ emailId, onClose, onMudou }: { emailId: number | null; onClose: () => void; onMudou?: () => void }) {
  const [email, setEmail] = useState<EmailRevisao | null>(null);
  const [form, setForm] = useState({ destinatario: '', assunto: '', corpo: '' });
  const [trilha, setTrilha] = useState<Trilha[] | null>(null);   // null = ainda carregando (a ficha leva ~8 s)
  const [anexoOrcamento, setAnexoOrcamento] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [instrucao, setInstrucao] = useState('');
  const [proposta, setProposta] = useState<{ assunto: string; corpo: string; observacao?: string } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [forcar, setForcar] = useState(false);
  const [motivoForcar, setMotivoForcar] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState('');

  const aplicar = (e: EmailRevisao) => {
    setEmail(e);
    setForm({ destinatario: e.destinatario ?? '', assunto: e.assunto ?? '', corpo: e.corpo ?? '' });
  };

  useEffect(() => {
    if (!emailId) return;
    setEmail(null); setErro(null); setProposta(null); setInstrucao(''); setErroIA(null); setForcar(false);
    setMotivoForcar(''); setCancelando(false); setMotivoCancelar(''); setTrilha(null); setAnexoOrcamento(null);
    setCarregando(true);
    getEmailsPendentes({ id: emailId })
      .then(async (r) => {
        const lista = Array.isArray(r.data) ? r.data : (r.data?.results ?? r.data?.itens ?? []);
        const e: EmailRevisao | undefined = lista.find((x: EmailRevisao) => x.id === emailId) ?? lista[0];
        if (!e) { setErro('Este e-mail não está mais na fila (já saiu ou foi cancelado).'); return; }
        aplicar(e);
        getFichaPedido(e.orderId).then((f) => setTrilha(f.data?.trilha ?? [])).catch(() => setTrilha([]));
        if (e.tipoEmail === 'ENVIAR_ORCAMENTO') {
          getAnexosOrder(e.orderId, 'ORCAMENTO').then((a) => {
            const l = Array.isArray(a.data) ? a.data : (a.data?.results ?? []);
            setAnexoOrcamento(l.length ? l[l.length - 1].linkImagem : null);
          }).catch(() => setAnexoOrcamento(null));
        }
      })
      .catch((e) => setErro(erroDe(e, 'Não consegui abrir o e-mail.')))
      .finally(() => setCarregando(false));
  }, [emailId]);

  const mudou = !!email && (form.destinatario !== (email.destinatario ?? '') || form.assunto !== (email.assunto ?? '') || form.corpo !== (email.corpo ?? ''));
  const checagem = email?.checagem ?? [];
  const problemas = checagem.filter((c) => c.estado === 'PROBLEMA');
  const podeEnviar = email?.podeEnviar !== false && !problemas.length;
  const historico = useMemo(() => [...(trilha ?? [])].sort((a, b) => +new Date(b.em) - +new Date(a.em)).slice(0, 10), [trilha]);

  const salvar = async () => {
    if (!email) return;
    setSalvando(true);
    try {
      const r = await salvarEdicaoEmailPendente(email.id, form);
      aplicar(r.data?.id ? r.data : { ...email, ...form });
      onMudou?.();
    } catch (e) {
      window.alert(erroDe(e, 'Não consegui salvar a edição.'));
    } finally { setSalvando(false); }
  };

  const pedirIA = async () => {
    if (!email || instrucao.trim().length < 3) return;
    setPensando(true); setErroIA(null); setProposta(null);
    try {
      const r = await editarEmailPendenteComIA(email.id, instrucao.trim());
      setProposta({ assunto: r.data?.assunto ?? form.assunto, corpo: r.data?.corpo ?? form.corpo, observacao: r.data?.observacao });
    } catch (e) {
      setErroIA(erroDe(e, 'A IA não respondeu. Edite o texto à mão.'));
    } finally { setPensando(false); }
  };

  const enviar = async () => {
    if (!email) return;
    if (mudou && !window.confirm('Você mudou o texto e não salvou. Enviar assim mesmo (o texto da tela é o que sai)?')) return;
    if (!podeEnviar && (!forcar || motivoForcar.trim().length < 10)) return;
    setEnviando(true);
    try {
      const r = await enviarEmailDireto({
        emailPendenteId: email.id, destinatario: form.destinatario.trim(), assunto: form.assunto.trim(), corpo: form.corpo.trim(),
        ...(anexoOrcamento ? { anexoUrl: anexoOrcamento } : {}),
        ...(!podeEnviar ? { forcar: true, motivo: motivoForcar.trim(), confirmarContradicao: true } : {}),
      });
      if (!r?.data?.success) { window.alert('O servidor não confirmou o envio.'); return; }
      onMudou?.(); onClose();
    } catch (e) {
      window.alert(erroDe(e, 'Erro ao enviar o e-mail.'));
    } finally { setEnviando(false); }
  };

  const cancelar = async () => {
    if (!email || motivoCancelar.trim().length < 5) return;
    try {
      await cancelarEmailPendente(email.id, motivoCancelar.trim());
      onMudou?.(); onClose();
    } catch (e) {
      window.alert(erroDe(e, 'Não consegui cancelar.'));
    }
  };

  const p = email?.porque;
  return (
    <Dialog visible={!!emailId} onHide={onClose} className="revisar-email-dialog" style={{ width: 'min(1250px, 97vw)' }}
      header={email ? `${ROTULO_TIPO[email.tipoEmail] ?? email.tipoEmail} · pedido #${email.orderId} · ${email.paciente}` : 'E-mail a revisar'}>
      {carregando && <div className="revisar-email__vazio"><i className="pi pi-spin pi-spinner" /> Abrindo o e-mail…</div>}
      {erro && <div className="revisar-email__erro">{erro}</div>}
      {email && (
        <div className="revisar-email">
          <section className="revisar-email__texto">
            <h4>O e-mail {email.status === 'ERRO' && <span className="revisar-email__tag-erro">deu erro na última tentativa</span>}</h4>
            <label>Para</label>
            <InputText value={form.destinatario} onChange={(e) => setForm({ ...form, destinatario: e.target.value })} className="w-full" />
            <label>Assunto</label>
            <InputText value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} className="w-full" />
            <label>Texto</label>
            <InputTextarea value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })} rows={14} autoResize className="w-full revisar-email__corpo" />
            <div className="revisar-email__acoes-texto">
              <Button label={salvando ? 'Salvando…' : 'Salvar alterações'} icon="pi pi-save" size="small" disabled={!mudou || salvando} onClick={salvar}
                tooltip="Grava o texto no pedido e refaz a checagem (não envia)" />
              <Button label="Desfazer" icon="pi pi-undo" size="small" text disabled={!mudou} onClick={() => aplicar(email)} />
            </div>
            <div className="revisar-email__ia">
              <label><i className="pi pi-sparkles" /> Editar com IA — diga o que mudar</label>
              <div className="revisar-email__ia-linha">
                <InputText value={instrucao} onChange={(e) => setInstrucao(e.target.value)} className="w-full"
                  placeholder="Ex.: deixe mais curto, cite o laudo de 12/09 e peça a ressonância" onKeyDown={(e) => { if (e.key === 'Enter') pedirIA(); }} />
                <Button label={pensando ? 'Pensando…' : 'Gerar proposta'} size="small" disabled={pensando || instrucao.trim().length < 3} onClick={pedirIA} />
              </div>
              {erroIA && <div className="revisar-email__erro">{erroIA}</div>}
              {proposta && (
                <div className="revisar-email__proposta">
                  <div className="revisar-email__proposta-cab">Proposta da IA (ainda não mudou nada)</div>
                  {proposta.observacao && <div className="revisar-email__obs">{proposta.observacao}</div>}
                  <div><b>Assunto:</b> {proposta.assunto}</div>
                  <pre>{proposta.corpo}</pre>
                  <div className="revisar-email__acoes-texto">
                    <Button label="Usar esta versão" icon="pi pi-check" size="small"
                      onClick={() => { setForm({ ...form, assunto: proposta.assunto, corpo: proposta.corpo }); setProposta(null); }} />
                    <Button label="Descartar" size="small" text onClick={() => setProposta(null)} />
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="revisar-email__lado">
            <div className="revisar-email__bloco">
              <h4>Por que este e-mail existe</h4>
              {p ? (
                <dl>
                  {p.motivo && <><dt>Motivo</dt><dd>{p.motivo}</dd></>}
                  {p.categoria && <><dt>Categoria</dt><dd>{p.categoria}</dd></>}
                  {p.justificativa && <><dt>Justificativa</dt><dd className="revisar-email__just">{p.justificativa}</dd></>}
                  {p.faseAntes && <><dt>Estava em</dt><dd>{p.faseAntes}</dd></>}
                  <dt>Gerado</dt><dd>{quando(p.geradoEm)}{p.geradoPor ? ` por ${p.geradoPor}` : ''}</dd>
                  {!p.motivo && !p.justificativa && p.tipo === 'PERDA' && <dd className="revisar-email__aviso">Ninguém registrou por que a perda foi dada.</dd>}
                </dl>
              ) : <div className="revisar-email__vazio">O servidor ainda não informa o porquê deste e-mail.</div>}
              {email.faseExibida && <div className="revisar-email__fase">Onde o pedido está agora: <b>{email.faseExibida}</b></div>}
            </div>

            <div className="revisar-email__bloco">
              <h4>Checagem antes de enviar</h4>
              {checagem.length ? checagem.map((c, i) => (
                <div key={i} className={`revisar-email__check revisar-email__check--${c.estado.toLowerCase()}`}>
                  <i className={`pi ${ICONE[c.estado]}`} />
                  <div><b>{c.item}</b> — {c.texto}{c.comoCorrigir && <div className="revisar-email__como">Como corrigir: {c.comoCorrigir}</div>}</div>
                </div>
              )) : <div className="revisar-email__vazio">Sem checagem do servidor ainda.</div>}
            </div>

            <div className="revisar-email__bloco">
              <h4>Histórico do pedido</h4>
              {trilha === null ? <div className="revisar-email__vazio"><i className="pi pi-spin pi-spinner" /> Carregando o histórico…</div> : historico.length ? (
                <ul className="revisar-email__hist">
                  {historico.map((t, i) => (
                    <li key={i}><span>{quando(t.em)}</span> {ROTULO_CAMPO[t.campo] ?? t.campo}: {t.de ?? '—'} → <b>{t.para ?? '—'}</b> <em>({t.por})</em></li>
                  ))}
                </ul>
              ) : <div className="revisar-email__vazio">Sem mudanças registradas.</div>}
            </div>
          </aside>

          <footer className="revisar-email__rodape">
            {cancelando ? (
              <div className="revisar-email__cancelar">
                <InputText value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} placeholder="Por que não enviar este e-mail? (mín. 5 letras)" />
                <Button label="Confirmar cancelamento" severity="danger" size="small" disabled={motivoCancelar.trim().length < 5} onClick={cancelar} />
                <Button label="Voltar" size="small" text onClick={() => setCancelando(false)} />
              </div>
            ) : (
              <Button label="Cancelar este e-mail" icon="pi pi-times" size="small" severity="danger" text onClick={() => setCancelando(true)} />
            )}
            <div className="revisar-email__enviar">
              {!podeEnviar && (
                <div className="revisar-email__bloqueio">
                  <b>Não sai assim:</b> {email.bloqueio ?? problemas.map((c) => c.texto).join(' · ')}
                  <label className="revisar-email__forcar">
                    <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} /> Enviar mesmo assim
                  </label>
                  {forcar && <InputText value={motivoForcar} onChange={(e) => setMotivoForcar(e.target.value)} placeholder="Por quê? (mín. 10 letras — fica registrado)" />}
                </div>
              )}
              <Button label={enviando ? 'Enviando…' : 'Enviar'} icon="pi pi-send"
                disabled={enviando || !form.destinatario.trim() || !form.assunto.trim() || !form.corpo.trim() || (!podeEnviar && (!forcar || motivoForcar.trim().length < 10))}
                onClick={enviar} />
            </div>
          </footer>
        </div>
      )}
    </Dialog>
  );
}

export default RevisarEmail;
