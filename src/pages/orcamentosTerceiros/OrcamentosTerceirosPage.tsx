import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Dropdown } from 'primereact/dropdown';
import { TabView, TabPanel } from 'primereact/tabview';
import { Tag } from 'primereact/tag';
import { getAcervoPrecos, getOrcamentosTerceiros } from '../../services/api/orders';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';
import { ContadorRegistros } from '../../components/ContadorRegistros/ContadorRegistros';
import './OrcamentosTerceirosPage.css';

/**
 * ACERVO DE PREÇOS (@R 28/08 18:50): "lapidar a interface... escolher por especialidade,
 * ter uma central de mais pedidos para verificar, e poder digitar ali por nome... usar tbm
 * a base da judicializacao.db".
 *
 * Unidade da tela é o PROCEDIMENTO (decisão 796f87623a), não o orçamento solto. Cada linha
 * traz as quatro lentes lado a lado — o que NÓS cobramos, o que TERCEIROS cobraram (quem
 * venceu e quem perdeu), o que o ESTADO pagou e quantos DOCUMENTOS de prova temos — com o N
 * sempre à vista: mediana de um caso é um caso, não régua. Abrir a linha mostra os orçamentos
 * de terceiros individuais (prestador, valor, página, arquivo) e os pedidos ainda sem
 * orçamento — a "central de mais pedidos para verificar" (decisão a81d86bc2b).
 */

type Stats = { n: number; mediana?: number; min?: number; max?: number; amostraPequena?: boolean };
type Linha = {
  chave: string; procedimento: string; especialidades: string[];
  demanda: { pedidos: number; semOrcamento: number; pedidosSemOrcamentoIds: number[]; perdas: number };
  nos: Stats; terceiros: Stats & { vencedor: Stats; concorrente: Stats; prestadores: number };
  estado: Stats; documentos: number;
};

