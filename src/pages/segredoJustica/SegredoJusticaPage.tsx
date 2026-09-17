import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { colunaBaixarOrcamento, colunaDiferenca, colunaEmpenhoEstado, colunaPagoEm } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido } from '../../components/Repedido/repedido';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { FilterMatchMode } from 'primereact/api';
import {
  getSegredoJustica, salvarResultadoSegredo, getAnexosOrder,
  getCandidatosSegredoJustica, marcarSegredoJusticaRetroativo, desmarcarSegredoJustica,
} from '../../services/api/orders';
import { Dialog } from 'primereact/dialog';
import { getStatusTagStyle } from '../../utils/statusTag';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { useAccess } from '../../access/AccessContext';
import './SegredoJusticaPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { PrimeiraVisitaInfo } from '../../components/PrimeiraVisitaInfo/PrimeiraVisitaInfo';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { colunaSolicitante, tagTipoPaciente, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar , cabecalhoComHint, colunaInteiroTeor, colunaOrigem, colunaSegredo } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';

interface DocumentoProcesso {
  label: string;
  nome: string;
  url: string;
  tipo: 'pdf' | 'imagem' | 'outro';
}

interface SegredoJustica {
  id: number;
  paciente: string;
  nprocesso: string;
  procedimento: string;
  idade?: number | null;
  tipoPaciente?: string | null;      // Pediátrico | Adulto (@R 27/08: "tipo do médico")
  statusOrcamento?: string | null;
  area: string;
  refPreco: number;
  valorOrcamento: number;
  dataStatusOrcamento: string | null;
  dias: number;
  statusProcesso: string;
  obsProtocolo: string;
  // campos legados para compatibilidade com a tabela existente
  cliente: string;
  valor: number;
  numeroProcesso: string;
  dataEnvioOrcamento: string;
  status: string;
  resultado: string;
  documentos: DocumentoProcesso[];
}

interface SegredoJusticaTableRow extends SegredoJustica {
  sequencial: number;
  dias: number;
}

type ResultadoType = 'ganho' | 'perda' | 'habilitacao' | 'cotacao' | '';

// Classificação retroativa (task #196, 26/08) — candidatos já no banco que a
// nova regra de idade<18 pegaria, mas nunca passaram pelo alerta (saíram do
// Jurídico antes dessa feature existir). Marcação é sempre confirmada por
// clique — nunca automática, mesmo princípio do alerta na tela Jurídico.
interface CandidatoSegredo {
  id: number;
  paciente: string;
  idade: number | null;              // null quando o candidato veio só da API (task #222)
  origem?: 'idade' | 'api' | 'idade+api';
  motivo?: string;                   // fonte legível (ex.: "classe sigilosa por lei: ...")
  procedimento: string;
  statusProcesso: string;
  statusJuridico: string | null;
  fechado: boolean;
}

function useCandidatosSegredoJustica() {
  const [candidatos, setCandidatos] = useState<CandidatoSegredo[]>([]);
  const [loadingCandidatos, setLoadingCandidatos] = useState(false);
  const [marcandoId, setMarcandoId] = useState<number | null>(null);
  const [aberto, setAberto] = useState(false);

  const recarregar = () => {
    setLoadingCandidatos(true);
    getCandidatosSegredoJustica()
      .then(({ data }) => setCandidatos(data.itens ?? []))
      .catch(() => console.error('Erro ao carregar candidatos a segredo de justiça'))
      .finally(() => setLoadingCandidatos(false));
  };

  useEffect(() => { recarregar(); }, []);

  const marcar = async (id: number) => {
    setMarcandoId(id);
    try {
      await marcarSegredoJusticaRetroativo(id);
      recarregar();
    } catch {
      alert('Não foi possível marcar este pedido como Segredo de Justiça.');
    } finally {
      setMarcandoId(null);
    }
  };

  return { candidatos, loadingCandidatos, marcandoId, marcar, aberto, setAberto };
}

