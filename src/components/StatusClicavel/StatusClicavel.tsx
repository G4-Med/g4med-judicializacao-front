/**
 * STATUS CLICÁVEL — #674 (@R 23/09 15:36): "em cima de cada status da tabela, abrir o significado
 * do status e a que fase pertence (modal com os status daquela fase). Ao clicar, ver a trajetória
 * do pedido desde a entrada: por quais status/fases passou e quanto tempo ficou em cada."
 *
 * UM COMPONENTE para todas as tabelas: cada tela desenhava o seu <Tag> de status à mão, e uma
 * explicação copiada em N telas envelhece em N ritmos. A tela passa o valor, o CAMPO (qual das
 * quatro réguas de status é esta coluna) e o nº do pedido; o resto vem da Ficha do pedido no
 * servidor — `situacaoOpcoes` (os status possíveis daquele campo) e `trilha` (o histórico de
 * mudanças). Nada novo no back.
 *
 * TEMPO EM CADA STATUS é a diferença entre uma mudança e a seguinte do MESMO campo (o último vai
 * até agora). Pedido que entrou antes do histórico existir (anterior a set/2026) mostra só o que
 * foi registrado — e a tela diz isso, em vez de fingir que a trajetória começou ali.
 */
import { useState } from 'react';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { getStatusTagStyle } from '../../utils/statusTag';
import { getFichaPedido } from '../../services/api/orders';
import { ETAPAS } from '../../pages/processoOperacional/conteudo';
import './StatusClicavel.css';

export type CampoStatus = 'statusProcesso' | 'statusJuridico' | 'statusOrcamento' | 'statusPerda' | 'resultado';

const NOME_CAMPO: Record<CampoStatus, string> = {
  statusProcesso: 'Fase do pedido',
  statusJuridico: 'Status do jurídico',
  statusOrcamento: 'Status do orçamento',
  statusPerda: 'Motivo da perda',
  resultado: 'Resultado',
};

/** Fase do funil de cada valor de statusProcesso (espelha a régua do Processo Operacional). */
const ETAPA_DA_FASE: Record<string, string> = {
  'Aguardando Juridico': 'juridico',
  'Aguardando Orçamento': 'orcamento-medico',
  'Aguardando Protocolar': 'para-protocolar',
  'Aguardando Resposta': 'protocolados',
  'Aguardando Resposta - Segredo de Justiça': 'protocolados',
  'Enviado à SES - Sem Protocolo': 'enviado-ses',
  // a tela Protocolados mostra este rótulo (não é valor do banco) para toda a fase 5
  Protocolado: 'protocolados',
};
/** A que etapa pertence cada régua de status quando não é a fase em si. */
const ETAPA_DO_CAMPO: Partial<Record<CampoStatus, string>> = {
  statusJuridico: 'juridico',
  statusOrcamento: 'orcamento-medico',
};

type Trilha = { campo: string; de: string | null; para: string | null; por: string; em: string };

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/** A entrada do pedido é DATA sem hora ('2026-09-22'). new Date() a leria como meia-noite UTC e o
 *  fuso a mostraria como 21:00 da VÉSPERA (visto no teste de tela do #1278). Data sem hora sai só data. */
const dataSoOuHora = (v?: string | null) => {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : dataHora(v);
};

