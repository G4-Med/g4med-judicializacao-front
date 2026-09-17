import { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { colunaCnj } from '../ColunasIdentificacao/colunasIdentificacao';
import type { LinhaIdentificada } from '../ColunasIdentificacao/colunasIdentificacao';
import { getCnjAConfirmar } from '../../services/api/orders';
import './CardCnjAConfirmar.css';

/**
 * A fila de "alguém precisa escolher o número do processo".
 *
 * POR QUE ESTE CARD EXISTE (furo medido em 17/09/2026):
 *   A busca automática gravou 163 sugestões em 69 pedidos — e 65 deles estão em
 *   `Histórico - Sem Rastro`, uma fase que NENHUMA tela lista (a HomePage só usa esse
 *   status para excluir do denominador). Sugestões corretas, gravadas, e invisíveis:
 *   produtor sem consumidor. A decisão morria no banco, que é exatamente o que o seletor
 *   de CNJ existe para impedir.
 *
 *   A FASE É O QUE ESCONDE — por isso esta lista não filtra por ela. Quem decide o que
 *   fazer com um pedido antigo é a pessoa, não o status dele.
 *
 * Só aparece quando há o que decidir: zero itens = card ausente, ¬card vazio dizendo nada.
 */
interface Linha extends LinhaIdentificada {
  id: number;
  paciente?: string | null;
  procedimento?: string | null;
  statusProcesso?: string | null;
  dataPedido?: string | null;
}

export function CardCnjAConfirmar() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  async function carregar() {
    try {
      const { data } = await getCnjAConfirmar();
      setLinhas(data?.itens || []);
    } catch {
      // fail-soft: a fila é um EXTRA da tela do jurídico — se ela falhar, a tela
      // principal continua. Mas o card some, ¬mostra lista vazia (que leria como
      // "não há nada a decidir", e isso seria mentira).
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  if (carregando || linhas.length === 0) return null;

  return (
    <div className="card cnj-confirmar-card">
      <button type="button" className="cnj-confirmar-cabecalho" onClick={() => setAberto(!aberto)}>
        <span className="cnj-confirmar-titulo">
          Nº de processo a confirmar
          <Tag value={String(linhas.length)} severity="warning" className="cnj-confirmar-tag" />
        </span>
        <span className="cnj-confirmar-sub">
          A busca encontrou processos para estes pedidos, mas o sistema não escolhe —
          quem confirma qual é o certo é você. {aberto ? 'Recolher' : 'Abrir'}
        </span>
      </button>

      {aberto && (
        <DataTable value={linhas} paginator rows={10} className="cnj-confirmar-tabela"
          emptyMessage="Nada a confirmar." dataKey="id">
          <Column field="paciente" header="Paciente" style={{ minWidth: '14rem' }} />
          <Column field="statusProcesso" header="Fase" style={{ minWidth: '11rem' }}
            body={(r: Linha) => <small className="cnj-confirmar-fase">{r.statusProcesso}</small>} />
          <Column field="procedimento" header="Procedimento" style={{ minWidth: '16rem' }}
            body={(r: Linha) => <small>{(r.procedimento || '').slice(0, 70)}</small>} />
          {/* a MESMA coluna das outras telas: o seletor já existe e já grava. */}
          {colunaCnj('16rem', () => carregar())}
        </DataTable>
      )}
    </div>
  );
}
