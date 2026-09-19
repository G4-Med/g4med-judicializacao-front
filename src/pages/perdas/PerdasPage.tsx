import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import { FilterMatchMode } from 'primereact/api';
import { getPerdas, getOrders, getMedicosCompleto, reabrirPerda } from '../../services/api/orders';
import { getStatusTagStyle } from '../../utils/statusTag';
import './PerdasPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { colunaOrigem, colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, filtroMaiorQue } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento, kpisEmpenho } from '../../components/ColunasEmpenho/colunasEmpenho';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { colunaExcluirAdmin } from '../../components/ExpansorPedido/colunaExcluirAdmin';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';

/** Data+hora em pt-BR a partir do ISO que o backend manda. Devolve '' quando não
 *  há valor — a coluna decide o que mostrar no lugar, e o vazio é dado legítimo
 *  (perda antiga sem autoria registrada), não erro. */
function formatarDataHora(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface PerdaProcesso {
  id: number;
  paciente: string;
  nprocesso: string;
  procedimento: string;
  area: string;
  refPreco: number;
  valorOrcamento: number;
  dataPedido: string | null;
  dataStatusPerda?: string | null;
  dias: number;
  statusProcesso: string;
  statusPerda: string;
  justificativaPerda: string;
  motivoPerdaCategoria?: string | null;
  analiseJuridicaFinal: string;
  cliente: string;
  valor: number;
  resultado: string;
  idMedico?: number | null;
  // @R 18/09: "quem deu perda" + "quem foi o último que alterou, e data e hora".
  // Vêm de OrderStatusHistorico. Ausentes quando a perda veio da carga de planilha
  // ou é anterior ao histórico — nesse caso ninguém sabe quem foi, e a coluna
  // mostra "—" de propósito (medido 18/09: 33 de 283 têm autor).
  perdaPor?: string | null;
  perdaEm?: string | null;
  perdaOrigem?: string | null;
  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: string | null;
  ultimaAlteracaoCampo?: string | null;
  ultimaAlteracaoOrigem?: string | null;
}

interface PerdaProcessoTableRow extends PerdaProcesso {
  sequencial: number;
  dias: number;
}

export function PerdasPage() {
  // A tabela recarrega quando a FICHA muda a situação de um pedido (@R 17/09:
  // "to mudando e a linha continua na tabela com os status incorretos"). O contexto
  // incrementa este número; ele entra nas dependências do efeito de carga abaixo.
  const { versaoDados } = useFichaPedido();
  // @R 28/08 03:37: o painel do pedido abre ABAIXO da linha, em toda fase.
  const [expandidas, setExpandidas] = useState<any>(undefined);
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<PerdaProcesso[]>([]);
  const [selectedRegistros, setSelectedRegistros] = useState<PerdaProcessoTableRow[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);

  const colunasCfg = useColunasVisiveis('perdas');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    cliente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    resultado: { value: '', matchMode: FilterMatchMode.CONTAINS },
    statusPerda: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    justificativaPerda: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

  const carregarDados = () => {
    setLoading(true);
    Promise.all([getPerdas(), getOrders(), getMedicosCompleto()])
      .then(([perdasRes, ordersRes, medicosRes]) => {
        const ordersLookup = (ordersRes.data as any[]).reduce<Record<number, any>>((acc, order) => {
          acc[order.id] = order;
          return acc;
        }, {});

        setRegistros(
          perdasRes.data.map((o: any) => {
            const orderCompleta = ordersLookup[o.id];
            const medicoId = o.idMedico ?? orderCompleta?.idMedico ?? null;
            const medico = medicosRes.data.find((item: any) => item.id === medicoId);
            const valorOrcamento = o.valorOrcamento ?? orderCompleta?.valorOrcamento ?? 0;

            return {
          ...o,   // preserva ident (SEI/comarca/cadastro/segredo/solicitante) — classe do bug 27/08
              id: o.id,
              paciente: o.paciente ?? '',
              nprocesso: o.nprocesso ?? '',
              procedimento: o.procedimento ?? '',
              area: o.area ?? '',
              refPreco: o.refPreco ?? 0,
              valorOrcamento,
              dataPedido: o.dataPedido ?? null,
              dataStatusPerda: o.dataStatusPerda ?? null,
              dias: o.dias ?? 0,
              statusProcesso: o.statusProcesso ?? '',
              statusPerda: o.statusPerda ?? '',
              justificativaPerda: o.justificativaPerda ?? '',
              motivoPerdaCategoria: o.motivoPerdaCategoria ?? null,
              analiseJuridicaFinal: o.analiseJuridicaFinal ?? '',
              cliente: medico?.razaoSocial || medico?.nomeSistema || medico?.nomeCompleto || '',
              valor: valorOrcamento || o.refPreco || 0,
              resultado: 'Perda',
              idMedico: medicoId
            };
          })
        );
      })
      .catch(() => console.error('Erro ao carregar perdas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregarDados();
  }, [versaoDados]);

  const dataComCamposCalculados = useMemo<PerdaProcessoTableRow[]>(() => {
    return registros.map((item, index) => {
      const dataPedido = item.dataPedido ? new Date(`${item.dataPedido}T00:00:00`) : null;
      const dataStatusPerda = item.dataStatusPerda ? new Date(`${item.dataStatusPerda}T00:00:00`) : null;
      const dias =
        dataPedido && dataStatusPerda
          ? Math.max(0, Math.floor((dataStatusPerda.getTime() - dataPedido.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

      return {
        ...item,
        sequencial: index + 1,
        dias
      };
    });
  }, [registros]);

  // ── MOTIVO COMO FILTRO (@R 08/09) ─────────────────────────────────────────────
  // A perda não acontece num lugar só: acontece em ETAPAS diferentes do funil, e o
  // motivo diz em qual. Sem o motivo, "353 perdas" é um número que não gera nenhuma
  // ação; com ele, cada grupo tem um dono e uma pergunta diferente:
  //   Perda Pelo Jurídico            → triagem funcionando (¬é falha, é filtro)
  //   Perda por falta de especialista→ não tínhamos quem operasse (rede de médicos)
  //   Perda pelo Médico              → tínhamos e ele recusou (relação com o médico)
  //   Perda pelo Orçamento           → perdemos no preço (competitividade)
  //   Perda (encontro de contas)     → reconciliação, ¬perda operacional
  // Somar tudo em "perdas" mistura triagem que funcionou com capacidade que faltou —
  // duas coisas que pedem decisões opostas.
  const ICONES: Record<string, string> = {
    'Perda Pelo Juridico': 'pi pi-briefcase',
    'Perda pelo Medico': 'pi pi-user-minus',
    'Perda por falta de especialista': 'pi pi-ban',
    'Perda pelo Orçamento': 'pi pi-dollar',
    'Perda sem resposta da SES': 'pi pi-clock',
    'Perda de prazo de protocolação': 'pi pi-calendar-times',
    'Perda por segredo de justiça': 'pi pi-lock',
  };
  const [motivoSelecionado, setMotivoSelecionado] = useState<string | null>(null);

  const motivos = useMemo(() => {
    const mapa = new Map<string, { qtd: number; valor: number }>();
    for (const item of dataComCamposCalculados) {
      // Perda sem motivo registrado é informação, não sujeira — ela ganha o próprio
      // grupo para que se veja QUANTAS não sabemos explicar.
      const chave = (item.statusPerda || '').trim() || 'Sem motivo registrado';
      const atual = mapa.get(chave) ?? { qtd: 0, valor: 0 };
      atual.qtd += 1;
      atual.valor += item.valorOrcamento || item.refPreco || 0;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()]
      .map(([motivo, v]) => ({ motivo, ...v, icone: ICONES[motivo] ?? 'pi pi-question-circle' }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [dataComCamposCalculados]);

  /** Linhas da tabela respeitando o motivo escolhido nos cards. */
  const linhasVisiveis = useMemo(
    () => (motivoSelecionado
      ? dataComCamposCalculados.filter(
          (i) => ((i.statusPerda || '').trim() || 'Sem motivo registrado') === motivoSelecionado,
        )
      : dataComCamposCalculados),
    [dataComCamposCalculados, motivoSelecionado],
  );

  const kpis = useMemo(() => {
    const totalProcessos = dataComCamposCalculados.length;
    const valorTotal = dataComCamposCalculados.reduce(
      (acc, item) => acc + (item.valorOrcamento || item.refPreco || 0),
      0
    );
    const perdaJuridico = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda Pelo Juridico'
    ).length;
    const perdaMedico = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda pelo Medico'
    ).length;
    const perdaSemEspecialista = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda por falta de especialista'
    ).length;
    // Padronização 68b1f91e32 (@R 27/08): as 2 classes novas de perda parcial/tempo
    const perdaSesSemResposta = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda sem resposta da SES'
    ).length;
    const perdaPrazoProtocolo = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda de prazo de protocolação'
    ).length;
    // Task #238 (@R 28/08): segredo que mata a cotação é PERDA com esse motivo
    const perdaSegredo = dataComCamposCalculados.filter(
      (item) => item.statusPerda === 'Perda por segredo de justiça'
    ).length;

    return {
      totalProcessos,
      valorTotal,
      perdaJuridico,
      perdaMedico,
      perdaSesSemResposta,
      perdaPrazoProtocolo,
      perdaSegredo,
      perdaSemEspecialista
    };
  }, [dataComCamposCalculados]);

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

  const precoBodyTemplate = (rowData: PerdaProcessoTableRow) => formatarMoeda(rowData.valor);

  const diasBodyTemplate = (rowData: PerdaProcessoTableRow) => (
    <span className="dias-cell">{rowData.dias}</span>
  );

  const resultadoBodyTemplate = (rowData: PerdaProcessoTableRow) => (
    <Tag
      value={rowData.resultado}
      style={getStatusTagStyle(rowData.resultado)}
      className="status-tag-custom"
    />
  );

  const statusPerdaBodyTemplate = (rowData: PerdaProcessoTableRow) => (
    <Tag
      value={rowData.statusPerda}
      style={getStatusTagStyle(rowData.statusPerda)}
      className="status-tag-custom"
    />
  );

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

  return (
    <div className="perdas-page">
      {/* Sem cabeçalho próprio (08/09): esta página não tem mais rota — é a aba
          "Perdas" do Painel de Resultados, que já traz o título. */}
      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-5">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Processos</span>
            <i className="pi pi-list"></i>
          </div>
          <div className="kpi-value">{kpis.totalProcessos}</div>
        </div>

        {/* MOTIVOS DERIVADOS DOS DADOS, ¬fixos no código (@R 08/09: ⟦perda tem motivos…
            filtrar o motivo nos ajuda a entender o que está acontecendo⟧).
            POR QUE MUDOU: os cards eram 6 constantes escritas à mão. Dois motivos com
            volume real ficavam INVISÍVEIS por não terem card — "Perda pelo Orçamento"
            (44 pedidos) e "Perda (encontro de contas Wesley)" (39), medidos no banco em
            08/09. Card fixo transforma motivo novo em motivo que não existe: quem lê a
            tela conclui que a perda tem 6 causas quando ela tem 8.
            Agora a lista vem do próprio dado — motivo novo aparece sozinho, e clicar
            FILTRA a tabela (clicar de novo tira o filtro). */}
        {motivos.map((m) => (
          <button
            type="button"
            key={m.motivo}
            className={`kpi-card kpi-card--clicavel ${motivoSelecionado === m.motivo ? 'kpi-card--ativo' : ''}`}
            onClick={() => setMotivoSelecionado((atual) => (atual === m.motivo ? null : m.motivo))}
            title={`${m.motivo} — clique para filtrar a tabela`}
          >
            <div className="kpi-header">
              <span>{m.motivo}</span>
              <i className={m.icone}></i>
            </div>
            <div className="kpi-value">{m.qtd}</div>
            <div className="kpi-subvalue">{formatarMoeda(m.valor)}</div>
          </button>
        ))}

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor Total</span>
            <i className="pi pi-dollar"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorTotal)}</div>
        </div>

        <div className="kpi-card" title="O Estado PAGOU nestes CNJs mesmo com a perda declarada — dinheiro que passou sem nós. Somatório do empenho pago (base 548)">
          <div className="kpi-header">
            <span>Pago pelo Estado (548)</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpisEmpenho(dataComCamposCalculados).somaPago)} · {kpisEmpenho(dataComCamposCalculados).nPagos}</div>
          <div className="kpi-subvalue">sinal forte · +{kpisEmpenho(dataComCamposCalculados).nHistorico} histórico ñ-atribuível</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Pedidos perdidos — motivo e fase em que a perda ocorreu</h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            <BotaoExportarExcel todos={dataComCamposCalculados} nome="perdas" />
            {colunasCfg.botao}
          </AcoesTabela>
        {/* Filtro ativo SEMPRE visível e com saída de 1 clique. Tabela que encolheu sem
            dizer por quê faz o usuário achar que perdeu dado. */}
        {motivoSelecionado && (
          <div className="perdas-filtro-ativo">
            Mostrando só <strong>{motivoSelecionado}</strong> — {linhasVisiveis.length} de{' '}
            {dataComCamposCalculados.length} perdas
            <button type="button" onClick={() => setMotivoSelecionado(null)}>
              <i className="pi pi-times" /> ver todas
            </button>
          </div>
        )}
        <DataTable rowClassName={rowClassRepedido}
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          aria-label="Pedidos perdidos — motivo e fase em que a perda ocorreu"
          value={linhasVisiveis}
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
          selectionMode="multiple"
          selection={selectedRegistros}
          onSelectionChange={(e) => setSelectedRegistros(e.value as PerdaProcessoTableRow[])}
          tableStyle={{ minWidth: '100rem' }}
          emptyMessage="Nenhuma perda encontrada."
          className="perdas-table"
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} />
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
          <Column
            field="sequencial"
            header="#"
            sortable
            style={{ minWidth: '4rem' }}
            body={(rowData: PerdaProcessoTableRow) => rowData.sequencial}
          />
          {/* Reabrir a perda (@R 29/08 14:07): volta o pedido para a fase de onde saiu. */}
          {colunaAcoesFase({
            principal: { label: 'Reabrir', icon: 'pi pi-replay', severity: 'secondary',
              tooltip: 'Devolve o pedido para a fase de onde ele saiu quando virou Perda',
              onClick: async (r: any) => {
                const de = r.faseAntesDaPerda ? ` para "${r.faseAntesDaPerda}"` : '';
                if (!window.confirm(`Reabrir o pedido de ${r.paciente}${de}? A justificativa da perda fica registrada no histórico.`)) return;
                try { await reabrirPerda(r.id); carregarDados(); }
                catch (e: any) { alert(e?.response?.data?.error || 'Não foi possível reabrir este pedido.'); }
              } },
            excluir: carregarDados,
            largura: '13rem',
            hint: 'Reabrir devolve o pedido à fase de onde ele saiu (a justificativa da perda continua no histórico). A lixeira remove do fluxo, com senha e reversível.',
          })}
          <Column
            field="paciente" className="col-paciente-upper" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          {colunaOrigem(linhasVisiveis)}
          {colunaSegredo(undefined, linhasVisiveis)}
          {colunaRepedido(linhasVisiveis)}
          <Column field="procedimento" header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')} sortable filter
            filterElement={(options: any) => (
              <InputText value={options.value || ''} onChange={(e) => options.filterApplyCallback(e.target.value)}
                placeholder="Buscar" className="p-column-filter" />
            )}
            style={{ minWidth: '16rem' }} />
          <Column
            field="cliente"
            header={cabecalhoComHint('Cliente', 'Empresa/prestador que responde pelo orçamento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />
          <Column field="dataStatusPerda" header={cabecalhoComHint('Perda em', 'Data em que a perda foi registrada.')} sortable style={{ minWidth: '8rem' }}
            body={(r: any) => (r.dataStatusPerda ? r.dataStatusPerda.split('-').reverse().join('/') : '—')} />
          <Column field="perdaPor" header={cabecalhoComHint('Quem deu a perda', 'Usuário que registrou a perda, com data e hora. Fica vazio nas perdas antigas, que vieram da carga de planilha e não têm autor registrado — ninguém sabe quem foi.')} sortable style={{ minWidth: '10rem' }}
            body={(r: any) => (r.perdaPor
              ? (<span title={`${r.perdaEm ? formatarDataHora(r.perdaEm) : ''}${r.perdaOrigem ? ` · via ${r.perdaOrigem}` : ''}`}>
                   {r.perdaPor}<br /><small style={{ opacity: .7 }}>{formatarDataHora(r.perdaEm)}</small>
                 </span>)
              : <span style={{ opacity: .5 }} title="Perda anterior ao registro de autoria (carga de planilha) — não há quem atribuir.">—</span>)} />
          <Column field="ultimaAlteracaoPor" header={cabecalhoComHint('Última alteração', 'Quem mexeu por último neste registro, quando, e em qual campo.')} sortable style={{ minWidth: '11rem' }}
            body={(r: any) => (r.ultimaAlteracaoPor || r.ultimaAlteracaoEm
              ? (<span title={r.ultimaAlteracaoOrigem ? `via ${r.ultimaAlteracaoOrigem}` : undefined}>
                   {r.ultimaAlteracaoPor || <em style={{ opacity: .7 }}>automático</em>}
                   <br /><small style={{ opacity: .7 }}>{formatarDataHora(r.ultimaAlteracaoEm)}{r.ultimaAlteracaoCampo ? ` · ${r.ultimaAlteracaoCampo}` : ''}</small>
                 </span>)
              : <span style={{ opacity: .5 }}>—</span>)} />
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
            header={cabecalhoComHint('Desde a chegada', 'Dias corridos desde que o pedido CHEGOU no sistema (não desde a entrada nesta fase). Compare com o SLA no cabeçalho.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            body={diasBodyTemplate}
            style={{ minWidth: '7rem' }}
          />
          <Column
            field="resultado"
            header={cabecalhoComHint('Resultado', 'Desfecho registrado: ganho, perda ou em andamento.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={resultadoBodyTemplate}
            style={{ minWidth: '12rem' }}
          />
          <Column
            field="statusPerda"
            header="Status Perda"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={statusPerdaBodyTemplate}
            style={{ minWidth: '16rem' }}
          />
          <Column field="motivoPerdaCategoria" header={cabecalhoComHint('Motivo (categoria)', 'Classificação da perda — alimenta os cards e o funil.')} sortable
            style={{ minWidth: '13rem' }}
            body={(r: any) => r.motivoPerdaCategoria ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>não classificado</span>} />
          <Column
            field="justificativaPerda"
            header="Justificativa Perda"
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '24rem' }}
          />
          {colunaAnexosSES(linhasVisiveis)}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaInteiroTeor()}
          {colunaSolicitante('13rem', linhasVisiveis)}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          {colunaExcluirAdmin(carregarDados)}
          </>)}
</DataTable>
      </div>
    </div>
  );
}
