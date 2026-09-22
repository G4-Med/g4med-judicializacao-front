import { useCallback, useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { useNavigate } from 'react-router-dom';
import {
  getAguardandoDocumentos, getPreviaPedirDocumento, postPedirDocumentoDeNovo, postMarcarDocumentoRecebido,
} from '../../services/api/integracoes';
import { ModalAnexosSES } from '../../components/AnexosSES/anexosSES';

/* AGUARDANDO DOCUMENTOS (#539, desenho aprovado pelo @R em 21/09/2026 ~21:40).
   Duas listas: "Não chegou" (pedimos o documento e ainda não veio) e "Chegou" (pedimos e veio, últimos
   30 dias). Perda ou ganho fecham o pedido — ele sai daqui sozinho (regra do servidor).
   "Pedir de novo" NÃO envia: mostra a prévia e cria o e-mail pendente, que sai pela aba Respostas. */

type Aba = 'nao_chegou' | 'chegou';
interface Linha {
  orderId: number; paciente: string | null; procedimento: string | null; statusProcesso: string;
  emailSolicitante: string | null; criadoEm: string | null; diasEsperando: number | null;
  pedidoDocumentoEm: string | null; pedidosDocumentoEnviados: number; pedidoNuncaSaiu: boolean;
  emailsNovos: number; ultimoEmailEm: string | null;
}

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function AguardandoDocumentos() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>('nao_chegou');
  const [itens, setItens] = useState<Linha[]>([]);
  const [contagem, setContagem] = useState<{ naoChegou: number; chegou: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [conversa, setConversa] = useState<Linha | null>(null);
  const [pedir, setPedir] = useState<{ linha: Linha; previa: any | null; erro: string | null } | null>(null);
  const [recebido, setRecebido] = useState<Linha | null>(null);
  const [como, setComo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    setFalhou(false);
    getAguardandoDocumentos(aba)
      .then(({ data: d }) => { setItens(d.itens || []); setContagem(d.contagem); })
      .catch(() => setFalhou(true))
      .finally(() => setCarregando(false));
  }, [aba]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirPedir = (linha: Linha) => {
    setPedir({ linha, previa: null, erro: null });
    getPreviaPedirDocumento(linha.orderId)
      .then(({ data: d }) => setPedir({ linha, previa: d, erro: null }))
      .catch((e) => setPedir({ linha, previa: null, erro: e?.response?.data?.error || 'Não consegui montar a prévia agora.' }));
  };

  const acoes = (l: Linha) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button label="Ver conversa" icon="pi pi-comments" size="small" outlined onClick={() => setConversa(l)} />
      {aba === 'nao_chegou' && <>
        <Button label="Pedir de novo" icon="pi pi-refresh" size="small" outlined onClick={() => abrirPedir(l)} />
        <Button label="Marcar recebido" icon="pi pi-check" size="small" outlined onClick={() => { setComo(''); setRecebido(l); }} />
        <Button label="Dar perda" icon="pi pi-times" size="small" outlined severity="danger"
          title="Abre o pedido na Base de Processos, onde a perda é registrada com o e-mail à SES"
          onClick={() => navigate(`/base-processos?paciente=${encodeURIComponent(l.paciente || '')}`)} />
      </>}
    </div>
  );

  return (
    <div>
      <p className="ce-sub" style={{ marginTop: 0 }}>
        Pedidos que chegaram sem documento. Perda ou ganho fecham o pedido e ele sai desta lista sozinho.
        O lembrete automático sai uma vez, 3 dias úteis depois do pedido de documento.
      </p>
      <SelectButton value={aba} onChange={(e) => e.value && setAba(e.value)} allowEmpty={false}
        options={[
          { label: `Não chegou${contagem ? ` (${contagem.naoChegou})` : ''}`, value: 'nao_chegou' },
          { label: `Chegou — 30 dias${contagem ? ` (${contagem.chegou})` : ''}`, value: 'chegou' },
        ]} style={{ marginBottom: 12 }} />
      {falhou
        ? <div className="ce-sub" style={{ color: '#b42318' }}>Não consegui carregar a lista agora. Tente de novo em instantes.</div>
        : (
          <DataTable value={itens} loading={carregando} size="small" stripedRows dataKey="orderId"
            emptyMessage={aba === 'nao_chegou' ? 'Nenhum pedido esperando documento.' : 'Nenhum documento chegou nos últimos 30 dias.'}>
            <Column field="orderId" header="Pedido" body={(l: Linha) => `#${l.orderId}`} style={{ width: '6rem' }} />
            <Column field="paciente" header="Paciente" className="col-paciente-upper" style={{ minWidth: '12rem' }} />
            <Column field="statusProcesso" header="Fase" style={{ minWidth: '10rem' }} />
            {aba === 'nao_chegou'
              ? <Column header="Pedimos o documento" style={{ minWidth: '13rem' }} body={(l: Linha) => l.pedidoNuncaSaiu
                  ? <Tag severity="warning" value="o pedido de documento nunca saiu"
                      title="Acontece no segredo de justiça: o e-mail de recebimento de segredo substitui o de 'falta documento'. Use 'Pedir de novo' se precisar." />
                  : <span>{data(l.pedidoDocumentoEm)}{l.pedidosDocumentoEnviados > 1 ? ` · ${l.pedidosDocumentoEnviados} envios` : ''}</span>} />
              : <Column header="Chegou em" body={(l: Linha) => data(l.ultimoEmailEm)} style={{ width: '9rem' }} />}
            {aba === 'nao_chegou' && <Column header="Esperando" body={(l: Linha) => l.diasEsperando == null ? '—' : `${l.diasEsperando} dia(s)`} style={{ width: '8rem' }} />}
            <Column header="Ações" body={acoes} style={{ minWidth: '22rem' }} />
          </DataTable>
        )}

      {conversa && <ModalAnexosSES orderId={conversa.orderId} paciente={conversa.paciente || undefined} aberto fechar={() => setConversa(null)} />}

      <Dialog header={pedir ? `Pedir o documento de novo — pedido #${pedir.linha.orderId}` : ''} visible={!!pedir} modal
        style={{ width: '44rem', maxWidth: '96vw' }} onHide={() => setPedir(null)}>
        {pedir?.erro && <div style={{ color: '#b42318' }}>{pedir.erro}</div>}
        {pedir && !pedir.erro && !pedir.previa && <div className="ce-sub">Montando a prévia…</div>}
        {pedir?.previa && <>
          {pedir.previa.destinatarioOk
            ? <div><span className="ce-sub">Para:</span> {pedir.previa.para}</div>
            : <div style={{ color: '#b42318', fontWeight: 600 }}>O e-mail do solicitante está vazio ou inválido — corrija na Ficha do Pedido antes.</div>}
          <div><span className="ce-sub">Assunto:</span> {pedir.previa.assunto}</div>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #e3eaef', borderRadius: 6, padding: '8px 10px', margin: '8px 0', maxHeight: '40vh', overflow: 'auto' }}>
            {pedir.previa.corpo}
          </div>
          <div className="ce-sub">O e-mail fica pendente na aba Respostas — ele só sai quando alguém enviar de lá.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button label="Cancelar" outlined onClick={() => setPedir(null)} />
            <Button label="Criar e-mail pendente" icon="pi pi-check" loading={salvando} disabled={salvando || !pedir.previa.destinatarioOk}
              onClick={async () => {
                setSalvando(true);
                try {
                  await postPedirDocumentoDeNovo(pedir.linha.orderId);
                  setPedir(null);
                  alert('E-mail criado como pendente. Confira e envie pela aba Respostas.');
                } catch (e: any) { alert(e?.response?.data?.error || 'Não foi possível criar o e-mail.'); }
                finally { setSalvando(false); }
              }} />
          </div>
        </>}
      </Dialog>

      <Dialog header={recebido ? `Documento recebido — pedido #${recebido.orderId}` : ''} visible={!!recebido} modal
        style={{ width: '36rem', maxWidth: '96vw' }} onHide={() => setRecebido(null)}>
        <p className="ce-sub" style={{ marginTop: 0 }}>Use quando o documento chegou por fora do e-mail (WhatsApp, em mãos). Fica registrado quem marcou e como chegou.</p>
        <label htmlFor="como-chegou">Como o documento chegou? <span style={{ color: '#ef4444' }}>*</span></label>
        <InputTextarea id="como-chegou" value={como} onChange={(e) => setComo(e.target.value)} rows={3} autoResize style={{ width: '100%', marginTop: 6 }}
          placeholder="Ex.: o hospital mandou o laudo pelo WhatsApp em 21/09" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button label="Cancelar" outlined onClick={() => setRecebido(null)} />
          <Button label="Marcar recebido" icon="pi pi-check" loading={salvando} disabled={salvando || como.trim().length < 10}
            onClick={async () => {
              if (!recebido) return;
              setSalvando(true);
              try {
                await postMarcarDocumentoRecebido(recebido.orderId, como.trim());
                setRecebido(null);
                carregar();
              } catch (e: any) { alert(e?.response?.data?.error || 'Não foi possível marcar.'); }
              finally { setSalvando(false); }
            }} />
        </div>
      </Dialog>
    </div>
  );
}
