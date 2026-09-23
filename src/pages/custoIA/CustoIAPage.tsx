/**
 * Custo de IA (@R 23/09 13:54): ⟦"o que está gastando quanto e onde e modelo e como"⟧.
 *
 * Cada chamada de IA do servidor vira 1 linha (ia/uso.py, ponto único — nenhuma área precisa lembrar de
 * registrar). A tela NÃO soma nada: os totais vêm prontos do banco, para o número daqui ser o número de lá.
 * "SEM PREÇO" = modelo fora da tabela de preços; aparece contado e sem valor, nunca com o preço de outro.
 */
import { useEffect, useMemo, useState } from 'react'
import { SelectButton } from 'primereact/selectbutton'
import { getCustosIA, type CustosIA, type LinhaCustoIA } from '../../services/api/orders'
import './CustoIAPage.css'

const PERIODOS = [
  { label: 'Hoje', value: 1 }, { label: '7 dias', value: 7 }, { label: '30 dias', value: 30 }, { label: '90 dias', value: 90 },
]
const VISOES: { label: string; value: keyof CustosIA; campo: string; titulo: string }[] = [
  { label: 'Por área', value: 'porArea', campo: 'area', titulo: 'Área do site que chamou a IA' },
  { label: 'Por modelo', value: 'porModelo', campo: 'modelo', titulo: 'Modelo' },
  { label: 'Por rota', value: 'porRota', campo: 'rota', titulo: 'Rota da API' },
  { label: 'Por sistema', value: 'porSistema', campo: 'sistema', titulo: 'Sistema (site ou tarefa agendada)' },
  { label: 'Por usuário', value: 'porUsuario', campo: 'usuario', titulo: 'Usuário' },
]

