import { useEffect, useState } from 'react';
import { AtividadesLista } from '../../components/Atividades/AtividadesLista';
import { descreverLocalizacao, getAcessos, type Acessos, type LoginDia } from '../../services/api/rotinaAcessos';
import { getLogAuditoria } from '../../services/api/orders';

/* @R 22/09 18:18: "uma parte que mostra histórico de login por dia, quem logou, horário, e podemos ver dias
   anteriores no mês, para saber quem logou, quem está logado e ativo no momento na plataforma".
   Só aparece para quem o servidor deixa ver (Admin/Gerente): 403 = o bloco não existe para essa pessoa. */

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const diaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const minutosDesde = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
/** "há 3 min" · "há 6 h 12 min" · "há 2 dias" */
const ha = (iso: string | null) => {
  if (!iso) return '?';
  const m = minutosDesde(iso);
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.floor(m / 1440);
  return `${d} dia${d > 1 ? 's' : ''}`;
};
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Robôs e agentes (Eliza, Robô Worker…) entram na conta de acessos como qualquer usuário. Separados pelo NOME
    — o servidor não marca conta de serviço de forma confiável; a regra fica dita na tela. */
const ehRobo = (nome: string) => /rob[oô]|eliza|\(api\)|servi[cç]o/i.test(nome);

interface ItemLog { id: number; orderId: number | null; paciente: string | null; campo: string; valorAnterior: string | null;
  valorNovo: string | null; usuario: string | null; origem: string | null; createDate: string }

/* @R 22/09 19:00: "para cada usuário ter um log de últimas atividades com horário — clicar na home no usuário
   para ver as ações de cada um". Fonte = o MESMO histórico da tela de Logs (OrderStatusHistorico, gravado
   sozinho pelos signals). Só o que MUDA dado aparece; abrir tela ou ler sem alterar não é registrado. */
function LogDoUsuario({ usuario, nome, onFechar, logins }: { usuario: string; nome: string; onFechar: () => void;
  logins: { em: string }[] }) {
  const [itens, setItens] = useState<ItemLog[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    getLogAuditoria({ usuario })
      // o servidor filtra por "contém"; aqui fica só o usuário EXATO (rapha ≠ raphael)
      .then((r) => setItens(((r.data?.itens ?? []) as ItemLog[]).filter((i) => i.usuario === usuario).slice(0, 50)))
      .catch(() => setErro(true));
  }, [usuario]);
  return (
    <div className="acessos-log" role="dialog" aria-label={`Atividades de ${nome}`}>
      <div className="acessos-log__cab">
        <strong>Atividades de {nome}</strong>
        <button type="button" onClick={onFechar} aria-label="Fechar"><i className="pi pi-times" /></button>
      </div>
      {logins.length > 0 && (
        <p className="acessos-log__logins">Entrou hoje às {logins.map((l) => hora(l.em)).join(', ')}</p>
      )}
      <AtividadesLista usuario={usuario} />
      <details className="acessos-log__historico">
        <summary>Mudanças de fase e status (de → para)</summary>
      {erro && <p className="acessos-bloco__erro">Não foi possível ler o histórico agora — isso não quer dizer que não houve ações.</p>}
      {!erro && itens === null && <p className="acessos-bloco__vazio">Carregando…</p>}
      {itens && itens.length === 0 && <p className="acessos-bloco__vazio">Nenhuma alteração registrada por esta pessoa no histórico.</p>}
      {itens && itens.length > 0 && (
        <ul className="acessos-log__lista">
          {itens.map((i) => (
            <li key={i.id}>
              <b>{diaHora(i.createDate)}</b>
              <span>{i.orderId ? <a href={`/base-processos?paciente=${encodeURIComponent(i.paciente || '')}`} title="Abrir na Base de Processos">#{i.orderId}</a> : '—'}{i.paciente ? ` ${i.paciente}` : ''}</span>
              <span className="acessos-log__mudanca">{i.campo}: {i.valorAnterior || '—'} → {i.valorNovo || '—'}</span>
            </li>
          ))}
        </ul>
      )}
      </details>
      <p className="acessos-bloco__regra">Atividades: tudo que a pessoa alterou, abriu (fichas, registros, arquivos), baixou e as páginas por onde passou — registrado desde 22/09/2026. Mudanças de fase: o de → para de cada status.</p>
    </div>
  );
}

