import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type { DataTableFilterMeta, DataTableSortEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaBaixarOrcamento, colunaDiferenca, colunaEmpenhoEstado, colunaPagoEm } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { FilterMatchMode } from 'primereact/api';
import { getAnexosOrder, uploadAnexoOrder } from '../../services/api/orders';
import {
  getAguardandoCirurgia,
  confirmarCirurgia,
  registrarPerdaCirurgia,
} from '../../services/api/financeiro';
import type {
  AguardandoCirurgiaItem,
  AguardandoCirurgiaKpis,
} from '../../services/api/financeiro';
import './AguardandoCirurgiaPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { colunaSolicitante, colunaSegredo, colunaCnj, colunaSei, colunaComarca, colunaCadastro, FILTROS_IDENTIFICACAO, nomeComCopiar, colunaInteiroTeor , cabecalhoComHint, colunaOrigem, filtroMaiorQue } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';

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
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type ExcelCell = string | number;

function getCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = getCrcTable();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function createZip(files: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = stringToBytes(file.name);
    const contentBytes = stringToBytes(file.content);
    const crc = crc32(contentBytes);

    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);

    localParts.push(new Uint8Array(localHeader), nameBytes, contentBytes);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);

    centralParts.push(new Uint8Array(centralHeader), nameBytes);
    offset += 30 + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endHeader = new ArrayBuffer(22);
  const endView = new DataView(endHeader);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const blobParts = [...localParts, ...centralParts, new Uint8Array(endHeader)]
    .map(bytesToArrayBuffer);

  return new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function columnName(index: number) {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function createWorksheet(rows: ExcelCell[][]) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => {
      const reference = `${columnName(cellIndex)}${rowIndex + 1}`;
      if (typeof cell === 'number') {
        return `<c r="${reference}"><v>${cell}</v></c>`;
      }
      return `<c r="${reference}" t="inlineStr"><is><t>${escapeHtml(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>${sheetRows}</sheetData>
    </worksheet>`;
}

function createXlsxBlob(rows: ExcelCell[][]) {
  return createZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        </Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        </Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Aguardando Cirurgia" sheetId="1" r:id="rId1"/></sheets>
        </workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        </Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: createWorksheet(rows),
    },
  ]);
}