const usd = (v: number | null | undefined, casas = 4) =>
  v == null ? 'SEM PREÇO' : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR')
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function CustoIAPage() {
  const [dias, setDias] = useState(7)
  const [visao, setVisao] = useState<keyof CustosIA>('porArea')
  const [dados, setDados] = useState<CustosIA | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null)
    getCustosIA(dias)
      .then((r) => { if (vivo) setDados(r.data) })
      .catch((e) => { if (vivo) setErro(e?.response?.status === 403 ? 'Só Admin e Gerente veem o custo de IA.' : 'Não consegui carregar o custo de IA agora.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [dias])

  const cfg = VISOES.find((v) => v.value === visao)!
  const linhas = (dados?.[visao] as LinhaCustoIA[] | undefined) ?? []
  const maiorDia = useMemo(() => Math.max(0, ...(dados?.porDia ?? []).map((d) => d.custoUsd)), [dados])
  const t = dados?.total

  return (
    <div className="custo-ia">
      <header className="custo-ia__topo">
        <div>
          <h1><i className="pi pi-wallet" /> Custo de IA</h1>
          <p>Quanto cada parte do site gasta com IA, com qual modelo e para quem. Valores em dólar, como a OpenAI cobra.</p>
          {dados?.contandoDesde && (
            <p className="custo-ia__desde"><i className="pi pi-info-circle" /> Contando desde {dataHora(dados.contandoDesde)} — antes disso as chamadas não eram registradas.</p>
          )}
        </div>
        <SelectButton value={dias} options={PERIODOS} onChange={(e) => e.value && setDias(e.value)} allowEmpty={false} aria-label="Período" />
      </header>

      {erro && <div className="custo-ia__erro" role="alert">{erro}</div>}

      <section className="custo-ia__kpis" aria-busy={carregando}>
        <div className="custo-ia__kpi custo-ia__kpi--destaque"><span>Gasto no período</span><strong>{usd(t?.custoUsd ?? 0, 2)}</strong><small>{usd(t?.custoUsd ?? 0, 4)}</small></div>
        <div className="custo-ia__kpi"><span>Chamadas</span><strong>{num(t?.chamadas)}</strong><small>{t?.chamadas ? `${usd((t.custoUsd || 0) / t.chamadas, 4)} em média` : '—'}</small></div>
        <div className="custo-ia__kpi"><span>Tokens</span><strong>{num((t?.tokensEntrada ?? 0) + (t?.tokensSaida ?? 0))}</strong><small>{num(t?.tokensEntrada)} de entrada · {num(t?.tokensSaida)} de saída</small></div>
        <div className={`custo-ia__kpi${t?.falhas || t?.semPreco ? ' custo-ia__kpi--alerta' : ''}`}>
          <span>Atenção</span><strong>{num(t?.falhas)} falha(s)</strong><small>{num(t?.semPreco)} chamada(s) sem preço na tabela</small>
        </div>
      </section>

      {!!dados?.porDia.length && (
        <section className="custo-ia__cartao">
          <h2>Gasto por dia</h2>
          <div className="custo-ia__barras" role="img" aria-label="Gasto de IA por dia">
            {dados.porDia.map((d) => (
              <div key={d.dia} className="custo-ia__barra" title={`${d.dia.split('-').reverse().join('/')}: ${usd(d.custoUsd)} em ${d.chamadas} chamada(s)`}>
                <div className="custo-ia__barra-v" style={{ height: `${maiorDia ? Math.max(3, (d.custoUsd / maiorDia) * 100) : 3}%` }} />
                <span>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="custo-ia__cartao">
        <div className="custo-ia__cartao-topo">
          <h2>Onde se gasta</h2>
          <SelectButton value={visao} options={VISOES.map(({ label, value }) => ({ label, value }))} onChange={(e) => e.value && setVisao(e.value)} allowEmpty={false} aria-label="Agrupar por" />
        </div>
        <div className="custo-ia__rolagem">
          <table className="custo-ia__tabela">
            <thead><tr><th>{cfg.titulo}</th><th className="n">Chamadas</th><th className="n">Tokens entrada</th><th className="n">Tokens saída</th><th className="n">Gasto</th><th className="n">% do gasto</th><th className="n">Falhas</th></tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={7} className="custo-ia__vazio">{carregando ? 'Carregando…' : 'Nenhuma chamada de IA no período.'}</td></tr>}
              {linhas.map((l) => {
                const pct = t?.custoUsd ? (l.custoUsd / t.custoUsd) * 100 : 0
                return (
                  <tr key={String(l[cfg.campo] ?? '—')}>
                    <td>{l[cfg.campo] ?? <em>{cfg.campo === 'usuario' ? 'tarefa agendada (sem usuário)' : '—'}</em>}{l.semPreco > 0 && <span className="custo-ia__tag">{l.semPreco} sem preço</span>}</td>
                    <td className="n">{num(l.chamadas)}</td><td className="n">{num(l.tokensEntrada)}</td><td className="n">{num(l.tokensSaida)}</td>
                    <td className="n"><strong>{usd(l.custoUsd)}</strong></td>
                    <td className="n"><span className="custo-ia__pct"><span style={{ width: `${pct}%` }} /></span>{pct.toFixed(1)}%</td>
                    <td className="n">{l.falhas || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="custo-ia__cartao">
        <h2>Últimas chamadas</h2>
        <div className="custo-ia__rolagem">
          <table className="custo-ia__tabela custo-ia__tabela--compacta">
            <thead><tr><th>Quando</th><th>Área</th><th>Quem</th><th>Modelo</th><th className="n">Tokens</th><th className="n">Tempo</th><th className="n">Gasto</th></tr></thead>
            <tbody>
              {(dados?.ultimas ?? []).map((u, i) => (
                <tr key={i} className={u.ok ? '' : 'custo-ia__falha'} title={u.erro || u.rota || ''}>
                  <td>{dataHora(u.em)}</td><td>{u.area}</td><td>{u.usuario || u.sistema}</td><td><code>{u.modelo}</code></td>
                  <td className="n">{num((u.tokensEntrada ?? 0) + (u.tokensSaida ?? 0))}</td>
                  <td className="n">{u.duracaoMs != null ? `${(u.duracaoMs / 1000).toFixed(1)} s` : '—'}</td>
                  <td className="n">{u.ok ? usd(u.custoUsd) : 'falhou'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dados && (
          <p className="custo-ia__rodape">
            Preço por 1 milhão de tokens (entrada / saída): {Object.entries(dados.precos).map(([m, p]) => `${m} ${p.entrada}/${p.saida}`).join(' · ')}.
          </p>
        )}
      </section>
    </div>
  )
}
