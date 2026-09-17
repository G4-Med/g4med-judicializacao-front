import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { getLogAuditoria, reverterHistorico } from '../../services/api/orders';
import './LogsPage.css';

// Log de auditoria (task #198, 26/08) — lê OrderStatusHistorico, o rastro que o sistema já
// grava sozinho desde 22/08 pra toda mudança de status. Não inventa dado novo, só mostra e
// deixa reverter — sempre com confirmação explícita, nunca automático.

interface LinhaLog {
  id: number;
  orderId: number;
  paciente: string | null;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  usuario: string | null;
  origem: string;
  createDate: string;
}

const CAMPOS = [
  { label: 'Todos os campos', value: '' },
  { label: 'Status do Processo', value: 'statusProcesso' },
  { label: 'Status Jurídico', value: 'statusJuridico' },
  { label: 'Status do Orçamento', value: 'statusOrcamento' },
  { label: 'Status da Perda', value: 'statusPerda' },
];

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function LogsPage() {
  const [itens, setItens] = useState<LinhaLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [campo, setCampo] = useState('');
  const [orderId, setOrderId] = useState('');
  const [revertendoId, setRevertendoId] = useState<number | null>(null);

  const carregar = () => {
    setLoading(true);
    setErro(null);
    const filtros: Record<string, string> = {};
    if (campo) filtros.campo = campo;
    if (orderId.trim()) filtros.orderId = orderId.trim();
    getLogAuditoria(filtros)
      .then(({ data }) => {
        setItens(data.itens ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => setErro('Não foi possível carregar o log de auditoria.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reverter = async (linha: LinhaLog) => {
    const confirmado = window.confirm(
      `Reverter #${linha.orderId} (${linha.paciente ?? 'sem paciente'})?\n\n` +
      `${linha.campo}: "${linha.valorNovo ?? '—'}" volta para "${linha.valorAnterior ?? '—'}".\n\n` +
      `Isso muda o pedido de verdade — fica registrado no próprio log quem reverteu.`
    );
    if (!confirmado) return;

    setRevertendoId(linha.id);
    try {
      await reverterHistorico(linha.id);
      carregar();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Não foi possível reverter esta mudança.');
    } finally {
      setRevertendoId(null);
    }
  };

  return (
    <div className="logs-page">
      <div className="logs-head">
        <div>
          <h1>Log de Auditoria</h1>
          <p>Todo campo de status já é rastreado automaticamente — quem mudou, quando, de onde veio.</p>
        </div>
      </div>

      <div className="logs-filtros">
        <Dropdown
          value={campo}
          options={CAMPOS}
          onChange={(e) => setCampo(e.value)}
          placeholder="Filtrar por campo"
          className="logs-filtro-campo"
        />
        <InputText
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Nº do pedido"
          className="logs-filtro-order"
        />
        <Button label="Buscar" icon="pi pi-search" onClick={carregar} />
      </div>

      {loading && <div className="logs-vazio">Carregando...</div>}
      {!loading && erro && <div className="logs-vazio logs-vazio--erro">{erro}</div>}
      {!loading && !erro && itens.length === 0 && (
        <div className="logs-vazio">Nenhum registro encontrado com esses filtros.</div>
      )}

      {!loading && !erro && itens.length > 0 && (
        <>
          <p className="logs-total">{total} registro(s) — mostrando os mais recentes.</p>
          <div className="logs-lista">
            {itens.map((linha) => (
              <div key={linha.id} className="logs-item">
                <div className="logs-item__topo">
                  <strong>Pedido #{linha.orderId}</strong>
                  <span>{linha.paciente ?? 'sem paciente'}</span>
                  <Tag value={linha.campo} severity="info" className="logs-tag-campo" />
                  <span className="logs-item__data">{formatarData(linha.createDate)}</span>
                </div>
                <div className="logs-item__mudanca">
                  <span className="logs-valor logs-valor--antes">{linha.valorAnterior ?? '—'}</span>
                  <i className="pi pi-arrow-right" />
                  <span className="logs-valor logs-valor--depois">{linha.valorNovo ?? '—'}</span>
                </div>
                <div className="logs-item__rodape">
                  <span>{linha.usuario ?? 'sistema'} · origem: {linha.origem}</span>
                  <Button
                    label={revertendoId === linha.id ? 'Revertendo...' : 'Reverter'}
                    icon="pi pi-undo"
                    outlined
                    size="small"
                    severity="warning"
                    disabled={revertendoId !== null}
                    loading={revertendoId === linha.id}
                    onClick={() => reverter(linha)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
