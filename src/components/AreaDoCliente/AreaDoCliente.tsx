import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { getMetricasMedico } from '../../services/api/client';
import './AreaDoCliente.css';

/**
 * A ÁREA DO CLIENTE — o que ele fez com os pedidos que recebeu.
 *
 * @R 17/09/2026: "uma área de cada médico com todos os dados, os pacientes que ele foi
 * selecionado, taxa de resposta de orçamento, taxa de perda para sabermos... taxa de
 * pedido de exames, e SLA dos médicos lá no clientes".
 *
 * NADA AQUI É DADO NOVO — tudo já estava no banco, só nunca esteve junto. O cálculo mora
 * no backend (`metricas_medico.py`) e é o MESMO que vai ordenar a sugestão de médico: se
 * fossem dois cálculos, um dia discordariam e ninguém saberia qual está certo.
 *
 * ═══ POR QUE ESTA TELA MOSTRA TANTA RESSALVA ═══
 *
 * Porque um número de desempenho sem régua é pior que número nenhum: ele é usado.
 *
 * · TODA TAXA VEM COM O DENOMINADOR ("96% — 102 de 106"). 100% de 3 e 96% de 106 não são
 *   comparáveis, e só o denominador conta isso a quem lê.
 * · POUCO MEDIDO É DITO. Abaixo de 8 pedidos a taxa aparece esmaecida e rotulada — ela
 *   existe, mas não sustenta comparação.
 * · PERDA VEM REPARTIDA POR CULPA. Medido em produção: das 366 perdas, 129 são do
 *   jurídico e 90 são falta de especialista (ou seja, NÓS não tínhamos quem operasse).
 *   Só 64 são "Perda pelo Medico". Uma taxa única culparia o cliente por 302 perdas
 *   alheias — e é o tipo de número que, uma vez na tela, vira conversa de renegociação.
 * · PEDIDO DE EXAMES VEM COMO CONTAGEM, ¬TAXA. Há 18 e-mails desse tipo no sistema
 *   inteiro (17/09), ~1 por cliente. Percentual sobre n=1 oscila 0/100 por acaso.
 */

type Taxa = { pct: number | null; parte: number; total: number; poucoMedido: boolean; leitura: string };
type Metricas = {
  medicoId: number; nome: string; ativo: boolean; totalPedidos: number;
  /** O backend RECUSA medir o placeholder "SEM PROFISSIONAL" (id=1) e diz por quê —
   *  ele não é um cliente, é a marca de que não tínhamos quem operasse. Sem este ramo a
   *  tela mostraria "responde 0% de 201" sobre uma linha que não é ninguém. */
  naoEhCliente?: boolean; motivo?: string;
  respostaOrcamento: Taxa;
  perda: { peloMedico: Taxa; porOrcamento: Taxa; outrosMotivos: number; porStatus: Record<string, number>; nota: string };
  pedidosDeExame: { quantidade: number; taxaSustentada: boolean; nota: string };
  sla: { medianaDias: number | null; medidos: number; semResposta: number; nota: string;
    // #698: contado do ENVIO ao médico; o que não tem envio registrado fica fora e é dito
    minimo?: number; poucoMedido?: boolean; semEnvioRegistrado?: number };
  experiencia: { subarea: string; pedidos: number }[];
  pediatricos: { declarado: string; jaAtendidos: number; contradiz: boolean };
  cidade: string | null; uf: string | null;
  porFase?: { fase: string; pedidos: number }[];
  listaAbertaPor?: string | null;
  pacientes?: { id: number; paciente: string; procedimento: string; subarea: string; dataPedido: string; fase: string; statusPerda: string | null; valorOrcamento: string | null; valorGanho: string | null }[];
};

