import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { salvarBlob } from '../../services/api/orders';
import {
  getPeticao, salvarPeticao, refazerPeticao, baixarPeticaoDocx, baixarPeticaoPdf, MARCA_CONFERIR,
  type EstadoPeticao, type Paragrafo, type TipoParagrafo,
} from '../../services/api/peticao';

/** Área da advogada no 4. Protocolar (#641): petição de juntada pronta, conferida e editável.
 *  O texto nasce do orçamento vigente; a conferência mostra se o valor escrito bate com as outras
 *  fontes do mesmo número; pendências dizem o que o sistema não sabe. */
const TIPOS: { label: string; value: TipoParagrafo }[] = [
  { label: 'Parágrafo', value: 'corpo' },
  { label: 'Título (negrito)', value: 'titulo' },
  { label: 'Cabeçalho (negrito)', value: 'cabecalho' },
  { label: 'Nº do processo', value: 'processo' },
  { label: 'Centralizado', value: 'centro' },
  { label: 'Linha em branco', value: 'vazio' },
];

const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function erroDoBlob(e: any): Promise<string> {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try { return JSON.parse(await d.text()).error || 'falha ao baixar'; } catch { return 'falha ao baixar'; }
  }
  return d?.error || e?.message || 'falha ao baixar';
}

interface Props { pedido: number | null; rotulo?: string; visivel: boolean; onFechar: () => void }

