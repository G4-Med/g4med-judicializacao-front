/** Quantas peças faltam, qual é a fila e em que ritmo ela anda (@R 18/09/2026:
 *  "temos que ter uma área para saber o status de quais já foram processados e quais faltam
 *  ser processados para acompanharmos o processo" + "quantas peças faltam e qual é a fila e
 *  quantos trabalhadores e o log dos processamentos para sabermos e auditarmos").
 *
 *  POR QUE O DENOMINADOR É O TOTAL DE ANEXOS, ¬a fila: medido em 18/09, a fila de leitura cobre
 *  SÓ a peça de inteiro teor — 204 de 2.632 anexos. Uma barra dizendo "85% pronto" seria verdade
 *  sobre a fila e mentira sobre o sistema: 857 laudos, 709 relatórios, 297 orçamentos e 152
 *  exames nunca passaram por leitura nenhuma. Por isso a tela mostra os DOIS blocos — o que está
 *  na fila e o que nunca foi chamado para ela. Esconder o segundo faria o número parecer melhor
 *  do que a realidade, que é exatamente o que uma tela de auditoria não pode fazer.
 *
 *  POR QUE "PARADA" É ESTADO DECLARADO, ¬calculado de um tempo fixo: a tela antiga prometia
 *  "~2 min" sobre uma constante, e havia peça parada há horas com esse aviso na frente. Aqui o
 *  ritmo vem do que REALMENTE saiu nas últimas 2h. Se saiu zero, a tela diz PARADA e não estima
 *  minuto nenhum — contar minutos sobre esteira parada é a mentira que o @R pegou em 18/09.
 */
import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import api from '../../services/api';

type Bloco = { total: number; processado: number; pendente: number; processando: number; erro: number; nuncaChamado: number };
type Item = {
  anexoId: number; orderId: number; paciente: string | null; fase: string | null;
  status: string | null; pedidoEm: string | null; ultimoToqueEm: string | null;
  duracaoMin: number | null; paginas: number | null; paginasOcr: number | null;
  mensagem: string; erro: boolean;
};

type Status = {
  naFila: { tipos: Record<string, Bloco>; lidos: number; faltam: number; comErro: number };
  foraDaFila: { tipos: Record<string, Bloco>; total: number };
  esteira: { ritmoHora: number; parada: boolean; ultimaConclusao: string | null; horasParaZerar: number | null };
  /* O LEITOR na máquina do Rapha (@R 19/09): vivo? por que parou? o que fazer? Vem do batimento
     que o cron manda ao servidor a cada tick — sem ele a tela só sabia dizer "PARADA". */
  leitor?: {
    estado: 'VERDE' | 'AMARELO' | 'VERMELHO';
    ultimoBatimento: string | null; ultimoFim: string | null; host: string | null;
    rc: number | string | null; carga: number | null; teto: number | null; killSwitch: boolean | null;
    diagnostico: { nivel: 'VERDE' | 'AMARELO' | 'VERMELHO'; causa: string; conserto: string | null }[];
  };
};

const ROTULO: Record<string, string> = {
  DECISAO_INTEIRO_TEOR: 'Peça de inteiro teor',
  LAUDO: 'Laudo',
  RELATORIO: 'Relatório médico',
  ORCAMENTO: 'Orçamento',
  EXAME: 'Exame',
  PROTOCOLO: 'Protocolo',
  EMAIL_ORIGINAL: 'E-mail original',
  ACOMPANHAMENTO: 'Acompanhamento',
  OUTRO: 'Outro',
  SEM_TIPO: 'Sem tipo',
};

