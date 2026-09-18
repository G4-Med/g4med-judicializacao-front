import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type { DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { colunaAcoesFase } from '../../components/AcoesFase/acoesFase';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { FilterMatchMode } from 'primereact/api';
import {
  getEnviadoSes, salvarResultadoSegredo, adicionarAcompanhamento, uploadAnexoOrder,
} from '../../services/api/orders';
import { useAccess } from '../../access/AccessContext';
import { ReadOnlyBanner } from '../../components/access/ReadOnlyBanner';
import { CabecalhoFase } from '../../components/CabecalhoFase/CabecalhoFase';
import { ContadorRegistros } from '../../components/ContadorRegistros/ContadorRegistros';
import {
  colunaCnj, colunaSei, colunaComarca, colunaCadastro, colunaSegredo, colunaInteiroTeor,
  colunaSolicitante, tagTipoPaciente, FILTROS_IDENTIFICACAO, nomeComCopiar, cabecalhoComHint, colunaOrigem, filtroMaiorQue, casaPeriodo, OPCOES_PERIODO, filtroOpcoes, casaOpcaoDosDados, filtroOpcoesDosDados } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { BotaoExportarExcel } from '../../components/BotaoExportarExcel/BotaoExportarExcel';
import { AcoesTabela } from '../../components/AcoesTabela/AcoesTabela';
import { useColunasVisiveis } from '../../components/ColunasVisiveis/useColunasVisiveis';
import { ExpansorPedido } from '../../components/ExpansorPedido/ExpansorPedido';
import { FILTRO_PAGAMENTO, colunaEmpenhoEstado, colunaPagoEm, colunaDiferenca, colunaBaixarOrcamento, kpisEmpenho } from '../../components/ColunasEmpenho/colunasEmpenho';
import { colunaRepedido, rowClassRepedido } from '../../components/Repedido/repedido';
import { colunaAnexosSES } from '../../components/AnexosSES/anexosSES';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';

/**
 * Enviado à SES (task #235, @R 28/08 00:2x): SÓ os pedidos cujo orçamento foi ao
 * Estado e que NÃO acompanhamos nos autos — sem-protocolo comuns + segredos de
 * justiça aguardando resposta. "Não temos que acompanhar e só podemos aguardar um
 * retorno técnico para sabermos se ganhos" (@R 27/08 23:53). Protocolados NÃO
 * entram aqui (fase 5 tem acompanhamento próprio).
 */

interface LinhaEnviadoSes {
  id: number;
  paciente: string;
  procedimento: string;
  area: string | null;
  idade: number | null;
  tipoPaciente?: string | null;
  valorOrcamento: number;
  dataEnvio: string | null;
  dias: number;
  origem: 'segredo' | 'sem_protocolo';
  statusProcesso: string;
  medico: string | null;
  anexos: { id: number; tipo: string; link: string; data: string }[];
  empenhos: { numEmpenho: string; ano: number | null; dataEmpenho: string | null;
    dataPagamento: string | null; valorEmpenhado: number; valorPago: number;
    favorecido: string | null }[];
  empenho548: { pago: number; empenhado: number; nEmpenhos: number; anoMax: number | null } | null;
  sequencial?: number;
  [k: string]: any;
}

// SLA da espera (@R 28/08 02:0x): 120 dias = primeira verificação baixa ·
// 180 dias = verificação recomendada. Duas cores para marcar.
const SLA_VERIFICACAO_1 = 120;
const SLA_VERIFICACAO_2 = 180;

type Resultado = 'ganho' | 'perda' | '';

export function EnviadoSesPage() {
  // Recarrega a tabela quando a ficha muda a situação de um pedido (@R 17/09).
  const { versaoDados } = useFichaPedido();
  const { isReadOnly } = useAccess();
  const readOnly = isReadOnly('protocolados');
  const [loading, setLoading] = useState(false);
  const [linhas, setLinhas] = useState<LinhaEnviadoSes[]>([]);
  const [visiveis, setVisiveis] = useState<LinhaEnviadoSes[]>([]);
  const colunasCfg = useColunasVisiveis('enviado-ses');

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    vezesPedido: { value: null, matchMode: FilterMatchMode.CUSTOM },
    segredo: { value: null, matchMode: 'custom' },
    origemRegistro: { value: null, matchMode: 'custom' },
    sesAnexos: { value: null, matchMode: 'custom' },
    cadastro: { value: null, matchMode: FilterMatchMode.CUSTOM },
    temInteiroTeor: { value: null, matchMode: FilterMatchMode.CUSTOM },
    tipoPaciente: { value: null, matchMode: 'custom' },
    dataEnvio: { value: null, matchMode: FilterMatchMode.CUSTOM },
    valorOrcamento: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
    ...FILTRO_PAGAMENTO,   // filtrar por exato · não exato · empenhado · sem pagamento
    ...FILTROS_IDENTIFICACAO,
    paciente: { value: '', matchMode: FilterMatchMode.CONTAINS },
    procedimento: { value: '', matchMode: FilterMatchMode.CONTAINS },
    // A coluna Médico pedia `filter` mas não tinha entrada AQUI. Numa tabela controlada
    // (filters={filtros}) o PrimeReact não guarda o que você digita numa coluna ausente
    // deste objeto: o campo aceita o texto, a tabela não muda, e nada acusa erro.
    // @R 17/09: "filtro do médico nao está funcionando dropbox ou digitar".
    medico: { value: '', matchMode: FilterMatchMode.CONTAINS },
    dias: { value: null, matchMode: FilterMatchMode.GREATER_THAN_OR_EQUAL_TO },
  });

  // diálogo de resultado (o retorno técnico chegou)
  const [alvo, setAlvo] = useState<LinhaEnviadoSes | null>(null);
  const [resultado, setResultado] = useState<Resultado>('');
  const [valor, setValor] = useState<number | null>(null);
  const [motivoCat, setMotivoCat] = useState<string | null>(null);
  const [parecer, setParecer] = useState('');
  const [salvando, setSalvando] = useState(false);

  // informação avulsa (@R 28/08 01:43: "podemos receber a ligação da médica ou do
  // representante" — a espera não é muda: anotação + anexo entram SEM fechar o pedido)
  const [anotacao, setAnotacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvandoInfo, setSalvandoInfo] = useState(false);

  const salvarInformacao = async () => {
    if (!alvo) return;
    if (!anotacao.trim() && !arquivo) { alert('Escreva a informação recebida ou escolha um arquivo.'); return; }
    setSalvandoInfo(true);
    try {
      if (arquivo) await uploadAnexoOrder(alvo.id, arquivo, 'ACOMPANHAMENTO');
      if (anotacao.trim() || arquivo) {
        await adicionarAcompanhamento(alvo.id, {
          acompanhamento: 'Retorno recebido na espera da SES',
          descricao: anotacao.trim() || `Anexo recebido: ${arquivo?.name}`,
        });
      }
      setAnotacao('');
      setArquivo(null);
      alert('Informação registrada — o pedido continua aguardando o retorno técnico.');
    } catch {
      alert('Erro ao registrar a informação.');
    } finally {
      setSalvandoInfo(false);
    }
  };

  const carregar = () => {
    setLoading(true);
    getEnviadoSes()
      .then(({ data }) => setLinhas(data.map((l: LinhaEnviadoSes, i: number) => ({ ...l, sequencial: i + 1 }))))
      .catch(() => setLinhas([]))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [versaoDados]);
  useEffect(() => { setVisiveis(linhas); }, [linhas]);

  // @R 28/08 02:03: "falta o marcar todos e a numeração dos pedidos" + "a opção de
  // selecionar mais de um" — seleção múltipla igual à tela 5.
  const [selecionadas, setSelecionadas] = useState<LinhaEnviadoSes[]>([]);
  // @R 28/08 02:04: "o frame que abre abaixo do pedido... igual temos em Análise
  // Jurídica, mas abre com as informações do empenho pago".
  const [expandidas, setExpandidas] = useState<any>(undefined);

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtData = (iso: string | null) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  };

  const abrirResultado = (l: LinhaEnviadoSes) => {
    setAlvo(l);
    setResultado('');
    setValor(null);
    setMotivoCat(null);
    setParecer('');
  };

  const salvar = async () => {
    if (!alvo || !resultado) { alert('Selecione Ganho ou Perda.'); return; }
    if (valor === null || valor <= 0) {
      alert(resultado === 'ganho' ? 'Informe o valor ganho.' : 'Informe o valor da causa.');
      return;
    }
    if (resultado === 'perda' && !parecer.trim()) {
      alert('Escreva o motivo da perda (obrigatório).');
      return;
    }
    setSalvando(true);
    try {
      await salvarResultadoSegredo(alvo.id, {
        resultado,
        parecer,
        valorGanho: valor,
        motivoPerdaCategoria: motivoCat ?? undefined,
      });
      setAlvo(null);
      carregar();
    } catch {
      alert('Erro ao salvar o resultado.');
    } finally {
      setSalvando(false);
    }
  };

  const kpis = useMemo(() => ({
    total: visiveis.length,
    segredo: visiveis.filter((l) => l.origem === 'segredo').length,
    semProtocolo: visiveis.filter((l) => l.origem === 'sem_protocolo').length,
    verificar120: visiveis.filter((l) => l.dias >= SLA_VERIFICACAO_1 && l.dias < SLA_VERIFICACAO_2).length,
    verificar180: visiveis.filter((l) => l.dias >= SLA_VERIFICACAO_2).length,
    empenhoPago: visiveis.filter((l) => (l.empenho548?.pago ?? 0) > 0).length,
    empenhoExato: visiveis.filter((l) => (l.empenho548?.pago ?? 0) > 0 && l.valorOrcamento > 0
      && Math.abs((l.empenho548?.pago ?? 0) - l.valorOrcamento) / l.valorOrcamento < 0.005).length,
    valorTotal: visiveis.reduce((acc, l) => acc + (l.valorOrcamento || 0), 0),
    empenho: kpisEmpenho(visiveis),
  }), [visiveis]);

  const filterElement = (options: any, placeholder: string) => (
    <InputText value={options.value || ''} onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder} className="p-column-filter" />
  );

  return (
    <div className="enviado-ses-page">
      <div className="page-header">
        <CabecalhoFase nome="Enviado à SES — sem protocolo" slaTexto="verificar em 120 dias · cobrar em 180" screen="protocolados"
          subtitulo="Orçamento já enviado ao Estado, sem acompanhamento nos autos — só aguardamos o retorno técnico (ganho ou perda)" />
      </div>

      {readOnly && <ReadOnlyBanner />}

      <div className="card">
        <h2 className="mc-tabela-titulo">
          <i className="pi pi-send" />Aguardando retorno técnico da SES
          <ContadorRegistros total={linhas.length} visiveis={visiveis.length} substantivo="pedidos"
            fases={[
              { rotulo: 'segredo de justiça', quantidade: kpis.segredo, tom: 'alerta' },
              { rotulo: 'sem protocolo', quantidade: kpis.semProtocolo, tom: 'ok' },
              { rotulo: '≥120d — 1ª verificação', quantidade: kpis.verificar120, tom: 'alerta' },
              { rotulo: '≥180d — verificação recomendada', quantidade: kpis.verificar180, tom: 'alerta' },
              { rotulo: 'com pagamento no Estado (548)', quantidade: kpis.empenhoPago, tom: 'alerta' },
              { rotulo: 'pago = orçado (conferir baixa)', quantidade: kpis.empenhoExato, tom: 'alerta' },
            ]} />
        </h2>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', margin: '4px 0 8px', fontSize: '0.95em' }}>
          <span><strong>Valor enviado (total):</strong> {kpis.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          <span title="Só sinal forte: pago DEPOIS do pedido ou valor compatível com o orçado"><strong>Pago pelo Estado (sinal forte):</strong> {kpis.empenho.somaPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em {kpis.empenho.nPagos} pedido(s)</span>
          <span style={{ color: '#7c3aed' }}><strong>Pago = orçado:</strong> {kpis.empenho.nExatos} (conferir baixa)</span>
          <span title="Pedidos SEM pagamento atribuível a eles — o que ainda esperamos"><strong>Em aberto:</strong> {kpis.empenho.somaAberto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em {kpis.empenho.nAbertos}</span>
          {kpis.empenho.nHistorico > 0 && <span style={{ opacity: 0.7 }} title="CNJs com pagamento anterior/valor distante — provável outro item do processo">histórico não atribuível: {kpis.empenho.nHistorico}</span>}
        </div>
        <AcoesTabela filtros={filters} aoMudarFiltros={setFilters}>
          <BotaoExportarExcel todos={linhas} visiveis={visiveis} nome="enviado-ses" />
          {colunasCfg.botao}
        </AcoesTabela>
        <DataTable scrollable rowClassName={rowClassRepedido}
          aria-label="Pedidos enviados à SES aguardando retorno técnico"
          value={linhas} dataKey="id" paginator rows={50} rowsPerPageOptions={[10, 20, 50, 100, 200]}
          selection={selecionadas} selectionMode="checkbox"
          onSelectionChange={(e) => setSelecionadas(e.value as LinhaEnviadoSes[])}
          expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
          rowExpansionTemplate={(r: any) => <ExpansorPedido linha={r} />}
          onValueChange={(v) => setVisiveis(v as LinhaEnviadoSes[])}
          filters={filters} onFilter={(e) => setFilters(e.filters)} filterDisplay="row"
          sortField="dias" sortOrder={-1}
          loading={loading} tableStyle={{ minWidth: '95rem' }}
          emptyMessage="Nenhum pedido aguardando retorno da SES — quando um orçamento for enviado sem protocolo (ou em segredo de justiça), ele aparece aqui."
        >{colunasCfg.filtrar(<>

          <Column expander style={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} frozen alignFrozen="left" />
          <Column field="sequencial" header="#" style={{ minWidth: '4rem' }}  frozen alignFrozen="left" />
          {/* Ações da fase ao lado do paciente (@R 29/08) — mesmos botões, agora fixos à esquerda. */}
{colunaAcoesFase({ corpo: (r: any) => <>{(((r: LinhaEnviadoSes) => (!readOnly
              ? <Button label="Registrar" icon="pi pi-flag" size="small" outlined onClick={() => abrirResultado(r)} />
              : null)) as any)(r)}</>, excluir: carregar })}
          <Column field="paciente" className="col-paciente-upper" header={cabecalhoComHint('Paciente', 'Nome do beneficiário, em MAIÚSCULAS sem acento (padrão de busca).')} filter
            filterElement={(o) => filterElement(o, 'Buscar')}
            body={(r: LinhaEnviadoSes) => nomeComCopiar(r.paciente)} style={{ minWidth: '16rem' }}  frozen alignFrozen="left" />
          {colunaOrigem(linhas)}
          {/* @R 17/09: a posicao de Segredo e a MESMA em todas as fases — logo depois de
              Origem. Coluna que muda de lugar obriga a procurar de novo em cada aba. */}
          {colunaSegredo(undefined, linhas)}
          {colunaRepedido(linhas)}
          <Column field="idade" header={cabecalhoComHint('Idade', 'Idade do paciente hoje, calculada da data de nascimento.')} sortable style={{ minWidth: '5rem' }} />
          <Column field="tipoPaciente"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaOpcaoDosDados}
            filterElement={filtroOpcoesDosDados(linhas, (l: any) => l?.tipoPaciente, 'Todos')} header={cabecalhoComHint('Grupo etário', 'Pediátrico (<18) · Adulto · Idoso (60+). Muda o médico certo e o risco de segredo.')} sortable style={{ minWidth: '7rem' }}
            body={(r: LinhaEnviadoSes) => tagTipoPaciente(r.tipoPaciente)} />
          <Column field="procedimento" header={cabecalhoComHint('Procedimento', 'O que a decisão judicial determinou. É a chave para achar o preço histórico.')} sortable filter
            filterElement={(o) => filterElement(o, 'BUSCAR')} style={{ minWidth: '18rem' }} />
          <Column field="medico" header={cabecalhoComHint('Médico', 'Profissional da rede que cotou (ou vai cotar) este procedimento.')} sortable filter
            filterElement={(o) => filterElement(o, 'Buscar')} style={{ minWidth: '13rem' }}
            body={(r: LinhaEnviadoSes) => r.medico ?? <span style={{ opacity: 0.5 }}>—</span>} />
          <Column field="origem" header={cabecalhoComHint('Origem', 'Por que está nesta fila: segredo de justiça ou sem protocolo (prazo perdido).')} sortable style={{ minWidth: '10rem' }}
            body={(r: LinhaEnviadoSes) => (r.origem === 'segredo'
              ? <Tag value="Segredo de Justiça" severity="danger" icon="pi pi-lock" />
              : <Tag value="Sem protocolo" severity="warning" icon="pi pi-file-excel"
                  title="Orçamento foi à SES, mas o protocolo nos autos ficou de fora (prazo)" />)} />
          <Column field="valorOrcamento"
            filter showFilterMenu={false} dataType="numeric"
            filterElement={filtroMaiorQue('acima de…')} header={cabecalhoComHint('Valor enviado', 'Valor do orçamento que enviamos ao Estado por este pedido.')} sortable style={{ minWidth: '9rem' }}
            body={(r: LinhaEnviadoSes) => (r.valorOrcamento ? fmtBRL(r.valorOrcamento) : '—')} />
          <Column field="dataEnvio"
            filter showFilterMenu={false} filterMatchMode="custom"
            filterFunction={casaPeriodo}
            filterElement={filtroOpcoes(OPCOES_PERIODO, 'Todas')} header={cabecalhoComHint('Enviado em', 'Data em que o orçamento foi enviado ao Estado.')} sortable style={{ minWidth: '8rem' }}
            body={(r: LinhaEnviadoSes) => fmtData(r.dataEnvio)} />
          <Column field="dias" header={cabecalhoComHint('Aguardando', 'Dias corridos desde o envio à SES — ou desde a chegada do pedido, quando ainda não houve envio.')} sortable filter
            dataType="numeric" filterElement={filtroMaiorQue('mais de…')} style={{ minWidth: '8rem' }}
            body={(r: LinhaEnviadoSes) => (r.dias >= SLA_VERIFICACAO_2
              ? <Tag value={`${r.dias}d`} severity="danger" icon="pi pi-exclamation-triangle"
                  title={`${SLA_VERIFICACAO_2}+ dias sem retorno — verificação RECOMENDADA junto à SES`} />
              : r.dias >= SLA_VERIFICACAO_1
                ? <Tag value={`${r.dias}d`} severity="warning" icon="pi pi-clock"
                    title={`${SLA_VERIFICACAO_1}+ dias sem retorno — primeira verificação baixa`} />
                : <span>{r.dias}d</span>)} />
          {colunaAnexosSES(linhas)}
          {colunaCnj()}
          {colunaSei()}
          {colunaComarca()}
          {colunaCadastro()}
          {colunaInteiroTeor()}
          {colunaSolicitante('13rem', linhas)}
          {colunaBaixarOrcamento()}
          {colunaEmpenhoEstado()}
          {colunaPagoEm()}
          {colunaDiferenca()}
          </>)}
</DataTable>
      </div>

      <Dialog header={`Retorno técnico — ${alvo?.paciente ?? ''}`} visible={!!alvo} modal
        style={{ width: '42rem', maxWidth: '96vw' }} onHide={() => setAlvo(null)}>
        <div className="field">
          <label>O que a SES respondeu?</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <Button label="Procedente (Ganho)" severity={resultado === 'ganho' ? 'success' : 'secondary'}
              outlined={resultado !== 'ganho'}
              onClick={() => { setResultado('ganho'); setValor(alvo?.valorOrcamento || null); }} />
            <Button label="Improcedente (Perda)" severity={resultado === 'perda' ? 'danger' : 'secondary'}
              outlined={resultado !== 'perda'}
              onClick={() => { setResultado('perda'); setValor(null); }} />
          </div>
        </div>
        {resultado !== '' && (
          <div className="field" style={{ marginTop: '12px' }}>
            <label>{resultado === 'ganho' ? 'Valor ganho' : 'Valor da causa'}</label>
            <InputNumber value={valor ?? undefined} onValueChange={(e) => setValor(e.value ?? null)}
              mode="currency" currency="BRL" locale="pt-BR"
              className={valor === null || valor <= 0 ? 'p-invalid' : ''} />
          </div>
        )}
        {resultado === 'perda' && (
          <div className="field" style={{ marginTop: '12px' }}>
            <label>Status da perda (escolha o que aconteceu — o motivo escrito continua obrigatório)</label>
            <Dropdown value={motivoCat} onChange={(e) => setMotivoCat(e.value)}
              options={[
                { label: 'SES não respondeu ao orçamento', value: 'SES_SEM_RESPOSTA' },
                { label: 'Perda de prazo de protocolação', value: 'PRAZO_PROTOCOLACAO' },
                { label: 'Perda por segredo de justiça', value: 'SEGREDO_DE_JUSTICA' },
                { label: 'Sem exames — médico não quis cotar', value: 'SEM_EXAMES' },
                { label: 'Não localizamos profissional', value: 'MEDICO_NAO_LOCALIZADO' },
                { label: 'Médico recusou a cotação', value: 'MEDICO_RECUSOU' },
                { label: 'Outro (ver justificativa)', value: 'OUTRO' },
              ]}
              placeholder="Escolha o status da perda" showClear style={{ width: '100%' }} />
          </div>
        )}
        {resultado !== '' && (
          <div className="field" style={{ marginTop: '12px' }}>
            <label>Parecer{resultado === 'perda' && <span style={{ color: '#ef4444' }}> *obrigatório</span>}</label>
            <InputTextarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={4} autoResize
              placeholder="Descreva o retorno técnico recebido..." style={{ width: '100%' }} />
          </div>
        )}
        <div className="field" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--surface-border, #e2e8f0)' }}>
          <label style={{ fontWeight: 600 }}>
            <i className="pi pi-phone" style={{ marginRight: '6px' }} />
            Recebeu uma ligação ou documento? Registre sem fechar o pedido
          </label>
          <InputTextarea value={anotacao} onChange={(e) => setAnotacao(e.target.value)} rows={2} autoResize
            placeholder="Ex.: a médica ligou informando que a cirurgia foi agendada..."
            style={{ width: '100%', marginTop: '6px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
            <input type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <Button label="Salvar informação" icon="pi pi-save" size="small" outlined
              loading={salvandoInfo} disabled={salvandoInfo} onClick={salvarInformacao} />
          </div>
        </div>
        <div className="dialog-footer-actions" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button label="Cancelar" outlined onClick={() => setAlvo(null)} />
          <Button label="Salvar resultado" icon="pi pi-check" loading={salvando}
            disabled={salvando || !resultado} onClick={salvar}
            severity={resultado === 'ganho' ? 'success' : resultado === 'perda' ? 'danger' : undefined} />
        </div>
      </Dialog>
    </div>
  );
}
