import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { useFichaPedido } from '../../components/FichaPedido/FichaPedidoContext';
import type { EstadoGatilho, FilaBaterValores, ItemBaterValores, PainelBaterValores, Saida } from '../../services/api/baterValores';
import { decidirBaterValores, listarBaterValores, painelBaterValores } from '../../services/api/baterValores';

/* Fase 3.1 "bater valores" (@R 22/09/2026 14:24: "quando recebemos um orçamento e vemos que tem um valor
   menor no próprio processo, nós tentamos bater o processo").
   POR QUE ESTA TELA EXISTE: medido em 22/09, a cotação nascia e saía para a SES no MESMO clique — não havia
   instante para olhar o valor, e quando a negociação acontecia (caso #1271) ela ficava só no WhatsApp.
   Aqui o orçamento para antes de sair; a pessoa confirma (1 clique) ou registra a revisão que o MÉDICO fez.
   O que esta tela NUNCA faz: sugerir onde cortar. Hospital, OPME e anestesista são custo de terceiro. */

const FILTROS: { label: string; value: EstadoGatilho | 'todos' }[] = [
  { label: 'Com concorrente', value: 'COM_CONCORRENTE' },
  { label: 'Indeterminado', value: 'INDETERMINADO' },
  { label: 'Sem concorrente', value: 'SEM_CONCORRENTE' },
  { label: 'Todos', value: 'todos' },
];
const COR: Record<EstadoGatilho, 'danger' | 'warning' | 'success'> = {
  COM_CONCORRENTE: 'danger', INDETERMINADO: 'warning', SEM_CONCORRENTE: 'success',
};
const ROTULO: Record<EstadoGatilho, string> = {
  COM_CONCORRENTE: 'Há orçamento menor no processo',
  INDETERMINADO: 'Menor, mas pode ser parcial',
  SEM_CONCORRENTE: 'Nenhum orçamento menor',
};
const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function BaterValoresPage() {
  const [filtro, setFiltro] = useState<EstadoGatilho | 'todos'>('todos');
  const [dados, setDados] = useState<FilaBaterValores | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<PainelBaterValores | null>(null);
  const ficha = useFichaPedido();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarBaterValores(filtro);
      setDados(r.data);
    } catch {
      // erro de rede NÃO é "fila vazia": dizer que não há nada seria mentir sobre orçamento parado
      setErro('Não foi possível carregar a fila. Nada foi decidido — tente de novo.');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = async (item: ItemBaterValores) => {
    try {
      const r = await painelBaterValores(item.pedido);
      setAberto(r.data);
    } catch {
      alert('Não foi possível abrir o painel deste pedido.');
    }
  };

  return (
    <div className="p-3">
      <h2 className="mt-0 mb-1">3,1 Bater valores</h2>
      <p className="mt-0 text-600" style={{ maxWidth: 900 }}>
        Orçamentos que chegaram do médico e ainda não foram à SES. O sistema compara com o menor orçamento de
        terceiro <strong>do próprio processo</strong> e mostra a diferença — quem decide é você, com o médico.
        Sem orçamento menor no processo, é só confirmar: o e-mail sai na hora.
      </p>

      <div className="flex align-items-center gap-3 mb-3 flex-wrap">
        <SelectButton value={filtro} options={FILTROS} onChange={(e) => e.value && setFiltro(e.value)} />
        {dados && (
          <span className="text-600">
            {dados.contagem.COM_CONCORRENTE} com concorrente · {dados.contagem.INDETERMINADO} indeterminados ·
            {' '}{dados.contagem.SEM_CONCORRENTE} sem concorrente
          </span>
        )}
        <Button icon="pi pi-refresh" text onClick={carregar} aria-label="Atualizar" />
      </div>

      {erro && <div className="p-3 mb-3" style={{ background: '#fef3f2', color: '#b42318', borderRadius: 6 }}>{erro}</div>}

      <DataTable value={dados?.itens ?? []} loading={carregando} dataKey="pedido" size="small" stripedRows
        emptyMessage={erro ? ' ' : 'Nenhum orçamento esperando conferência de valor.'}>
        <Column header="#" body={(r: ItemBaterValores) => (
          <Button link className="p-0" label={String(r.pedido)} onClick={() => ficha.abrir(r.pedido)} />
        )} style={{ width: 70 }} />
        <Column field="paciente" header="Paciente" />
        <Column header="Procedimento" body={(r: ItemBaterValores) => (
          <span style={{ fontSize: '.85rem' }}>{(r.procedimento ?? '').slice(0, 90)}</span>
        )} />
        <Column header="Nosso" body={(r: ItemBaterValores) => brl(r.nossoTotal)} style={{ whiteSpace: 'nowrap' }} />
        <Column header="Menor do processo" body={(r: ItemBaterValores) => brl(r.menorTerceiro)} style={{ whiteSpace: 'nowrap' }} />
        <Column header="Situação" body={(r: ItemBaterValores) => r.estado ? (
          <div>
            <Tag severity={COR[r.estado]} value={ROTULO[r.estado]} />
            {r.acimaPct != null && <div className="text-600" style={{ fontSize: '.8rem' }}>nosso {Math.round(r.acimaPct)}% acima</div>}
          </div>
        ) : null} />
        <Column body={(r: ItemBaterValores) => (
          <Button label="Conferir" icon="pi pi-check-square" size="small" onClick={() => abrir(r)} />
        )} style={{ width: 130 }} />
      </DataTable>

      {aberto && (
        <DialogDecisao painel={aberto} onFechar={() => setAberto(null)} onDecidido={() => { setAberto(null); carregar(); }} />
      )}
    </div>
  );
}

