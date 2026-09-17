import { useEffect, useMemo, useState } from 'react';
import { getNotificacoesHistorico } from '../../services/api/orders';
import './NotificacoesHistoricoPage.css';

// Central de Notificações — histórico (task #189, 26/08): "o que eu já recebi",
// com detalhe de cada uma. O sino no Header é AO VIVO (recalcula na hora); esta
// tela lê o rastro persistido em NotificacaoEvento (backend), já filtrado pelo
// mesmo escopo de usuário que o resto do sistema usa.

interface NotificacaoItem {
  id: number;
  tipo: 'AGUARDANDO_JURIDICO' | 'SLA_ESTOURADO';
  tipoLabel: string;
  fase: string;
  detalhe: string;
  orderId: number;
  paciente: string | null;
  nprocesso: string | null;
  createDate: string;
}

const TIPO_ICONE: Record<string, string> = {
  AGUARDANDO_JURIDICO: 'pi pi-briefcase',
  SLA_ESTOURADO: 'pi pi-exclamation-triangle',
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

export function NotificacoesHistoricoPage() {
  const [itens, setItens] = useState<NotificacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'TODAS' | 'AGUARDANDO_JURIDICO' | 'SLA_ESTOURADO'>('TODAS');

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    getNotificacoesHistorico()
      .then(({ data }) => {
        if (ativo) setItens(data.itens ?? []);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar o histórico de notificações.');
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const itensFiltrados = useMemo(
    () => (filtroTipo === 'TODAS' ? itens : itens.filter((i) => i.tipo === filtroTipo)),
    [itens, filtroTipo],
  );

  return (
    <div className="nh-page">
      <div className="nh-head">
        <div>
          <h1>Central de Notificações</h1>
          <p>Todas as notificações que já apareceram pra você, com o detalhe de cada uma.</p>
        </div>
        <div className="nh-filtros">
          {(['TODAS', 'AGUARDANDO_JURIDICO', 'SLA_ESTOURADO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`nh-filtro${filtroTipo === t ? ' nh-filtro--ativo' : ''}`}
              onClick={() => setFiltroTipo(t)}
            >
              {t === 'TODAS' ? 'Todas' : t === 'AGUARDANDO_JURIDICO' ? 'Aguardando Jurídico' : 'SLA Estourado'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="nh-vazio">Carregando...</div>}
      {!loading && erro && <div className="nh-vazio nh-vazio--erro">{erro}</div>}
      {!loading && !erro && itensFiltrados.length === 0 && (
        <div className="nh-vazio">Nenhuma notificação por aqui ainda.</div>
      )}

      {!loading && !erro && itensFiltrados.length > 0 && (
        <div className="nh-lista">
          {itensFiltrados.map((item) => (
            <div key={item.id} className={`nh-item nh-item--${item.tipo.toLowerCase()}`}>
              <div className="nh-item__icone">
                <i className={TIPO_ICONE[item.tipo] ?? 'pi pi-bell'} />
              </div>
              <div className="nh-item__corpo">
                <div className="nh-item__topo">
                  <strong>{item.tipoLabel}</strong>
                  <span className="nh-item__data">{formatarData(item.createDate)}</span>
                </div>
                <p>{item.detalhe}</p>
                <span className="nh-item__pedido">
                  Pedido #{item.orderId} — {item.paciente ?? 'sem paciente'}
                  {item.nprocesso ? ` · Processo ${item.nprocesso}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
