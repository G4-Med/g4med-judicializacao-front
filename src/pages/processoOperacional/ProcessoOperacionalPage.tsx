import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ETAPAS, DONOS, PRAZOS, REGRAS, PORQUE, FONTE, DICAS, ATUALIZACOES, AREAS_MENU } from './conteudo';
import type { AreaMenu } from './conteudo';
import type { Etapa } from './conteudo';
import './ProcessoOperacionalPage.css';

/**
 * PROCESSO OPERACIONAL — o manual dentro do próprio sistema.
 *
 * POR QUE ESTA TELA EXISTE:
 *   A equipe do Instituto Mateus recebeu o treinamento numa reunião de 1h50. O @R
 *   prometeu "uma ajuda para cada telinha". Mas o problema medido não é falta de
 *   informação — é informação ENTERRADA: o próprio autor do sistema não achou um
 *   campo que estava dois cliques para dentro. Um manual que ninguém abre repete
 *   esse defeito num arquivo maior.
 *
 *   Por isso o desenho: PORQUÊ primeiro (a tese que faz a regra parar de soar
 *   arbitrária), depois as etapas com o DONO de cada uma, e a fala do @R AO LADO
 *   de cada passo — não num apêndice. Quem lê "prazo de 96 horas" lê junto o
 *   motivo, e é o motivo que faz cumprir sem fiscal.
 */
/** Mesmo número que o menu mostra (menuConfigClean deriva de ETAPAS pela rota) — nunca escrito à mão. */
function nomeComNumero(a: AreaMenu): string {
  const e = ETAPAS.find((x) => x.rota === a.rota);
  if (!e) return a.nome;
  return Number.isInteger(e.numero) ? `${e.numero}. ${a.nome}` : `${String(e.numero).replace('.', ',')} ${a.nome}`;
}

const GRUPOS_MENU: AreaMenu['grupo'][] = ['Acompanhar', 'Processo SES-MG', 'Apoio', 'Admin'];