function DialogDecisao({ painel, onFechar, onDecidido }: {
  painel: PainelBaterValores; onFechar: () => void; onDecidido: () => void;
}) {
  const [saida, setSaida] = useState<Saida>('CONFIRMADO');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [valorNovo, setValorNovo] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const revisando = saida === 'REVISADO';
  const pode = !salvando && (!revisando || (!!motivo && !!valorNovo && valorNovo > 0));

  const decidir = async () => {
    setSalvando(true);
    try {
      const r = await decidirBaterValores(painel.pedido, {
        saida, motivo: motivo ?? undefined, observacao: obs || undefined, valorNovo: revisando ? valorNovo : undefined,
      });
      const envio = r.data.envio;
      if (saida === 'CONFIRMADO') {
        // o desfecho REAL do e-mail, nunca "sucesso" genérico — quem clica precisa saber se a SES recebeu
        if (envio?.enviado) alert(`Valor confirmado e e-mail ENVIADO à SES (${envio.para ?? 'solicitante'}).`);
        else if (envio) alert(`Valor confirmado, mas o e-mail NÃO saiu: ${envio.motivo}. Ele está na Central de E-mails.`);
        else alert('Valor confirmado. Não havia e-mail de orçamento retido — envie pela tela de Orçamento Médico.');
      } else {
        alert('Revisão registrada. Agora suba a nova versão com o valor que o médico mandou (Orçamento Médico → versões) — é ela que vai à SES.');
      }
      onDecidido();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não foi possível registrar: ${msg ?? 'erro de rede'}.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog header={`Conferência de valor — pedido #${painel.pedido}`} visible onHide={onFechar}
      style={{ width: 'min(720px, 96vw)' }}>
      <div className="mb-3">
        <div><strong>{painel.paciente}</strong></div>
        <div className="text-600" style={{ fontSize: '.85rem' }}>{painel.procedimento}</div>
      </div>

      <div className="grid mb-2">
        <div className="col-6"><div className="text-600">Nosso orçamento</div><div className="text-2xl font-bold">{brl(painel.nossoTotal)}</div></div>
        <div className="col-6"><div className="text-600">Menor orçamento do processo</div><div className="text-2xl font-bold">{brl(painel.menorTerceiro)}</div>
          {painel.acimaPct != null && <div className="text-600">nosso está {Math.round(painel.acimaPct)}% acima</div>}</div>
      </div>

      {painel.aviso && <div className="p-2 mb-2" style={{ background: '#fffaeb', color: '#b54708', borderRadius: 6 }}>{painel.aviso}</div>}

      {painel.terceiros.length > 0 && (
        <div className="mb-3">
          <div className="text-600 mb-1">Orçamentos de terceiro no processo que ficam abaixo do nosso</div>
          {painel.terceiros.map((t) => (
            <div key={t.id} style={{ fontSize: '.85rem' }}>
              {brl(t.valorTotal)} — {t.prestador ?? 'prestador não identificado'}{t.pagina ? ` (p. ${t.pagina})` : ''}
              {!t.comparavel && <span style={{ color: '#b54708' }}> · pode ser parcial</span>}
            </div>
          ))}
        </div>
      )}

      <div className="p-2 mb-3 text-600" style={{ background: '#f2f4f7', borderRadius: 6, fontSize: '.85rem' }}>
        Não alteramos o valor do médico. Hospital, OPME e anestesista são custo de terceiro; se houver espaço,
        ele está no honorário — e a decisão é do médico. Se ele mandou valor novo, registre abaixo.
      </div>

      <SelectButton className="mb-3" value={saida} onChange={(e) => e.value && setSaida(e.value)} options={[
        { label: 'Confirmar o valor (envia agora)', value: 'CONFIRMADO' },
        { label: 'O médico revisou', value: 'REVISADO' },
      ]} />

      <div className="flex flex-column gap-2">
        <Dropdown value={motivo} onChange={(e) => setMotivo(e.value)} showClear
          options={painel.motivosRevisao} optionLabel="rotulo" optionValue="valor"
          placeholder={revisando ? 'Motivo da revisão (obrigatório)' : 'Motivo (opcional)'} />
        {revisando && (
          <InputNumber value={valorNovo} onValueChange={(e) => setValorNovo(e.value ?? null)} mode="currency"
            currency="BRL" locale="pt-BR" placeholder="Valor que o MÉDICO mandou" />
        )}
        <InputTextarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação (opcional)" />
      </div>

      <div className="flex justify-content-end gap-2 mt-3">
        <Button label="Cancelar" text onClick={onFechar} />
        <Button label={revisando ? 'Registrar revisão' : 'Confirmar e enviar'} icon="pi pi-check" loading={salvando}
          disabled={!pode} onClick={decidir} />
      </div>
    </Dialog>
  );
}
