import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tag } from 'primereact/tag';
import { NovoPedidoManual } from '../../components/NovoPedidoManual/novoPedidoManual';
import type { ResultadoBusca } from '../../services/api/baterValores';
import { MOTIVOS_ENTRADA, buscarParaBaterValores, colocarNaBaterValores } from '../../services/api/baterValores';
import { uploadAnexoOrder } from '../../services/api/orders';

/* Entrada MANUAL na 3,1 (@R 22/09): a Valéria escolhe QUALQUER pedido, em qualquer fase — ou cadastra um novo
   que não veio por e-mail — e registra por que o valor precisa ser revisto.
   Decisões do @R que moldam esta tela: (1) a fase do pedido NÃO muda — pode ser um protocolado com ajuste
   pedido pelo juiz ou mudança do pedido; (2) o "valor a bater" só vira orçamento de terceiro quando o motivo
   é mesmo um orçamento menor no processo; (3) pedido cadastrado aqui conta nos números, com selo Manual. */

const TIPOS_ARQUIVO = [
  { valor: 'DECISAO_PECA', rotulo: 'Peça do processo (decisão, pedido do juiz)' },
  { valor: 'ORCAMENTO_TERCEIRO', rotulo: 'Orçamento de outro prestador' },
  { valor: 'ORCAMENTO', rotulo: 'Nosso orçamento' },
  { valor: 'PROCESSO', rotulo: 'Outro documento do processo' },
];