export function SegredoJusticaPage() {
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('segredoJustica');
  const candidatosHook = useCandidatosSegredoJustica();
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<SegredoJustica[]>([]);
  const [first, setFirst] = useState(0);
  // Task #222 (@R: "temos que ter uma área Enviado para SES - Segredo de Justiça"):
  // a MESMA tela em 2 filas — o menu aponta /segredo-justica?fila=ses.
  const [searchParams, setSearchParams] = useSearchParams();
  const fila: 'analisar' | 'ses' = searchParams.get('fila') === 'ses' ? 'ses' : 'analisar';
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);

  const colunasCfg = useColunasVisiveis('segredo-justica');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    cliente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    numeroProcesso: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: '', matchMode: FilterMatchMode.CONTAINS },
    status: { value: '', matchMode: FilterMatchMode.CONTAINS },
    resultado: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

  const [visibleProcessos, setVisibleProcessos] = useState<SegredoJusticaTableRow[]>([]);

  const [updateDialogVisible, setUpdateDialogVisible] = useState(false);
  const [registroAtualizando, setRegistroAtualizando] = useState<SegredoJusticaTableRow | null>(null);

  const [resultadoSelecionado, setResultadoSelecionado] = useState<ResultadoType>('');
  const [parecerJuridico, setParecerJuridico] = useState('');
  const [valorGanho, setValorGanho] = useState<number | null>(null);
  const [motivoPerdaCat, setMotivoPerdaCat] = useState<string | null>(null);  // task #223
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
  const [previewNome, setPreviewNome] = useState('');


const carregarDados = () => {
  setLoading(true);
  getSegredoJustica(fila)
    .then(({ data }) => {
      setRegistros(data.map((o: any) => ({
        ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
        // Campos de identificação (task #214/#217/#222) preservados por spread — o
        // mapeamento explícito antigo os DESCARTAVA e a comarca/cadastro/segredo
        // chegavam undefined nesta tela (bug visto no print do @R 27/08 16:45).
        ...o,
        id: o.id,
        paciente: o.paciente ?? '',
        nprocesso: o.nprocesso ?? '',
        procedimento: o.procedimento ?? '',
        area: o.area ?? '',
        refPreco: o.refPreco ?? 0,
        valorOrcamento: o.valorOrcamento ?? 0,
        dataStatusOrcamento: o.dataStatusOrcamento,
        dias: o.dias ?? 0,
        statusProcesso: o.statusProcesso ?? '',
        obsProtocolo: o.obsProtocolo ?? '',
        // campos legados mapeados
        cliente: o.area ?? '',
        valor: o.valorOrcamento ?? o.refPreco ?? 0,
        numeroProcesso: o.nprocesso ?? '',
        dataEnvioOrcamento: o.dataStatusOrcamento ?? '',
        status: 'Ativo',
        resultado: 'Sem resultado',
        documentos: [],
      })));
    })
    .catch(() => console.error('Erro ao carregar segredo de justiça'))
    .finally(() => setLoading(false));
};

