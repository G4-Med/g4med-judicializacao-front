/* Gerenciador da PEÇA DE INTEIRO TEOR (#684 — @R 24/09 00:02): "precisamos colocar na ficha do pedido uma opção
   para trocar as peças de inteiro teor ou recarregar novas peças (…) e garantir que na fase 1, quando a Valéria
   anexa e clica na tabela, abra a interface para anexar mais de uma parte".
   Um componente só (ponto único), usado na FICHA do pedido e na coluna "Inteiro teor" das tabelas.
   A peça pode ter PARTES (o PJe divide cópias grandes em volumes): as partes ficam em ORDEM DE ENVIO e o "baixar"
   do servidor junta tudo num PDF só (<CNJ>_partes_1-N.pdf). Trocar NÃO apaga: as partes viram "Outro" com quem e
   quando trocou (servidor). A mesma parte enviada de novo o servidor devolve com duplicado=true, sem duplicar. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { getPartesPeca, uploadAnexoOrder, removerInteiroTeor, baixarAnexoDoTipo, baixarAnexo, salvarBlob } from '../../services/api/orders';
import './PecaInteiroTeor.css';

/* #690 (@R 24/09 00:4x): "preciso ver a peça para saber o tamanho e o número de páginas e poder visualizar para eu
   saber que peça é" + "ao subir uma nova peça ou trocar (…) devem ser adicionadas a processamento automaticamente".
   O envio JÁ põe a parte na fila (servidor); o que faltava era a tela DIZER isso — por isso cada parte mostra a leitura.
   Tamanho e páginas vêm do servidor, lidos do próprio arquivo (1ª abertura mede; depois fica guardado). */
type Leitura = { estado: 'NUNCA' | 'NA_FILA' | 'LENDO' | 'LIDA' | 'PARCIAL' | 'ERRO' | string; desde: string | null;
  lidaEm: string | null; documentos: number; copiaDe: number | null; detalhe: string | null };
type Parte = { id: number; ordem: number; enviadaEm: string; nome: string | null; tamanhoBytes: number | null;
  numeroPaginas: number | null; medida: 'OK' | 'FALHOU' | 'PENDENTE'; erroMedida: string | null; leitura: Leitura };

const tamanho = (b: number | null) => (b == null ? '' : b >= 1024 * 1024
  ? `${(b / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`);

function TextoLeitura({ l }: { l: Leitura }) {
  const docs = `${l.documentos} ${l.documentos === 1 ? 'documento extraído' : 'documentos extraídos'}`;
  if (l.copiaDe) return <><i className="pi pi-clone" /> Mesmo arquivo da peça #{l.copiaDe}, que já foi lida — não é lida de novo ({docs}, que seguem no pedido).</>;
  switch (l.estado) {
    case 'NA_FILA': return <><i className="pi pi-clock" /> Na fila de leitura — o leitor passa a cada 10 minutos. Não precisa clicar em Reprocessar.</>;
    case 'LENDO': return <><i className="pi pi-spin pi-spinner" /> Sendo lida agora.</>;
    case 'LIDA': return <><i className="pi pi-check" /> Lida — {docs}.</>;
    case 'PARCIAL': return <><i className="pi pi-exclamation-triangle" /> Lida em parte — {docs}; há páginas não analisadas.</>;
    case 'ERRO': return <><i className="pi pi-times-circle" /> A leitura falhou{l.detalhe ? `: ${l.detalhe}` : ''}.</>;
    default: return <><i className="pi pi-minus-circle" /> Ainda não foi para a leitura.</>;
  }
}