export function EntradaManualDialog({ onFechar, onPronto }: { onFechar: () => void; onPronto: () => void }) {
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<{ pedido: number; paciente: string | null; fase: string | null; jaFoiSES: boolean } | null>(null);

  const [motivo, setMotivo] = useState<string | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [prestador, setPrestador] = useState('');
  const [anotacao, setAnotacao] = useState('');
  const [arquivos, setArquivos] = useState<{ file: File; tipo: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  const buscar = async () => {
    setBuscando(true);
    setErroBusca(null);
    try {
      const r = await buscarParaBaterValores(q.trim());
      setResultados(r.data.itens);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErroBusca(msg ?? 'Não foi possível buscar agora (erro de rede) — nada foi encontrado nem descartado.');
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  };

  const precisaValor = motivo === 'ORCAMENTO_MENOR';
  const pode = !!escolhido && !!motivo && anotacao.trim().length >= 5 && (!precisaValor || (!!valor && valor > 0)) && !salvando;

  const salvar = async () => {
    if (!escolhido || !motivo) return;
    setSalvando(true);
    try {
      await colocarNaBaterValores(escolhido.pedido, {
        motivo, anotacao: anotacao.trim(), valorAlvo: valor, prestador: prestador.trim() || undefined,
      });
      // os arquivos sobem pela rota de anexos que já existe; falha de 1 arquivo é dita, não engolida
      const falhas: string[] = [];
      for (const a of arquivos) {
        try { await uploadAnexoOrder(escolhido.pedido, a.file, a.tipo); } catch { falhas.push(a.file.name); }
      }
      alert(
        `Pedido #${escolhido.pedido} colocado na 3,1.` +
        (escolhido.jaFoiSES ? ' Ele continua na fase atual; se o valor mudar, o reenvio sai pela refação e fica retido na 3,1 até a decisão.' : '') +
        (falhas.length ? `\n\nATENÇÃO: não subiram ${falhas.length} arquivo(s): ${falhas.join(', ')}. Anexe de novo pela Ficha.` : ''),
      );
      onPronto();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não foi possível colocar na 3,1: ${msg ?? 'erro de rede'}.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog header="Colocar pedido na 3,1" visible onHide={onFechar} style={{ width: 'min(760px, 96vw)' }}>
      {!escolhido ? (
        <>
          <div className="text-600 mb-2">① Ache o pedido — pode estar em qualquer fase. Digite o nome do paciente, o nº do processo ou o nº do pedido.</div>
          <div className="flex gap-2 mb-2">
            <InputText className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do paciente, nº do processo ou nº do pedido"
              onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) buscar(); }} autoFocus />
            <Button label="Buscar" icon="pi pi-search" loading={buscando} disabled={!q.trim()} onClick={buscar} />
          </div>
          {erroBusca && <div className="p-2 mb-2" style={{ background: '#fef3f2', color: '#b42318', borderRadius: 6 }}>{erroBusca}</div>}
          {resultados && resultados.length === 0 && <div className="text-600 mb-2">Nenhum pedido encontrado com esse texto.</div>}
          {resultados && resultados.map((r) => (
            <div key={r.pedido} className="flex align-items-center justify-content-between p-2 mb-1" style={{ border: '1px solid #eaecf0', borderRadius: 6 }}>
              <div>
                <strong>#{r.pedido} · {r.paciente}</strong>
                <div className="text-600" style={{ fontSize: '.8rem' }}>{r.procedimento}</div>
                <div className="flex gap-2 mt-1">
                  <Tag value={r.fase ?? 'sem fase'} severity={r.jaFoiSES ? 'warning' : 'info'} />
                  {r.jaFoiSES && <Tag value="já foi à SES" severity="warning" />}
                  {!r.temCotacaoNossa && <Tag value="sem orçamento nosso" severity="secondary" />}
                  {r.jaNa31 && <Tag value="já está na 3,1" severity="danger" />}
                </div>
              </div>
              <Button label="Escolher" size="small" disabled={r.jaNa31}
                onClick={() => setEscolhido({ pedido: r.pedido, paciente: r.paciente, fase: r.fase, jaFoiSES: r.jaFoiSES })} />
            </div>
          ))}
          <div className="mt-3 p-2" style={{ background: '#f2f4f7', borderRadius: 6 }}>
            <div className="mb-2">Não achou? O paciente ainda não está no sistema — cadastre à mão (ele entra com o selo <strong>Manual</strong>):</div>
            <NovoPedidoManual aoCriar={(id: number) => setEscolhido({ pedido: id, paciente: null, fase: 'Análise Jurídica (novo)', jaFoiSES: false })} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex align-items-center gap-2 flex-wrap">
            <strong>#{escolhido.pedido}{escolhido.paciente ? ` · ${escolhido.paciente}` : ''}</strong>
            <Tag value={escolhido.fase ?? ''} severity={escolhido.jaFoiSES ? 'warning' : 'info'} />
            <Button label="trocar" link className="p-0" onClick={() => setEscolhido(null)} />
          </div>
          <div className="text-600 mb-2">② Por que o valor precisa ser revisto? A fase do pedido não muda.</div>
          <div className="flex flex-column gap-2">
            <Dropdown value={motivo} onChange={(e) => setMotivo(e.value)} options={MOTIVOS_ENTRADA} optionLabel="rotulo" optionValue="valor" placeholder="Motivo (obrigatório)" />
            <InputNumber value={valor} onValueChange={(e) => setValor(e.value ?? null)} mode="currency" currency="BRL" locale="pt-BR"
              placeholder={precisaValor ? 'Valor a bater (obrigatório)' : 'Valor a bater (se houver)'} />
            {precisaValor && (
              <InputText value={prestador} onChange={(e) => setPrestador(e.target.value)} placeholder="Quem cobrou esse valor (hospital/prestador)" />
            )}
            {precisaValor && (
              <div className="text-600" style={{ fontSize: '.8rem' }}>
                Esse valor entra na régua da 3,1 como orçamento de terceiro conferido por você.
              </div>
            )}
            <InputTextarea value={anotacao} onChange={(e) => setAnotacao(e.target.value)} rows={3}
              placeholder="Anotação: o que precisa ser revisto e por quê (fica nas anotações internas do pedido)" />
          </div>

          <div className="text-600 mt-3 mb-2">③ Arquivos (a peça, o orçamento do outro prestador…) — opcional</div>
          <input type="file" multiple onChange={(e) => {
            const novos = Array.from(e.target.files ?? []).map((file) => ({ file, tipo: 'DECISAO_PECA' }));
            setArquivos([...arquivos, ...novos]);
            e.target.value = '';
          }} />
          {arquivos.map((a, i) => (
            <div key={`${a.file.name}-${i}`} className="flex align-items-center gap-2 mt-1">
              <span style={{ fontSize: '.85rem', flex: 1 }}>{a.file.name}</span>
              <Dropdown value={a.tipo} options={TIPOS_ARQUIVO} optionLabel="rotulo" optionValue="valor"
                onChange={(e) => setArquivos(arquivos.map((x, j) => (j === i ? { ...x, tipo: e.value } : x)))} />
              <Button icon="pi pi-times" text aria-label="Tirar" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))} />
            </div>
          ))}

          <div className="flex justify-content-end gap-2 mt-3">
            <Button label="Cancelar" text onClick={onFechar} />
            <Button label="Colocar na 3,1" icon="pi pi-check" loading={salvando} disabled={!pode} onClick={salvar} />
          </div>
        </>
      )}
    </Dialog>
  );
}
