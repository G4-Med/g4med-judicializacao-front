import { useCallback, useEffect, useState } from 'react';
import { getRotinaDadosEstado, type RotinaDadosEstado, type Situacao } from '../../services/api/rotinaAcessos';
import './RotinaDadosEstadoPage.css';

/* @R 22/09 18:19 + 18:34: "uma área no menu que mostra todo o funcionamento da rotina — que está rodando,
   que foi concluída e que as bases estão sendo atualizadas corretamente". A cadeia tem 5 elos:
   portal do Estado → coleta (PC do Rapha) → carga no servidor → pagamentos na base → régua dos pedidos.
   Cada elo diz o que faz, quando roda, a última execução e o resultado — e o PRIMEIRO elo parado é a causa. */

const ROTULO: Record<Situacao, string> = { ok: 'OK', atencao: 'Atenção', parado: 'Parado', sem_info: 'Sem informação' };
const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function RotinaDadosEstadoPage() {
  const [dados, setDados] = useState<RotinaDadosEstado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    getRotinaDadosEstado()
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.status === 403
        ? 'Seu perfil não tem acesso a esta área.'
        : 'Não foi possível ler a rotina agora (erro de rede ou servidor). Isso NÃO quer dizer que ela está parada.'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="rotina-estado">
      <header className="rotina-estado__cab">
        <div>
          <h1>Rotina dos dados do Estado</h1>
          <p>De onde vêm os pagamentos do Estado e se cada etapa está funcionando. Lida agora, direto do servidor.</p>
        </div>
        <button type="button" onClick={carregar} disabled={carregando}>{carregando ? 'Lendo…' : 'Atualizar'}</button>
      </header>

      {erro && <div className="rotina-estado__erro">{erro}</div>}

      {dados && (
        <>
          <div className={`rotina-estado__resumo ${dados.resumo.ok ? 'ok' : 'alerta'}`}>
            <strong>{dados.resumo.ok ? '✓ Tudo funcionando' : '⚠ Atenção'}</strong> — {dados.resumo.texto}
            <small> · medido em {quando(dados.medidoEm)}</small>
          </div>

          <ol className="rotina-estado__etapas">
            {dados.etapas.map((e, i) => (
              <li key={e.chave} className={`etapa etapa--${e.situacao}`}>
                <div className="etapa__num">{i + 1}</div>
                <div className="etapa__corpo">
                  <div className="etapa__topo">
                    <h2>{e.nome}</h2>
                    <span className={`etapa__selo etapa__selo--${e.situacao}`}>{ROTULO[e.situacao]}</span>
                  </div>
                  <p className="etapa__oque">{e.oQueFaz}</p>
                  <dl>
                    <dt>Quando roda</dt><dd>{e.agenda}</dd>
                    <dt>Última execução</dt><dd>{quando(e.ultimaExecucao)}</dd>
                    <dt>Resultado</dt><dd>{e.resultado}</dd>
                    <dt>Próxima</dt><dd>{quando(e.proximaExecucao)}</dd>
                  </dl>
                  {e.detalhe && <p className="etapa__detalhe">{e.detalhe}</p>}
                </div>
              </li>
            ))}
          </ol>

          <section className="rotina-estado__hist">
            <h2>Últimas rodadas da coleta e carga ({dados.historico.length})</h2>
            {dados.historico.length === 0
              ? <p className="rotina-estado__vazio">O histórico começou a ser gravado em 22/09 — as rodadas aparecem aqui a partir da próxima execução (todo dia às 08:07).</p>
              : (
                <table>
                  <thead><tr><th>Quando</th><th>Resultado</th><th>Etapa</th><th>Mensagem</th><th>Portal</th><th>Empenho mais novo coletado</th></tr></thead>
                  <tbody>
                    {[...dados.historico].reverse().map((h, i) => (
                      <tr key={i} className={h.rc === 0 ? '' : 'falhou'}>
                        <td>{quando(h.ts)}</td>
                        <td>{h.rc === 0 ? 'concluída' : h.rc == null ? '—' : `falhou (código ${h.rc})`}</td>
                        <td>{h.etapa ?? '—'}</td>
                        <td>{h.mensagem ?? '—'}</td>
                        <td>{h.portalVazio ? 'arquivos VAZIOS' : 'normal'}</td>
                        <td>{h.coletaMaxEmpenho ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </section>
        </>
      )}
    </div>
  );
}
