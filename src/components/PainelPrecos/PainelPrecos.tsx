import { useEffect, useState } from 'react';
import { Chart } from 'primereact/chart';
import { getPrecosProcedimento, getInteligenciaPedido } from '../../services/api/orders';
import './PainelPrecos.css';

/**
 * Painel de preços do procedimento (task #207, 27/08/2026 — mandato @R na tela Jurídico).
 *
 * POR QUE: ao analisar um pedido, o jurídico precisa saber quanto o Estado vem pagando por
 * AQUELA cirurgia — não a média solta, mas a distribuição, os últimos pagamentos com data e
 * ONDE aconteceram. Abre dentro da própria linha da tabela: a decisão acontece ali, não em
 * outra tela.
 *
 * Carrega SÓ quando a linha é expandida (a consulta leva ~5s na 1ª vez; o backend cacheia 6h).
 * A escala do gráfico usa a MEDIANA como linha-guia, não a média: em quadril a média é
 * R$ 54 mil contra mediana de R$ 38 mil porque um pagamento de R$ 121 mil puxa tudo.
 */

interface Pagamento {
  data: string;
  valor: number;
  comarca: string | null;
  distancia_km: number | null;
  num_empenho: string | null;
}

interface Precos {
  estatistica: {
    n: number;
    moda: number | null;
    moda_frequencia: number;
    media: number | null;
    media_suspeita?: boolean;
    p25?: number | null;
    p75?: number | null;
    excluidos_nao_positivos?: number;
    mediana: number | null;
    minimo: number | null;
    maximo: number | null;
  };
  serie: Pagamento[];
  pagamentos: Pagamento[];
  historico: Pagamento[];                                   // todos, mais recente primeiro
  casos_por_mes: { mes: string; casos: number; total: number }[];
  janela_dias: number | null;
  janela_ampliada: boolean;
  total_na_fonte: number;
  base_distancia: string;
  sem_comarca: number;
  erro: string | null;
}

