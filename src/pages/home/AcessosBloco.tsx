import { useEffect, useState } from 'react';
import { getAcessos, type Acessos } from '../../services/api/rotinaAcessos';

/* @R 22/09 18:18: "uma parte que mostra histórico de login por dia, quem logou, horário, e podemos ver dias
   anteriores no mês, para saber quem logou, quem está logado e ativo no momento na plataforma".
   Só aparece para quem o servidor deixa ver (Admin/Gerente): 403 = o bloco não existe para essa pessoa. */

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const diaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function AcessosBloco() {
  const [dia, setDia] = useState(hojeIso());
  const [dados, setDados] = useState<Acessos | null>(null);
  const [proibido, setProibido] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setErro(false);
    getAcessos(dia)
      .then((r) => { setDados(r.data); setProibido(false); })
      .catch((e) => { if (e?.response?.status === 403) setProibido(true); else setErro(true); });
  }, [dia]);

  if (proibido) return null;
  return (
    <section className="home-block acessos-bloco">
      <div className="acessos-bloco__cab">
        <h2>Acessos à plataforma</h2>
        {dados && <span className="acessos-bloco__agora">
          <strong>{dados.ativosAgora}</strong> ativo(s) agora · <strong>{dados.logadosAgora}</strong> logado(s)
        </span>}
        <label className="acessos-bloco__dia">Dia:{' '}
          <input type="date" value={dia} max={hojeIso()} onChange={(e) => e.target.value && setDia(e.target.value)} />
        </label>
      </div>
      {erro && <div className="acessos-bloco__erro">Não foi possível carregar os acessos agora (erro de rede) — isso não quer dizer que ninguém entrou.</div>}
      {dados && (
        <div className="acessos-bloco__grade">
          <div>
            <h3>Quem entrou em {new Date(`${dados.dia}T12:00:00`).toLocaleDateString('pt-BR')} ({dados.logins.length})</h3>
            {dados.logins.length === 0
              ? <p className="acessos-bloco__vazio">Nenhum login registrado neste dia.{dados.historicoDesde && dados.dia < dados.historicoDesde.slice(0, 10) ? ` O histórico começa em ${new Date(dados.historicoDesde).toLocaleDateString('pt-BR')}.` : ''}</p>
              : <ul>{dados.logins.map((l, i) => (
                  <li key={i} title={l.aparelho ?? ''}><b>{hora(l.em)}</b> · {l.nome}{l.grupo ? ` · ${l.grupo}` : ''}</li>
                ))}</ul>}
            <h3 style={{ marginTop: '.75rem' }}>No mês</h3>
            <div className="acessos-bloco__mes">
              {dados.mes.length === 0 && <span className="acessos-bloco__vazio">Sem logins registrados neste mês.</span>}
              {dados.mes.map((m) => (
                <button key={m.dia} type="button" className={m.dia === dados.dia ? 'ativo' : ''} onClick={() => setDia(m.dia)}
                  title={`${m.logins} login(s) de ${m.pessoas} pessoa(s)`}>
                  {m.dia.slice(8, 10)}/{m.dia.slice(5, 7)} <small>{m.pessoas}p</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3>Agora</h3>
            <ul>
              {dados.agora.map((p) => (
                <li key={p.usuario}>
                  <span className={`acessos-bloco__ponto ${p.ativo ? 'ativo' : p.logado ? 'logado' : ''}`}
                    aria-label={p.ativo ? 'ativo' : p.logado ? 'logado' : 'fora'} />
                  {p.nome}{p.grupo ? ` · ${p.grupo}` : ''}
                  <small> — {p.ativo ? `ativo (última ação ${hora(p.ultimaAtividade)})` : p.logado ? `logado desde ${diaHora(p.ultimoLogin)}` : `último login ${diaHora(p.ultimoLogin)}`}</small>
                </li>
              ))}
            </ul>
            <p className="acessos-bloco__regra">Ativo = fez alguma ação nos últimos {dados.regras.ativoMinutos} min. Logado = entrou nas últimas {dados.regras.logadoHoras} h.</p>
          </div>
        </div>
      )}
    </section>
  );
}