export function PeticaoDialog({ pedido, rotulo, visivel, onFechar }: Props) {
  const [estado, setEstado] = useState<EstadoPeticao | null>(null);
  const [paras, setParas] = useState<Paragrafo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);

  const aplicar = (e: EstadoPeticao) => { setEstado(e); setParas(e.paragrafos); setAlterado(false); };

  useEffect(() => {
    if (!visivel || !pedido) return;
    setCarregando(true); setErro(null); setEstado(null);
    getPeticao(pedido).then(r => aplicar(r.data))
      .catch(e => setErro(e?.response?.data?.error || 'Não foi possível carregar a petição.'))
      .finally(() => setCarregando(false));
  }, [visivel, pedido]);

  const mudar = (i: number, campo: keyof Paragrafo, v: string) => {
    setParas(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
    setAlterado(true);
  };
  const inserir = (i: number) => {
    setParas(ps => [...ps.slice(0, i + 1), { tipo: 'corpo', texto: '' }, ...ps.slice(i + 1)]);
    setAlterado(true);
  };
  const remover = (i: number) => { setParas(ps => ps.filter((_, j) => j !== i)); setAlterado(true); };

  const salvar = async () => {
    if (!pedido) return;
    setSalvando(true); setErro(null);
    try { aplicar((await salvarPeticao(pedido, paras)).data); }
    catch (e: any) { setErro(e?.response?.data?.error || 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  };
  const refazer = async () => {
    if (!pedido) return;
    if (!window.confirm('Descartar a edição e voltar ao texto gerado a partir do orçamento atual?')) return;
    setSalvando(true);
    try { aplicar((await refazerPeticao(pedido)).data); } finally { setSalvando(false); }
  };

  // Baixar sempre o que está SALVO: se há edição não salva, salva antes (senão o arquivo sairia sem ela).
  const baixar = async (tipo: 'docx' | 'pdf' | 'pdf-so') => {
    if (!pedido) return;
    setBaixando(tipo); setErro(null);
    try {
      if (alterado) aplicar((await salvarPeticao(pedido, paras)).data);
      const r = tipo === 'docx' ? await baixarPeticaoDocx(pedido) : await baixarPeticaoPdf(pedido, tipo === 'pdf-so');
      const ext = tipo === 'docx' ? 'docx' : 'pdf';
      const mime = tipo === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
      salvarBlob(new Blob([r.data], { type: mime }),
        `peticao_${tipo === 'pdf' ? 'com_orcamento_' : ''}pedido_${pedido}.${ext}`);
    } catch (e) { setErro(await erroDoBlob(e)); }
    finally { setBaixando(null); }
  };

  const marcas = paras.reduce((n, p) => n + (p.texto.split(MARCA_CONFERIR).length - 1), 0);
  const conf = estado?.conferencia;

  return (
    <Dialog header={`Petição de juntada${rotulo ? ` — ${rotulo}` : ''}`} visible={visivel}
      style={{ width: '70rem', maxWidth: '96vw' }} modal onHide={onFechar} className="pp-dialog">
      {carregando && <p>Montando a petição a partir do orçamento…</p>}
      {erro && <div className="p-2 mb-2" style={{ background: '#fdecea', color: '#8a1c1c', borderRadius: 6 }}>{erro}</div>}
      {estado && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1rem' }}>
            <div style={{ border: '1px solid #dfe3e8', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Conferência do valor</strong>
                <Tag value={conf?.ok ? 'bate' : 'conferir'} severity={conf?.ok ? 'success' : 'warning'} />
              </div>
              <table style={{ width: '100%', marginTop: 6, fontSize: 13 }}>
                <tbody>
                  {conf?.linhas.map(l => (
                    <tr key={l.fonte}><td>{l.fonte}</td><td style={{ textAlign: 'right' }}>{brl(l.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
              {conf?.parcelas && conf.parcelas.length > 0 && (
                <details style={{ marginTop: 6, fontSize: 13 }}>
                  <summary>Parcelas que a petição cita</summary>
                  {conf.parcelas.map(p => <div key={p.nome}>{p.nome}: {brl(p.valor)}</div>)}
                </details>
              )}
              {conf?.motivo && <small style={{ color: '#8a5a00' }}>{conf.motivo}</small>}
              {estado.salva?.orcamentoMudou && (
                <div style={{ marginTop: 6, color: '#8a1c1c', fontSize: 13 }}>
                  O orçamento vigente mudou depois desta edição — confira o valor escrito ou use "Refazer".
                </div>
              )}
            </div>
            <div style={{ border: '1px solid #dfe3e8', borderRadius: 8, padding: '0.75rem' }}>
              <strong>O que conferir antes de protocolar</strong>
              {estado.pendencias.length === 0
                ? <p style={{ fontSize: 13 }}>Nada pendente.</p>
                : <ul style={{ margin: '6px 0 0 1rem', padding: 0, fontSize: 13 }}>
                  {estado.pendencias.map(p => <li key={p}>{p}</li>)}
                </ul>}
              {marcas > 0 && (
                <p style={{ fontSize: 13, color: '#8a5a00', marginTop: 6 }}>
                  {marcas} trecho(s) marcados com {MARCA_CONFERIR} no texto.
                </p>
              )}
              <small style={{ color: '#5b6573' }}>
                {estado.salva ? `Editada por ${estado.salva.por || '—'} em ${new Date(estado.salva.em).toLocaleString('pt-BR')}` : 'Rascunho gerado — ainda não editado.'}
                {' · '}Assina: {estado.advogada.nome}, {estado.advogada.oab}
              </small>
            </div>
          </section>

          <section>
            <small style={{ color: '#5b6573' }}>Negrito: escreva entre **dois asteriscos**.</small>
            {paras.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '11rem 1fr auto', gap: 6, marginTop: 6, alignItems: 'start' }}>
                <Dropdown value={p.tipo} options={TIPOS} onChange={e => mudar(i, 'tipo', e.value)} />
                <InputTextarea value={p.texto} autoResize rows={p.tipo === 'corpo' ? 3 : 1}
                  onChange={e => mudar(i, 'texto', e.target.value)}
                  style={{ width: '100%', borderColor: p.texto.includes(MARCA_CONFERIR) ? '#d99a00' : undefined }} />
                <div style={{ display: 'flex', gap: 2 }}>
                  <Button icon="pi pi-plus" text rounded title="Inserir parágrafo abaixo" onClick={() => inserir(i)} />
                  <Button icon="pi pi-trash" text rounded severity="danger" title="Remover" onClick={() => remover(i)} />
                </div>
              </div>
            ))}
          </section>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <Button label="Refazer do orçamento" icon="pi pi-refresh" outlined onClick={refazer} disabled={salvando} />
            <Button label="Salvar" icon="pi pi-check" onClick={salvar} loading={salvando} disabled={!alterado || salvando} />
            <Button label="Baixar Word" icon="pi pi-file-word" outlined onClick={() => baixar('docx')} loading={baixando === 'docx'} />
            <Button label="PDF só da petição" icon="pi pi-file-pdf" outlined onClick={() => baixar('pdf-so')} loading={baixando === 'pdf-so'} />
            <Button label="PDF completo (petição + orçamento)" icon="pi pi-download" onClick={() => baixar('pdf')} loading={baixando === 'pdf'} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
