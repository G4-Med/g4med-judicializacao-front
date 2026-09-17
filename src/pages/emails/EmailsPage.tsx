import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent,
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dialog } from 'primereact/dialog';
import { FilterMatchMode } from 'primereact/api';
import {
  enviarEmailDireto,
  getAnexosOrder,
  getConfiguracoesEmails,
  getEmailsPendentes,
  getEmailsPendentesKpis,
  uploadAnexoOrder,
} from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import './EmailsPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';

type TipoEmail = 'ENVIAR_ORCAMENTO' | 'PEDIR_EXAMES' | 'DAR_PERDA';

interface EmailPendente {
  id: number;
  orderId: number;
  paciente: string;
  procedimento: string;
  medico: string;
  dias: number;
  tipoEmail: TipoEmail;
  status: string;
  assunto: string;
  destinatario: string;
  corpo?: string;
  examesSolicit?: string;
}

interface EmailPendenteTableRow extends EmailPendente {
  sequencial: number;
}

interface EmailsKpis {
  totalPendente: number;
  enviarOrcamento: number;
  pedirExames: number;
  darPerda: number;
}

interface AnexoEmail {
  linkImagem: string;
  tipo?: string;
}

interface ConfiguracaoEmail {
  id?: number;
  tipoEmail: TipoEmail;
  assunto: string;
  corpo: string;
  ativo?: boolean;
}

const statusEmailStyle: Record<string, React.CSSProperties> = {
  PENDENTE: {
    background: '#dbeafe',
    color: '#1d4ed8',
    borderColor: '#93c5fd',
  },
  ERRO: {
    background: '#fee2e2',
    color: '#991b1b',
    borderColor: '#fca5a5',
  },
  ENVIADO: {
    background: '#dcfce7',
    color: '#166534',
    borderColor: '#86efac',
  },
  CANCELADO: {
    background: '#e5e7eb',
    color: '#374151',
    borderColor: '#cbd5e1',
  },
};

const tipoEmailLabel: Record<TipoEmail, string> = {
  ENVIAR_ORCAMENTO: 'Enviar Orçamento',
  PEDIR_EXAMES: 'Pedir Exames',
  DAR_PERDA: 'Dar Perda',
};

const tipoEmailStyle: Record<TipoEmail, React.CSSProperties> = {
  ENVIAR_ORCAMENTO: {
    background: '#dcfce7',
    color: '#166534',
    borderColor: '#86efac',
  },
  PEDIR_EXAMES: {
    background: '#fef3c7',
    color: '#92400e',
    borderColor: '#fcd34d',
  },
  DAR_PERDA: {
    background: '#fee2e2',
    color: '#991b1b',
    borderColor: '#fca5a5',
  },
};

