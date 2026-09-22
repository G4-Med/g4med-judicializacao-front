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

/** Robôs e agentes (Eliza, Robô Worker…) entram na conta de acessos como qualquer usuário. Separados pelo NOME
    — o servidor não marca conta de serviço de forma confiável; a regra fica dita na tela. */
const ehRobo = (nome: string) => /rob[oô]|eliza|\(api\)|servi[cç]o/i.test(nome);

export function AcessosBloco() {
  const [dia, setDia] = useState(hojeIso());
  const [dados, setDados] = useState<Acessos | null>(null);
  const [proibido, setProibido] = useState(false);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [verRobos, setVerRobos] = useState(false);

  useEffect(() => {
    setErro(false);
    getAcessos(dia)
      .then((r) => { setDados(r.data); setProibido(false); })
      .catch((e) => { if (e?.response?.status === 403) setProibido(true); else setErro(true); });
  }, [dia]);

  if (proibido) return null;
  const pessoasAgora = (dados?.agora ?? []).filter((p) => !ehRobo(p.nome));
  const robosAgora = (dados?.agora ?? []).filter((p) => ehRobo(p.nome));
  const loginsPessoas = (dados?.logins ?? []).filter((l) => !ehRobo(l.nome));
  const loginsRobos = (dados?.logins ?? []).filter((l) => ehRobo(l.nome));
  const ativos = pessoasAgora.filter((p) => p.ativo).length;
  const logados = pessoasAgora.filter((p) => p.logado).length;
  const resumo = dados
    ? `${ativos} pessoa(s) ativa(s) agora · ${logados} logada(s) nas últimas 24 h · ${loginsPessoas.length} login(s) de pessoas hoje`
    : erro ? 'não foi possível carregar agora' : 'carregando…';

  const linhaPessoa = (p: Acessos['agora'][number]) => (
    <li key={p.usuario} className="acessos-bloco__pessoa">
      <span className={`acessos-bloco__ponto ${p.ativo ? 'ativo' : p.logado ? 'logado' : ''}`}
        aria-label={p.ativo ? 'ativo' : p.logado ? 'logado' : 'fora'} />
      <span className="acessos-bloco__nome">{p.nome}</span>
      {p.grupo && <span className="acessos-bloco__grupo">{p.grupo}</span>}
      <small>{p.ativo ? `ativo · última ação ${hora(p.ultimaAtividade)}` : p.logado ? `logado desde ${diaHora(p.ultimoLogin)}` : `último login ${diaHora(p.ultimoLogin)}`}</small>
    </li>
  );

  return (
    <section className={`home-collapse acessos-bloco ${aberto ? 'home-collapse--open' : ''}`}>
      <div className="home-collapse__head">
        <button type="button" className="home-collapse__toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          <span className="home-collapse__chevron"><i className={`pi ${aberto ? 'pi-chevron-down' : 'pi-chevron-right'}`} /></span>
          <span className="home-collapse__titles">
            <span className="home-panel__title">Acessos à plataforma</span>
            <span className="home-panel__sub">{resumo}</span>
          </span>
        </button>
        {aberto && (
          <div className="home-collapse__extras" onClick={(e) => e.stopPropagation()}>
            <label className="acessos-bloco__dia">Dia{' '}
              <input type="date" value={dia} max={hojeIso()} onChange={(e) => e.target.value && setDia(e.target.value)} />
            </label>
          </div>
        )}
      </div>
      {aberto && (
        <div className="home-collapse__body">
          {erro && <div className="acessos-bloco__erro">Não foi possível carregar os acessos agora (erro de rede) — isso não quer dizer que ninguém entrou.</div>}
          {dados && (
            <div className="acessos-bloco__grade">
              <div className="acessos-bloco__coluna">
                <h3>Agora <span>{ativos} ativa(s) · {logados} logada(s)</span></h3>
                <ul className="acessos-bloco__lista">{pessoasAgora.map(linhaPessoa)}</ul>
                <p className="acessos-bloco__regra">Ativo = fez alguma ação nos últimos {dados.regras.ativoMinutos} min · Logado = entrou nas últimas {dados.regras.logadoHoras} h.</p>
              </div>
              <div className="acessos-bloco__coluna">
                <h3>Quem entrou em {new Date(`${dados.dia}T12:00:00`).toLocaleDateString('pt-BR')} <span>{loginsPessoas.length}</span></h3>
                {loginsPessoas.length === 0
                  ? <p className="acessos-bloco__vazio">Nenhuma pessoa entrou neste dia.{dados.historicoDesde && dados.dia < dados.historicoDesde.slice(0, 10) ? ` O histórico começa em ${new Date(dados.historicoDesde).toLocaleDateString('pt-BR')}.` : ' O registro de logins começou em 22/09/2026.'}</p>
                  : <ul className="acessos-bloco__lista">{loginsPessoas.map((l, i) => (
                      <li key={i} className="acessos-bloco__pessoa" title={l.aparelho ?? ''}>
                        <b className="acessos-bloco__hora">{hora(l.em)}</b>
                        <span className="acessos-bloco__nome">{l.nome}</span>
                        {l.grupo && <span className="acessos-bloco__grupo">{l.grupo}</span>}
                      </li>
                    ))}</ul>}
                <h3 className="acessos-bloco__mes-titulo">Dias do mês com login</h3>
                <div className="acessos-bloco__mes">
                  {dados.mes.length === 0 && <span className="acessos-bloco__vazio">Sem logins registrados neste mês.</span>}
                  {dados.mes.map((m) => (
                    <button key={m.dia} type="button" className={m.dia === dados.dia ? 'ativo' : ''} onClick={() => setDia(m.dia)}
                      title={`${m.logins} login(s) de ${m.pessoas} conta(s), contando robôs`}>
                      {m.dia.slice(8, 10)}/{m.dia.slice(5, 7)}
                    </button>
                  ))}
                </div>
              </div>
              {(robosAgora.length > 0 || loginsRobos.length > 0) && (
                <div className="acessos-bloco__robos">
                  <button type="button" onClick={() => setVerRobos((v) => !v)} aria-expanded={verRobos}>
                    <i className={`pi ${verRobos ? 'pi-chevron-down' : 'pi-chevron-right'}`} /> Robôs e agentes ({robosAgora.length}) · {loginsRobos.length} login(s) automático(s) neste dia
                  </button>
                  {verRobos && <ul className="acessos-bloco__lista">{robosAgora.map(linhaPessoa)}</ul>}
                  <small>Separados pelo nome (Robô, Eliza, "(API)", "serviço").</small>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
