/**
 * Cadastro MANUAL de pedido (@R 29/08 13:24): "tela para a Valéria ou nós cadastrarmos um pedido à mão
 * já com os campos necessários e sabermos que é um cadastro manual". Usa o endpoint que o Yago criou
 * (pedidos/criar-manual/); o backend converte na hora e o pedido aparece na Análise Jurídica com selo
 * "Manual". Nenhuma resposta automática sai (não houve e-mail de origem).
 */
import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { criarPedidoManual } from '../../services/api/integracoes';
import './novoPedidoManual.css';

const hoje = () => new Date().toISOString().slice(0, 10);
const brData = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

export function NovoPedidoManual({ aoCriar }: { aoCriar?: (orderId: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ paciente: '', dataNascimento: '', procedimento: '', area: '', nomeSolicitante: '', emailSolicitante: '', dataPedido: hoje(), nprocesso: '', numeroSei: '', observacoes: '' });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const obrig = f.paciente.trim() && f.procedimento.trim() && f.dataPedido;

  const salvar = async () => {
    setErro(null); setEnviando(true);
    try {
      const r = await criarPedidoManual({
        paciente: f.paciente.trim().toUpperCase(),
        dataNascimento: brData(f.dataNascimento),
        procedimento: f.procedimento.trim(),
        area: f.area.trim() || null,
        dataPedido: `${brData(f.dataPedido)} 00:00`,
        emailSolicitante: f.emailSolicitante.trim() || null,
        nprocesso: f.nprocesso.trim() || null,
        numeroSei: f.numeroSei.trim() || null,
        observacoes: f.observacoes.trim() || null,
        email: { remetente: f.nomeSolicitante.trim() ? `${f.nomeSolicitante.trim()} <${f.emailSolicitante.trim()}>` : f.emailSolicitante.trim(), origem: 'manual' },
      });
      setAberto(false);
      setF({ ...f, paciente: '', dataNascimento: '', procedimento: '', nprocesso: '', numeroSei: '', observacoes: '' });
      aoCriar?.(r.data?.orderId);
    } catch (e: any) {
      setErro(e?.response?.data?.detail || e?.response?.data?.error || 'Não foi possível cadastrar. Confira os campos e tente de novo.');
    } finally { setEnviando(false); }
  };

  return (
    <>
      <Button label="Novo pedido" icon="pi pi-plus" onClick={() => setAberto(true)}
        tooltip="Cadastrar um pedido à mão (fica marcado como Manual)" tooltipOptions={{ position: 'bottom' }} />
      <Dialog header="Novo pedido — cadastro manual" visible={aberto} onHide={() => setAberto(false)} style={{ width: '46rem', maxWidth: '96vw' }}>
        <p className="npm-intro">Use quando o pedido chegou por outro caminho (telefone, WhatsApp, ofício em mãos). Ele entra na <b>Análise Jurídica</b> com o selo <b>Manual</b> e <b>nenhuma resposta automática</b> é enviada.</p>
        <div className="npm-grid">
          <label className="npm-c2">Paciente <b>*</b><InputText value={f.paciente} onChange={set('paciente')} placeholder="NOME COMPLETO" autoFocus /></label>
          <label>Data de nascimento<InputText type="date" value={f.dataNascimento} onChange={set('dataNascimento')} /></label>
          <label>Data do pedido <b>*</b><InputText type="date" value={f.dataPedido} onChange={set('dataPedido')} /></label>
          <label className="npm-c2">Procedimento <b>*</b><InputText value={f.procedimento} onChange={set('procedimento')} placeholder="Ex.: ARTROPLASTIA TOTAL DE JOELHO" /></label>
          <label>Área / especialidade<InputText value={f.area} onChange={set('area')} placeholder="Ortopedia" /></label>
          <label>Nome do solicitante<InputText value={f.nomeSolicitante} onChange={set('nomeSolicitante')} placeholder="Cleide Ferreira" /></label>
          <label className="npm-c2">E-mail do solicitante<InputText value={f.emailSolicitante} onChange={set('emailSolicitante')} placeholder="nome@saude.mg.gov.br" /></label>
          <label>Nº CNJ (se houver)<InputText value={f.nprocesso} onChange={set('nprocesso')} placeholder="0000000-00.0000.0.00.0000" /></label>
          <label>Nº SEI (se houver)<InputText value={f.numeroSei} onChange={set('numeroSei')} placeholder="1080.01.0000000/2026-00" /></label>
          <label className="npm-c2">Observações<InputTextarea value={f.observacoes} onChange={set('observacoes')} rows={3} autoResize placeholder="Como chegou, quem pediu, urgência…" /></label>
        </div>
        {erro && <small className="npm-erro">{erro}</small>}
        <div className="npm-rodape">
          <Button label="Cancelar" outlined onClick={() => setAberto(false)} disabled={enviando} />
          <Button label="Cadastrar pedido" icon="pi pi-check" onClick={salvar} loading={enviando} disabled={!obrig} />
        </div>
      </Dialog>
    </>
  );
}
