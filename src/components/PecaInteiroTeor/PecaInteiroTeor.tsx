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
import { getAnexosOrder, uploadAnexoOrder, removerInteiroTeor, baixarAnexoDoTipo, salvarBlob } from '../../services/api/orders';
import './PecaInteiroTeor.css';

type Parte = { id: number; createDate: string };

// O servidor manda "2026-09-20 10:00:00.123456+00:00" (espaço + microssegundos) — normaliza antes de ler.
const dataBr = (s: string) => new Date(s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')).toLocaleDateString('pt-BR');

export function GerenciadorPeca({ orderId, readOnly = false, onMudou }: {
  orderId: number; readOnly?: boolean; onMudou?: (partes: number) => void;
}) {
  const [partes, setPartes] = useState<Parte[] | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState<'' | 'enviando' | 'trocando' | 'baixando'>('');
  const [aviso, setAviso] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r: any = await getAnexosOrder(orderId, 'DECISAO_INTEIRO_TEOR');
      const lista: Parte[] = [...(r.data?.anexos ?? [])].sort((a: any, b: any) =>
        (a.createDate < b.createDate ? -1 : a.createDate > b.createDate ? 1 : a.id - b.id));
      setPartes(lista);
      return lista.length;
    } catch {
      setPartes([]); setAviso('Não consegui ler as partes da peça agora.');
      return 0;
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
      const n = await carregar();
      setAviso((novas ? `${novas === 1 ? 'Parte anexada' : `${novas} partes anexadas`}.` : '')
        + (repetidas ? ` ${repetidas === 1 ? '1 arquivo já estava anexado' : `${repetidas} arquivos já estavam anexados`} — não dupliquei.` : ''));
      onMudou?.(n);
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
      setAviso('Peça anterior retirada. Escolha o(s) PDF(s) correto(s) e envie.');
      onMudou?.(m);
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
          ? <><i className="pi pi-check-circle" /> Peça anexada em <strong>{partes.length} {partes.length === 1 ? 'parte' : 'partes'}</strong>: {partes.map((p, k) => `parte ${k + 1} (${dataBr(p.createDate)})`).join(' · ')}</>
          : <><i className="pi pi-exclamation-circle" /> Este pedido ainda não tem a peça de inteiro teor.</>}
      </p>
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