export function EmailsPage() {
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('emails');
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<EmailPendente[]>([]);
  const [kpis, setKpis] = useState<EmailsKpis>({
    totalPendente: 0,
    enviarOrcamento: 0,
    pedirExames: 0,
    darPerda: 0,
  });
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('dias');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(1);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<EmailPendenteTableRow[]>([]);
  const [enviandoMassa, setEnviandoMassa] = useState(false);
  const [emailDialogVisible, setEmailDialogVisible] = useState(false);
  const [emailSelecionado, setEmailSelecionado] = useState<EmailPendenteTableRow | null>(null);
  const [anexosDialog, setAnexosDialog] = useState<AnexoEmail[]>([]);
  const [anexosOrcamentoAutomaticos, setAnexosOrcamentoAutomaticos] = useState<AnexoEmail[]>([]);
  const [loadingDialog, setLoadingDialog] = useState(false);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTipo, setPreviewTipo] = useState<'pdf' | 'imagem' | 'outro'>('outro');
  const [previewNome, setPreviewNome] = useState('');
  const [emailForm, setEmailForm] = useState({
    destinatario: '',
    assunto: '',
    corpo: '',
  });
  const [templatesEmails, setTemplatesEmails] = useState<Record<TipoEmail, ConfiguracaoEmail>>({
    DAR_PERDA: { tipoEmail: 'DAR_PERDA', assunto: '', corpo: '', ativo: true },
    PEDIR_EXAMES: { tipoEmail: 'PEDIR_EXAMES', assunto: '', corpo: '', ativo: true },
    ENVIAR_ORCAMENTO: { tipoEmail: 'ENVIAR_ORCAMENTO', assunto: '', corpo: '', ativo: true },
  });
  const inputAnexoRef = useRef<HTMLInputElement | null>(null);

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    medico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: '', matchMode: FilterMatchMode.CONTAINS },
    tipoEmail: { value: '', matchMode: FilterMatchMode.CONTAINS },
    status: { value: '', matchMode: FilterMatchMode.CONTAINS },
  });

  const carregarDados = async () => {
    setLoading(true);

    try {
      // Traz PENDENTE e ERRO em paralelo (não traz ENVIADO/CANCELADO,
      // que é o gargalo). ERRO precisa aparecer pro operador reenviar.
      const [pendentesRes, errosRes] = await Promise.all([
        getEmailsPendentes({ status: 'PENDENTE' }),
        getEmailsPendentes({ status: 'ERRO' }).catch(() => ({ data: [] })),
      ]);
      const pendentes = Array.isArray(pendentesRes.data) ? pendentesRes.data : [];
      const erros = Array.isArray(errosRes.data) ? errosRes.data : [];
      // Erros primeiro (precisam de atenção), depois pendentes — preserva a
      // ordem cronológica original dentro de cada grupo.
      setRegistros([...erros, ...pendentes]);
    } catch (error) {
      console.error('Erro ao carregar lista de emails', error);
      setRegistros([]);
    }

    try {
      const kpisRes = await getEmailsPendentesKpis();
      setKpis({
        totalPendente: kpisRes.data?.totalPendente ?? 0,
        enviarOrcamento: kpisRes.data?.enviarOrcamento ?? 0,
        pedirExames: kpisRes.data?.pedirExames ?? 0,
        darPerda: kpisRes.data?.darPerda ?? 0,
      });
    } catch (error) {
      console.error('Erro ao carregar KPIs de emails pendentes', error);
      setKpis({
        totalPendente: 0,
        enviarOrcamento: 0,
        pedirExames: 0,
        darPerda: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const carregarTemplatesEmails = async () => {
    try {
      const response = await getConfiguracoesEmails();
      const lista = Array.isArray(response.data) ? response.data : [];

      const mapa = lista.reduce<Record<TipoEmail, ConfiguracaoEmail>>(
        (acc, item) => {
          if (item?.tipoEmail && acc[item.tipoEmail as TipoEmail]) {
            acc[item.tipoEmail as TipoEmail] = {
              id: item.id,
              tipoEmail: item.tipoEmail,
              assunto: item.assunto ?? '',
              corpo: item.corpo ?? '',
              ativo: item.ativo ?? true,
            };
          }
          return acc;
        },
        {
          DAR_PERDA: { tipoEmail: 'DAR_PERDA', assunto: '', corpo: '', ativo: true },
          PEDIR_EXAMES: { tipoEmail: 'PEDIR_EXAMES', assunto: '', corpo: '', ativo: true },
          ENVIAR_ORCAMENTO: { tipoEmail: 'ENVIAR_ORCAMENTO', assunto: '', corpo: '', ativo: true },
        }
      );

      setTemplatesEmails(mapa);
    } catch (error) {
      console.error('Erro ao carregar templates de emails', error);
    }
  };

  useEffect(() => {
    void carregarDados();
    void carregarTemplatesEmails();
  }, []);

  const dataComSequencial = useMemo<EmailPendenteTableRow[]>(
    () =>
      registros.map((item, index) => ({
        ...item,
        sequencial: index + 1,
      })),
    [registros]
  );

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const carregarAnexosDialog = async (orderId: number) => {
    const orcamentosRes = await getAnexosOrder(orderId, 'ORCAMENTO').catch(() => ({ data: { anexos: [] } }));

    const orcamentos = (orcamentosRes.data?.anexos ?? []).map((anexo: AnexoEmail) => ({
      ...anexo,
      tipo: 'ORCAMENTO',
    }));

    return {
      orcamentos,
      lista: [...orcamentos],
    };
  };

  const abrirDialogEmail = async (rowData: EmailPendenteTableRow) => {
    const template = templatesEmails[rowData.tipoEmail];
    const destinatario = rowData.destinatario ?? '';
    const nomeSolicitante = resolverNomeSolicitanteFormatado(destinatario);
    const assuntoBase = template?.assunto?.trim() || rowData.assunto || '';
    const corpoBase = template?.corpo?.trim() || rowData.corpo || '';

    const substituirVariaveis = (texto: string) =>
      texto
        .split('{{nomeSolicitante}}').join(nomeSolicitante)
        .split('{{emailSolicitante}}').join(destinatario)
        .split('{{paciente}}').join(rowData.paciente ?? '')
        .split('{{procedimento}}').join(rowData.procedimento ?? '')
        .split('{{medico}}').join(rowData.medico ?? '')
        .split('{{exames}}').join(rowData.tipoEmail === 'PEDIR_EXAMES' ? (rowData.examesSolicit ?? '') : '');

    setEmailSelecionado(rowData);
    setEmailForm({
      destinatario,
      assunto: substituirVariaveis(assuntoBase),
      corpo: substituirVariaveis(corpoBase),
    });
    setEmailDialogVisible(true);
    setAnexosDialog([]);
    setAnexosOrcamentoAutomaticos([]);
    setLoadingDialog(true);

    try {
      const anexos = await carregarAnexosDialog(rowData.orderId);
      setAnexosDialog(anexos.lista);
      setAnexosOrcamentoAutomaticos(anexos.orcamentos);
    } catch {
      setAnexosDialog([]);
      setAnexosOrcamentoAutomaticos([]);
    } finally {
      setLoadingDialog(false);
    }
  };

  const fecharDialogEmail = () => {
    setEmailDialogVisible(false);
    setEmailSelecionado(null);
    setAnexosDialog([]);
    setAnexosOrcamentoAutomaticos([]);
    setLoadingDialog(false);
    setUploadingAnexo(false);
    setEmailForm({
      destinatario: '',
      assunto: '',
      corpo: '',
    });
    if (inputAnexoRef.current) {
      inputAnexoRef.current.value = '';
    }
  };

  const abrirPreview = (url: string, nome: string, tipo: 'pdf' | 'imagem' | 'outro') => {
    setPreviewUrl(url);
    setPreviewNome(nome);
    setPreviewTipo(tipo);
    setPreviewVisible(true);
  };

  const removerAnexoSelecionado = (index: number) => {
    setAnexosDialog((atual) => {
      const anexoRemovido = atual[index];
      if (anexoRemovido?.tipo === 'ORCAMENTO') {
        setAnexosOrcamentoAutomaticos((orcamentos) =>
          orcamentos.filter((item) => item.linkImagem !== anexoRemovido.linkImagem)
        );
      }
      return atual.filter((_, idx) => idx !== index);
    });
  };

  const handleAdicionarAnexo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !emailSelecionado) return;

    try {
      setUploadingAnexo(true);
      await uploadAnexoOrder(emailSelecionado.orderId, file, 'OUTRO');
      const anexosAtualizados = await carregarAnexosDialog(emailSelecionado.orderId);
      setAnexosDialog(anexosAtualizados.lista);
      setAnexosOrcamentoAutomaticos(anexosAtualizados.orcamentos);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao adicionar anexo.');
    } finally {
      setUploadingAnexo(false);
      if (inputAnexoRef.current) {
        inputAnexoRef.current.value = '';
      }
    }
  };

  const resolverNomeSolicitante = (destinatario: string) => {
    const email = (destinatario || '').trim();
    if (!email.includes('@')) return email;

    const parteLocal = email.split('@')[0];
    return parteLocal
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const resolverNomeSolicitanteFormatado = (destinatario: string) =>
    resolverNomeSolicitante(destinatario)
      .split(' ')
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())[0] || '';

  const aplicarVariaveisTemplate = (texto: string) => {
    if (!emailSelecionado) return texto;

    const substituicoes: Record<string, string> = {
      '{{nomeSolicitante}}': resolverNomeSolicitanteFormatado(emailForm.destinatario),
      '{{emailSolicitante}}': emailForm.destinatario ?? '',
      '{{paciente}}': emailSelecionado.paciente ?? '',
      '{{procedimento}}': emailSelecionado.procedimento ?? '',
      '{{medico}}': emailSelecionado.medico ?? '',
      '{{exames}}': emailSelecionado.tipoEmail === 'PEDIR_EXAMES' ? (emailSelecionado.examesSolicit ?? '') : '',
    };

    return Object.entries(substituicoes).reduce(
      (resultado, [chave, valor]) => resultado.split(chave).join(valor),
      texto
    );
  };

  const construirPayloadEmail = async (rowData: EmailPendenteTableRow) => {
    const template = templatesEmails[rowData.tipoEmail];
    const destinatario = rowData.destinatario ?? '';
    const nomeSolicitante = resolverNomeSolicitanteFormatado(destinatario);
    const assuntoBase = template?.assunto?.trim() || rowData.assunto || '';
    const corpoBase = template?.corpo?.trim() || rowData.corpo || '';

    const substituir = (texto: string) =>
      texto
        .split('{{nomeSolicitante}}').join(nomeSolicitante)
        .split('{{emailSolicitante}}').join(destinatario)
        .split('{{paciente}}').join(rowData.paciente ?? '')
        .split('{{procedimento}}').join(rowData.procedimento ?? '')
        .split('{{medico}}').join(rowData.medico ?? '')
        .split('{{exames}}').join(rowData.tipoEmail === 'PEDIR_EXAMES' ? (rowData.examesSolicit ?? '') : '');

    const anexos = await carregarAnexosDialog(rowData.orderId).catch(() => ({ orcamentos: [], lista: [] }));
    const anexoUrl = anexos.orcamentos[0]?.linkImagem;

    return {
      emailPendenteId: rowData.id,
      destinatario,
      assunto: substituir(assuntoBase),
      corpo: substituir(corpoBase),
      ...(anexoUrl ? { anexoUrl } : {}),
    };
  };

  const handleEnviarEmailsSelecionados = async () => {
    if (!selectedEmails.length) {
      alert('Selecione pelo menos um email para enviar.');
      return;
    }

    if (!confirm(`Enviar ${selectedEmails.length} email(s) selecionado(s)?`)) return;

    setEnviandoMassa(true);
    let sucesso = 0;
    let falha = 0;

    for (const row of selectedEmails) {
      try {
        const payload = await construirPayloadEmail(row);
        if (!payload.destinatario.trim() || !payload.assunto.trim() || !payload.corpo.trim()) {
          falha += 1;
          continue;
        }
        const response = await enviarEmailDireto(payload);
        if (response?.data?.success) sucesso += 1;
        else falha += 1;
      } catch {
        falha += 1;
      }
    }

    setEnviandoMassa(false);
    setSelectedEmails([]);
    alert(`Envio concluído. Sucesso: ${sucesso}. Falha: ${falha}.`);
    await carregarDados();
  };

  const handleEnviarEmail = async () => {
    if (!emailSelecionado) return;
    if (!emailForm.destinatario.trim() || !emailForm.assunto.trim() || !emailForm.corpo.trim()) {
      alert('Preencha destinatário, assunto e corpo do email.');
      return;
    }

    try {
      setEnviandoId(emailSelecionado.id);
      const anexoOrcamento = anexosOrcamentoAutomaticos[0];
      const anexoUrl = anexoOrcamento?.linkImagem;
      const assuntoFinal = aplicarVariaveisTemplate(emailForm.assunto.trim());
      const corpoFinal = aplicarVariaveisTemplate(emailForm.corpo.trim());
      const payload = {
        emailPendenteId: emailSelecionado.id,
        destinatario: emailForm.destinatario.trim(),
        assunto: assuntoFinal,
        corpo: corpoFinal,
        ...(anexoUrl ? { anexoUrl } : {}),
      };

      console.log('[EmailsPage] payload envio email', payload);

      const response = await enviarEmailDireto(payload);

      if (!response?.data?.success) {
        alert('A API não confirmou o envio do email.');
        return;
      }

      fecharDialogEmail();
      await carregarDados();
    } catch (err: any) {
      const mensagemErro =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        'Erro ao enviar email.';
      alert(mensagemErro);
      await carregarDados();
    } finally {
      setEnviandoId(null);
    }
  };

  const tipoEmailBodyTemplate = (rowData: EmailPendenteTableRow) => (
    <Tag
      value={tipoEmailLabel[rowData.tipoEmail] ?? rowData.tipoEmail}
      style={tipoEmailStyle[rowData.tipoEmail] ?? tipoEmailStyle.DAR_PERDA}
      className="status-tag-custom"
    />
  );

  const diasBodyTemplate = (rowData: EmailPendenteTableRow) => (
    <span className="dias-cell">{rowData.dias}</span>
  );

  const statusBodyTemplate = (rowData: EmailPendenteTableRow) => (
    <Tag
      value={rowData.status}
      style={statusEmailStyle[rowData.status] ?? statusEmailStyle.PENDENTE}
      className="status-tag-custom"
    />
  );

  const enviarBodyTemplate = (rowData: EmailPendenteTableRow) => (
    <Button
      label={enviandoId === rowData.id ? 'Enviando...' : 'Enviar Email'}
      icon="pi pi-send"
      size="small"
      loading={enviandoId === rowData.id}
      disabled={enviandoId !== null}
      onClick={() => void abrirDialogEmail(rowData)}
    />
  );

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  return (
    <div className="emails-page">
      <div className="page-header">
        <div>
          <h1>Enviar Emails</h1>
          <p>Gestão dos emails pendentes para devolutiva ao estado</p>
        </div>
        {!readOnly && (
          <Button
            label={
              enviandoMassa
                ? 'Enviando...'
                : `Enviar selecionados${selectedEmails.length ? ` (${selectedEmails.length})` : ''}`
            }
            icon="pi pi-send"
            loading={enviandoMassa}
            disabled={enviandoMassa || selectedEmails.length === 0}
            onClick={() => void handleEnviarEmailsSelecionados()}
          />
        )}
      </div>

      {readOnly && <ReadOnlyBanner />}

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid kpi-grid-5">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de emails para enviar</span>
            <i className="pi pi-envelope"></i>
          </div>
          <div className="kpi-value">{kpis.totalPendente}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de emails de enviar orçamento</span>
            <i className="pi pi-file"></i>
          </div>
          <div className="kpi-value">{kpis.enviarOrcamento}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de emails de pedir exames</span>
            <i className="pi pi-search"></i>
          </div>
          <div className="kpi-value">{kpis.pedirExames}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Quantidade de emails de enviar como perda</span>
            <i className="pi pi-times-circle"></i>
          </div>
          <div className="kpi-value">{kpis.darPerda}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Emails com erro</span>
            <i className="pi pi-exclamation-triangle"></i>
          </div>
          <div className="kpi-value kpi-value-danger">
            {registros.filter((r) => r.status === 'ERRO').length}
          </div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />E-mails pendentes de envio</h2>
        <DataTable
          aria-label="E-mails pendentes de envio"
          value={dataComSequencial}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          totalRecords={dataComSequencial.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          selectionMode="multiple"
          selection={selectedEmails}
          onSelectionChange={(e) => setSelectedEmails(e.value as EmailPendenteTableRow[])}
          tableStyle={{ minWidth: '96rem' }}
          emptyMessage="Nenhum email pendente encontrado."
          className="emails-table"
        >
          {!readOnly && <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />}

          <Column
            field="sequencial"
            header="#"
            sortable
            style={{ minWidth: '4rem' }}
            body={(rowData: EmailPendenteTableRow) => rowData.sequencial}
          />

          <Column
            field="paciente"
            header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />

          <Column
            field="procedimento" className="col-procedimento-upper"
            header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            style={{ minWidth: '22rem' }}
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
            field="dias"
            header={cabecalhoComHint('Dias', 'Dias corridos desde a entrada do pedido nesta fase. Compare com o SLA no cabeçalho.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={diasBodyTemplate}
            style={{ minWidth: '7rem' }}
          />

          <Column
            field="tipoEmail"
            header={cabecalhoComHint('Tipo', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={tipoEmailBodyTemplate}
            style={{ minWidth: '12rem' }}
          />

          <Column
            field="status"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            filter
            filterElement={(options) => filterElement(options, 'Buscar')}
            body={statusBodyTemplate}
            style={{ minWidth: '10rem' }}
          />

          {!readOnly && (
            <Column
              header="Enviar Email"
              body={enviarBodyTemplate}
              style={{ minWidth: '11rem' }}
              bodyStyle={{ textAlign: 'center' }}
            />
          )}
        </DataTable>
      </div>

      <Dialog
        header="Enviar Email"
        visible={emailDialogVisible}
        modal
        onHide={fecharDialogEmail}
        style={{ width: '72vw', maxWidth: '960px' }}
        className="email-envio-dialog"
      >
        <div className="email-dialog-content">
          <div className="email-dialog-grid">
            <div className="email-dialog-field">
              <label>Email solicitante</label>
              <InputText
                value={emailForm.destinatario}
                onChange={(e) =>
                  setEmailForm((atual) => ({ ...atual, destinatario: e.target.value }))
                }
              />
            </div>

            <div className="email-dialog-field email-dialog-field-full">
              <label>Assunto</label>
              <InputText
                value={emailForm.assunto}
                onChange={(e) =>
                  setEmailForm((atual) => ({ ...atual, assunto: e.target.value }))
                }
              />
            </div>

            <div className="email-dialog-field email-dialog-field-full">
              <label>Corpo do email</label>
              <InputTextarea
                value={emailForm.corpo}
                onChange={(e) =>
                  setEmailForm((atual) => ({ ...atual, corpo: e.target.value }))
                }
                rows={12}
                autoResize
              />
            </div>

            <div className="email-dialog-field email-dialog-field-full">
              <label>Anexos</label>
              <div className="email-anexos-actions">
                <input
                  ref={inputAnexoRef}
                  type="file"
                  className="email-anexo-input"
                  onChange={(e) => void handleAdicionarAnexo(e)}
                />
                {!readOnly && (
                  <Button
                    type="button"
                    label={uploadingAnexo ? 'Enviando anexo...' : 'Adicionar anexo'}
                    icon="pi pi-plus"
                    outlined
                    loading={uploadingAnexo}
                    disabled={!emailSelecionado || uploadingAnexo}
                    onClick={() => inputAnexoRef.current?.click()}
                  />
                )}
              </div>
              <div className="email-anexos-lista">
                {loadingDialog ? (
                  <div className="email-anexo-empty">Carregando anexos...</div>
                ) : anexosDialog.length === 0 ? (
                  <div className="email-anexo-empty">Nenhum anexo encontrado.</div>
                ) : (
                  anexosDialog.map((anexo, index) => {
                    const nomeArquivo = anexo.linkImagem?.split('/').pop() || `Anexo ${index + 1}`;
                    const extensao = nomeArquivo.split('.').pop()?.toLowerCase();
                    const tipo: 'pdf' | 'imagem' | 'outro' = extensao === 'pdf'
                      ? 'pdf'
                      : ['jpg', 'jpeg', 'png', 'webp'].includes(extensao ?? '')
                        ? 'imagem'
                        : 'outro';
                    return (
                      <div key={`${anexo.linkImagem}-${index}`} className="email-anexo-item">
                        <button
                          type="button"
                          className="email-anexo-open"
                          onClick={() => abrirPreview(anexo.linkImagem, nomeArquivo, tipo)}
                        >
                          <i className="pi pi-paperclip" />
                          <span>{nomeArquivo}</span>
                          <i className="pi pi-external-link" />
                        </button>
                        {!readOnly && (
                          <Button
                            type="button"
                            icon="pi pi-trash"
                            text
                            rounded
                            severity="danger"
                            onClick={() => removerAnexoSelecionado(index)}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="email-dialog-actions">
            <Button label="Cancelar" outlined onClick={fecharDialogEmail} />
            {!readOnly && (
              <Button
                label={enviandoId === emailSelecionado?.id ? 'Enviando...' : 'Enviar Email'}
                icon="pi pi-send"
                loading={enviandoId === emailSelecionado?.id}
                disabled={!emailSelecionado || enviandoId !== null}
                onClick={() => void handleEnviarEmail()}
              />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        header={previewNome}
        visible={previewVisible}
        modal
        onHide={() => setPreviewVisible(false)}
        style={{ width: '80vw', maxWidth: '1100px' }}
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
                label="Abrir arquivo"
                icon="pi pi-external-link"
                onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <Button
            label="Abrir em nova aba"
            icon="pi pi-external-link"
            outlined
            onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
          />
          <Button label="Fechar" onClick={() => setPreviewVisible(false)} />
        </div>
      </Dialog>
    </div>
  );
}