export function AguardandoCirurgiaPage() {
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState<AguardandoCirurgiaItem[]>([]);
  const [kpis, setKpis] = useState<AguardandoCirurgiaKpis>({ quantidade: 0, valorGanhos: 0, comissaoEsperada: 0 });

  const [dialogVisible, setDialogVisible] = useState(false);
  const [registroAtual, setRegistroAtual] = useState<AguardandoCirurgiaItem | null>(null);
  const [valorComissao, setValorComissao] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [perdaModo, setPerdaModo] = useState(false);
  const [descPerda, setDescPerda] = useState('');
  const [dataConfirmacao, setDataConfirmacao] = useState<Date | null>(new Date());
  const [anexoAcompanhamento, setAnexoAcompanhamento] = useState<File | null>(null);

  const [anexosRelatorio, setAnexosRelatorio] = useState<Anexo[]>([]);
  const [anexosOrcamento, setAnexosOrcamento] = useState<Anexo[]>([]);
  const [anexosProtocolo, setAnexosProtocolo] = useState<Anexo[]>([]);
  // DOSSIÊ DO MÉDICO (@R 08/09): o que ELE devolve DEPOIS da cirurgia — nota fiscal e
  // relatório. Guardados com TIPO próprio (NOTA_FISCAL / RELATORIO_CIRURGIA, migration
  // 0070) e não como 'Outro': são a prova de que o serviço foi prestado, e é com eles
  // que se cobra a comissão e se responde a uma auditoria. Como 'Outro' virariam mais
  // um hash sem resposta para "esse médico já mandou a nota?".
  const [anexosMedico, setAnexosMedico] = useState<Array<Anexo & { _tipo?: string }>>([]);
  const [enviandoDossie, setEnviandoDossie] = useState<string | null>(null);
  const [carregandoAnexos, setCarregandoAnexos] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);

  const colunasCfg = useColunasVisiveis('aguardando-cirurgia');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    ...FILTROS_IDENTIFICACAO,   // CNJ · SEI · Comarca (task #214)
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    valor: { value: '', matchMode: FilterMatchMode.CONTAINS },
    nprocesso: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
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
      const { data } = await getAguardandoCirurgia();
      setItens(data.itens ?? []);
      setKpis(data.kpis ?? { quantidade: 0, valorGanhos: 0, comissaoEsperada: 0 });
    } catch (err) {
      console.error('Erro ao carregar aguardando cirurgia:', err);
      alert('Erro ao carregar a lista.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(
    () => itens.map((item, index) => ({ ...item, sequencial: index + 1 })),
    [itens],
  );

  const handleExportarExcel = () => {
    if (linhas.length === 0) return;

    const rows: ExcelCell[][] = [
      ['#', 'Paciente', 'Medico', 'Procedimento', 'Valor', 'Comissao estimada', 'Processo', 'Dias', 'Data pedido', 'Status'],
      ...linhas.map((row) => [
        row.sequencial,
        row.paciente,
        row.medico || '-',
        row.procedimento || '-',
        Number((row.valor || 0).toFixed(2)),
        Number((row.comissaoEstimada || 0).toFixed(2)),
        row.nprocesso || '-',
        row.dias,
        formatarData(row.dataPedido),
        row.statusProcesso || '-',
      ]),
    ];

    const blob = createXlsxBlob(rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dataAtual = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `aguardando-cirurgia-${dataAtual}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const abrirConfirmar = async (rowData: AguardandoCirurgiaItem) => {
    setRegistroAtual(rowData);
    // Pré-preenche pela comissão estimada (calculada no backend usando o
    // takeRate cadastrado no médico). Operador pode editar se quiser.
    setValorComissao(Number((rowData.comissaoEstimada || 0).toFixed(2)));
    setPerdaModo(false);
    setDescPerda('');
    setDataConfirmacao(new Date());
    setAnexoAcompanhamento(null);
    setAnexosRelatorio([]);
    setAnexosOrcamento([]);
    setAnexosProtocolo([]);
    setAnexosMedico([]);
    setDialogVisible(true);

    setCarregandoAnexos(true);
    try {
      // Os 2 últimos são o DOSSIÊ DO MÉDICO (@R 08/09): o que ELE devolve DEPOIS da
      // cirurgia — a nota fiscal e o relatório. São a prova de que o serviço foi
      // prestado; é com eles que se cobra a comissão e se responde a uma auditoria.
      const [rel, orc, prot, nf, relCir] = await Promise.all([
        getAnexosOrder(rowData.id, 'RELATORIO').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.id, 'ORCAMENTO').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.id, 'PROTOCOLO').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.id, 'NOTA_FISCAL').catch(() => ({ data: { anexos: [] } })),
        getAnexosOrder(rowData.id, 'RELATORIO_CIRURGIA').catch(() => ({ data: { anexos: [] } })),
      ]);
      setAnexosRelatorio((rel.data as any)?.anexos ?? []);
      setAnexosOrcamento((orc.data as any)?.anexos ?? []);
      setAnexosProtocolo((prot.data as any)?.anexos ?? []);
      setAnexosMedico([
        ...(((nf.data as any)?.anexos ?? []) as any[]).map((a) => ({ ...a, _tipo: 'NOTA_FISCAL' })),
        ...(((relCir.data as any)?.anexos ?? []) as any[]).map((a) => ({ ...a, _tipo: 'RELATORIO_CIRURGIA' })),
      ]);
    } finally {
      setCarregandoAnexos(false);
    }
  };

  const fecharDialog = () => {
    setDialogVisible(false);
    setRegistroAtual(null);
    setValorComissao(null);
    setPerdaModo(false);
    setDescPerda('');
    setDataConfirmacao(new Date());
    setAnexoAcompanhamento(null);
  };

  const formatarDataIso = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const uploadAnexoSeNecessario = async (orderId: number): Promise<string | null> => {
    if (!anexoAcompanhamento) return null;
    const resUpload: any = await uploadAnexoOrder(orderId, anexoAcompanhamento, 'ACOMPANHAMENTO');
    return resUpload?.data?.linkImagem ?? resUpload?.data?.url ?? null;
  };

  const handleConfirmarCirurgia = async () => {
    if (!registroAtual) return;
    if (valorComissao === null || Number.isNaN(valorComissao)) {
      alert('Informe o valor da comissão.');
      return;
    }
    if (!dataConfirmacao) {
      alert('Informe a data da confirmação.');
      return;
    }
    setSalvando(true);
    try {
      const linkAnexo = await uploadAnexoSeNecessario(registroAtual.id);
      await confirmarCirurgia(registroAtual.id, {
        valorComissao,
        dataConfirmacao: formatarDataIso(dataConfirmacao),
        linkAnexo,
      });
      alert('Cirurgia confirmada e registro financeiro criado.');
      fecharDialog();
      await carregar();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      console.error('Erro ao confirmar cirurgia:', err);
      alert(detail || 'Erro ao confirmar cirurgia.');
    } finally {
      setSalvando(false);
    }
  };

  const handleRegistrarPerda = async () => {
    if (!registroAtual) return;
    if (!descPerda.trim()) {
      alert('Informe o motivo da perda.');
      return;
    }
    if (!dataConfirmacao) {
      alert('Informe a data.');
      return;
    }
    setSalvando(true);
    try {
      const linkAnexo = await uploadAnexoSeNecessario(registroAtual.id);
      await registrarPerdaCirurgia(registroAtual.id, {
        descCirurgiaPerda: descPerda.trim(),
        dataConfirmacao: formatarDataIso(dataConfirmacao),
        linkAnexo,
      });
      alert('Perda registrada.');
      fecharDialog();
      await carregar();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      console.error('Erro ao registrar perda:', err);
      alert(detail || 'Erro ao registrar perda.');
    } finally {
      setSalvando(false);
    }
  };

  const renderValor = (rowData: AguardandoCirurgiaItem) => formatarMoeda(rowData.valor);
  const renderConfirmar = (rowData: AguardandoCirurgiaItem) => (
    <Button
      label="Confirmar"
      icon="pi pi-check"
      severity="success"
      size="small"
      onClick={() => abrirConfirmar(rowData)}
    />
  );

  const renderListaAnexos = (lista: Anexo[]) => {
    if (lista.length === 0) {
      return <div className="ag-cir-anexos__empty">Nenhum arquivo anexado.</div>;
    }
    return (
      <div className="ag-cir-anexos__list">
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
              className="ag-cir-anexo-item"
              onClick={() => window.open(a.linkImagem, '_blank', 'noopener,noreferrer')}
              title={nome}
            >
              <i className={`${icone} ag-cir-anexo-item__icon`} />
              <span className="ag-cir-anexo-item__nome">{nome}</span>
              <i className="pi pi-external-link ag-cir-anexo-item__action" />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="aguardando-cirurgia-page">
      {/* O <h1> saiu (08/09) — a página é a aba "Aguardando cirurgia" do Painel de
          Resultados, que já traz o título. O `.page-header` FICA: é ele que posiciona
          o botão de exportar. */}
      <div className="page-header">
        <Button
          label="Exportar Excel"
          icon="pi pi-file-excel"
          className="ag-cir-export-button"
          onClick={handleExportarExcel}
          disabled={loading || linhas.length === 0}
        />
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de Ganhos</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{kpis.quantidade}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Valor dos Ganhos</span>
            <i className="pi pi-wallet"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.valorGanhos)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Comissão Esperada</span>
            <i className="pi pi-percentage"></i>
          </div>
          <div className="kpi-value">{formatarMoeda(kpis.comissaoEsperada)}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Pedidos aguardando confirmação de cirurgia</h2>
          <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
            <BotaoExportarExcel todos={linhas} nome="aguardando-cirurgia" />
            {colunasCfg.botao}
          </AcoesTabela>
        <DataTable scrollable rowClassName={rowClassRepedido}
          aria-label="Pedidos aguardando confirmação de cirurgia"
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
          emptyMessage="Nenhum pedido aguardando cirurgia."
          className="ag-cir-table"
        >{colunasCfg.filtrar(<>

          <Column field="sequencial" header="#" style={{ minWidth: '4rem' }}  frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{renderConfirmar(r)}</> })}
          <Column
            field="paciente" className="col-paciente-upper" body={(r: any) => nomeComCopiar(r.paciente)}
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
           frozen alignFrozen="left" />
          {colunaOrigem(linhas)}
          {colunaSegredo(undefined, linhas)}
          {colunaRepedido(linhas)}
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
          {/* COMISSÃO ESTIMADA — o número que diz quanto ESTA cirurgia vale para nós
              (@R 08/09: ⟦a comissão aqui deve ter também, para sabermos tecnicamente⟧).
              Já era calculada pelo backend e usada no Excel e no diálogo de confirmar,
              mas não aparecia na tabela: quem olhava a fila via o valor do PROCESSO
              (o que o Estado paga ao médico) e não o nosso.
              ⚠ "estimada" é literal: sai do `takeRate` do cadastro, e os 26 médicos
              cadastrados têm todos exatamente 10,00 — que é o default, não a taxa
              negociada caso a caso. O hint diz isso para ninguém tratar como fechado. */}
          <Column
            field="comissaoEstimada"
            header={cabecalhoComHint(
              'Nossa comissão (est.)',
              'Estimativa = valor do ganho × take rate cadastrado do médico. A taxa real é negociada caso a caso — confira antes de cobrar.',
            )}
            sortable
            style={{ minWidth: '11rem', textAlign: 'right' }}
            body={(r: any) =>
              Number(r.comissaoEstimada)
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                    .format(Number(r.comissaoEstimada))
                : '—'
            }
          />
          {/* A coluna "Processo" saiu (08/09): ela tinha field="nprocesso", o MESMO da
              `colunaCnj()` logo abaixo — duas colunas do mesmo campo na mesma tabela.
              O React avisava "two children with the same key, col-nprocesso" e podia
              duplicar/omitir células em silêncio. Ficou a canônica (`colunaCnj`), que
              já traz o rótulo "Nº CNJ", o hint explicativo e o botão de copiar. */}
          <Column
            field="dias"
            header={cabecalhoComHint('Desde a chegada', 'Dias corridos desde que o pedido CHEGOU no sistema (não desde a entrada nesta fase). Compare com o SLA no cabeçalho.')}
            sortable
            filter
            dataType="numeric"
            filterElement={filtroMaiorQue('mais de…')}
            style={{ minWidth: '7rem' }}
          />
          {colunaAnexosSES(linhas)}
          {/* Identificação do pedido (task #214): CNJ + SEI com copiar, Comarca + km */}
{colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
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
        header={registroAtual ? `Cirurgia — ${registroAtual.paciente}` : 'Cirurgia'}
        visible={dialogVisible}
        style={{ width: '60rem', maxWidth: '96vw' }}
        modal
        onHide={fecharDialog}
      >
        {registroAtual && (
          <div className="ag-cir-form">
            <div className="ag-cir-form__grid">
              <div className="ag-cir-field ag-cir-field--span-2">
                <label>Paciente</label>
                <InputText value={registroAtual.paciente} disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-4">
                <label>Procedimento</label>
                <InputTextarea value={registroAtual.procedimento || ''} rows={2} autoResize disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-2">
                <label>Médico</label>
                <InputText value={registroAtual.medico || '-'} disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-1">
                <label>Valor</label>
                <InputText value={formatarMoeda(registroAtual.valor)} disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-1">
                <label>Processo</label>
                <InputText value={registroAtual.nprocesso || '-'} disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-1">
                <label>Dias</label>
                <InputText value={String(registroAtual.dias)} disabled />
              </div>
              <div className="ag-cir-field ag-cir-field--span-1">
                <label>Data Pedido</label>
                <InputText value={formatarData(registroAtual.dataPedido)} disabled />
              </div>

              <div className="ag-cir-field ag-cir-field--span-2">
                <label>Valor da Comissão *</label>
                <InputNumber
                  value={valorComissao ?? undefined}
                  onValueChange={(e) => setValorComissao(e.value ?? null)}
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                  disabled={perdaModo}
                />
              </div>
              {/* A TAXA SAI DA BASE REGISTRADA — e só cai no orçamento se não houver base.
                  CASO REAL (ord#381, achado pela eliza-financeiro em 08/09): orçamento
                  R$ 233.000, comissão R$ 5.199,70 → dividindo pelo orçamento dava "2,23%",
                  um número que PARECE taxa negociada e não é. A taxa é 10%, sobre o
                  honorário da NF (R$ 62.647,00), com 17% de imposto retido DA COMISSÃO:
                      62.647,00 × 10% = 6.264,70 − 17% = 5.199,70
                  ⚠ A ORDEM IMPORTA e é invisível no resultado: descontar 17% da BASE
                  (62.647 − 17% = 51.997,01, e 10% disso) dá o MESMO 5.199,70, porque
                  multiplicação é comutativa — mas guarda outro significado. O desempate é
                  documental: 62.647,00 está na NF; 51.997,01 não existe em papel nenhum.
                  (Este comentário afirmou 51.997,01 até 08/09 — estava errado.)
                  Nas outras 7 fichas não há dedução e todas dão 10,00% redondo: o padrão é
                  tão limpo que o único fora da curva parecia negociação. Por isso passou.
                  Backfill aplicado em produção 08/09: as 8 fichas com comissão têm base. */}
              <div className="ag-cir-field ag-cir-field--span-1">
                {(() => {
                  const base = registroAtual.baseCalculoComissao ?? null;
                  const ded = registroAtual.deducaoPercentual ?? 0;
                  const temBase = base !== null && base > 0;
                  const divisor = temBase ? base : registroAtual.valor;
                  // comissão = base × taxa × (1 − dedução) ⇒ taxa = comissão ÷ base ÷ (1 − dedução)
                  const fator = temBase ? 1 - ded / 100 : 1;
                  const taxa =
                    valorComissao !== null && divisor > 0 && fator > 0
                      ? (valorComissao / divisor / fator) * 100
                      : null;
                  return (
                    <>
                      <label
                        title={
                          temBase
                            ? `Taxa sobre a base registrada (R$ ${base!.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                              })})${ded ? `, com ${ded}% retido da comissão` : ''}.`
                            : 'Sem base registrada: calculado sobre o ORÇAMENTO. Se a comissão foi combinada sobre outra base (ex.: honorário do médico menos imposto), este número NÃO é a taxa acordada.'
                        }
                      >
                        {temBase ? '% sobre a base ✓' : '% sobre o orçamento ⓘ'}
                      </label>
                      <InputText value={taxa !== null ? `${taxa.toFixed(2)}%` : '-'} disabled />
                    </>
                  );
                })()}
              </div>
              <div className="ag-cir-field ag-cir-field--span-1">
                <label>Data {perdaModo ? 'da Perda' : 'da Cirurgia'} *</label>
                <Calendar
                  value={dataConfirmacao}
                  onChange={(e) => setDataConfirmacao(e.value as Date | null)}
                  dateFormat="dd/mm/yy"
                  showIcon
                  locale="pt"
                  placeholder="dd/mm/aaaa"
                />
              </div>

              <div className="ag-cir-field ag-cir-field--span-4">
                <label>Anexo do acompanhamento (opcional)</label>
                <div className="acompanhamento-anexo-row">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setAnexoAcompanhamento(e.target.files?.[0] ?? null)}
                  />
                  {anexoAcompanhamento && (
                    <span className="acompanhamento-anexo-info">
                      <i className="pi pi-file" />
                      {anexoAcompanhamento.name}
                      <button
                        type="button"
                        className="acompanhamento-anexo-remove"
                        onClick={() => setAnexoAcompanhamento(null)}
                        title="Remover"
                      >
                        <i className="pi pi-times" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="ag-cir-anexos">
              <div className="ag-cir-anexos__bloco">
                <h3>Relatórios Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosRelatorio)}
              </div>
              <div className="ag-cir-anexos__bloco">
                <h3>Orçamentos Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosOrcamento)}
              </div>
              <div className="ag-cir-anexos__bloco">
                <h3>Protocolos Anexados</h3>
                {carregandoAnexos ? <div>Carregando...</div> : renderListaAnexos(anexosProtocolo)}
              </div>
              {/* DOSSIÊ DO MÉDICO (@R 08/09) — o que ELE devolve DEPOIS da cirurgia.
                  Fica junto dos outros anexos de propósito: quem confirma a cirurgia é
                  quem recebe a nota, e separar em outra tela faria o documento chegar
                  por um caminho que ninguém abre. O bloco mostra o que FALTA, não só o
                  que existe — a pergunta útil é "esse médico já mandou a nota?". */}
              <div className="ag-cir-anexos__bloco ag-cir-anexos__bloco--medico">
                <h3>Dossiê do médico</h3>
                {(['NOTA_FISCAL', 'RELATORIO_CIRURGIA'] as const).map((tipo) => {
                  const rotulo = tipo === 'NOTA_FISCAL' ? 'Nota fiscal' : 'Relatório pós-cirurgia';
                  const doTipo = anexosMedico.filter((a) => a._tipo === tipo);
                  return (
                    <div className="dossie-linha" key={tipo}>
                      <div className="dossie-linha__topo">
                        <span className={doTipo.length ? 'dossie-ok' : 'dossie-falta'}>
                          {doTipo.length ? '✓' : '○'} {rotulo}
                          {doTipo.length ? ` (${doTipo.length})` : ' — não recebido'}
                        </span>
                        <label className="dossie-upload">
                          <input
                            type="file"
                            style={{ display: 'none' }}
                            disabled={!!enviandoDossie}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f || !registroAtual) return;
                              setEnviandoDossie(tipo);
                              try {
                                await uploadAnexoOrder(registroAtual.id, f, tipo);
                                const r: any = await getAnexosOrder(registroAtual.id, tipo)
                                  .catch(() => ({ data: { anexos: [] } }));
                                setAnexosMedico((atual) => [
                                  ...atual.filter((a) => a._tipo !== tipo),
                                  ...((r.data?.anexos ?? []) as any[]).map((a) => ({ ...a, _tipo: tipo })),
                                ]);
                              } finally {
                                setEnviandoDossie(null);
                                e.target.value = '';
                              }
                            }}
                          />
                          <span className="dossie-upload__btn">
                            {enviandoDossie === tipo ? 'enviando…' : 'anexar'}
                          </span>
                        </label>
                      </div>
                      {doTipo.length > 0 && renderListaAnexos(doTipo)}
                    </div>
                  );
                })}
              </div>
            </div>

            {perdaModo && (
              <div className="ag-cir-perda-bloco">
                <label>Motivo da perda *</label>
                <InputTextarea
                  value={descPerda}
                  onChange={(e) => setDescPerda(e.target.value)}
                  rows={3}
                  autoResize
                  placeholder="Descreva o motivo da perda da cirurgia"
                />
              </div>
            )}

            <div className="ag-cir-actions">
              <Button
                label="Cancelar"
                outlined
                onClick={fecharDialog}
                disabled={salvando}
              />
              {!perdaModo ? (
                <>
                  <Button
                    label="Perda"
                    icon="pi pi-times"
                    severity="danger"
                    outlined
                    onClick={() => setPerdaModo(true)}
                    disabled={salvando}
                  />
                  <Button
                    label={salvando ? 'Salvando...' : 'Confirmar Cirurgia'}
                    icon="pi pi-check"
                    severity="success"
                    onClick={handleConfirmarCirurgia}
                    loading={salvando}
                  />
                </>
              ) : (
                <>
                  <Button
                    label="Voltar"
                    icon="pi pi-arrow-left"
                    outlined
                    onClick={() => { setPerdaModo(false); setDescPerda(''); }}
                    disabled={salvando}
                  />
                  <Button
                    label={salvando ? 'Salvando...' : 'Registrar Perda'}
                    icon="pi pi-times"
                    severity="danger"
                    onClick={handleRegistrarPerda}
                    loading={salvando}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
