import { useState } from 'react';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Password } from 'primereact/password';
import { InputTextarea } from 'primereact/inputtextarea';
import { excluirOrder } from '../../services/api/orders';

/**
 * Excluir = mandar para a LIXEIRA (@R 28/08 11:1x: "vamos deixar cada um deletar o
 * registro e para deletar e mover para lixeira ele precisa digitar a senha dele, e
 * registramos no log, mas da lixeira ninguém esvazia pedidos").
 *
 * Por que senha e não confirm(): excluir é um ato ASSINADO — a senha prova que foi
 * a pessoa, não um clique perdido, e o backend grava quem/quando no log. Nada é
 * apagado: o pedido sai de todas as telas e KPIs e pode voltar pela tela Lixeira
 * para a fase que o usuário escolher. O nome do arquivo ficou (colunaExcluirAdmin)
 * para não quebrar as 9 telas que importam — o Admin-only morreu no mesmo dia.
 */
function DialogoExcluir({ linha, onFechar, onFeito }: { linha: any; onFechar: () => void; onFeito?: () => void }) {
  const [senha, setSenha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (!senha) { setErro('Digite a sua senha para confirmar.'); return; }
    setEnviando(true); setErro(null);
    try {
      await excluirOrder(linha.id, senha, motivo || undefined);
      onFechar();
      onFeito?.();
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível excluir.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog header={`Mover para a lixeira — #${linha.id} ${linha.paciente ?? ''}`} visible modal
      style={{ width: '32rem', maxWidth: '96vw' }} onHide={onFechar}>
      <p style={{ marginTop: 0 }}>
        O pedido some de todas as telas e dos indicadores, mas <strong>nada é apagado</strong>:
        ele fica na <strong>Lixeira</strong> com seu nome, a data e a fase de onde saiu, e pode
        voltar ao fluxo por lá. A ação fica registrada no log.
      </p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <label>
          <span style={{ display: 'block', marginBottom: 4 }}>Motivo (opcional)</span>
          <InputTextarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
            placeholder="Ex.: pedido duplicado, lançado no paciente errado…" style={{ width: '100%' }} />
        </label>
        <label>
          <span style={{ display: 'block', marginBottom: 4 }}>Sua senha <span style={{ color: '#ef4444' }}>*</span></span>
          <Password value={senha} onChange={(e) => setSenha(e.target.value)} feedback={false} toggleMask
            inputStyle={{ width: '100%' }} style={{ width: '100%' }} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} />
        </label>
        {erro && <small style={{ color: '#ef4444' }}>{erro}</small>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <Button label="Cancelar" outlined onClick={onFechar} disabled={enviando} />
        <Button label="Mover para a lixeira" icon="pi pi-trash" severity="danger"
          onClick={confirmar} loading={enviando} />
      </div>
    </Dialog>
  );
}

export function BotaoExcluir({ linha, aoExcluir }: { linha: any; aoExcluir?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button icon="pi pi-trash" severity="danger" outlined size="small"
        onClick={() => setAberto(true)}
        tooltip="Mover para a lixeira (pede a sua senha; reversível)"
        aria-label={`Mover pedido ${linha.id} para a lixeira`} />
      {aberto && <DialogoExcluir linha={linha} onFechar={() => setAberto(false)} onFeito={aoExcluir} />}
    </>
  );
}

export function colunaExcluirAdmin(aoExcluir?: () => void) {
  return (
    <Column key="col-excluir-admin" header="Excluir" style={{ width: '5.5rem' }}
      bodyStyle={{ textAlign: 'center' }}
      body={(r: any) => <BotaoExcluir linha={r} aoExcluir={aoExcluir} />} />
  );
}