const CaixaTaxa = ({ titulo, taxa, bom }: { titulo: string; taxa: Taxa; bom?: 'alto' | 'baixo' }) => {
  // ausência ¬é zero: "nunca recebeu pedido" e "falha sempre" são opostos, e um ranking
  // que os trata igual inverte a ordem exatamente nos casos novos.
  if (taxa.pct === null) {
    return (
      <div className="adc__caixa adc__caixa--sem">
        <span className="adc__rotulo">{titulo}</span>
        <strong className="adc__sem">—</strong>
        <span className="adc__regua">{taxa.leitura}</span>
      </div>
    );
  }
  const ruim = bom === 'alto' ? taxa.pct < 70 : taxa.pct > 20;
  return (
    <div className={`adc__caixa ${taxa.poucoMedido ? 'adc__caixa--fraca' : ''} ${ruim ? 'adc__caixa--alerta' : ''}`}>
      <span className="adc__rotulo">{titulo}</span>
      <strong>{taxa.pct}%</strong>
      <span className="adc__regua">{taxa.leitura}</span>
      {taxa.poucoMedido && <span className="adc__aviso">pouco medido — não compare</span>}
    </div>
  );
};

export function AreaDoCliente({ medicoId, nome, aberto, aoFechar }: {
  medicoId: number | null; nome?: string; aberto: boolean; aoFechar: () => void;
}) {
  const [m, setM] = useState<Metricas | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // #485 D (@R 19/09): contagens por fase SEMPRE; a lista nominal (PII) só ao clicar
  // "Ver pedidos" — e o backend registra quem abriu.
  const [comPacientes, setComPacientes] = useState(false);
  useEffect(() => { if (!aberto) setComPacientes(false); }, [aberto]);
  useEffect(() => {
    if (!aberto || !medicoId) return;
    // #698 (achado no teste de tela 24/09): ao trocar de médico a janela mostrava os números do
    // ANTERIOR enquanto carregava (e com o nome dele no título); se a carga falhasse, ficavam na tela
    // ao lado do erro. Agora limpa ao trocar de médico e descarta resposta que chega atrasada.
    let vivo = true;
    setCarregando(true); setErro('');
    setM((atual) => (atual && atual.medicoId === medicoId ? atual : null));
    getMetricasMedico(medicoId, comPacientes)
      .then((r) => { if (vivo) setM(r.data); })
      .catch((e: { response?: { data?: { detail?: string } } }) => {
        if (vivo) setErro(e?.response?.data?.detail ?? 'Não foi possível carregar os dados deste cliente.');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [aberto, medicoId, comPacientes]);

  return (
    <Dialog header={`Área do cliente — ${(m && m.medicoId === medicoId ? m.nome : null) ?? nome ?? ''}`} visible={aberto}
      style={{ width: 'min(1040px, 96vw)' }} onHide={aoFechar}>
      {carregando && <p>Carregando os dados…</p>}
      {erro && <p className="adc__erro">{erro}</p>}

      {m?.naoEhCliente && (
        <div className="adc__recusa">
          <p><strong>{m.totalPedidos}</strong> pedido(s) estão nesta marca.</p>
          <p>{m.motivo}</p>
        </div>
      )}

      {m && !m.naoEhCliente && (
        <>
          <p className="adc__topo">
            <strong>{m.totalPedidos}</strong> pedido(s) já atribuídos
            {m.cidade && <> · {m.cidade}{m.uf ? `/${m.uf}` : ''}</>}
            {!m.ativo && <span className="adc__inativo"> · cliente inativo</span>}
          </p>

          {m.totalPedidos === 0 ? (
            <p className="adc__vazio">
              Este cliente ainda não recebeu nenhum pedido — não há desempenho a mostrar.
              Isso <strong>não</strong> é o mesmo que desempenho ruim.
            </p>
          ) : (
            <>
              <div className="adc__caixas">
                <CaixaTaxa titulo="Responde o orçamento" taxa={m.respostaOrcamento} bom="alto" />
                <CaixaTaxa titulo="Perda pelo médico" taxa={m.perda.peloMedico} bom="baixo" />
                <CaixaTaxa titulo="Perda por orçamento" taxa={m.perda.porOrcamento} bom="baixo" />
                <div className="adc__caixa">
                  <span className="adc__rotulo" title={m.sla.nota}>SLA — do envio a ele até o orçamento</span>
                  <strong>{m.sla.medianaDias === null ? '—' : `${m.sla.medianaDias.toLocaleString('pt-BR')} d`}</strong>
                  <span className="adc__regua">
                    {m.sla.medianaDias !== null ? `mediana de ${m.sla.medidos} resposta(s) desde o envio`
                      : m.sla.poucoMedido ? `poucos casos (${m.sla.medidos} de ${m.sla.minimo ?? 10} necessários)`
                        : 'nenhuma resposta com envio registrado'}
                  </span>
                  {(m.sla.semEnvioRegistrado ?? 0) > 0 && (
                    <span className="adc__aviso">{m.sla.semEnvioRegistrado} resposta(s) sem envio registrado — fora da conta (não usamos a data do pedido)</span>
                  )}
                  {m.sla.semResposta > 0 && (
                    <span className="adc__aviso">{m.sla.semResposta} pedido(s) sem resposta — fora da média</span>
                  )}
                </div>
                <div className="adc__caixa">
                  <span className="adc__rotulo">Pedidos de exame</span>
                  <strong>{m.pedidosDeExame.quantidade}</strong>
                  <span className="adc__regua">contagem, não percentual</span>
                  <span className="adc__aviso">volume ainda baixo no sistema</span>
                </div>
                <div className="adc__caixa">
                  <span className="adc__rotulo">Pediátrico</span>
                  <strong>
                    {m.pediatricos.declarado === 'SIM' ? 'Atende'
                      : m.pediatricos.declarado === 'NAO' ? 'Não atende' : 'Não informado'}
                  </strong>
                  <span className="adc__regua">{m.pediatricos.jaAtendidos} já atendido(s)</span>
                  {m.pediatricos.contradiz && (
                    <span className="adc__aviso adc__aviso--forte">
                      declarado "não atende", mas há {m.pediatricos.jaAtendidos} no histórico
                    </span>
                  )}
                </div>
              </div>

              <p className="adc__nota">{m.perda.nota}</p>

              {Object.keys(m.perda.porStatus).length > 0 && (
                <details className="adc__bloco">
                  <summary>Perdas repartidas por motivo ({m.perda.outrosMotivos + m.perda.peloMedico.parte + m.perda.porOrcamento.parte})</summary>
                  <ul className="adc__lista">
                    {Object.entries(m.perda.porStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                      <li key={s}><span>{s}</span><strong>{n}</strong></li>
                    ))}
                  </ul>
                </details>
              )}

              {m.experiencia.length > 0 && (
                <details className="adc__bloco" open>
                  <summary>Experiência por subárea — "já fez cirurgia dessa?"</summary>
                  <ul className="adc__lista">
                    {m.experiencia.map((e) => (
                      <li key={e.subarea}><span>{e.subarea}</span><strong>{e.pedidos}</strong></li>
                    ))}
                  </ul>
                  <p className="adc__nota">
                    A subárea vem como foi digitada no pedido — há grafias diferentes para a
                    mesma coisa ("JOELHO" e "Cirurgia do Joelho"), então a experiência real
                    pode estar repartida em mais de uma linha.
                  </p>
                </details>
              )}

              {m.porFase && m.porFase.length > 0 && (
                <div className="adc__bloco">
                  <strong>Pedidos deste cliente por fase</strong>
                  <ul style={{ margin: '.3rem 0 .5rem', paddingLeft: '1.1rem' }}>
                    {m.porFase.map((f) => <li key={f.fase}>{f.fase}: <b>{f.pedidos}</b></li>)}
                  </ul>
                  {!comPacientes && (
                    <button type="button" className="p-button p-button-sm p-button-outlined" onClick={() => setComPacientes(true)}>
                      Ver pedidos (lista com nomes — fica registrado quem abriu)
                    </button>
                  )}
                </div>
              )}

              {m.pacientes && m.pacientes.length > 0 && (
                <details className="adc__bloco" open>
                  <summary>Pacientes atribuídos a este cliente ({m.pacientes.length}){m.listaAbertaPor ? ` · aberta por ${m.listaAbertaPor}` : ''}</summary>
                  <table className="adc__tabela">
                    <thead><tr><th>#</th><th>Paciente</th><th>Procedimento</th><th>Fase</th><th>Orçamento</th><th>Ganho</th></tr></thead>
                    <tbody>
                      {m.pacientes.map((p) => (
                        <tr key={p.id}>
                          <td>{p.id}</td>
                          <td>{p.paciente}</td>
                          <td>{p.procedimento}</td>
                          <td>{p.statusPerda || p.fase}</td>
                          <td>{p.valorOrcamento ?? '—'}</td>
                          <td>{p.valorGanho ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

export default AreaDoCliente;