useEffect(() => { carregarDados(); }, [fila]);

  const dataComCamposCalculados = useMemo<SegredoJusticaTableRow[]>(() => {
    const hoje = new Date();

    return registros.map((item, index) => {
      const dataBase = new Date(`${item.dataEnvioOrcamento}T00:00:00`);
      const diferencaMs = hoje.getTime() - dataBase.getTime();
      const dias = Math.max(0, Math.floor(diferencaMs / (1000 * 60 * 60 * 24)));

      return {
        ...item,
        sequencial: index + 1,
        dias
      };
    });
  }, [registros]);

  useEffect(() => { setVisibleProcessos(dataComCamposCalculados); }, [dataComCamposCalculados]);

  const kpis = useMemo(() => {
    const totalProcessos = visibleProcessos.length;
    const mediaProcessos = totalProcessos
      ? Math.round(
          visibleProcessos.reduce((acc, item) => acc + item.dias, 0) / totalProcessos
        )
      : 0;

    const valorTotal = visibleProcessos.reduce((acc, item) => acc + item.valor, 0);
    const mediaValorProcessos = totalProcessos ? valorTotal / totalProcessos : 0;

    return {
      totalProcessos,
      mediaProcessos,
      valorTotal,
      mediaValorProcessos,
    };
  }, [visibleProcessos]);

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const formatarData = (data: string) => {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const precoBodyTemplate = (rowData: SegredoJusticaTableRow) => formatarMoeda(rowData.valor);
  const diasBodyTemplate = (rowData: SegredoJusticaTableRow) => <span className="dias-cell">{rowData.dias}</span>;
  const statusBodyTemplate = (rowData: SegredoJusticaTableRow) => (
    <Tag value={rowData.statusProcesso} style={getStatusTagStyle(rowData.statusProcesso)} className="status-tag-custom" />
  );
  const atualizarBodyTemplate = (rowData: SegredoJusticaTableRow) => {
    return (
      <Button
        label="Atualizar"
        icon="pi pi-refresh"
        outlined
        onClick={() => {
          setRegistroAtualizando({ ...rowData, documentos: [] });
          setResultadoSelecionado('');
          setParecerJuridico('');
          setValorGanho(null);
          getAnexosOrder(rowData.id, 'ORCAMENTO')
            .then((res: any) => {
              const anexos: any[] = res.data.anexos ?? [];
              const documentos = anexos.map((anexo, index) => {
                const nome = anexo.linkImagem.split('/').pop() || `Orçamento ${index + 1}`;
                const extensao = nome.split('.').pop()?.toLowerCase();
                const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
                  ? 'pdf'
                  : ['jpg', 'jpeg', 'png', 'webp'].includes(extensao ?? '')
                    ? 'imagem'
                    : 'outro';

                return {
                  label: `Orçamento ${index + 1}`,
                  nome,
                  url: anexo.linkImagem,
                  tipo,
                };
              });

              setRegistroAtualizando((atual) =>
                atual && atual.id === rowData.id ? { ...atual, documentos } : atual
              );
            })
            .catch(() => {
              setRegistroAtualizando((atual) =>
                atual && atual.id === rowData.id ? { ...atual, documentos: [] } : atual
              );
            });
          setUpdateDialogVisible(true);
        }}
      />
    );
  };

  const filterElement = (options: any, placeholder: string) => {
    return (
      <InputText
        value={options.value || ''}
        onChange={(e) => options.filterApplyCallback(e.target.value)}
        placeholder={placeholder}
        className="p-column-filter"
      />
    );
  };

  const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

  const handleBaixarDocumento = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleVisualizarDocumento = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    abrirPreview(url, nome, tipo);
  };

  const handleSalvarAtualizacao = async () => {
    if (!registroAtualizando || !resultadoSelecionado) {
      alert('Selecione um resultado antes de salvar.');
      return;
    }
    // Habilitação não é desfecho financeiro — é o processo saindo do escuro e
    // voltando para o acompanhamento normal. Exigir valor aqui obrigaria a
    // inventar um número, e número inventado contamina o indicador.
    if (!['habilitacao', 'cotacao'].includes(resultadoSelecionado)
        && (valorGanho === null || valorGanho <= 0)) {
      alert(resultadoSelecionado === 'ganho' ? 'Informe o valor ganho.' : 'Informe o valor da causa.');
      return;
    }
    if (resultadoSelecionado === 'habilitacao' && !parecerJuridico.trim()) {
      alert('Escreva no parecer como a habilitação foi obtida.');
      return;
    }
    // Perda sem motivo é número cego — mesma exigência das outras telas (task #222).
    if (resultadoSelecionado === 'perda' && !parecerJuridico.trim()) {
      alert('Escreva no parecer o motivo da perda (obrigatório).');
      return;
    }

    try {
      await salvarResultadoSegredo(registroAtualizando.id, {
        resultado: resultadoSelecionado,
        parecer: parecerJuridico,
        valorGanho,
        motivoPerdaCategoria: motivoPerdaCat ?? undefined,   // task #223 (opcional)
      });
      carregarDados();
      setUpdateDialogVisible(false);
      setValorGanho(null);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao salvar.');
    }
  };

  return (
    <div className="segredo-justica-page">
      <PrimeiraVisitaInfo etapaId="segredo-justica" />
      <div className="page-header">
        <CabecalhoFase nome="Segredo de Justiça" screen="segredoJustica"
          subtitulo="Gestão dos processos em segredo de justiça" />

        <div className="page-actions">
          {!readOnly && <Button
            label="Novo Protocolo"
            icon="pi pi-plus"
          />}
        </div>
      </div>

      {readOnly && <ReadOnlyBanner />}

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Processos</span>
            <i className="pi pi-list"></i>
          </div>
          <div className="kpi-value">{kpis.totalProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Média de dias dos Processos</span>
            <i className="pi pi-chart-line"></i>
          </div>
          <div className="kpi-value">{kpis.mediaProcessos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor Total</span>
            <i className="pi pi-dollar"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorTotal)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Média Valor Processos</span>
            <i className="pi pi-wallet"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.mediaValorProcessos)}</div>
        </div>

      </div>
      </PainelKpis>

      {candidatosHook.candidatos.length > 0 && (
        <div className="card candidatos-segredo-card">
          <button
            type="button"
            className="candidatos-segredo-toggle"
            onClick={() => candidatosHook.setAberto((v) => !v)}
            aria-expanded={candidatosHook.aberto}
          >
            <i className={`pi ${candidatosHook.aberto ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
            <i className="pi pi-flag" />
            <span>
              Candidatos a revisar — {candidatosHook.candidatos.length} pedido(s) com sinal de
              segredo (menor de idade ou consulta ao CNJ) ainda não marcados Segredo de Justiça
              {candidatosHook.candidatos.some((c) => !c.fechado) && (
                <strong> ({candidatosHook.candidatos.filter((c) => !c.fechado).length} ainda em andamento)</strong>
              )}
            </span>
          </button>

          {candidatosHook.aberto && (
            <div className="candidatos-segredo-lista">
              <p className="candidatos-segredo-nota">
                Sugestão automática por idade — não foi marcado sozinho. Confira o caso antes de confirmar.
              </p>
              {candidatosHook.candidatos.map((c) => (
                <div key={c.id} className="candidatos-segredo-item">
                  <div className="candidatos-segredo-item__info">
                    <strong>{c.paciente}</strong>
                    <span>
                      {c.idade !== null && c.idade !== undefined ? `${c.idade} anos · ` : ''}
                      {c.procedimento}
                      {c.origem && c.origem !== 'idade' && (
                        <Tag value="API DataJud" severity="warning" style={{ marginLeft: 6, fontSize: '10px' }}
                          title={c.motivo ?? 'Sinalizado pela consulta automática ao CNJ'} />
                      )}
                    </span>
                    <span className="candidatos-segredo-item__status">
                      {c.statusProcesso}
                      {c.fechado && <Tag value="Encerrado" severity="secondary" style={{ marginLeft: 6, fontSize: '10px' }} />}
                    </span>
                  </div>
                  <Button
                    label={candidatosHook.marcandoId === c.id ? 'Marcando...' : 'Marcar Segredo de Justiça'}
                    icon="pi pi-lock"
                    outlined
                    severity="warning"
                    disabled={readOnly || candidatosHook.marcandoId !== null}
                    loading={candidatosHook.marcandoId === c.id}
                    onClick={() => candidatosHook.marcar(c.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="segredo-filas" role="tablist" aria-label="Filas do segredo de justiça">
          <Button label="Analisar / Desfecho" icon="pi pi-search" role="tab"
            aria-selected={fila === 'analisar'}
            severity={fila === 'analisar' ? 'success' : 'secondary'} outlined={fila !== 'analisar'}
            onClick={() => setSearchParams({})} />
          <Button label="Enviado à SES — aguardando resposta" icon="pi pi-send" role="tab"
            aria-selected={fila === 'ses'}
            severity={fila === 'ses' ? 'success' : 'secondary'} outlined={fila !== 'ses'}
            onClick={() => setSearchParams({ fila: 'ses' })} />
        </div>
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />
          {fila === 'ses' ? 'Segredo de justiça — enviado à SES (aguardando resposta)' : 'Pedidos em segredo de justiça'}</h2>
          <AcoesTabela>
            <BotaoExportarExcel todos={dataComCamposCalculados} visiveis={visibleProcessos} nome="segredo-justica" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable
          aria-label="Pedidos em segredo de justiça"
          value={dataComCamposCalculados}
          onValueChange={(value) => setVisibleProcessos(value as SegredoJusticaTableRow[])}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          totalRecords={dataComCamposCalculados.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          tableStyle={{ minWidth: '95rem' }}
          emptyMessage="Nenhum processo encontrado."
          className="segredo-justica-table"
        >{colunasCfg.filtrar(<>

          {!readOnly && <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />}
          <Column
            field="sequencial"
            header="#"
            style={{ minWidth: '4rem' }}
            body={(rowData: SegredoJusticaTableRow) => rowData.sequencial}
           frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{atualizarBodyTemplate(r)}</> })}
          <Column
            field="paciente" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem()}
          {colunaRepedido()}
          {/* @R 27/08 16:45: "quero saber a idade, se é pediatria e adulto (tipo do
              médico) e o nome do procedimento". Idade ausente = "—", nunca chute. */}
<Column
            field="idade"
            header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')}
            sortable
            style={{ minWidth: '6rem' }}
            body={(r: any) => (r.idade ?? null) !== null ? `${r.idade} anos` : <span className="ident-vazio">—</span>}
          />
          <Column
            field="tipoPaciente"
            header={cabecalhoComHint('Tipo', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')}
            sortable
            style={{ minWidth: '8rem' }}
            body={(r: any) => tagTipoPaciente(r.tipoPaciente)}
          />
          <Column
            field="procedimento"
            header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          <Column
            field="cliente"
            header="Especialidade"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '14rem' }}
          />
          {/* @R 27/08 16:53: médico vinculado ou "sem profissional" na cara — a ação
              de passar para médico é o "Enviar para cotação" do diálogo Atualizar. */}
<Column
            field="medico"
            header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')}
            sortable
            style={{ minWidth: '12rem' }}
            body={(r: any) => r.medico
              ? r.medico
              : <Tag value="Sem profissional" severity="warning" title="Use Atualizar → Enviar para cotação para passar ao médico" />}
          />
          {/* @R 27/08 16:53: "cadê a coluna para verificar se era segredo mesmo —
              alguns eram normais". O veredito da consulta automática ao CNJ. */}
<Column
            field="segredoApiSinal"
            header="É segredo mesmo?"
            sortable
            style={{ minWidth: '11rem' }}
            body={(r: any) => {
              if (r.segredoApiSinal === true) return <Tag value="API confirma" severity="danger" icon="pi pi-lock" title={r.segredoApiFonte ?? ''} />;
              if (r.segredoApiSinal === false) return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Tag value="API refuta — revisar" severity="warning" icon="pi pi-exclamation-triangle" title={`Pode ser processo comum. ${r.segredoApiFonte ?? ''}`} />
                  {!readOnly && <Button label="Desmarcar" size="small" text severity="danger"
                    title="Confirmou que NÃO é segredo? Devolve o pedido ao fluxo comum (com motivo, auditado)."
                    onClick={async (ev) => {
                      ev.stopPropagation();
                      const motivo = window.prompt(`Desmarcar Segredo de Justiça de ${r.paciente}?\nEscreva o motivo (obrigatório):`);
                      if (!motivo?.trim()) return;
                      try { await desmarcarSegredoJustica(r.id, motivo.trim()); carregarDados(); }
                      catch (err: any) { alert(err?.response?.data?.error ?? 'Erro ao desmarcar.'); }
                    }} />}
                </span>
              );
              return <span className="ident-vazio" title={r.segredoApiFonte ?? 'CNJ ausente ou não consta no DataJud'}>não verificado</span>;
            }}
          />
          <Column
            field="valor"
            header={cabecalhoComHint('Valor', 'Valor do orçamento que enviamos ao Estado por este pedido.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={precoBodyTemplate}
            style={{ minWidth: '10rem' }}
          />
          <Column
            field="dias"
            header={cabecalhoComHint('Dias', 'Dias corridos desde a entrada do pedido nesta fase. Compare com o SLA no cabeçalho.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={diasBodyTemplate}
            style={{ minWidth: '7rem' }}
          />
          <Column
            field="statusProcesso"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={statusBodyTemplate}
            style={{ minWidth: '12rem' }}
          />
          {colunaAnexosSES()}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaSegredo()}
          {colunaInteiroTeor()}
          {colunaSolicitante()}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>
      </div>

      <Dialog
        header="Atualização"
        visible={updateDialogVisible}
        style={{ width: '64rem', maxWidth: '96vw' }}
        modal
        onHide={() => setUpdateDialogVisible(false)}
        className="segredo-update-dialog"
      >
        {registroAtualizando && (
          <div className="segredo-update-layout">
            <div className="update-topbar">
              <div className="update-processo-title">
                Processo {registroAtualizando.numeroProcesso}
              </div>

              <Button
                label="Voltar"
                outlined
                onClick={() => setUpdateDialogVisible(false)}
              />
            </div>

            <section className="update-section">
              <h3>Informações do Processo</h3>

              <div className="update-info-grid">
                <div><strong>Paciente</strong><span>{registroAtualizando.paciente}</span></div>
                <div><strong>Nº Processo</strong><span>{registroAtualizando.nprocesso || '-'}</span></div>
                <div><strong>Procedimento</strong><span>{registroAtualizando.procedimento}</span></div>
                <div><strong>Valor Orçamento</strong><span>{formatarMoeda(registroAtualizando.valorOrcamento)}</span></div>
                <div><strong>Data Envio Orçamento</strong><span>{registroAtualizando.dataEnvioOrcamento ? formatarData(registroAtualizando.dataEnvioOrcamento) : '-'}</span></div>
                <div><strong>Dias desde o envio</strong><span>{registroAtualizando.dias} dias</span></div>
                {registroAtualizando.obsProtocolo && (
                  <div><strong>Obs Protocolo</strong><span>{registroAtualizando.obsProtocolo}</span></div>
                )}
              </div>
            </section>

            <section className="update-section">
              <h3>Orçamento do Pedido</h3>

              {registroAtualizando.documentos.length === 0 && (
                <div className="timeline-empty">Nenhum orçamento anexado.</div>
              )}

              {registroAtualizando.documentos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {registroAtualizando.documentos.map((doc, index) => {
                    const icone = doc.tipo === 'pdf'
                      ? 'pi pi-file-pdf'
                      : doc.tipo === 'imagem'
                        ? 'pi pi-image'
                        : 'pi pi-file';

                    return (
                      <button
                        key={`${doc.nome}-${index}`}
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          background: 'transparent',
                          color: '#374151',
                          fontSize: '0.9rem',
                          width: '100%',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        onClick={() => handleVisualizarDocumento(doc.url, doc.nome, doc.tipo)}
                      >
                        <i className={icone} style={{ fontSize: '1.1rem', color: '#f97316' }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{doc.nome || `Orçamento ${index + 1}`}</span>
                        <i className="pi pi-eye" style={{ color: '#9ca3af', fontSize: '0.85rem' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="update-section">
              <h3>Resultado</h3>

              <div className="resultado-only-layout">
                {!readOnly && <div className="resultado-actions">
                  <Button
                    label="Procedente (Ganho)"
                    severity={resultadoSelecionado === 'ganho' ? 'success' : 'secondary'}
                    outlined={resultadoSelecionado !== 'ganho'}
                    onClick={() => {
                      setResultadoSelecionado('ganho');
                      setValorGanho(registroAtualizando.valorOrcamento || null);
                    }}
                  />
                  <Button
                    label="Improcedente (Perda)"
                    severity={resultadoSelecionado === 'perda' ? 'danger' : 'secondary'}
                    outlined={resultadoSelecionado !== 'perda'}
                    onClick={() => {
                      setResultadoSelecionado('perda');
                      setValorGanho(null);
                    }}
                  />
                  {/* Task #222 (@R: segredo é onde se define "se cota ou não") —
                      devolve à fase 1 para o jurídico solicitar o médico; a marca
                      de segredo permanece (statusProcesso composto, decisão 36f8f9dd9c). */}
                  <Button
                    label="Enviar para cotação"
                    icon="pi pi-send"
                    severity={resultadoSelecionado === 'cotacao' ? 'success' : 'secondary'}
                    outlined={resultadoSelecionado !== 'cotacao'}
                    onClick={() => {
                      setResultadoSelecionado('cotacao');
                      setValorGanho(null);
                    }}
                  />
                  {/* F4 · Habilitação: o processo deixa de ser cego e vai para
                      Protocolados, onde é acompanhado como qualquer outro. */}
                  <Button
                    label="Habilitação obtida"
                    icon="pi pi-unlock"
                    severity={resultadoSelecionado === 'habilitacao' ? 'info' : 'secondary'}
                    outlined={resultadoSelecionado !== 'habilitacao'}
                    onClick={() => {
                      setResultadoSelecionado('habilitacao');
                      setValorGanho(null);
                    }}
                  />
                </div>}

                {resultadoSelecionado === 'perda' && (
                  <div className="field">
                    <label>Motivo da perda (opcional — o parecer continua obrigatório)</label>
                    <Dropdown value={motivoPerdaCat} onChange={(e) => setMotivoPerdaCat(e.value)}
                      options={[
                        { label: 'Decidimos não cotar', value: 'NAO_COTAR' },
                        { label: 'Não localizamos o médico', value: 'MEDICO_NAO_LOCALIZADO' },
                        { label: 'Não conseguimos o orçamento', value: 'ORCAMENTO_NAO_OBTIDO' },
                        { label: 'O médico recusou o pedido', value: 'MEDICO_RECUSOU' },
                        { label: 'Orçamento não chegou em tempo hábil', value: 'ORCAMENTO_FORA_DO_PRAZO' },
                        { label: 'Sem exames — médico não quis cotar', value: 'SEM_EXAMES' },
                        { label: 'Perda por segredo de justiça', value: 'SEGREDO_DE_JUSTICA' },
                        { label: 'Outro (ver justificativa)', value: 'OUTRO' },
                      ]}
                      placeholder="Escolha, se algum se aplicar" showClear />
                  </div>
                )}
                {resultadoSelecionado !== '' && resultadoSelecionado !== 'habilitacao' && (
                  <div className="field">
                    <label>{resultadoSelecionado === 'ganho' ? 'Valor Ganho' : 'Valor da Causa'}</label>
                    <InputNumber
                      value={valorGanho ?? undefined}
                      onValueChange={(e) => setValorGanho(e.value ?? null)}
                      mode="currency"
                      currency="BRL"
                      locale="pt-BR"
                      className={valorGanho === null || valorGanho <= 0 ? 'p-invalid' : ''}
                    />
                  </div>
                )}

                <div className="field">
                  <label>Parecer Jurídico</label>
                  <InputTextarea
                    value={parecerJuridico}
                    onChange={(e) => setParecerJuridico(e.target.value)}
                    rows={6}
                    placeholder="Descreva o parecer jurídico..."
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {!readOnly && <div className="dialog-footer-actions">
          <Button
            label="Cancelar"
            outlined
            onClick={() => setUpdateDialogVisible(false)}
          />
          <Button
            label="Salvar"
            icon="pi pi-check"
            onClick={handleSalvarAtualizacao}
          />
        </div>}
      </Dialog>

      <Dialog
        header={previewNome}
        visible={previewVisible}
        style={{ width: '80vw', maxWidth: '1100px' }}
        modal
        onHide={() => setPreviewVisible(false)}
      >
        <div style={{ minHeight: '70vh' }}>
          {previewTipo === 'pdf' && (
            <iframe
              src={previewUrl}
              title={previewNome}
              width="100%"
              height="700px"
              style={{ border: 'none', borderRadius: '8px' }}
            />
          )}

          {previewTipo === 'imagem' && (
            <img
              src={previewUrl}
              alt={previewNome}
              style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }}
            />
          )}

          {previewTipo === 'outro' && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
              <Button
                label="Baixar arquivo"
                icon="pi pi-download"
                onClick={() => handleBaixarDocumento(previewUrl)}
              />
            </div>
          )}
        </div>

        <div className="dialog-footer-actions">
          <Button
            label="Baixar"
            icon="pi pi-download"
            outlined
            onClick={() => handleBaixarDocumento(previewUrl)}
          />
          <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
        </div>
      </Dialog>
    </div>
  );
}
