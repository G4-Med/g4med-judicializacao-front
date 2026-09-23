import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { listarPropostas, criarProposta, salvarProposta, excluirProposta, registrarPdfProposta } from '../../services/api/propostas';
import { PropostaDocumento, type Proposta } from './PropostaDocumento';
import './propostas.css';

/* PROPOSTA COMERCIAL NA PLATAFORMA (@R 21/09 19:31): preencher cliente, percentual e a base da cobrança,
   ver o documento, gerar o PDF — e guardar quem gerou e quando. Qualquer um da equipe abre de novo,
   edita e gera outra vez. O PDF é a impressão da prévia (mesmo padrão dos manuais): o papel é sempre
   o que está na tela. */

const VAZIA: Proposta = { cliente: '', tipoCliente: 'HOSPITAL', percentual: 15, base: 'VALOR_OPORTUNIDADE', contato: '', observacoes: '', validadeDias: 5 };
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function PropostasPage() {
  const [lista, setLista] = useState<Proposta[]>([]);
  const [atual, setAtual] = useState<Proposta>(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const navegar = useNavigate();
  const [busca] = useSearchParams();

  const carregar = () => listarPropostas().then((r) => setLista(r.data.itens ?? [])).catch(() => setAviso('Não foi possível carregar as propostas.'));
  useEffect(() => { carregar(); }, []);
  // aberta pela área Documentos (/manuais/propostas?id=N): já entra na proposta clicada
  const idPedido = Number(busca.get('id')) || 0;
  useEffect(() => {
    if (!idPedido || atual.id) return;
    const p = lista.find((x) => x.id === idPedido);
    if (p) setAtual(p);
  }, [lista, idPedido]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (campo: keyof Proposta, valor: unknown) => setAtual((p) => ({ ...p, [campo]: valor }));

  const salvar = async (): Promise<Proposta | null> => {
    setSalvando(true); setAviso('');
    try {
      const dados = { cliente: atual.cliente, tipoCliente: atual.tipoCliente, percentual: atual.percentual, base: atual.base,
        contato: atual.contato, observacoes: atual.observacoes, validadeDias: atual.validadeDias };
      const r = atual.id ? await salvarProposta(atual.id, dados) : await criarProposta(dados);
      setAtual(r.data); await carregar(); setAviso('Proposta salva.');
      return r.data;
    } catch (e: any) {
      setAviso(e?.response?.data?.error ?? 'Não foi possível salvar.');
      return null;
    } finally { setSalvando(false); }
  };

  const gerarPdf = async () => {
    const salva = await salvar();          // o PDF é sempre do que está gravado — nunca de um rascunho solto
    if (!salva?.id) return;
    try { const r = await registrarPdfProposta(salva.id); setAtual(r.data); carregar(); } catch { /* o PDF sai mesmo assim */ }
    const titulo = document.title;
    document.title = `Proposta G4MED - ${salva.cliente}`;   // vira o nome do arquivo no "Salvar como PDF"
    window.print();
    document.title = titulo;
  };

  const excluir = async () => {
    if (!atual.id || !window.confirm(`Excluir a proposta de ${atual.cliente}? Ela sai da lista (o registro fica guardado).`)) return;
    await excluirProposta(atual.id); setAtual(VAZIA); carregar();
  };

  return (
    <div className="propostas-pagina mc-pagina-g4">
      <div className="g4-cabecalho">
        <div>
          <h1>Proposta comercial</h1>
          <p>Preencha o cliente, o percentual e a base da cobrança. A prévia ao lado é exatamente o PDF.</p>
        </div>
        <div className="g4-acoes">
          <Button label="Documentos" icon="pi pi-arrow-left" text onClick={() => navegar('/documentos')} />
          <Button label="Nova proposta" icon="pi pi-plus" onClick={() => { setAtual(VAZIA); setAviso(''); }} />
        </div>
      </div>
      <div className="propostas-corpo">
      <aside className="propostas-lista">
        <div className="pl-titulo">Propostas salvas ({lista.length})</div>
        {lista.length === 0 && <p className="pl-vazio">Nenhuma proposta ainda. Preencha ao lado e clique em Salvar.</p>}
        {lista.map((p) => (
          <button key={p.id} type="button" className={`pl-item${p.id === atual.id ? ' ativo' : ''}`} onClick={() => { setAtual(p); setAviso(''); }}>
            <b>{p.cliente}</b>
            <span>{Number(p.percentual).toLocaleString('pt-BR')}% · {p.base === 'HONORARIO_MEDICO' ? 'sobre honorário médico' : 'sobre a oportunidade'}</span>
            <small>por {p.atualizadoPor ?? p.criadoPor} · {fmt(p.atualizadoEm)}</small>
          </button>
        ))}
      </aside>

        <div className="pe-form">
          <h1>{atual.id ? 'Editar proposta' : 'Nova proposta comercial'}</h1>
          <label htmlFor="pp-cliente">Nome do cliente (hospital ou médico)</label>
          <InputText id="pp-cliente" value={atual.cliente} onChange={(e) => mudar('cliente', e.target.value)} placeholder="ex.: Hospital Santa Rita" />
          <div className="pe-linha">
            <div>
              <label htmlFor="pp-tipo">É</label>
              <Dropdown inputId="pp-tipo" value={atual.tipoCliente} onChange={(e) => mudar('tipoCliente', e.value)}
                options={[{ label: 'Hospital', value: 'HOSPITAL' }, { label: 'Médico', value: 'MEDICO' }]} />
            </div>
            <div>
              <label htmlFor="pp-pct">Percentual</label>
              <InputNumber inputId="pp-pct" value={atual.percentual} onValueChange={(e) => mudar('percentual', e.value ?? 0)}
                suffix="%" minFractionDigits={0} maxFractionDigits={2} min={0} max={100} locale="pt-BR" />
            </div>
          </div>
          <label htmlFor="pp-base">Cobrado sobre</label>
          <Dropdown inputId="pp-base" value={atual.base} onChange={(e) => mudar('base', e.value)}
            options={[{ label: 'O valor da oportunidade captada (orçamento total)', value: 'VALOR_OPORTUNIDADE' },
                      { label: 'O honorário médico, no sucesso', value: 'HONORARIO_MEDICO' }]} />
          <div className="pe-linha">
            <div>
              <label htmlFor="pp-contato">Contato (opcional)</label>
              <InputText id="pp-contato" value={atual.contato ?? ''} onChange={(e) => mudar('contato', e.target.value)} />
            </div>
            <div>
              <label htmlFor="pp-val">Validade (dias úteis)</label>
              <InputNumber inputId="pp-val" value={atual.validadeDias} onValueChange={(e) => mudar('validadeDias', e.value ?? 5)} min={1} max={90} />
            </div>
          </div>
          <label htmlFor="pp-obs">Observações que vão no documento (opcional)</label>
          <InputTextarea id="pp-obs" value={atual.observacoes ?? ''} onChange={(e) => mudar('observacoes', e.target.value)} rows={3} autoResize />
          <div className="pe-botoes">
            <Button label="Salvar" icon="pi pi-save" outlined onClick={salvar} loading={salvando} />
            <Button label="Gerar PDF" icon="pi pi-file-pdf" onClick={gerarPdf} disabled={salvando} />
            {atual.id && <Button label="Excluir" icon="pi pi-trash" text severity="danger" onClick={excluir} />}
          </div>
          {aviso && <p className="pe-aviso">{aviso}</p>}
          {atual.id && (
            <div className="pe-rastro">
              <div>Criada por <b>{atual.criadoPor}</b> em {fmt(atual.criadoEm)}</div>
              <div>Última edição por <b>{atual.atualizadoPor}</b> em {fmt(atual.atualizadoEm)}</div>
              {(atual.pdfsGerados ?? []).length > 0 && (
                <div>PDF gerado {atual.pdfsGerados!.length}× — último por <b>{atual.pdfsGerados![atual.pdfsGerados!.length - 1].por}</b> em {fmt(atual.pdfsGerados![atual.pdfsGerados!.length - 1].em)}</div>
              )}
            </div>
          )}
        </div>
        <div className="pe-previa">
          <div className="pe-folha"><PropostaDocumento p={atual} /></div>
        </div>
      </div>
    </div>
  );
}