function desde(iso: string | null): string {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h}h${String(min % 60).padStart(2, '0')}` : `há ${Math.floor(h / 24)}d`;
}

export function ProcessamentoPage() {
  const [d, setD] = useState<Status | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [fases, setFases] = useState<{ fase: string; n: number }[]>([]);
  const [fStatus, setFStatus] = useState<string | null>('ERRO');
  const [fFase, setFFase] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [reprocessando, setReprocessando] = useState<number | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const buscar = () => {
    setCarregando(true);
    api.get('status-processamento/')
      .then((r) => { setD(r.data); setErro(false); })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  };

  const buscarItens = () => {
    const p = new URLSearchParams();
    if (fStatus) p.set('status', fStatus);
    if (fFase) p.set('fase', fFase);
    if (busca.trim()) p.set('busca', busca.trim());
    api.get(`status-processamento/itens/?${p.toString()}`)
      .then((r) => { setItens(r.data?.itens ?? []); setFases(r.data?.fases ?? []); })
      .catch(() => setItens([]));
  };

  // REPROCESSAR: reusa a rota que já existe (pedir-processamento). Não há caminho novo —
  // a peça volta para a fila pelo mesmo lugar por onde entra normalmente.
  const reprocessar = async (anexoId: number) => {
    setReprocessando(anexoId);
    try {
      await api.post(`anexos/${anexoId}/processar/`);
      buscarItens(); buscar();
    } finally { setReprocessando(null); }
  };

  useEffect(() => { buscarItens(); /* eslint-disable-next-line */ }, [fStatus, fFase]);

  // Recarrega sozinho a cada 60s: é uma tela de acompanhamento, e um número que não se move
  // sozinho obriga a pessoa a apertar F5 para saber se algo mudou — ela para de olhar.
  useEffect(() => {
    buscar();
    const t = setInterval(buscar, 60000);
    return () => clearInterval(t);
  }, []);

  if (carregando && !d) return <div className="p-4">Carregando…</div>;
  if (erro) return <div className="p-4">Não consegui falar com o servidor para saber o estado da fila.</div>;
  if (!d) return null;

  const naFilaTotal = d.naFila.lidos + d.naFila.faltam + d.naFila.comErro;
  const pct = naFilaTotal > 0 ? Math.round((100 * d.naFila.lidos) / naFilaTotal) : 0;
  const linhasFora = Object.entries(d.foraDaFila.tipos)
    .map(([tipo, b]) => ({ tipo: ROTULO[tipo] ?? tipo, total: b.total }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="p-3">
      <h2>Processamento dos documentos</h2>
      <p className="text-color-secondary">
        O que já foi lido, o que espera a vez, e o que nunca entrou na fila.
      </p>

      <div className="grid mt-2">
        <div className="col-12 md:col-3">
          <Card><div className="text-sm text-color-secondary">JÁ LIDOS</div>
            <div className="text-4xl font-bold">{d.naFila.lidos}</div></Card>
        </div>
        <div className="col-12 md:col-3">
          <Card><div className="text-sm text-color-secondary">FALTAM NA FILA</div>
            <div className="text-4xl font-bold">{d.naFila.faltam}</div></Card>
        </div>
        <div className="col-12 md:col-3">
          <Card><div className="text-sm text-color-secondary">RITMO</div>
            <div className="text-4xl font-bold">
              {d.esteira.parada ? <Tag severity="danger" value="PARADA" /> : `${d.esteira.ritmoHora}/h`}
            </div>
            <div className="text-sm text-color-secondary">última conclusão {desde(d.esteira.ultimaConclusao)}</div>
          </Card>
        </div>
        <div className="col-12 md:col-3">
          <Card><div className="text-sm text-color-secondary">NUNCA CHAMADOS</div>
            <div className="text-4xl font-bold text-orange-500">{d.foraDaFila.total}</div>
            <div className="text-sm text-color-secondary">documentos fora da fila de leitura</div>
          </Card>
        </div>
      </div>

      {/* @R 19/09/2026: "saber que tudo está funcional com o sistema do nosso computador e diagnosticar
          caso não esteja, na aba da rota". O card mostra o que o CRON da máquina do Rapha mandou como
          batimento e, quando algo está errado, a CAUSA medida e o CONSERTO (comando) — não "verifique". */}
      <Card className="mt-3" title="Leitor de peças — servidor">
        {!d.leitor ? (
          <p className="mt-0 text-color-secondary">Esta versão do servidor ainda não manda o estado do leitor.</p>
        ) : (
          <>
            <div className="flex align-items-center gap-3 flex-wrap">
              <Tag severity={d.leitor.estado === 'VERDE' ? 'success' : d.leitor.estado === 'AMARELO' ? 'warning' : 'danger'}
                value={d.leitor.estado === 'VERDE' ? 'VIVO' : d.leitor.estado === 'AMARELO' ? 'ATENÇÃO' : 'PARADO'} />
              <span className="text-color-secondary">
                último batimento {desde(d.leitor.ultimoBatimento)}
                {d.leitor.host ? ` · ${d.leitor.host}` : ''}
                {d.leitor.carga != null && d.leitor.teto != null ? ` · carga ${d.leitor.carga}/${d.leitor.teto}` : ''}
                {d.leitor.ultimoFim ? ` · último ciclo concluído ${desde(d.leitor.ultimoFim)}` : ''}
              </span>
            </div>
            <ul className="mt-2 mb-0 pl-3">
              {d.leitor.diagnostico.map((x, i) => (
                <li key={i} className="mb-2">
                  <span className={x.nivel === 'VERDE' ? 'text-green-600' : x.nivel === 'AMARELO' ? 'text-orange-600' : 'text-red-600'}>
                    <strong>{x.nivel === 'VERDE' ? '✓' : x.nivel === 'AMARELO' ? '⚠' : '✖'}</strong> {x.causa}
                  </span>
                  {x.conserto && (
                    <div className="text-sm text-color-secondary mt-1">
                      Conserto: <code style={{ whiteSpace: 'pre-wrap' }}>{x.conserto}</code>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-sm text-color-secondary mb-0 mt-2">
              Desde 21/09/2026 o leitor roda no próprio servidor (cron a cada 10 min, 3 peças por vez) — saiu do
              computador do Rapha, que ficava ocupado e pulava a leitura (o pedido #1272 esperou 50 min).
              Sem batimento por mais de 25 min = o cron do servidor não está rodando.
            </p>
          </>
        )}
      </Card>

      <Card className="mt-3" title="A fila de leitura">
        <ProgressBar value={pct} />
        <div className="mt-2">
          {d.naFila.lidos} de {naFilaTotal} lidos
          {d.naFila.comErro > 0 && <> · <Tag severity="warning" value={`${d.naFila.comErro} com erro`} /></>}
          {/* Sem ritmo não há previsão honesta — a tela cala em vez de inventar um número. */}
          {d.esteira.parada
            ? <> · <strong>a esteira não conclui nada há mais de 2 horas</strong></>
            : d.esteira.horasParaZerar != null && <> · ~{d.esteira.horasParaZerar}h para zerar no ritmo atual</>}
        </div>
      </Card>

      <Card className="mt-3" title="Documentos que NUNCA entraram na fila">
        <p className="text-color-secondary mt-0">
          A leitura hoje cobre só a peça de inteiro teor. Estes existem nos processos e ninguém
          nunca os leu — é deles que sai a informação médica que o médico usa para cotar.
        </p>
        <DataTable value={linhasFora} size="small">
          <Column field="tipo" header="Tipo de documento" />
          <Column field="total" header="Quantos" style={{ width: '10rem' }} />
        </DataTable>
      </Card>

      <Card className="mt-3" title="Peça a peça — quem, quando, quanto demorou e por que falhou">
        <div className="flex gap-2 flex-wrap mb-3">
          <Dropdown value={fStatus} options={[
            { label: 'Com erro', value: 'ERRO' },
            { label: 'Na fila', value: 'PENDENTE' },
            { label: 'Sendo lida agora', value: 'PROCESSANDO' },
            { label: 'Já lidas', value: 'PROCESSADO' },
            { label: 'Nunca chamadas', value: 'NAO_CHAMADO' },
            { label: 'Todas', value: null },
          ]} onChange={(e) => setFStatus(e.value)} placeholder="Situação" style={{ minWidth: '14rem' }} />
          <Dropdown value={fFase} options={[{ label: 'Todas as fases', value: null },
            ...fases.map((f) => ({ label: `${f.fase} (${f.n})`, value: f.fase }))]}
            onChange={(e) => setFFase(e.value)} placeholder="Fase do pedido" style={{ minWidth: '18rem' }} />
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarItens()} placeholder="Paciente (Enter para buscar)" />
          </span>
          <Button label="Buscar" icon="pi pi-filter" outlined onClick={buscarItens} />
        </div>

        <DataTable value={itens} size="small" paginator rows={20} emptyMessage="Nada nesta situação.">
          <Column field="orderId" header="Pedido" style={{ width: '6rem' }} />
          <Column field="paciente" header="Paciente" />
          <Column field="fase" header="Fase do pedido" />
          <Column header="Situação" body={(r: Item) => (
            <Tag severity={r.erro ? 'danger' : r.status === 'PROCESSADO' ? 'success'
              : r.status === 'PROCESSANDO' ? 'info' : 'warning'}
              value={r.status ?? 'nunca chamada'} />
          )} />
          <Column header="Último toque" body={(r: Item) => (
            r.ultimoToqueEm ? new Date(r.ultimoToqueEm).toLocaleString('pt-BR') : '—'
          )} />
          <Column header="Levou" body={(r: Item) => (r.duracaoMin ? `${r.duracaoMin} min` : '—')} style={{ width: '7rem' }} />
          <Column header="Páginas" body={(r: Item) => (
            r.paginas ? `${r.paginas}${r.paginasOcr ? ` (${r.paginasOcr} por imagem)` : ''}` : '—'
          )} />
          <Column header="Reprocessar" style={{ width: '9rem' }} body={(r: Item) => (
            <Button icon="pi pi-replay" label="Reler" size="small" outlined
              loading={reprocessando === r.anexoId}
              disabled={r.status === 'PROCESSANDO'}
              onClick={() => reprocessar(r.anexoId)} />
          )} />
        </DataTable>

        {/* O texto do erro fica FORA da tabela, inteiro. Truncado numa célula ele vira enfeite:
            a mensagem é o único lugar que diz ONDE consertar. */}
        {itens.filter((i) => i.erro).map((i) => (
          <Message key={i.anexoId} severity="error" className="mt-2 w-full"
            text={`Pedido ${i.orderId} — ${i.mensagem}`} />
        ))}
      </Card>

      <div className="mt-3">
        <Button label="Atualizar agora" icon="pi pi-refresh" outlined onClick={() => { buscar(); buscarItens(); }} loading={carregando} />
      </div>
    </div>
  );
}