// O servidor manda "2026-09-20 10:00:00.123456+00:00" (espaço + microssegundos) — normaliza antes de ler.
const dataBr = (s: string) => new Date(s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')).toLocaleDateString('pt-BR');

export function GerenciadorPeca({ orderId, readOnly = false, onMudou }: {
  orderId: number; readOnly?: boolean; onMudou?: (partes: number) => void;
}) {
  const [partes, setPartes] = useState<Parte[] | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState<'' | 'enviando' | 'trocando' | 'baixando'>('');
  const [vendo, setVendo] = useState<Parte | null>(null);
  const [aviso, setAviso] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      // 1º sem baixar nada (a lista aparece na hora); se faltar medir alguma parte, 2ª chamada mede e completa.
      const r: any = await getPartesPeca(orderId, false);
      const lista: Parte[] = r.data?.partes ?? [];
      setPartes(lista);
      if (lista.some((p) => p.medida !== 'OK')) {
        getPartesPeca(orderId, true).then((m: any) => setPartes(m.data?.partes ?? lista)).catch(() => {});
      }
      return lista;
    } catch {
      setPartes([]); setAviso('Não consegui ler as partes da peça agora.');
      return [] as Parte[];
    }
  }, [orderId]);

  useEffect(() => { setArquivos([]); setAviso(''); carregar(); }, [carregar]);

  const enviar = async () => {
    setOcupado('enviando'); setAviso('');
    let novas = 0, repetidas = 0;
    try {
      for (const f of arquivos) {   // na ORDEM da seleção — é a ordem das partes no PDF juntado
        const r: any = await uploadAnexoOrder(orderId, f, 'DECISAO_INTEIRO_TEOR');
        if (r?.data?.duplicado) repetidas++; else novas++;
      }
      setArquivos([]); if (input.current) input.current.value = '';
      const lista = await carregar();
      const copias = lista.filter((p) => p.leitura.copiaDe).length;
      setAviso((novas ? `${novas === 1 ? 'Parte anexada' : `${novas} partes anexadas`} e posta na fila de leitura automaticamente — não precisa clicar em Reprocessar.` : '')
        + (repetidas ? ` ${repetidas === 1 ? '1 arquivo já estava anexado' : `${repetidas} arquivos já estavam anexados`} — não dupliquei.` : '')
        + (copias ? ` ${copias === 1 ? '1 parte é o mesmo arquivo de uma peça já lida' : `${copias} partes são o mesmo arquivo de peças já lidas`} — não será lida de novo.` : ''));
      onMudou?.(lista.length);
    } catch (e: any) {
      setAviso(e?.response?.data?.error || 'O envio falhou. Tente de novo.');
      await carregar();
    } finally { setOcupado(''); }
  };

  const trocar = async () => {
    const n = partes?.length ?? 0;
    if (!window.confirm(`Trocar a peça de inteiro teor deste pedido${n > 1 ? ` (as ${n} partes)` : ''}?\n\n`
      + 'A peça atual NÃO é apagada: continua nos documentos do pedido como "Outro" (peça substituída), com quem e quando trocou. '
      + 'Em seguida você anexa a correta (uma ou mais partes).')) return;
    setOcupado('trocando'); setAviso('');
    try {
      await removerInteiroTeor(orderId);
      const m = await carregar();
      setAviso('Peça anterior retirada. Escolha o(s) PDF(s) correto(s) e envie — a leitura começa sozinha.');
      onMudou?.(m.length);
    } catch (e: any) {
      setAviso(e?.response?.data?.error || 'Não consegui trocar a peça agora. Tente de novo.');
    } finally { setOcupado(''); }
  };

  const baixar = async () => {
    setOcupado('baixando'); setAviso('');
    try {
      const { data } = await baixarAnexoDoTipo(orderId, 'DECISAO_INTEIRO_TEOR');
      salvarBlob(data, `peca-inteiro-teor-${orderId}${(partes?.length ?? 0) > 1 ? `-${partes!.length}-partes` : ''}.pdf`);
    } catch {
      setAviso('Não foi possível baixar a peça agora.');
    } finally { setOcupado(''); }
  };

  if (partes === null) return <p className="pit__carregando"><i className="pi pi-spin pi-spinner" /> Lendo as partes da peça…</p>;
  const tem = partes.length > 0;
  return (
    <div className="pit">
      <p className="pit__estado" role="status">
        {tem
          ? <><i className="pi pi-check-circle" /> Peça anexada em <strong>{partes.length} {partes.length === 1 ? 'parte' : 'partes'}</strong>{partes.length > 1 ? ' — o download junta na ordem abaixo' : ''}:</>
          : <><i className="pi pi-exclamation-circle" /> Este pedido ainda não tem a peça de inteiro teor.</>}
      </p>
      {tem && (
        <ol className="pit__partes">
          {partes.map((p) => (
            <li key={p.id} className="pit__parte">
              <div className="pit__parte-cab">
                <strong>Parte {p.ordem}</strong>
                <span className="pit__parte-meta">
                  enviada {dataBr(p.enviadaEm)}
                  {p.medida === 'OK' && <> · <strong>{p.numeroPaginas} {p.numeroPaginas === 1 ? 'página' : 'páginas'}</strong> · {tamanho(p.tamanhoBytes)}</>}
                  {p.medida === 'PENDENTE' && <> · <i className="pi pi-spin pi-spinner" /> medindo…</>}
                  {p.medida === 'FALHOU' && <> · {p.tamanhoBytes ? `${tamanho(p.tamanhoBytes)} · ` : ''}<span className="pit__erro">{p.erroMedida}</span></>}
                </span>
                <Button type="button" size="small" text icon="pi pi-eye" label="Ver" onClick={() => setVendo(p)}
                  aria-label={`Ver a parte ${p.ordem} da peça`} />
              </div>
              {p.nome && <small className="pit__parte-nome" title={p.nome}>{p.nome}</small>}
              <small className={`pit__leitura pit__leitura--${(p.leitura.copiaDe ? 'copia' : p.leitura.estado).toLowerCase()}`}>
                <TextoLeitura l={p.leitura} />
              </small>
            </li>
          ))}
        </ol>
      )}
      {vendo && <DialogVerParte parte={vendo} total={partes.length} onHide={() => setVendo(null)} />}
      {!readOnly && (
        <div className="pit__dica" role="note">
          <i className="pi pi-info-circle" /> <strong>O processo veio em mais de um arquivo?</strong> O PJe divide cópias
          grandes em volumes. Anexe <strong>todas as partes, na ordem</strong> (a parte 1 primeiro) — dá para escolher
          várias de uma vez. O botão de baixar entrega o processo inteiro num PDF só. Até 100 MB por arquivo; a mesma
          parte enviada de novo não duplica.
        </div>
      )}
      {!readOnly && (
        <div className="pit__linha">
          <input ref={input} type="file" accept="application/pdf" multiple
            aria-label={tem ? 'Adicionar parte(s) da peça (PDF)' : 'Peça de inteiro teor (PDF) — uma ou mais partes'}
            onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
          {arquivos.length > 0 && (
            <Button type="button" size="small" icon="pi pi-upload" loading={ocupado === 'enviando'} disabled={!!ocupado && ocupado !== 'enviando'}
              label={arquivos.length > 1 ? `Enviar estas ${arquivos.length} partes` : (tem ? 'Adicionar esta parte' : 'Enviar esta peça')}
              onClick={enviar} />
          )}
        </div>
      )}
      <div className="pit__linha">
        {tem && (
          <Button type="button" size="small" outlined icon="pi pi-download" loading={ocupado === 'baixando'} disabled={!!ocupado && ocupado !== 'baixando'}
            label={partes.length > 1 ? 'Baixar o processo inteiro (1 PDF)' : 'Baixar a peça'} onClick={baixar} />
        )}
        {tem && !readOnly && (
          <Button type="button" size="small" outlined severity="warning" icon="pi pi-refresh" loading={ocupado === 'trocando'} disabled={!!ocupado && ocupado !== 'trocando'}
            label={partes.length > 1 ? 'Trocar a peça (todas as partes)' : 'Trocar a peça'} onClick={trocar} />
        )}
      </div>
      {aviso && <small className="pit__aviso" role="status">{aviso}</small>}
    </div>
  );
}

