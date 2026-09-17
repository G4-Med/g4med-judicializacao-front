import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputNumber } from 'primereact/inputnumber';
import { InputSwitch } from 'primereact/inputswitch';
import { Tag } from 'primereact/tag';
import {
  getDashboardIntegracoes,
  getExecucoesIntegracao,
  executarIntegracao,
  getMonitorEmailConfig,
  salvarMonitorEmailConfig,
} from '../../services/api/integracoes';
import type {
  Integracao,
  IntegracaoExecucao,
  IntegracaoKpis,
  MonitorEmailConfig,
} from '../../services/api/integracoes';
import './MonitorIntegracaoPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';

type StatusUI = 'Aguardando' | 'Em processamento' | 'Sucesso' | 'Erro' | 'Pausado';

const STATUS_STYLE: Record<StatusUI, { background: string; color: string; border: string }> = {
  Aguardando:        { background: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  'Em processamento':{ background: '#dbeafe', color: '#1e3a8a', border: '#3b82f6' },
  Sucesso:           { background: '#d1fae5', color: '#065f46', border: '#10b981' },
  Erro:              { background: '#fee2e2', color: '#991b1b', border: '#ef4444' },
  Pausado:           { background: '#e5e7eb', color: '#374151', border: '#9ca3af' },
};

function statusFor(integracao: Integracao): StatusUI {
  if (!integracao.ativo) return 'Pausado';
  switch (integracao.ultimaExecucaoStatus) {
    case 'EXECUTANDO': return 'Em processamento';
    case 'SUCESSO':    return 'Sucesso';
    case 'ERRO':       return 'Erro';
    default:           return 'Aguardando';
  }
}

function statusFromExec(exec: IntegracaoExecucao): StatusUI {
  switch (exec.status) {
    case 'EXECUTANDO': return 'Em processamento';
    case 'SUCESSO':    return 'Sucesso';
    case 'ERRO':       return 'Erro';
    default:           return 'Aguardando';
  }
}

function formatarDataHora(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusBody(value: StatusUI) {
  const style = STATUS_STYLE[value];
  return (
    <Tag
      value={value}
      style={{
        backgroundColor: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontWeight: 600,
      }}
    />
  );
}

export function MonitorIntegracaoPage() {
  const [carregando, setCarregando] = useState(false);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [kpis, setKpis] = useState<IntegracaoKpis>({ total: 0, aguardando: 0, sucesso: 0, erros: 0, executando: 0 });
  const [filtro, setFiltro] = useState('');
  const [executandoId, setExecutandoId] = useState<number | null>(null);

  const [execucoesVisible, setExecucoesVisible] = useState(false);
  const [execucoesIntegracao, setExecucoesIntegracao] = useState<Integracao | null>(null);
  const [execucoes, setExecucoes] = useState<IntegracaoExecucao[]>([]);
  const [carregandoExecucoes, setCarregandoExecucoes] = useState(false);

  const [configVisible, setConfigVisible] = useState(false);
  const [config, setConfig] = useState<MonitorEmailConfig | null>(null);
  const [carregandoConfig, setCarregandoConfig] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const { data } = await getDashboardIntegracoes();
      setIntegracoes(data.integracoes ?? []);
      setKpis(data.kpis ?? { total: 0, aguardando: 0, sucesso: 0, erros: 0, executando: 0 });
    } catch (err) {
      console.error('Erro ao carregar integrações:', err);
      alert('Erro ao carregar integrações.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const integracoesFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return integracoes;
    return integracoes.filter(i =>
      i.nome.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q),
    );
  }, [integracoes, filtro]);

  const handleExecutar = async (integracao: Integracao, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!integracao.ativo) {
      alert('Integração está pausada. Ative-a antes de executar.');
      return;
    }
    setExecutandoId(integracao.id);
    try {
      await executarIntegracao(integracao.id);
      await carregar();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.mensagem;
      console.error('Erro ao executar integração:', err);
      alert(detail || 'Erro ao executar integração.');
    } finally {
      setExecutandoId(null);
    }
  };

  const abrirExecucoes = async (integracao: Integracao) => {
    setExecucoesIntegracao(integracao);
    setExecucoesVisible(true);
    setExecucoes([]);
    setCarregandoExecucoes(true);
    try {
      const { data } = await getExecucoesIntegracao(integracao.id, { page: 1, pageSize: 50 });
      setExecucoes(data.execucoes ?? []);
    } catch (err) {
      console.error('Erro ao carregar execuções:', err);
      alert('Erro ao carregar execuções.');
    } finally {
      setCarregandoExecucoes(false);
    }
  };

  const abrirConfig = async () => {
    setConfigVisible(true);
    setCarregandoConfig(true);
    try {
      const { data } = await getMonitorEmailConfig();
      setConfig(data);
    } catch (err) {
      console.error('Erro ao carregar configuração:', err);
      alert('Erro ao carregar configuração.');
    } finally {
      setCarregandoConfig(false);
    }
  };

  const handleSalvarConfig = async () => {
    if (!config) return;
    setSalvandoConfig(true);
    try {
      const { data } = await salvarMonitorEmailConfig({
        intervaloMinutos: config.intervaloMinutos,
        remetentesValidos: config.remetentesValidos,
        maxPorCiclo: config.maxPorCiclo,
        ativo: config.ativo,
      });
      setConfig(data);
      setConfigVisible(false);
      await carregar();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      console.error('Erro ao salvar configuração:', err);
      alert(detail || 'Erro ao salvar configuração.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const renderStatus = (rowData: Integracao) => statusBody(statusFor(rowData));
  const renderModificado = (rowData: Integracao) => formatarDataHora(rowData.ultimaExecucao);
  const renderExecutar = (rowData: Integracao) => (
    <div className="monitor-acoes">
      <Button
        icon="pi pi-play"
        rounded
        severity="success"
        size="small"
        loading={executandoId === rowData.id}
        disabled={!rowData.ativo || executandoId === rowData.id}
        onClick={(e) => handleExecutar(rowData, e)}
        tooltip={rowData.ativo ? 'Executar agora' : 'Integração pausada'}
        tooltipOptions={{ position: 'top' }}
      />
    </div>
  );
  const renderLog = (rowData: Integracao) => (
    <Button
      icon="pi pi-ellipsis-h"
      rounded
      severity="info"
      size="small"
      onClick={(e) => { e.stopPropagation(); abrirExecucoes(rowData); }}
      tooltip="Ver execuções"
      tooltipOptions={{ position: 'top' }}
    />
  );

  const renderExecStatus = (rowData: IntegracaoExecucao) => statusBody(statusFromExec(rowData));
  const renderExecInicio = (rowData: IntegracaoExecucao) => formatarDataHora(rowData.dataInicio);
  const renderExecFim = (rowData: IntegracaoExecucao) => formatarDataHora(rowData.dataFim);
  const renderExecTrigger = (rowData: IntegracaoExecucao) =>
    rowData.triggeredBy === 'MANUAL' ? 'Manual' : 'Tarefa Agendada';

  return (
    <div className="monitor-integracao-page">
      <div className="page-header monitor-header">
        <div className="monitor-header__title">
          <h1>Monitor de Integração</h1>
          <p>Acompanhe e aprove as integrações em andamento entre os sistemas.</p>
        </div>

        <div className="monitor-header__actions">
          <Button
            label="Configurar"
            icon="pi pi-cog"
            outlined
            onClick={abrirConfig}
          />
          <Button
            label="Atualizar"
            icon="pi pi-refresh"
            severity="success"
            loading={carregando}
            onClick={carregar}
          />
        </div>
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="monitor-kpi-grid">
        <div className="monitor-kpi-card monitor-kpi-card--total">
          <div className="monitor-kpi-card__label">TOTAL</div>
          <div className="monitor-kpi-card__value">{kpis.total}</div>
          <i className="pi pi-list monitor-kpi-card__icon" />
        </div>
        <div className="monitor-kpi-card monitor-kpi-card--aguardando">
          <div className="monitor-kpi-card__label">AGUARDANDO</div>
          <div className="monitor-kpi-card__value">{kpis.aguardando}</div>
          <i className="pi pi-clock monitor-kpi-card__icon" />
        </div>
        <div className="monitor-kpi-card monitor-kpi-card--executando">
          <div className="monitor-kpi-card__label">EM PROCESSAMENTO</div>
          <div className="monitor-kpi-card__value">{kpis.executando}</div>
          <i className="pi pi-sync monitor-kpi-card__icon" />
        </div>
        <div className="monitor-kpi-card monitor-kpi-card--erros">
          <div className="monitor-kpi-card__label">ERROS</div>
          <div className="monitor-kpi-card__value">{kpis.erros}</div>
          <i className="pi pi-exclamation-triangle monitor-kpi-card__icon" />
        </div>
      </div>
      </PainelKpis>

      <div className="monitor-card">
        <div className="monitor-card__header">
          <h2>Processos</h2>
          <IconField iconPosition="left" className="monitor-search">
            <InputIcon className="pi pi-search" />
            <InputText
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar processo..."
            />
          </IconField>
        </div>

        <DataTable
          aria-label="Processos de integração"
          value={integracoesFiltradas}
          loading={carregando}
          dataKey="id"
          rowHover
          paginator
          rows={50}
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          emptyMessage="Nenhuma integração cadastrada."
          onRowClick={(e) => abrirExecucoes(e.data as Integracao)}
          className="monitor-tabela"
        >
          <Column field="id" header="Id" style={{ width: '6rem' }} />
          <Column field="nome" header="Processo" />
          <Column header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')} body={renderStatus} style={{ width: '12rem' }} />
          <Column header="Executar" body={renderExecutar} style={{ width: '8rem', textAlign: 'center' }} />
          <Column header="Modificado" body={renderModificado} style={{ width: '12rem' }} />
          <Column header="Log" body={renderLog} style={{ width: '6rem', textAlign: 'center' }} />
        </DataTable>
      </div>

      <Dialog
        header={execucoesIntegracao ? `Execuções — ${execucoesIntegracao.nome}` : 'Execuções'}
        visible={execucoesVisible}
        style={{ width: '70rem', maxWidth: '96vw' }}
        modal
        onHide={() => setExecucoesVisible(false)}
      >
        <DataTable
          aria-label="Execuções da integração selecionada"
          value={execucoes}
          loading={carregandoExecucoes}
          dataKey="id"
          paginator
          rows={50}
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          emptyMessage="Nenhuma execução registrada."
        >
          <Column field="id" header="Id" style={{ width: '6rem' }} />
          <Column header="Início" body={renderExecInicio} style={{ width: '12rem' }} />
          <Column header="Fim" body={renderExecFim} style={{ width: '12rem' }} />
          <Column header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')} body={renderExecStatus} style={{ width: '11rem' }} />
          <Column header={cabecalhoComHint('Origem', 'Por que está nesta fila: segredo de justiça ou sem protocolo (prazo perdido).')} body={renderExecTrigger} style={{ width: '10rem' }} />
          <Column field="pedidosCriados" header="Pedidos Criados" style={{ width: '9rem', textAlign: 'right' }} />
          <Column field="totalProcessados" header="Total Processados" style={{ width: '10rem', textAlign: 'right' }} />
          <Column field="erroMensagem" header="Erro" body={(r: IntegracaoExecucao) => r.erroMensagem || '-'} />
        </DataTable>
      </Dialog>

      <Dialog
        header="Configurar Monitor de Email"
        visible={configVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={() => setConfigVisible(false)}
      >
        {carregandoConfig || !config ? (
          <div className="monitor-loading">Carregando...</div>
        ) : (
          <div className="monitor-form">
            <div className="monitor-form__row">
              <label>Intervalo (minutos)</label>
              <InputNumber
                value={config.intervaloMinutos}
                onValueChange={(e) => setConfig({ ...config, intervaloMinutos: e.value ?? 1 })}
                min={1}
                showButtons
              />
            </div>

            <div className="monitor-form__row">
              <label>Máximo por ciclo</label>
              <InputNumber
                value={config.maxPorCiclo}
                onValueChange={(e) => setConfig({ ...config, maxPorCiclo: e.value ?? 1 })}
                min={1}
                showButtons
              />
            </div>

            <div className="monitor-form__row">
              <label>Remetentes válidos</label>
              <InputText
                value={config.remetentesValidos}
                onChange={(e) => setConfig({ ...config, remetentesValidos: e.target.value })}
                placeholder="@dominio.com, outro@email.com"
              />
              <small className="monitor-form__hint">
                Separe por vírgula. Aceita domínios (@dominio.com) ou emails completos.
              </small>
            </div>

            <div className="monitor-form__row monitor-form__row--switch">
              <label>Integração ativa</label>
              <InputSwitch
                checked={config.ativo}
                onChange={(e) => setConfig({ ...config, ativo: e.value })}
              />
            </div>
          </div>
        )}

        <div className="monitor-form__actions">
          <Button
            label="Cancelar"
            outlined
            onClick={() => setConfigVisible(false)}
          />
          <Button
            label={salvandoConfig ? 'Salvando...' : 'Salvar'}
            icon="pi pi-check"
            severity="success"
            loading={salvandoConfig}
            disabled={!config || carregandoConfig}
            onClick={handleSalvarConfig}
          />
        </div>
      </Dialog>
    </div>
  );
}
