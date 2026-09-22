import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import { getAnotacoes, criarAnotacao, apagarAnotacao, type Anotacao } from '../../services/api/orders';
import { invalidarAnotacoes } from './MarcadorAnotacao';
import './Anotacoes.css';

export function BlocoAnotacoes({ orderId }: { orderId: number }) {
  const [itens, setItens] = useState<Anotacao[]>([]);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => getAnotacoes(orderId).then((r) => { setItens(r.data.itens ?? []); setErro(''); })
    .catch(() => { setItens([]); setErro('Não foi possível carregar as anotações — tente de novo; a lista vazia aqui não quer dizer que não há anotação.'); });
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

  const salvar = async () => {
    const t = texto.trim();
    if (t.length < 3) { setErro('Escreva a anotação.'); return; }
    setSalvando(true); setErro('');
    try {
      const r = await criarAnotacao(orderId, t);
      setItens(r.data.itens ?? []); setTexto(''); invalidarAnotacoes();
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? 'Não foi possível gravar a anotação.');
    } finally { setSalvando(false); }
  };
  const apagar = async (a: Anotacao) => {
    if (!window.confirm('Apagar esta anotação?')) return;
    try { await apagarAnotacao(orderId, a.id); await carregar(); invalidarAnotacoes(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Não foi possível apagar.'); }
  };
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

  return (
    <section className="fic__situacao">
      <header className="fic__situacao-cab">
        <strong>Anotações internas {itens.length > 0 && <span className="mc-anotacao-bang">!</span>}</strong>
        <small>Só a equipe vê. Enquanto houver anotação, o nome do paciente aparece com "!" nas filas.</small>
      </header>
      {itens.length > 0 && (
        <ul className="fic__anotacoes-lista">
          {itens.map((a) => (
            <li key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{a.texto}</span>
                <Button icon="pi pi-trash" text size="small" severity="danger" aria-label="Apagar anotação" onClick={() => apagar(a)} />
              </div>
              <small>{a.usuario ?? 'sistema'} · {fmt(a.createDate)}</small>
            </li>
          ))}
        </ul>
      )}
      <div className="fic__anotacoes-form">
        <InputTextarea value={texto} onChange={(e) => setTexto(e.target.value)} autoResize rows={2}
          placeholder="Ex.: paciente prefere contato à tarde; advogada pediu para avisar antes de protocolar" />
        <Button label="Anotar" icon="pi pi-pencil" size="small" loading={salvando} onClick={salvar} />
      </div>
      {erro && <small style={{ color: '#b91c1c' }}>{erro}</small>}
    </section>
  );
}
