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

// Rótulos dos campos conhecidos; qualquer campo novo que o log registrar aparece pelo nome
// cru (a lista vem do servidor — `campos` — não é fixa aqui).
const ROTULO_CAMPO: Record<string, string> = {
  statusProcesso: 'Status do Processo',
  statusJuridico: 'Status Jurídico',
  statusOrcamento: 'Status do Orçamento',
  statusPerda: 'Status da Perda',
  cotacao: 'Resposta da cotação',
  idMedico: 'Médico do pedido',
};

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
  // @R 20/09: auditoria por NOME do paciente — quem procura "o que aconteceu com fulano"
  // não sabe o número do pedido. Também usuário e período, que o servidor já filtrava.
  const [paciente, setPaciente] = useState('');
  const [usuario, setUsuario] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [camposServidor, setCamposServidor] = useState<string[]>([]);
  const [revertendoId, setRevertendoId] = useState<number | null>(null);

  const carregar = () => {
    setLoading(true);
    setErro(null);
    const filtros: Record<string, string> = {};
    if (campo) filtros.campo = campo;
    if (orderId.trim()) filtros.orderId = orderId.trim();
    if (paciente.trim()) filtros.paciente = paciente.trim();
    if (usuario.trim()) filtros.usuario = usuario.trim();
    if (dataInicio) filtros.dataInicio = dataInicio;
    if (dataFim) filtros.dataFim = dataFim;
    getLogAuditoria(filtros)
      .then(({ data }) => {
        setItens(data.itens ?? []);
        setTotal(data.total ?? 0);
        if (Array.isArray(data.campos)) setCamposServidor(data.campos);
      })
      .catch(() => setErro('Não foi possível carregar o log de auditoria.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const CAMPOS = [
    { label: 'Todos os campos', value: '' },
    ...camposServidor.map((c) => ({ label: ROTULO_CAMPO[c] ?? c, value: c })),
  ];

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
          <p>Auditoria de cada edição: quem mudou, o quê, quando e de onde veio. Busque pelo nome do paciente para ver tudo que aconteceu com ele.</p>
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
          value={paciente}
          onChange={(e) => setPaciente(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }}
          placeholder="Nome do paciente"
          className="logs-filtro-paciente"
          autoFocus
        />
        <InputText
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }}
          placeholder="Nº do pedido"
          className="logs-filtro-order"
        />
        <InputText
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }}
          placeholder="Quem editou (usuário)"
          className="logs-filtro-usuario"
        />
        <InputText type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} title="De" />
        <InputText type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} title="Até" />
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