const brl = (v?: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Uma lente: mediana grande, N e faixa pequenos. N < 3 fica marcado — o número não vira régua. */
function Lente({ s, vazio = 'sem dado' }: { s?: Stats; vazio?: string }) {
  if (!s || !s.n) return <span className="acv-lente acv-lente--vazia">{vazio}</span>;
  return (
    <span className={`acv-lente${s.amostraPequena ? ' acv-lente--fraca' : ''}`}
      title={`n=${s.n} · de ${brl(s.min)} a ${brl(s.max)}`}>
      <span className="acv-lente-valor">{brl(s.mediana)}</span>
      <span className="acv-lente-n">n={s.n}{s.amostraPequena ? ' · amostra pequena' : ''}</span>
    </span>
  );
}

/** Detalhe da linha: os orçamentos de terceiros daquele procedimento + pedidos sem orçamento. */
function DetalheProcedimento({ linha }: { linha: Linha }) {
  const [itens, setItens] = useState<any[] | null>(null);
  useEffect(() => {
    getOrcamentosTerceiros({ procedimento: linha.procedimento })
      .then(({ data }) => setItens(data.itens ?? []))
      .catch(() => setItens([]));
  }, [linha.procedimento]);

  return (
    <div className="acv-detalhe">
      <div className="acv-detalhe-bloco">
        <h4>Orçamentos de terceiros <small>({itens ? itens.length : '…'})</small></h4>
        {itens && itens.length === 0 && <p className="acv-vazio">Nenhum orçamento de terceiro extraído para este procedimento ainda.</p>}
        {itens && itens.length > 0 && (
          <DataTable value={itens} size="small" dataKey="id" sortField="valorTotal" sortOrder={-1}
            className="acv-subtabela" aria-label={`Orçamentos de terceiros — ${linha.procedimento}`}>
            <Column field="prestador" header="Prestador" sortable
              body={(r) => r.prestador || <span className="acv-vazio">não informado</span>} />
            <Column field="categoria" header="Papel" style={{ width: '9rem' }}
              body={(r) => r.categoria
                ? <Tag value={r.categoria === 'VENCEDOR' ? 'venceu' : r.categoria === 'CONCORRENTE' ? 'concorreu' : r.categoria.toLowerCase()}
                    severity={r.categoria === 'VENCEDOR' ? 'success' : 'info'} />
                : <span className="acv-vazio">—</span>} />
            <Column field="valorTotal" header="Valor" sortable style={{ width: '9rem' }}
              bodyStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} body={(r) => brl(r.valorTotal)} />
            <Column field="dataOrcamento" header="Data" sortable style={{ width: '7.5rem' }} body={(r) => r.dataOrcamento || '—'} />
            <Column field="paciente" header="Paciente / pedido"
              body={(r) => <span>{r.paciente || '—'}{r.orderId ? <span className="acv-pedido-id">#{r.orderId}</span> : null}</span>} />
            <Column header="Conferido" style={{ width: '7rem' }} bodyStyle={{ textAlign: 'center' }}
              body={(r) => r.confirmado ? <Tag value="sim" severity="success" /> : <Tag value="não" severity="warning" />} />
            <Column header="Origem" style={{ width: '8rem' }} bodyStyle={{ textAlign: 'center' }}
              body={(r) => (r.linkArquivo
                ? <a href={r.linkArquivo} target="_blank" rel="noreferrer" className="acv-baixar" title="Abrir o documento de origem">
                    <i className="pi pi-download" /> {r.paginaOrigem ? `p. ${r.paginaOrigem}` : 'baixar'}
                  </a>
                : (r.paginaOrigem ? `p. ${r.paginaOrigem}` : <span className="acv-vazio">—</span>))} />
          </DataTable>
        )}
      </div>

      <div className="acv-detalhe-bloco">
        <h4>Pedidos sem orçamento nosso <small>({linha.demanda.semOrcamento})</small></h4>
        {linha.demanda.semOrcamento === 0
          ? <p className="acv-vazio">Todos os pedidos deste procedimento já têm orçamento.</p>
          : <div className="acv-ids">
              {linha.demanda.pedidosSemOrcamentoIds.map((id) => <span key={id} className="acv-id-chip">#{id}</span>)}
              {linha.demanda.semOrcamento > linha.demanda.pedidosSemOrcamentoIds.length &&
                <span className="acv-vazio">+{linha.demanda.semOrcamento - linha.demanda.pedidosSemOrcamentoIds.length} mais</span>}
            </div>}
      </div>
    </div>
  );
}

export function OrcamentosTerceirosPage() {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [expandidas, setExpandidas] = useState<any>(null);

  const carregar = (esp: string | null, texto: string) => {
    setLoading(true);
    const params: any = {};
    if (esp) params.especialidade = esp;
    if (texto) params.q = texto;
    getAcervoPrecos(params)
      .then(({ data }) => {
        setLinhas(data.linhas ?? []);
        setResumo(data.resumo ?? {});
        // A lista de especialidades só se renova sem filtro — senão o dropdown encolhe até sumir.
        if (!esp && !texto) setEspecialidades(data.especialidades ?? []);
        else if (!especialidades.length && data.especialidades?.length) setEspecialidades(data.especialidades);
      })
      .catch(() => { setLinhas([]); setResumo({}); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { carregar(null, ''); }, []);

  const aplicar = (esp = especialidade, texto = q.trim()) => { setBusca(texto); carregar(esp, texto); };
  const limpar = () => { setQ(''); setBusca(''); setEspecialidade(null); carregar(null, ''); };

  const semOrcamento = useMemo(
    () => [...linhas].filter((l) => l.demanda.semOrcamento > 0).sort((a, b) => b.demanda.semOrcamento - a.demanda.semOrcamento),
    [linhas]);
  const demanda = useMemo(() => [...linhas].sort((a, b) => b.demanda.pedidos - a.demanda.pedidos), [linhas]);
  const totais = useMemo(() => ({
    pedidos: linhas.reduce((s, l) => s + l.demanda.pedidos, 0),
    comNos: linhas.filter((l) => l.nos.n > 0).length,
    comTerceiros: linhas.filter((l) => l.terceiros.n > 0).length,
    comEstado: linhas.filter((l) => l.estado.n > 0).length,
  }), [linhas]);

  const filtroAtivo = Boolean(especialidade || busca);

  return (
    <div className="acv-page">
      <div className="page-header acv-header">
        <div>
          <h1><i className="pi pi-dollar" /> Acervo de preços</h1>
          <p className="acv-sub">
            Um procedimento por linha e quatro lentes de preço lado a lado: o que <strong>nós</strong> cobramos,
            o que <strong>terceiros</strong> cobraram, o que o <strong>Estado</strong> pagou e quantos
            <strong> documentos</strong> temos. O <em>n</em> fica sempre à vista — mediana de um caso é um caso.
          </p>
        </div>
      </div>

      <div className="acv-toolbar" role="search">
        <Dropdown value={especialidade} options={especialidades} placeholder="Todas as especialidades"
          showClear filter className="acv-especialidade" aria-label="Filtrar por especialidade"
          onChange={(e) => { setEspecialidade(e.value ?? null); aplicar(e.value ?? null); }} />
        <IconField iconPosition="left" className="acv-busca">
          <InputIcon className="pi pi-search" />
          <InputText value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); }}
            placeholder="Digite o procedimento — ex.: artroplastia de quadril" aria-label="Buscar procedimento" />
        </IconField>
        <Button label="Buscar" icon="pi pi-search" onClick={() => aplicar()} />
        <Button label="Limpar" outlined onClick={limpar} disabled={!filtroAtivo && !q} />
      </div>

      <div className="acv-kpis">
        <div className="acv-kpi"><span className="acv-kpi-rot">Procedimentos</span><strong>{linhas.length}</strong>
          <span className="acv-kpi-sub">{totais.pedidos} pedidos{filtroAtivo ? ' no filtro' : ''}</span></div>
        <div className="acv-kpi acv-kpi--alerta"><span className="acv-kpi-rot">Pedidos sem orçamento</span>
          <strong>{resumo.pedidosSemOrcamento ?? 0}</strong><span className="acv-kpi-sub">{semOrcamento.length} procedimentos a verificar</span></div>
        <div className="acv-kpi"><span className="acv-kpi-rot">Com preço nosso</span><strong>{totais.comNos}</strong>
          <span className="acv-kpi-sub">procedimentos</span></div>
        <div className="acv-kpi"><span className="acv-kpi-rot">Com preço de terceiros</span><strong>{totais.comTerceiros}</strong>
          <span className="acv-kpi-sub">{resumo.orcamentosTerceiros ?? 0} orçamentos no acervo</span></div>
        <div className="acv-kpi"><span className="acv-kpi-rot">Com pagamento do Estado</span><strong>{totais.comEstado}</strong>
          <span className="acv-kpi-sub">procedimentos (empenhos)</span></div>
      </div>

      <TabView className="acv-tabs">
        <TabPanel header={`Acervo por procedimento (${linhas.length})`} leftIcon="pi pi-table mr-2">
          <ContadorRegistros total={linhas.length} visiveis={linhas.length} substantivo="procedimentos" />
          <DataTable value={linhas} loading={loading} dataKey="chave" paginator rows={25}
            rowsPerPageOptions={[25, 50, 100, 200]} sortField="demanda.pedidos" sortOrder={-1}
            expandedRows={expandidas} onRowToggle={(e) => setExpandidas(e.data)}
            rowExpansionTemplate={(l: Linha) => <DetalheProcedimento linha={l} />}
            rowClassName={(l: Linha) => (l.demanda.semOrcamento > 0 ? 'acv-linha-pendente' : '')}
            emptyMessage="Nenhum procedimento encontrado para este filtro." className="acv-tabela"
            aria-label="Acervo de preços por procedimento">
            <Column expander style={{ width: '3rem' }} />
            <Column field="procedimento" header="Procedimento" sortable style={{ minWidth: '18rem' }}
              body={(l: Linha) => (
                <div className="acv-proc">
                  <span className="acv-proc-nome">{l.procedimento}</span>
                  {l.especialidades.length > 0 && <span className="acv-proc-esp">{l.especialidades.join(' · ')}</span>}
                </div>)} />
            <Column field="demanda.pedidos" header={cabecalhoComHint('Demanda', 'Pedidos que chegaram com este procedimento · quantos ainda estão sem orçamento nosso · quantos perdemos')}
              sortable style={{ width: '11rem' }}
              body={(l: Linha) => (
                <span className="acv-demanda">
                  <strong>{l.demanda.pedidos}</strong> pedidos
                  {l.demanda.semOrcamento > 0 && <span className="acv-chip acv-chip--alerta">{l.demanda.semOrcamento} sem orçamento</span>}
                  {l.demanda.perdas > 0 && <span className="acv-chip acv-chip--perda">{l.demanda.perdas} perda{l.demanda.perdas > 1 ? 's' : ''}</span>}
                </span>)} />
            <Column field="nos.mediana" header={cabecalhoComHint('Nós cobramos', 'Mediana dos nossos orçamentos para este procedimento (valorOrcamento dos pedidos)')}
              sortable style={{ width: '11rem' }} body={(l: Linha) => <Lente s={l.nos} vazio="nunca orçamos" />} />
            <Column field="terceiros.mediana" header={cabecalhoComHint('Terceiros cobraram', 'Mediana dos orçamentos de outros prestadores extraídos das peças · abaixo, o preço de quem VENCEU')}
              sortable style={{ width: '12rem' }}
              body={(l: Linha) => (
                <span className="acv-lente-dupla">
                  <Lente s={l.terceiros} vazio="sem terceiros" />
                  {l.terceiros.vencedor?.n > 0 && <span className="acv-vencedor">venceu: {brl(l.terceiros.vencedor.mediana)} <small>n={l.terceiros.vencedor.n}</small></span>}
                </span>)} />
            <Column field="estado.mediana" header={cabecalhoComHint('Estado pagou', 'Mediana do que o Estado efetivamente pagou (empenhos ligados por número do processo)')}
              sortable style={{ width: '11rem' }} body={(l: Linha) => <Lente s={l.estado} vazio="sem empenho" />} />
            <Column field="documentos" header={cabecalhoComHint('Docs', 'Exames, laudos e relatórios anexados aos pedidos deste procedimento')}
              sortable style={{ width: '5.5rem' }} bodyStyle={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              body={(l: Linha) => l.documentos || <span className="acv-vazio">0</span>} />
          </DataTable>
        </TabPanel>

        <TabPanel header={`Pedidos sem orçamento (${resumo.pedidosSemOrcamento ?? 0})`} leftIcon="pi pi-exclamation-circle mr-2">
          <p className="acv-tab-intro">
            A central de verificação: procedimentos com pedidos que ainda não têm orçamento nosso, os mais
            urgentes primeiro. Ao lado, a referência de preço que já temos para cotar com margem.
          </p>
          <DataTable value={semOrcamento} loading={loading} dataKey="chave" paginator rows={25} rowsPerPageOptions={[25, 50, 100]}
            emptyMessage="Nenhum pedido sem orçamento neste filtro." className="acv-tabela" aria-label="Pedidos sem orçamento por procedimento">
            <Column field="procedimento" header="Procedimento" sortable style={{ minWidth: '18rem' }}
              body={(l: Linha) => <div className="acv-proc"><span className="acv-proc-nome">{l.procedimento}</span>
                {l.especialidades.length > 0 && <span className="acv-proc-esp">{l.especialidades.join(' · ')}</span>}</div>} />
            <Column field="demanda.semOrcamento" header="Sem orçamento" sortable style={{ width: '9rem' }}
              bodyStyle={{ fontVariantNumeric: 'tabular-nums' }}
              body={(l: Linha) => <span className="acv-chip acv-chip--alerta acv-chip--grande">{l.demanda.semOrcamento} de {l.demanda.pedidos}</span>} />
            <Column header="Pedidos" style={{ minWidth: '14rem' }}
              body={(l: Linha) => <div className="acv-ids">{l.demanda.pedidosSemOrcamentoIds.map((id) => <span key={id} className="acv-id-chip">#{id}</span>)}</div>} />
            <Column header="Referência de preço" style={{ minWidth: '16rem' }}
              body={(l: Linha) => (
                <span className="acv-ref">
                  {l.nos.n > 0 && <span>nós <Lente s={l.nos} /></span>}
                  {l.terceiros.n > 0 && <span>terceiros <Lente s={l.terceiros} /></span>}
                  {l.estado.n > 0 && <span>Estado <Lente s={l.estado} /></span>}
                  {!l.nos.n && !l.terceiros.n && !l.estado.n && <span className="acv-vazio">nenhuma referência ainda — cotar do zero</span>}
                </span>)} />
          </DataTable>
        </TabPanel>

        <TabPanel header="Demanda" leftIcon="pi pi-chart-bar mr-2">
          <p className="acv-tab-intro">O que mais chega: procedimentos ordenados pelo número de pedidos, com o que já temos de referência para cada um.</p>
          <DataTable value={demanda.slice(0, 100)} loading={loading} dataKey="chave" className="acv-tabela" aria-label="Demanda por procedimento">
            <Column field="procedimento" header="Procedimento" style={{ minWidth: '18rem' }}
              body={(l: Linha) => <div className="acv-proc"><span className="acv-proc-nome">{l.procedimento}</span>
                {l.especialidades.length > 0 && <span className="acv-proc-esp">{l.especialidades.join(' · ')}</span>}</div>} />
            <Column header="Pedidos" style={{ minWidth: '16rem' }}
              body={(l: Linha) => {
                const max = demanda[0]?.demanda.pedidos || 1;
                return (
                  <span className="acv-barra-wrap" title={`${l.demanda.pedidos} pedidos · ${l.demanda.semOrcamento} sem orçamento · ${l.demanda.perdas} perdas`}>
                    <span className="acv-barra" style={{ width: `${Math.max(4, (l.demanda.pedidos / max) * 100)}%` }}>
                      <span className="acv-barra-pend" style={{ width: `${(l.demanda.semOrcamento / l.demanda.pedidos) * 100}%` }} />
                    </span>
                    <strong>{l.demanda.pedidos}</strong>
                  </span>);
              }} />
            <Column header="Cobertura de preço" style={{ width: '14rem' }}
              body={(l: Linha) => (
                <span className="acv-cobertura">
                  <span className={l.nos.n ? 'on' : ''} title="nós">nós</span>
                  <span className={l.terceiros.n ? 'on' : ''} title="terceiros">terceiros</span>
                  <span className={l.estado.n ? 'on' : ''} title="Estado">Estado</span>
                  <span className={l.documentos ? 'on' : ''} title="documentos">docs</span>
                </span>)} />
            <Column field="demanda.perdas" header="Perdas" style={{ width: '6rem' }} bodyStyle={{ textAlign: 'center' }}
              body={(l: Linha) => l.demanda.perdas ? <span className="acv-chip acv-chip--perda">{l.demanda.perdas}</span> : <span className="acv-vazio">0</span>} />
          </DataTable>
        </TabPanel>
      </TabView>
    </div>
  );
}