/* VER uma parte (#690): o PDF abre DENTRO da plataforma, no visualizador do navegador (tem as páginas e a busca).
   Passa pelo servidor (permissão + o R2 é outra origem) e vira um endereço local do navegador, apagado ao fechar. */
function DialogVerParte({ parte, total, onHide }: { parte: Parte; total: number; onHide: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true, u: string | null = null;
    baixarAnexo(parte.id)
      .then(({ data }: any) => {
        u = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        if (vivo) setUrl(u); else URL.revokeObjectURL(u);
      })
      .catch(() => vivo && setErro('Não consegui abrir esta parte agora. Tente de novo ou use "Baixar".'));
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [parte.id]);
  const titulo = `Parte ${parte.ordem}${total > 1 ? ` de ${total}` : ''}`
    + (parte.numeroPaginas ? ` — ${parte.numeroPaginas} ${parte.numeroPaginas === 1 ? 'página' : 'páginas'}` : '')
    + (parte.tamanhoBytes ? ` · ${tamanho(parte.tamanhoBytes)}` : '');
  return (
    <Dialog header={titulo} visible onHide={onHide} style={{ width: 'min(1100px, 96vw)' }} contentStyle={{ padding: 0 }} modal dismissableMask>
      {erro ? <p className="pit__erro" style={{ padding: '1rem' }}>{erro}</p>
        : url ? <iframe className="pit__visor" src={url} title={titulo} />
          : <p className="pit__carregando" style={{ padding: '1rem' }}><i className="pi pi-spin pi-spinner" /> Abrindo a parte {parte.ordem}{parte.tamanhoBytes ? ` (${tamanho(parte.tamanhoBytes)})` : ''}…</p>}
    </Dialog>
  );
}

/* Janela usada pela coluna "Inteiro teor" das tabelas: clicar em "Anexar" ou em "Partes" abre ISTO. */
export function DialogGerenciadorPeca({ orderId, visible, onHide, onMudou }: {
  orderId: number | null; visible: boolean; onHide: () => void; onMudou?: (partes: number) => void;
}) {
  return (
    <Dialog header="Peça de inteiro teor" visible={visible && !!orderId} onHide={onHide} style={{ width: 'min(640px, 95vw)' }} modal dismissableMask>
      {orderId ? <GerenciadorPeca orderId={orderId} onMudou={onMudou} /> : null}
    </Dialog>
  );
}

/* Seção da FICHA do pedido. */
export function BlocoPecaInteiroTeor({ orderId }: { orderId: number }) {
  return (
    <section className="fic__situacao pit-bloco">
      <header className="fic__situacao-cab"><strong>Peça de inteiro teor</strong></header>
      <GerenciadorPeca orderId={orderId} />
    </section>
  );
}
