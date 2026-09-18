import { useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { enviarEmailAvulso, redigirEmailComIA } from '../../services/api/orders';
import './EscreverEmail.css';

/**
 * ESCREVER AO SOLICITANTE, EM QUALQUER FASE (@R 17/09/2026).
 *
 * ⟦"mandarmos um e-mail em qualquer fase para o solicitante, em ações em cada parte do
 * pedido, com IA para nos ajudar a digitar e com a opção de anexar informações"⟧.
 *
 * POR QUE EXISTE: os e-mails do sistema são automáticos — cada um nasce de um evento do
 * fluxo. Quando a realidade sai do roteiro (um erro a corrigir, uma pergunta, um aviso
 * fora de hora), não havia caminho: ou se escrevia por fora e o pedido ficava sem rastro
 * do que foi dito, ou não se escrevia.
 *
 * O RASCUNHO DA IA NÃO É O E-MAIL. Ela devolve um texto no campo; quem lê, corrige e
 * decide enviar é a pessoa. Escrever para um órgão público, em nome da empresa, sobre um
 * processo judicial é responsabilidade humana — e o ganho real aqui (poupar a digitação)
 * não exige abrir mão disso.
 *
 * "NA FILA" É O PADRÃO, "ENVIAR AGORA" É A EXCEÇÃO: na fila, o e-mail aparece na Central
 * junto dos automáticos e pode ser cancelado antes de sair — a mesma janela de conserto
 * que existe para os outros. Enviar na hora existe porque retificação costuma ser
 * urgente, mas abre mão dessa janela, e o botão diz isso.
 */
export function EscreverEmail({
  orderId,
  destinatarioPadrao,
  aoEnviar,
}: {
  orderId: number;
  destinatarioPadrao?: string | null;
  aoEnviar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [destinatario, setDestinatario] = useState(destinatarioPadrao ?? '');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [intencao, setIntencao] = useState('');
  const [redigindo, setRedigindo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const abrir = () => {
    setDestinatario(destinatarioPadrao ?? '');
    setAssunto(''); setCorpo(''); setIntencao('');
    setAberto(true);
  };

  const pedirRascunho = async () => {
    if (!intencao.trim()) return;
    setRedigindo(true);
    try {
      const r = await redigirEmailComIA(orderId, intencao);
      setAssunto(r.data.assunto);
      setCorpo(r.data.corpo);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não consegui redigir agora. Escreva à mão — o envio funciona igual.');
    } finally {
      setRedigindo(false);
    }
  };

  const enviar = async (agora: boolean) => {
    if (!assunto.trim() || !corpo.trim()) { alert('Preencha assunto e mensagem.'); return; }
    if (agora && !window.confirm(
      `Enviar AGORA para ${destinatario}?\n\nNão dá para cancelar depois — na fila, dá.`)) return;
    setEnviando(true);
    try {
      const r = await enviarEmailAvulso(orderId, {
        destinatario: destinatario.trim() || undefined,
        assunto: assunto.trim(), corpo: corpo.trim(), enviarAgora: agora,
      });
      alert(r.data?.mensagem ?? (agora ? 'E-mail enviado.' : 'E-mail montado e na fila.'));
      setAberto(false);
      aoEnviar?.();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Não foi possível registrar este e-mail.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button label="Escrever e-mail" icon="pi pi-pencil" size="small" outlined onClick={abrir} />

      <Dialog header="Escrever ao solicitante" visible={aberto} modal
        style={{ width: '46rem', maxWidth: '96vw' }} onHide={() => setAberto(false)}>
        <div className="esc-email">
          <label>Para</label>
          <InputText value={destinatario} onChange={(e) => setDestinatario(e.target.value)}
            placeholder="e-mail do solicitante" />

          <label>O que você quer dizer? <small>(a IA escreve o texto formal a partir disto)</small></label>
          <div className="esc-email__ia">
            <InputText value={intencao} onChange={(e) => setIntencao(e.target.value)}
              placeholder='ex.: avisar que o orçamento anterior tinha valor errado e que o correto segue' />
            <Button label="Redigir" icon="pi pi-sparkles" onClick={pedirRascunho}
              loading={redigindo} disabled={!intencao.trim()} outlined />
          </div>
          <small className="esc-email__aviso">
            A IA usa só os dados deste pedido e não promete prazo nem valor. Leia e corrija
            antes de enviar — o e-mail sai em nome da G4MED.
          </small>

          <label>Assunto</label>
          <InputText value={assunto} onChange={(e) => setAssunto(e.target.value)} />

          <label>Mensagem</label>
          <InputTextarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={10} autoResize />
        </div>

        <div className="esc-email__acoes">
          <Button label="Cancelar" text onClick={() => setAberto(false)} disabled={enviando} />
          <Button label="Enviar agora" icon="pi pi-send" severity="warning" outlined
            onClick={() => enviar(true)} loading={enviando}
            tooltip="Dispara na hora — sem janela para cancelar" />
          <Button label="Pôr na fila" icon="pi pi-inbox" onClick={() => enviar(false)} loading={enviando} />
        </div>
      </Dialog>
    </>
  );
}