const moeda = (v: number | null) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const dataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano.slice(2)}`;
};

const mesCurto = (aaaaMm: string) => {
  const [ano, mes] = aaaaMm.split('-');
  return `${mes}/${ano.slice(2)}`;
};

/** Os 5 números sobre um subconjunto (mês clicado) — mesma régua do backend, no cliente. */
function estatisticaLocal(valores: number[]): Precos['estatistica'] {
  // Régua anti-média-ficção (lição 548, fecho #7a92fe4b): estorno/zero fora COM
  // contador; mediana + miolo p25-p75 guiam; média ganha aviso quando dista >2x.
  const excluidos = valores.filter((v) => v <= 0).length;
  const validos = valores.filter((v) => v > 0);
  if (!validos.length) return { n: 0, excluidos_nao_positivos: excluidos, moda: null, moda_frequencia: 0, media: null, media_suspeita: false, p25: null, p75: null, mediana: null, minimo: null, maximo: null };
  const ord = [...validos].sort((a, b) => a - b);
  const cont = new Map<number, number>();
  for (const v of validos) cont.set(v, (cont.get(v) ?? 0) + 1);
  const [modaV, modaF] = [...cont.entries()].sort((a, b) => b[1] - a[1])[0];
  const meio = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 ? ord[meio] : Math.round(((ord[meio - 1] + ord[meio]) / 2) * 100) / 100;
  const media = Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100) / 100;
  // quantis método statistics.quantiles(n=4) exclusivo (mesma conta do Python p/ JS==PY)
  const q = (k: number): number => {
    const pos = (k * (ord.length + 1)) / 4;
    const i = Math.floor(pos) - 1;
    if (i < 0) return ord[0];
    if (i + 1 >= ord.length) return ord[ord.length - 1];
    return Math.round((ord[i] + (ord[i + 1] - ord[i]) * (pos - Math.floor(pos))) * 100) / 100;
  };
  return {
    n: validos.length,
    excluidos_nao_positivos: excluidos,
    moda: modaF > 1 ? modaV : null,
    moda_frequencia: modaF > 1 ? modaF : 0,
    media,
    media_suspeita: mediana > 0 && media > 2 * mediana,
    p25: ord.length >= 4 ? q(1) : null,
    p75: ord.length >= 4 ? q(3) : null,
    mediana,
    minimo: ord[0],
    maximo: ord[ord.length - 1],
  };
}

/** Frase honesta sobre QUAL período está na tela — número sem janela engana. */
function textoJanela(p: Precos): string {
  if (p.janela_dias === null) {
    return `sem pagamentos no último ano — mostrando todo o histórico (${p.estatistica.n} desde o registro mais antigo)`;
  }
  if (p.janela_ampliada) {
    return `poucos pagamentos em 90 dias — ampliado para 12 meses (${p.estatistica.n} pagamentos)`;
  }
  return `últimos 90 dias · ${p.estatistica.n} pagamentos de ${p.total_na_fonte} no histórico`;
}

// Memória da sessão (módulo, sobrevive a abrir/fechar a linha): a 1ª consulta de um pedido
// custa ~5s na API pública; reabrir a MESMA linha não pode custar de novo. O backend já
// cacheia 6h por procedimento — esta camada elimina até o round-trip HTTP na reabertura.
const memoriaPrecos = new Map<number, Precos>();

export function PainelPrecos({ orderId, procedimento, nossoPreco }: {
  orderId: number;
  procedimento: string;
  nossoPreco?: number | null;
}) {
  const [dados, setDados] = useState<Precos | null>(() => memoriaPrecos.get(orderId) ?? null);
  // @R 28/08 03:21: "cadê a parte para eu ver os valores NOSSOS para o procedimento
  // e quanto estamos concorrendo?" — os nossos envios vêm da memória do pedido.
  const [nossos, setNossos] = useState<any>(null);
  const [enviosNossos, setEnviosNossos] = useState<any[]>([]);
  useEffect(() => {
    getInteligenciaPedido(orderId)
      .then(({ data }) => {
        setNossos(data?.precos_similares ?? null);
        // @R 28/08 03:2x: "mostrar o nosso médico, valores dos envios e datas...
        // separado, abaixo do gráfico" — a experiência similar tem tudo isso.
        setEnviosNossos((data?.experiencia ?? []).filter((e: any) => e.valor_respondido));
      })
      .catch(() => { setNossos(null); setEnviosNossos([]); });
  }, [orderId]);
  const [carregando, setCarregando] = useState(!memoriaPrecos.has(orderId));
  const [falhou, setFalhou] = useState(false);
  const [filtroMes, setFiltroMes] = useState<string | null>(null);   // 'AAAA-MM' clicado na linha

  useEffect(() => {
    const guardado = memoriaPrecos.get(orderId);
    if (guardado) {
      // Depuração: rastro no DevTools (Console) de onde o dado veio e quanto custou.
      console.debug(`[PainelPrecos] pedido ${orderId}: memória da sessão (0ms) · "${procedimento}"`);
      setDados(guardado);
      setCarregando(false);
      return;
    }
    let vivo = true;
    const t0 = performance.now();
    setCarregando(true);
    setFalhou(false);
    getPrecosProcedimento(orderId)
      .then(({ data }) => {
        const ms = Math.round(performance.now() - t0);
        console.debug(
          `[PainelPrecos] pedido ${orderId}: API em ${ms}ms · janela=${data?.janela_dias ?? 'histórico'}d ` +
          `· n=${data?.estatistica?.n ?? 0} · erro=${data?.erro ?? 'nenhum'} · "${procedimento}"`,
        );
        if (data?.erro) console.warn(`[PainelPrecos] fonte declarou: ${data.erro}`);
        memoriaPrecos.set(orderId, data);
        if (vivo) setDados(data);
      })
      .catch((err) => {
        console.warn(
          `[PainelPrecos] pedido ${orderId}: consulta FALHOU em ${Math.round(performance.now() - t0)}ms ` +
          `(${err?.response?.status ?? 'sem resposta — backend offline?'})`, err,
        );
        if (vivo) setFalhou(true);
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [orderId, procedimento]);

  if (carregando) {
    return (
      <div className="painel-precos painel-precos--aviso">
        <i className="pi pi-spin pi-spinner" />
        <span>Consultando os pagamentos públicos deste procedimento… (a primeira consulta leva alguns segundos)</span>
      </div>
    );
  }

  if (falhou || !dados) {
    // Fallback offline: distingue "sem internet/servidor fora" (navigator.onLine) de erro
    // da consulta — e nunca trava a análise do pedido, que é o trabalho principal da tela.
    const semRede = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="painel-precos painel-precos--aviso" role="alert">
        <i className="pi pi-exclamation-triangle" />
        <span>
          {semRede
            ? 'Sem conexão com a internet — os preços públicos não puderam ser consultados.'
            : 'Não foi possível consultar os preços agora (detalhe no Console do navegador).'}
          {' '}A análise do pedido segue normalmente.
        </span>
      </div>
    );
  }

  if (dados.erro || dados.estatistica.n === 0) {
    return (
      <div className="painel-precos painel-precos--aviso">
        <i className="pi pi-info-circle" />
        <span>Sem pagamentos públicos registrados para <strong>{procedimento}</strong>. {dados.erro ? `(${dados.erro})` : ''}</span>
      </div>
    );
  }

  // FILTRO POR MÊS (@R 27/08 12:36: "clicar no gráfico de linhas para fazer o filtro"):
  // com um mês selecionado, barras, 5 números e tabela passam a ser DAQUELE mês, sobre o
  // histórico completo que o backend já mandou — zero consulta nova.
  const doMes = filtroMes ? (dados.historico ?? []).filter((p) => p.data.startsWith(filtroMes)) : null;
  const serie = doMes ? [...doMes].sort((a, b) => a.data.localeCompare(b.data)) : dados.serie;
  const pagamentos = doMes ?? dados.pagamentos;
  const e = doMes ? estatisticaLocal(doMes.map((p) => p.valor)) : dados.estatistica;
  const mediana = e.mediana ?? 0;

  // Outlier: mais que o dobro da mediana. Marcado em cinza para não sequestrar a escala —
  // sem isso, um pagamento de R$ 121 mil achata visualmente todos os de R$ 30-40 mil.
  const ehOutlier = (v: number) => v > mediana * 2;

  const meses = dados.casos_por_mes ?? [];
  const dadosLinha = {
    labels: meses.map((m) => mesCurto(m.mes)),
    datasets: [{
      type: 'line' as const,
      label: 'Casos por mês (pagamentos do Estado)',
      data: meses.map((m) => m.casos),
      borderColor: '#0f766e',
      backgroundColor: 'rgba(15,118,110,0.12)',
      fill: true,
      tension: 0.3,
      pointRadius: meses.map((m) => (m.mes === filtroMes ? 6 : 3)),
      pointBackgroundColor: meses.map((m) => (m.mes === filtroMes ? '#f59e0b' : '#0f766e')),
      pointHoverRadius: 7,
    }],
  };
  const opcoesLinha = {
    maintainAspectRatio: false,
    onClick: (_evt: unknown, elementos: { index: number }[]) => {
      const alvo = elementos?.[0] ? meses[elementos[0].index]?.mes : null;
      if (!alvo) return;
      console.debug(`[PainelPrecos] filtro por mês: ${filtroMes === alvo ? 'limpo' : alvo}`);
      setFiltroMes((atual) => (atual === alvo ? null : alvo));   // reclicar limpa
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const m = meses[ctx.dataIndex];
            return ` ${m.casos} caso${m.casos === 1 ? '' : 's'} · ${moeda(m.total)} · clique para filtrar`;
          },
        },
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { ticks: { font: { size: 10 }, maxTicksLimit: 18 }, grid: { display: false } },
    },
  };

  const dadosGrafico = {
    labels: serie.map((p) => dataCurta(p.data)),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Pagamento do Estado',
        data: serie.map((p) => p.valor),
        backgroundColor: serie.map((p) => (ehOutlier(p.valor) ? '#cbd5e1' : '#3b82f6')),
        borderRadius: 4,
        order: 2,
      },
      {
        type: 'line' as const,
        label: `Mediana (${moeda(mediana)})`,
        data: serie.map(() => mediana),
        borderColor: '#f59e0b',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        order: 1,
      },
      ...(nossoPreco
        ? [{
            type: 'line' as const,
            label: `Nosso orçamento (${moeda(nossoPreco)})`,
            data: dados.serie.map(() => nossoPreco),
            borderColor: '#16a34a',
            borderWidth: 2,
            pointRadius: 0,
            order: 0,
          }]
        : []),
    ],
  };

  const opcoesGrafico = {
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: any) => {
            const p = serie[ctx.dataIndex];
            if (!p) return '';
            const onde = p.comarca ?? 'comarca não informada';
            const km = p.distancia_km !== null ? ` · ${p.distancia_km} km daqui` : '';
            return `${onde}${km}`;
          },
        },
      },
    },
    scales: {
      y: {
        ticks: { callback: (v: any) => moeda(Number(v)), font: { size: 10 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };

  const numeros = [
    { rotulo: 'Mediana', valor: e.mediana, nota: 'o valor-guia (metade pagou menos)', destaque: true },
    { rotulo: 'Miolo 50%', valor: null, nota: e.p25 != null && e.p75 != null ? `${moeda(e.p25)} – ${moeda(e.p75)}` : 'amostra pequena (<4)', textoLivre: e.p25 != null && e.p75 != null ? `${moeda(e.p25)}–${moeda(e.p75)}` : '—' },
    { rotulo: 'Moda', valor: e.moda, nota: e.moda ? `${e.moda_frequencia}× repetido` : 'nenhum valor se repete' },
    { rotulo: 'Média', valor: e.media, nota: e.media_suspeita ? '⚠ 2× acima da mediana — possível agregado na amostra' : 'puxada por valores extremos' },
    { rotulo: 'Mínimo', valor: e.minimo, nota: 'menor pago' },
    { rotulo: 'Máximo', valor: e.maximo, nota: 'maior pago' },
  ] as { rotulo: string; valor: number | null; nota: string; destaque?: boolean; textoLivre?: string }[];

  return (
    <div className="painel-precos">
      <div className="painel-precos__cabecalho">
        <h3><i className="pi pi-chart-bar" /> Quanto o Estado pagou por “{procedimento}”</h3>
        {filtroMes ? (
          <span className="painel-precos__janela painel-precos__janela--filtro">
            mês {mesCurto(filtroMes)} · {e.n} pagamento{e.n === 1 ? '' : 's'}
            <button type="button" className="ppc-limpar" onClick={() => setFiltroMes(null)}
              aria-label="Limpar o filtro de mês">× limpar</button>
          </span>
        ) : (
          <span className="painel-precos__janela">{textoJanela(dados)}</span>
        )}
      </div>

      <div className="painel-precos__corpo">
        <div className="painel-precos__graficos">
          {meses.length > 1 && (
            <div className="painel-precos__grafico painel-precos__grafico--linha">
              <div className="ppc-grafico-titulo">
                Casos por mês · {meses.length} meses · clique num ponto para filtrar o painel
              </div>
              <Chart type="line" data={dadosLinha} options={opcoesLinha} style={{ height: '190px' }} />
            </div>
          )}
          <div className="painel-precos__grafico">
            <Chart type="bar" data={dadosGrafico} options={opcoesGrafico} style={{ height: '210px' }} />
          </div>
        </div>

        <div className="painel-precos__lateral">
          <div className="painel-precos__numeros">
            {numeros.map((n) => (
              <div key={n.rotulo} className={`ppc-numero${n.destaque ? ' ppc-numero--destaque' : ''}`}>
                <span className="ppc-numero__rotulo">{n.rotulo}</span>
                <span className="ppc-numero__valor">{n.textoLivre ?? moeda(n.valor)}</span>
                <span className="ppc-numero__nota">{n.nota}</span>
              </div>
            ))}
          </div>

          {nossos && (nossos.n_enviados > 0 || (nossos.pagos_estado?.length ?? 0) > 0) && (
            <div style={{ margin: '8px 0', padding: '8px 12px', background: '#eff6ff',
                          border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '0.85rem', color: '#1e3a8a' }}>
              <strong>Nossos números p/ cirurgia similar:</strong>{' '}
              {nossos.n_enviados > 0 && (
                <span>enviamos {nossos.n_enviados}× · mediana{' '}
                  <strong>{nossos.mediana_enviados?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</strong>
                  {nossos.enviados?.length > 0 && <small> (últimos: {nossos.enviados.map((v: number) =>
                    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })).join(' · ')})</small>}
                </span>
              )}
              {(nossos.pagos_estado?.length ?? 0) > 0 && (
                <span> · <strong>concorrência (Estado pagou):</strong>{' '}
                  {nossos.pagos_estado.map((pg: any) =>
                    pg.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })).join(' · ')}
                </span>
              )}
            </div>
          )}
          {enviosNossos.length > 0 && (
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '10px', fontSize: '0.85rem' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}>
                Nossos envios p/ cirurgia similar — médico · data · valor · desfecho
              </caption>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                  <th style={{ padding: '3px 8px' }}>Data</th>
                  <th style={{ padding: '3px 8px' }}>Médico</th>
                  <th style={{ padding: '3px 8px' }}>Procedimento</th>
                  <th style={{ padding: '3px 8px', textAlign: 'right' }}>Enviamos</th>
                  <th style={{ padding: '3px 8px' }}>Desfecho</th>
                </tr>
              </thead>
              <tbody>
                {enviosNossos.slice(0, 8).map((e: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--surface-border, #e2e8f0)' }}>
                    <td style={{ padding: '3px 8px' }}>{e.data_resposta ? e.data_resposta.split('-').reverse().join('/') : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{e.medico_nome ?? '—'}</td>
                    <td style={{ padding: '3px 8px', opacity: 0.8 }}>{(e.procedimento ?? '').slice(0, 45)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <strong>{e.valor_respondido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</strong>
                    </td>
                    <td style={{ padding: '3px 8px' }}>{e.desfecho?.rotulo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="painel-precos__tabela">
            <caption>{filtroMes ? `Pagamentos de ${mesCurto(filtroMes)}` : 'Últimos pagamentos'} {dados.sem_comarca > 0 && `· ${dados.sem_comarca} sem comarca informada`}</caption>
            <thead>
              <tr><th>Data</th><th>Comarca</th><th>Distância</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {pagamentos.map((p, i) => (
                <tr key={`${p.data}-${p.num_empenho ?? i}`}>
                  <td>{dataCurta(p.data)}</td>
                  <td>{p.comarca ?? <span className="ppc-vazio">não informada</span>}</td>
                  <td className="ppc-num">
                    {p.distancia_km !== null ? `${p.distancia_km} km` : <span className="ppc-vazio">—</span>}
                  </td>
                  <td className="ppc-num">{moeda(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="painel-precos__rodape">
            Distâncias em linha reta a partir de <strong>{dados.base_distancia}</strong>. Fonte: empenhos públicos do Estado.
          </p>
        </div>
      </div>
    </div>
  );
}