export function ProcessoOperacionalPage() {
  // `abertas` é um CONJUNTO, não um id só: o "abrir todas" é o modo de leitura
  // corrida (e o que o PDF precisa — seção fechada não sai impressa).
  const [abertas, setAbertas] = useState<Set<string>>(new Set(['juridico']));
  const [filtroDono, setFiltroDono] = useState<'TODOS' | 'INSTITUTO' | 'G4MED'>('TODOS');

  const etapasVisiveis = ETAPAS.filter(
    (e) => filtroDono === 'TODOS' || e.dono === filtroDono
  );

  const todasAbertas =
    etapasVisiveis.length > 0 && etapasVisiveis.every((e) => abertas.has(e.id));

  const alternarTodas = () => {
    setAbertas(todasAbertas ? new Set() : new Set(etapasVisiveis.map((e) => e.id)));
  };

  const alternarUma = (id: string) => {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  /**
   * PDF pela impressão do navegador — de propósito.
   * Gerar PDF no servidor exigiria um motor de render (weasyprint/wkhtmltopdf) e
   * uma segunda versão do layout que envelhece separada da tela. Imprimir a
   * própria página garante que o PDF é SEMPRE o que está na tela hoje.
   * O que muda é só: abre tudo (senão sai vazio) e espera o React pintar.
   */
  const baixarPdf = () => {
    setAbertas(new Set(etapasVisiveis.map((e) => e.id)));
    document.querySelectorAll<HTMLDetailsElement>('details.proc-op__area').forEach((d) => { d.open = true; });
    setTimeout(() => window.print(), 250);
  };

  return (
    <div className="proc-op">
      <header className="proc-op__topo">
        <h1>Processo operacional</h1>
        <p className="proc-op__sub">
          Como o trabalho anda do pedido até a decisão — com as regras, os prazos e o motivo de
          cada um.
        </p>
        <button type="button" className="proc-op__pdf" onClick={baixarPdf}>
          <i className="pi pi-file-pdf" /> Baixar em PDF
        </button>
      </header>

      {/* O PORQUÊ vem antes do COMO: sem ele, o prazo vira regra arbitrária. */}
      <section className="proc-op__porque">
        <h2>{PORQUE.titulo}</h2>
        {PORQUE.paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <blockquote className="proc-op__fechamento">{PORQUE.fechamento}</blockquote>
        <div className="proc-op__proposito">
          <span className="proc-op__proposito-rotulo">O propósito, nas palavras do Rapha</span>
          <p>{PORQUE.proposito}</p>
        </div>
      </section>

      {/* O FLUXO, antes de qualquer detalhe: as 6 fases em ordem, quem é dono de cada uma
          e o que cada uma ENTREGA à seguinte. Clicar abre a etapa correspondente abaixo.
          (@R 16/09: "o fluxo tem que estar claro processualmente") */}
      <section className="proc-op__fluxo">
        <h2>O fluxo, do pedido à decisão</h2>
        <p className="proc-op__fluxo-legenda">
          Cada fase entrega algo à próxima. Se a entrega não saiu, o pedido não deveria ter andado —
          e é isso que o ⟲ (ficha do pedido) permite corrigir, em qualquer tela.
        </p>
        <ol className="proc-op__fluxo-fita">
          {ETAPAS.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="proc-op__fluxo-passo"
                style={{ borderTopColor: DONOS[e.dono].cor }}
                onClick={() => {
                  setAbertas((atual) => new Set(atual).add(e.id));
                  document.getElementById(`etapa-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <span className="proc-op__fluxo-num" style={{ background: DONOS[e.dono].cor }}>{e.numero}</span>
                <strong>{e.titulo.split('—')[0].trim()}</strong>
                <em style={{ color: DONOS[e.dono].cor }}>{DONOS[e.dono].rotulo}</em>
                {e.entrega && <span className="proc-op__fluxo-entrega">entrega: {e.entrega}</span>}
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* MAPA DO MENU — o que é cada área e como usar (@R 22/09). Uma entrada por item do menu. */}
      <section className="proc-op__mapa" aria-labelledby="proc-op-mapa">
        <h2 id="proc-op-mapa">Mapa do menu — o que é cada área e como usar</h2>
        <p className="proc-op__fluxo-legenda">
          Clique numa área para ver para que serve e o passo a passo. As marcadas <span className="proc-op__novo">NOVO</span> entraram em setembro/2026.
        </p>
        {GRUPOS_MENU.map((g) => (
          <div key={g} className="proc-op__mapa-grupo">
            <h3>{g}</h3>
            {AREAS_MENU.filter((a) => a.grupo === g).map((a) => (
              <details key={a.rota + a.nome} className="proc-op__area">
                <summary>
                  <strong>{nomeComNumero(a)}</strong>
                  {a.novo && <span className="proc-op__novo" title={`no ar desde ${a.novo}`}>NOVO</span>}
                  {a.quem && <em className="proc-op__area-quem">{a.quem}</em>}
                  <span className="proc-op__area-oque">{a.oQueE}</span>
                </summary>
                <div className="proc-op__area-corpo">
                  <p><b>Para que serve:</b> {a.paraQue}</p>
                  <ol>{a.tutorial.map((t) => <li key={t}>{t}</li>)}</ol>
                  {!a.externo && <Link to={a.rota} className="proc-op__area-ir">Abrir {a.nome} →</Link>}
                </div>
              </details>
            ))}
          </div>
        ))}
      </section>

      {/* DICAS — o que a operação mais erra, com a cura em uma linha. */}
      <section className="proc-op__dicas">
        <h2>Dicas para o dia a dia</h2>
        <div className="proc-op__dicas-grade">
          {DICAS.map((d) => (
            <div key={d.titulo} className="proc-op__dica">
              <i className={`pi ${d.icone}`} />
              <div>
                <strong>{d.titulo}</strong>
                <p>{d.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="proc-op__prazos">
        <h2>Os prazos</h2>
        <div className="proc-op__prazos-grade">
          {PRAZOS.map((p) => (
            <div key={p.prazo} className="proc-op__prazo-card">
              <strong>{p.prazo}</strong>
              <span>{p.oQue}</span>
              <em>{p.deQuem}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="proc-op__etapas">
        <div className="proc-op__etapas-topo">
          <h2>As 6 etapas</h2>
          <div className="proc-op__filtros">
            <button type="button" className="proc-op__filtro" onClick={alternarTodas}>
              {todasAbertas ? 'Fechar todas' : 'Abrir todas'}
            </button>
            {(['TODOS', 'INSTITUTO', 'G4MED'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`proc-op__filtro ${filtroDono === f ? 'is-ativo' : ''}`}
                onClick={() => setFiltroDono(f)}
              >
                {f === 'TODOS' ? 'Todas' : DONOS[f].rotulo}
              </button>
            ))}
          </div>
        </div>

        {etapasVisiveis.map((etapa: Etapa) => {
          const dono = DONOS[etapa.dono];
          const estaAberta = abertas.has(etapa.id);
          return (
            <article
              key={etapa.id}
              id={`etapa-${etapa.id}`}
              className={`proc-op__etapa ${estaAberta ? 'is-aberta' : ''}`}
              style={{ borderLeftColor: dono.cor }}
            >
              <button
                type="button"
                className="proc-op__etapa-cabeca"
                onClick={() => alternarUma(etapa.id)}
                aria-expanded={estaAberta}
              >
                <span className="proc-op__etapa-numero" style={{ background: dono.cor }}>
                  {etapa.numero}
                </span>
                <span className="proc-op__etapa-titulo">{etapa.titulo}</span>
                <span className="proc-op__etapa-dono" style={{ color: dono.cor }}>
                  {dono.rotulo}
                </span>
                <i className={`pi ${estaAberta ? 'pi-chevron-up' : 'pi-chevron-down'}`} />
              </button>

              {estaAberta && (
                <div className="proc-op__etapa-corpo">
                  <p className="proc-op__etapa-oque">{etapa.oQueFaz}</p>

                  {etapa.entrega && (
                    <div className="proc-op__etapa-entrega">
                      <i className="pi pi-arrow-right-arrow-left" />
                      <span><strong>O que esta fase entrega à próxima:</strong> {etapa.entrega}</span>
                    </div>
                  )}

                  {etapa.prazo && (
                    <div className="proc-op__etapa-prazo">
                      <i className="pi pi-clock" /> {etapa.prazo}
                    </div>
                  )}

                  <h4>Passo a passo</h4>
                  <ol className="proc-op__passos">
                    {etapa.comoFazer.map((passo, i) => (
                      <li key={i}>{passo}</li>
                    ))}
                  </ol>

                  {etapa.exemplos && etapa.exemplos.length > 0 && (
                    <>
                      <h4>Exemplos de cada decisão</h4>
                      <div style={{ display: 'grid', gap: '.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', margin: '0 0 1rem' }}>
                        {etapa.exemplos.map((ex) => (
                          <div key={ex.decisao} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '.6rem .75rem' }}>
                            <strong style={{ display: 'block', marginBottom: '.35rem' }}>{ex.decisao}</strong>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.45 }}>
                              {ex.quando.map((q, i) => <li key={i}>{q}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {etapa.falaDoRapha && (
                    <blockquote className="proc-op__fala">
                      <span className="proc-op__fala-rotulo">Rapha, na reunião</span>
                      {etapa.falaDoRapha}
                    </blockquote>
                  )}

                  {etapa.atencao && (
                    <div className="proc-op__atencao">
                      <i className="pi pi-exclamation-triangle" />
                      <span>{etapa.atencao}</span>
                    </div>
                  )}

                  {etapa.rota && (
                    <a className="proc-op__ir" href={etapa.rota}>
                      Ir para a tela <i className="pi pi-arrow-right" />
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="proc-op__regras">
        <h2>Regras que valem sempre</h2>
        {REGRAS.map((r) => (
          <div key={r.titulo} className="proc-op__regra">
            <h3>{r.titulo}</h3>
            <p>{r.texto}</p>
            {r.fala && <blockquote className="proc-op__fala proc-op__fala--curta">{r.fala}</blockquote>}
          </div>
        ))}
      </section>

      {/* @R 21/09: a atualização fica AQUI, no fim, para o processo operacional nunca ficar velho */}
      <section className="proc-op__regras" aria-labelledby="proc-op-atualizacoes">
        <h2 id="proc-op-atualizacoes">O que mudou no processo</h2>
        <ol className="proc-op__atualizacoes" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ATUALIZACOES.map((a, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '6.5rem 1fr', gap: '.75rem', padding: '.55rem 0', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>{a.data}</span>
              <span><strong>{a.onde}</strong> — {a.oQue}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="proc-op__fonte">{FONTE}</footer>
    </div>
  );
}

export default ProcessoOperacionalPage;