export function AcessosBloco() {
  const [dia, setDia] = useState(hojeIso());
  const [dados, setDados] = useState<Acessos | null>(null);
  const [proibido, setProibido] = useState(false);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [verRobos, setVerRobos] = useState(false);
  const [logDe, setLogDe] = useState<{ usuario: string; nome: string } | null>(null);

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

  const linhaPessoa = (p: Acessos['agora'][number]) => {
    const alt = p.ultimaAlteracao;
    return (
      <li key={p.usuario} className="acessos-bloco__pessoa acessos-bloco__pessoa--clicavel" role="button" tabIndex={0}
        title="Clique para ver as últimas ações desta pessoa"
        onClick={() => setLogDe({ usuario: p.usuario, nome: p.nome })}
        onKeyDown={(e) => { if (e.key === 'Enter') setLogDe({ usuario: p.usuario, nome: p.nome }); }}>
        <span className={`acessos-bloco__ponto ${p.ativo ? 'ativo' : p.logado ? 'logado' : ''}`}
          aria-label={p.ativo ? 'on-line' : p.logado ? 'logado' : 'fora'} />
        <span className="acessos-bloco__nome">{p.nome}</span>
        {p.grupo && <span className="acessos-bloco__grupo">{p.grupo}</span>}
        <small>{p.ativo ? `on-line · página aberta (há ${ha(p.ultimaAtividade)})` : p.logado ? `logado desde ${diaHora(p.ultimoLogin)}` : `último login ${diaHora(p.ultimoLogin)}`}</small>
        {/* @R 22/09 19:25: página aberta ≠ trabalho feito. A ação EFETIVA é a última alteração gravada. */}
        <span className={`acessos-bloco__efetiva ${alt && minutosDesde(alt.em) > 120 && p.ativo ? 'acessos-bloco__efetiva--parada' : ''}`}>
          {alt
            ? <>última ação efetiva <b>há {ha(alt.em)}</b> ({diaHora(alt.em)}){alt.pedido ? ` · #${alt.pedido}` : ''} · {alt.campo}: {alt.de || '—'} → {alt.para || '—'}
                {typeof p.alteracoesHoje === 'number' && <> · <b>{p.alteracoesHoje}</b> alteraç{p.alteracoesHoje === 1 ? 'ão' : 'ões'} hoje</>}</>
            : 'nenhuma alteração gravada no histórico'}
        </span>
      </li>
    );
  };

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
                {logDe && (
                  <LogDoUsuario usuario={logDe.usuario} nome={logDe.nome} onFechar={() => setLogDe(null)}
                    logins={(dados.logins ?? []).filter((l) => l.usuario === logDe.usuario)} />
                )}
                <p className="acessos-bloco__regra">Clique numa pessoa para ver as últimas ações dela. On-line = a página dela fez alguma requisição (inclusive automática) nos últimos {dados.regras.ativoMinutos} min · Ação efetiva = última alteração gravada no histórico · Logado = entrou nas últimas {dados.regras.logadoHoras} h.</p>
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
                        <OrigemLogin l={l} />
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

/** #634: de onde e como a pessoa entrou — aparelho, navegador/versão, sistema, IP e (se autorizada) o ponto no mapa. */
function OrigemLogin({ l }: { l: LoginDia }) {
  const como = [l.dispositivo, l.navegador && `${l.navegador}${l.navegadorVersao ? ` ${l.navegadorVersao}` : ''}`, l.sistema]
    .filter(Boolean).join(' · ');
  const loc = descreverLocalizacao(l);
  return (
    <span className="acessos-bloco__origem">
      {como || 'aparelho não identificado'}
      {l.ip && <> · IP {l.ip}</>}
      {' · '}
      {loc.mapa
        ? <a href={loc.mapa} target="_blank" rel="noreferrer" title={loc.dica}>{loc.texto}</a>
        : <span className="acessos-bloco__origem-sem" title={loc.dica}>{loc.texto}</span>}
    </span>
  );
}