export function duracao(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d === 1 ? '' : 's'}${h % 24 ? ` ${h % 24} h` : ''}`;
}

/** Trajetória de UM campo: cada valor que ele assumiu, desde quando e por quanto tempo. */
export function trajetoria(trilha: Trilha[], campo: string, agora = Date.now()) {
  const doCampo = trilha.filter((t) => t.campo === campo && t.em).sort((a, b) => +new Date(a.em) - +new Date(b.em));
  return doCampo.map((t, i) => {
    const ini = +new Date(t.em);
    const fim = i + 1 < doCampo.length ? +new Date(doCampo[i + 1].em) : agora;
    return { valor: t.para ?? '(vazio)', de: t.de, desde: t.em, por: t.por, ms: fim - ini, atual: i + 1 === doCampo.length };
  });
}

function etapaDe(valor: string, campo: CampoStatus) {
  const id = campo === 'statusProcesso' ? ETAPA_DA_FASE[valor] : ETAPA_DO_CAMPO[campo];
  return id ? ETAPAS.find((e) => e.id === id) : undefined;
}

function desfecho(valor: string): string | null {
  if (valor === 'Ganho') return 'Desfecho: o Estado decidiu a nosso favor.';
  if (valor === 'Perda') return 'Desfecho: o pedido saiu do funil (motivo no "Motivo da perda").';
  if (valor.startsWith('Histórico')) return 'Carga anterior ao sistema: tem data e valor, mas ninguém trabalha nela.';
  return null;
}

export function StatusClicavel({ valor, campo, orderId, className }: {
  valor: string | null | undefined; campo: CampoStatus; orderId: number | null | undefined; className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<{ trilha: Trilha[]; opcoes: string[]; entrada: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!valor) return null;
  const tag = <Tag value={valor} style={getStatusTagStyle(valor)} className={className ?? 'status-tag-custom'} />;
  if (!orderId) return tag;

  const abrir = async () => {
    setAberto(true);
    if (dados) return;
    setErro(null);
    try {
      const r: any = await getFichaPedido(orderId);
      setDados({
        trilha: r.data?.trilha ?? [],
        opcoes: r.data?.situacaoOpcoes?.[campo] ?? [],
        entrada: r.data?.blocos?.[0]?.quando ?? null,
      });
    } catch (e: any) {
      // falha de leitura NÃO pode parecer "pedido sem trajetória"
      setErro(e?.response?.data?.error ?? 'Não consegui ler o histórico deste pedido agora.');
    }
  };

  const etapa = etapaDe(valor, campo);
  const fases = dados ? trajetoria(dados.trilha, 'statusProcesso') : [];
  const doCampo = dados && campo !== 'statusProcesso' ? trajetoria(dados.trilha, campo) : [];

  return (
    <>
      <button type="button" className="stc__botao" onClick={(e) => { e.stopPropagation(); void abrir(); }}
        title="O que é este status e por onde o pedido já passou" aria-haspopup="dialog">
        {tag}
      </button>
      <Dialog header={`${NOME_CAMPO[campo]}: ${valor} · pedido #${orderId}`} visible={aberto}
        onHide={() => setAberto(false)} style={{ width: 'min(760px, 96vw)' }} dismissableMask>
        <section className="stc__bloco">
          <h4>O que significa</h4>
          {etapa ? (
            <p><b>Fase {String(etapa.numero).replace('.', ',')} — {etapa.titulo}.</b> {etapa.oQueFaz}
              {etapa.entrega && <><br /><span className="stc__nota">Sai desta fase quando: {etapa.entrega}</span></>}</p>
          ) : (
            <p>{desfecho(valor) ?? `"${valor}" é um valor de ${NOME_CAMPO[campo].toLowerCase()}.`}</p>
          )}
        </section>

        {erro && <p className="stc__erro">{erro}</p>}
        {!dados && !erro && <p className="stc__nota"><i className="pi pi-spin pi-spinner" /> Lendo o histórico do pedido…</p>}

        {dados && dados.opcoes.length > 0 && (
          <section className="stc__bloco">
            <h4>Os status possíveis em "{NOME_CAMPO[campo]}"</h4>
            <div className="stc__opcoes">
              {dados.opcoes.map((o) => (
                <span key={o} className={o === valor ? 'stc__op stc__op--atual' : 'stc__op'}>{o}{o === valor ? ' ← agora' : ''}</span>
              ))}
            </div>
          </section>
        )}

        {dados && (
          <section className="stc__bloco">
            <h4>Trajetória do pedido pelas fases</h4>
            <p className="stc__nota">Entrada do pedido: {dataSoOuHora(dados.entrada)}</p>
            {fases.length === 0 ? (
              <p className="stc__nota">Nenhuma mudança de fase registrada — o histórico começou em set/2026; pedidos mais antigos não têm o caminho gravado.</p>
            ) : (
              <ol className="stc__linha">
                {fases.map((f, i) => (
                  <li key={i} className={f.atual ? 'stc__passo stc__passo--atual' : 'stc__passo'}>
                    <b>{f.valor}</b>
                    <span>desde {dataHora(f.desde)} · {f.atual ? 'há' : 'ficou'} <b>{duracao(f.ms)}</b> · por {f.por}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {dados && campo !== 'statusProcesso' && (
          <section className="stc__bloco">
            <h4>Mudanças de "{NOME_CAMPO[campo]}"</h4>
            {doCampo.length === 0 ? (
              <p className="stc__nota">Nenhuma mudança deste status registrada no histórico.</p>
            ) : (
              <ol className="stc__linha">
                {doCampo.map((f, i) => (
                  <li key={i} className={f.atual ? 'stc__passo stc__passo--atual' : 'stc__passo'}>
                    <b>{f.valor}</b>
                    <span>desde {dataHora(f.desde)} · {f.atual ? 'há' : 'ficou'} <b>{duracao(f.ms)}</b> · por {f.por}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </Dialog>
    </>
  );
}

export default StatusClicavel;
