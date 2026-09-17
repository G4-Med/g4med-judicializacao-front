import { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Password } from 'primereact/password';
import { Tag } from 'primereact/tag';
import { getLixeira, restaurarOrder } from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { colunaCnj, colunaSei, cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { ContadorRegistros } from '../../components/ContadorRegistros/ContadorRegistros';
import './LixeiraPage.css';

/**
 * LIXEIRA (@R 28/08): tudo que alguém excluiu, com quem/quando/de onde. Daqui o
 * pedido VOLTA ao fluxo — "voltar para uma fase específica" — assinado com a senha
 * de quem restaura e registrado no log. Não existe "esvaziar": por mandato, ninguém
 * apaga pedidos; a lixeira é memória, não descarte.
 */

const ROTULO_FASE: Record<string, string> = {
  '1_analise_juridica': '1. Análise Jurídica',
  '2_3_orcamento': '2/3. Selecionar Médico / Orçamento',
  '4_protocolar': '4. Protocolar',
  '5_protocolados': '5. Protocolados',
  '6_enviado_ses': '6. Enviado à SES sem protocolo',
  'perdas': 'Perdas',
  'ganhos': 'Ganhos (Aguardando Cirurgia)',
};

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export function LixeiraPage() {
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('lixeira');
  const [itens, setItens] = useState<any[]>([]);
  const [fases, setFases] = useState<{ chave: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [restaurando, setRestaurando] = useState<any | null>(null);
  const [fase, setFase] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () => {
    setLoading(true);
    getLixeira()
      .then(({ data }) => { setItens(data.itens ?? []); setFases(data.fases ?? []); })
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const opcoesFase = fases.map((f) => ({ label: ROTULO_FASE[f.chave] ?? f.status, value: f.status }));

  const abrirRestaurar = (r: any) => {
    setRestaurando(r); setFase(r.faseAnterior ?? null); setSenha(''); setErro(null);
  };

  const confirmar = async () => {
    if (!restaurando) return;
    if (!fase) { setErro('Escolha a fase para onde o pedido volta.'); return; }
    if (!senha) { setErro('Digite a sua senha para confirmar.'); return; }
    setEnviando(true); setErro(null);
    try {
      await restaurarOrder(restaurando.id, senha, fase);
      setRestaurando(null);
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível restaurar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="lixeira-page">
      <div className="page-header">
        <h1><i className="pi pi-trash" /> Lixeira</h1>
        <p style={{ opacity: 0.75, margin: 0 }}>
          Pedidos excluídos ficam aqui com quem excluiu, quando e de qual fase. Nada é apagado:
          restaure para a fase certa e o pedido volta ao fluxo. Toda exclusão e restauração fica no Log.
        </p>
      </div>
      {readOnly && <ReadOnlyBanner />}

      <ContadorRegistros total={itens.length} visiveis={itens.length} substantivo="pedidos na lixeira" />

      <DataTable value={itens} loading={loading} dataKey="id" paginator rows={10}
        rowsPerPageOptions={[10, 25, 50, 100]} emptyMessage="A lixeira está vazia."
        sortField="excluidoEm" sortOrder={-1} aria-label="Pedidos na lixeira">
        <Column field="id" header="#" sortable style={{ width: '5rem' }} />
        <Column field="paciente" header="Paciente" sortable style={{ minWidth: '14rem' }} />
        {colunaCnj()}
        {colunaSei()}
        <Column field="procedimento" header="Procedimento" style={{ minWidth: '14rem' }} />
        <Column field="faseAnterior" header={cabecalhoComHint('Saiu de', 'A fase em que o pedido estava quando foi excluído — é o destino sugerido ao restaurar')}
          sortable style={{ minWidth: '12rem' }}
          body={(r) => r.faseAnterior ? <Tag value={r.faseAnterior} severity="secondary" /> : '—'} />
        <Column field="excluidoPor" header="Excluído por" sortable style={{ minWidth: '9rem' }} />
        <Column field="excluidoEm" header="Quando" sortable style={{ minWidth: '10rem' }} body={(r) => fmt(r.excluidoEm)} />
        <Column field="motivoExclusao" header="Motivo" style={{ minWidth: '14rem' }} body={(r) => r.motivoExclusao || <span style={{ opacity: 0.5 }}>—</span>} />
        {!readOnly && (
          <Column header="Restaurar" style={{ width: '9rem' }} bodyStyle={{ textAlign: 'center' }}
            body={(r) => (
              <Button icon="pi pi-replay" label="Voltar" size="small" outlined onClick={() => abrirRestaurar(r)}
                tooltip="Recolocar no fluxo, na fase que você escolher (pede a sua senha)" />
            )} />
        )}
      </DataTable>

      <Dialog header={restaurando ? `Restaurar #${restaurando.id} — ${restaurando.paciente}` : ''}
        visible={!!restaurando} modal style={{ width: '32rem', maxWidth: '96vw' }}
        onHide={() => setRestaurando(null)}>
        {restaurando && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <label>
              <span style={{ display: 'block', marginBottom: 4 }}>Voltar para a fase</span>
              <Dropdown value={fase} options={opcoesFase} onChange={(e) => setFase(e.value)}
                placeholder="Escolha a fase" style={{ width: '100%' }} />
              <small style={{ opacity: 0.7 }}>Sugerido: a fase de onde saiu ({restaurando.faseAnterior ?? '—'}).</small>
            </label>
            <label>
              <span style={{ display: 'block', marginBottom: 4 }}>Sua senha <span style={{ color: '#ef4444' }}>*</span></span>
              <Password value={senha} onChange={(e) => setSenha(e.target.value)} feedback={false} toggleMask
                inputStyle={{ width: '100%' }} style={{ width: '100%' }}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} />
            </label>
            {erro && <small style={{ color: '#ef4444' }}>{erro}</small>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button label="Cancelar" outlined onClick={() => setRestaurando(null)} disabled={enviando} />
              <Button label="Restaurar" icon="pi pi-check" onClick={confirmar} loading={enviando} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
