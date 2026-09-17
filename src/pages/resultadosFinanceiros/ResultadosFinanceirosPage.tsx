import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type { DataTableFilterMeta, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tag } from 'primereact/tag';
import { FilterMatchMode } from 'primereact/api';
import { getAnexosOrder } from '../../services/api/orders';
import {
  getResultadosFinanceiros,
  getFinanceiroDetalhe,
} from '../../services/api/financeiro';
import type {
  ResultadoFinanceiroItem,
  ResultadosFinanceirosKpis,
  FinanceiroDetalhe,
} from '../../services/api/financeiro';
import './ResultadosFinanceirosPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';

interface Anexo {
  id: number;
  linkImagem: string;
  tipo: string;
  createDate: string;
}

function formatarMoeda(value: number) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(value: string | null) {
  if (!value) return '-';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

export function ResultadosFinanceirosPage() {
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState<ResultadoFinanceiroItem[]>([]);
  const [kpis, setKpis] = useState<ResultadosFinanceirosKpis>({
    qtdRealizadas: 0,
    valorPagoComissao: 0,
    qtdARealizar: 0,
    valorARepassar: 0,
    qtdPerdas: 0,
    valorPerdaCirurgia: 0,
  });

  const [dialogVisible, setDialogVisible] = useState(false);
  const [detalhe, setDetalhe] = useState<FinanceiroDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [anexosRelatorio, setAnexosRelatorio] = useState<Anexo[]>([]);
  const [anexosOrcamento, setAnexosOrcamento] = useState<Anexo[]>([]);
  const [anexosProtocolo, setAnexosProtocolo] = useState<Anexo[]>([]);
  const [carregandoAnexos, setCarregandoAnexos] = useState(false);

  const [sortField, setSortField] = useState<string | undefined>('createDate');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(-1);

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valorComissao: { value: '', matchMode: FilterMatchMode.CONTAINS },
    statusCirurgia: { value: '', matchMode: FilterMatchMode.CONTAINS },
  });

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  const carregar = async () => {
    setLoading(true);
    try {
      const { data } = await getResultadosFinanceiros();
      setItens(data.itens ?? []);
      setKpis(data.kpis);
    } catch (err) {
      console.error('Erro ao carregar resultados financeiros:', err);
      alert('Erro ao carregar resultados financeiros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(
    () => itens.map((item, index) => ({ ...item, sequencial: index + 1 })),
    [itens],
  );

  const abrirDetalhes = async (rowData: ResultadoFinanceiroItem) => {
    setDetalhe(null);
    setAnexosRelatorio([]);
    setAnexosOrcamento([]);
    setAnexosProtocolo([]);
    setDialogVisible(true);

    setCarregandoDetalhe(true);
    try {
      const { data } = await getFinanceiroDetalhe(rowData.id);
      setDetalhe(data);
    } catch (err) {
      console.error('Erro ao carregar detalhe:', err);
      alert('Erro ao carregar detalhe.');
      setDialogVisible(false);
    } finally {
      setCarregandoDetalhe(false);
    }

    setCarregandoAnexos(true);
    try {
      const [rel, orc, prot] = await Promise.all([
        getAnexosOrder(rowData.orderId, 'RELATORIO').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.orderId, 'ORCAMENTO').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.orderId, 'PROTOCOLO').catch(() => ({ data: { anexos: [] } })),
      ]);
      setAnexosRelatorio((rel.data as any)?.anexos ?? []);
      setAnexosOrcamento((orc.data as any)?.anexos ?? []);
      setAnexosProtocolo((prot.data as any)?.anexos ?? []);
    } finally {
      setCarregandoAnexos(false);
    }
  };

  const fecharDialog = () => {
    setDialogVisible(false);
    setDetalhe(null);
  };

  const renderValor = (rowData: ResultadoFinanceiroItem) => formatarMoeda(rowData.valor);
  const renderComissao = (rowData: ResultadoFinanceiroItem) => formatarMoeda(rowData.valorComissao);
  const renderStatus = (rowData: ResultadoFinanceiroItem) => (
    <Tag
      value={rowData.statusCirurgia ? 'Realizada' : 'Perda'}
      style={
        rowData.statusCirurgia
          ? { backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #10b981', fontWeight: 600 }
          : { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444', fontWeight: 600 }
      }
    />
  );

  const renderDetalhes = (rowData: ResultadoFinanceiroItem) => (
    <Button
      label="Ver detalhes"
      icon="pi pi-eye"
      outlined
      severity="info"
      size="small"
      onClick={() => abrirDetalhes(rowData)}
    />
  );

  const renderListaAnexos = (lista: Anexo[]) => {
    if (lista.length === 0) {
      return <div className="rf-anexos__empty">Nenhum arquivo anexado.</div>;
    }
    return (
      <div className="rf-anexos__list">
        {lista.map((a, index) => {
          const nome = a.linkImagem.split('/').pop() || `Anexo ${index + 1}`;
          const ext = nome.split('.').pop()?.toLowerCase();
          const icone = ext === 'pdf'
            ? 'pi pi-file-pdf'
            : ['jpg', 'jpeg', 'png'].includes(ext ?? '')
              ? 'pi pi-image'
              : 'pi pi-file';
          return (
            <button
              key={a.id ?? index}
              type="button"
              className="rf-anexo-item"
              onClick={() => window.open(a.linkImagem, '_blank', 'noopener,noreferrer')}
              title={nome}
            >
              <i className={`${icone} rf-anexo-item__icon`} />
              <span className="rf-anexo-item__nome">{nome}</span>
              <i className="pi pi-external-link rf-anexo-item__action" />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="resultados-financeiros-page">
      {/* Sem cabeçalho próprio (08/09): esta página não tem mais rota — é a aba
          "Nosso dinheiro" do Painel de Resultados, que já traz o título. */}
      <PainelKpis titulo="Cirurgias">
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi-card kpi-card--ok">
          <div className="kpi-header">
            <span>Cirurgias Realizadas</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{kpis.qtdRealizadas}</div>
        </div>
        <div className="kpi-card kpi-card--pendente">
          <div className="kpi-header">
            <span>Cirurgias a Realizar</span>
            <i className="pi pi-clock"></i>
          </div>
          <div className="kpi-value">{kpis.qtdARealizar}</div>
        </div>
        <div className="kpi-card kpi-card--perda">
          <div className="kpi-header">
            <span>Cirurgias Perdidas</span>
            <i className="pi pi-times-circle"></i>
          </div>
          <div className="kpi-value">{kpis.qtdPerdas}</div>
        </div>
      </div>
      </PainelKpis>

      <PainelKpis titulo="Valores">
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi-card kpi-card--ok">
          <div className="kpi-header">
            <span>Valor Pago de Comissão</span>
            <i className="pi pi-dollar"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorPagoComissao)}</div>
        </div>
        <div className="kpi-card kpi-card--pendente">
          <div className="kpi-header">
            <span>Valor a Ser Repassado</span>
            <i className="pi pi-wallet"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorARepassar)}</div>
        </div>
        <div className="kpi-card kpi-card--perda">
          <div className="kpi-header">
            <span>Valor de Cirurgias Perdidas</span>
            <i className="pi pi-ban"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorPerdaCirurgia)}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Resultados financeiros</h2>
        <DataTable
          aria-label="Resultados financeiros"
          value={linhas}
          loading={loading}
          dataKey="id"
          paginator
          rows={50}
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={(e: DataTableSortEvent) => { setSortField(e.sortField); setSortOrder(e.sortOrder); }}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          emptyMessage="Nenhum registro financeiro."
          className="rf-table"
        >
          <Column field="sequencial" header="#" sortable style={{ minWidth: '4rem' }} />
          <Column
            field="paciente" className="col-paciente-upper"
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          <Column
            field="medico"
            header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
          />
          <Column
            field="valor"
            header={cabecalhoComHint('Valor', 'Valor do orçamento que enviamos ao Estado por este pedido.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={renderValor}
            style={{ minWidth: '10rem' }}
          />
          <Column
            field="valorComissao"
            header="Comissão"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={renderComissao}
            style={{ minWidth: '10rem' }}
          />
          {/* O QUE JÁ ENTROU (@R 08/09: "tudo que a gente já teve recebimento, para
              pararmos de perder dinheiro"). A aba mostrava só a comissão DEVIDA e
              parava aí — as 6 fichas com R$ 32.679,70 recebidos existiam no banco e
              não chegavam à tela porque o campo não era serializado.
              DEVIDO e RECEBIDO ficam em colunas SEPARADAS de propósito: são duas
              perguntas ("quanto é nosso?" × "quanto entrou?") e juntá-las apagaria
              exatamente a diferença que interessa cobrar. */}
          <Column
            field="valorRecebido"
            header={cabecalhoComHint('Recebido', 'Quanto de fato ENTROU. Compare com a Comissão ao lado: a diferença é o que ainda falta receber.')}
            sortable
            style={{ minWidth: '9rem', textAlign: 'right' }}
            body={(r: ResultadoFinanceiroItem) =>
              Number(r.valorRecebido)
                ? <span className="rf-recebido">{formatarMoeda(Number(r.valorRecebido))}</span>
                : <span className="rf-sem-recebimento">—</span>
            }
          />
          <Column
            field="dataPagamento"
            header="Pago em"
            sortable
            style={{ minWidth: '8rem' }}
            body={(r: ResultadoFinanceiroItem) =>
              r.dataPagamento ? r.dataPagamento.split('-').reverse().join('/') : '—'
            }
          />
          <Column
            field="statusCirurgia"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={renderStatus}
            style={{ minWidth: '10rem' }}
          />
          <Column header="Detalhes" body={renderDetalhes} style={{ minWidth: '11rem', textAlign: 'center' }} />
        </DataTable>
      </div>

      <Dialog
        header={detalhe ? `Detalhes — ${detalhe.paciente}` : 'Detalhes'}
        visible={dialogVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={fecharDialog}
      >
        {carregandoDetalhe || !detalhe ? (
          <div className="rf-loading">Carregando...</div>
        ) : (
          <div className="rf-form">
            <div className="rf-form__grid">
              <div className="rf-field rf-field--span-2">
                <label>Paciente</label>
                <InputText value={detalhe.paciente} disabled />
              </div>
              <div className="rf-field rf-field--span-4">
                <label>Procedimento</label>
                <InputTextarea value={detalhe.procedimento || ''} rows={2} autoResize disabled />
              </div>
              <div className="rf-field rf-field--span-2">
                <label>Médico</label>
                <InputText value={detalhe.medico || '-'} disabled />
              </div>
              <div className="rf-field rf-field--span-1">
                <label>Valor</label>
                <InputText value={formatarMoeda(detalhe.valor)} disabled />
              </div>
              <div className="rf-field rf-field--span-1">
                <label>Processo</label>
                <InputText value={detalhe.nprocesso || '-'} disabled />
              </div>
              <div className="rf-field rf-field--span-1">
                <label>Dias até o resultado</label>
                <InputText value={`${detalhe.diasAteResultado ?? detalhe.dias} dias`} disabled />
              </div>
              <div className="rf-field rf-field--span-1">
                <label>Data Pedido</label>
                <InputText value={formatarData(detalhe.dataPedido)} disabled />
              </div>
              <div className="rf-field rf-field--span-1">
                <label>Data Confirmação</label>
                <InputText value={formatarData(detalhe.dataConfirmacao)} disabled />
              </div>
              <div className="rf-field rf-field--span-2">
                <label>Valor da Comissão</label>
                <InputText value={formatarMoeda(detalhe.valorComissao)} disabled />
              </div>
              <div className="rf-field rf-field--span-2">
                <label>Status Cirurgia</label>
                <div className="rf-field__tag">
                  <Tag
                    value={detalhe.statusCirurgia ? 'Realizada' : 'Perda'}
                    style={
                      detalhe.statusCirurgia
                        ? { backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #10b981', fontWeight: 600 }
                        : { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444', fontWeight: 600 }
                    }
                  />
                </div>
              </div>
              <div className="rf-field rf-field--span-4">
                <label>Observação</label>
                <InputTextarea
                  value={detalhe.descCirurgiaPerda || (detalhe.statusCirurgia ? '-' : '')}
                  rows={3}
                  autoResize
                  disabled
                />
              </div>
            </div>

            <div className="rf-anexos">
              <div className="rf-anexos__bloco">
                <h3>Relatórios Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosRelatorio)}
              </div>
              <div className="rf-anexos__bloco">
                <h3>Orçamentos Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosOrcamento)}
              </div>
              <div className="rf-anexos__bloco">
                <h3>Protocolos Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosProtocolo)}
              </div>
            </div>

            <div className="rf-actions">
              <Button label="Fechar" outlined onClick={fecharDialog} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
