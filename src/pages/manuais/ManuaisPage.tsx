import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { MANUAIS, type QualManual } from './ManualPublicoPage';
import { listarPropostas } from '../../services/api/propostas';
import type { Proposta } from './PropostaDocumento';
import './propostas.css';

/* DOCUMENTOS (@R 23/09 16:53: "vamos mudar o nome de Manuais médico e hospitalar para Documentos, ai vamos
   criar dentro uma área de manuais e uma área de Proposta Comercial e uma Área de Documentos Jurídicos ainda em
   construção e dentro temos os arquivos internos para ficar organizado"). Os links públicos dos manuais NÃO
   mudam (/manuais/medico e /manuais/hospital já foram enviados a clientes); só a página interna mudou de nome.

   MANUAIS NO MENU INTERNO (GO @R 19:15, "no site disponível corretamente, para nós"): a equipe abre,
   lê e copia o link público para mandar ao médico ou ao hospital. O endereço é o do domínio próprio
   (plataforma.g4med.com.br), que é o que o participante vê — nunca o endereço técnico da API. */
const BASE_PUBLICA = 'https://plataforma.g4med.com.br';

const DESCRICAO: Record<QualManual, string> = {
  medico: '1 página · como o pedido chega pelo WhatsApp, como responder, o link seguro dos documentos.',
  hospital: 'Completo · o fluxo inteiro, responsabilidades, transparência e sigilo, perguntas frequentes.',
};

const dataCurta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

export function DocumentosPage() {
  const [copiado, setCopiado] = useState<QualManual | null>(null);
  // @R 19:32: "no manual ... podemos colocar o nome do hospital, visualizarmos e podermos salvar" — o nome vai
  // no link (?para=) e aparece no topo do manual e no PDF; o link com o nome é o que se manda ao cliente.
  const [para, setPara] = useState<Record<QualManual, string>>({ medico: '', hospital: '' });
  const [propostas, setPropostas] = useState<Proposta[] | null>(null);
  const navegar = useNavigate();
  useEffect(() => { listarPropostas().then((r) => setPropostas(r.data.itens ?? [])).catch(() => setPropostas([])); }, []);
  const sufixo = (q: QualManual) => (para[q].trim() ? `?para=${encodeURIComponent(para[q].trim())}` : '');
  const urlDe = (q: QualManual) => `${BASE_PUBLICA}/manuais/${q}${sufixo(q)}`;
  const copiar = async (q: QualManual) => {
    const url = urlDe(q);
    try { await navigator.clipboard.writeText(url); setCopiado(q); }
    catch { window.prompt('Copie o link:', url); }
  };
  const recentes = (propostas ?? []).slice().sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')).slice(0, 6);
  return (
    <div className="mc-pagina-g4 doc-pagina" style={{ maxWidth: 1100 }}>
      <div className="g4-cabecalho">
        <div>
          <h1>Documentos</h1>
          <p>O que enviamos ao médico, ao hospital e ao cliente, separado por área.</p>
        </div>
      </div>

      <section className="doc-area" aria-labelledby="doc-manuais">
        <header className="doc-area-cabeca">
          <h2 id="doc-manuais"><i className="pi pi-book" aria-hidden="true" /> Manuais</h2>
          <p>Para o médico e o hospital participante. O link abre sem login, no celular, e tem "Salvar em PDF".</p>
        </header>
        <div className="doc-grade">
          {(Object.keys(MANUAIS) as QualManual[]).map((q) => (
            <article key={q} className="doc-cartao">
              <h3>{MANUAIS[q].titulo}</h3>
              <p className="doc-desc">{DESCRICAO[q]}</p>
              <label htmlFor={`para-${q}`} className="doc-rotulo">Para (nome do {q === 'hospital' ? 'hospital' : 'médico'}, opcional)</label>
              <InputText id={`para-${q}`} value={para[q]} onChange={(e) => { setPara((p) => ({ ...p, [q]: e.target.value })); setCopiado(null); }}
                placeholder={q === 'hospital' ? 'ex.: Hospital Santa Rita' : 'ex.: Dr. Fulano'} className="doc-campo" />
              <div className="doc-acoes">
                <Button label={copiado === q ? 'Link copiado' : 'Copiar link'} icon={copiado === q ? 'pi pi-check' : 'pi pi-copy'}
                  size="small" onClick={() => copiar(q)} />
                {/* mesma aba: o "Voltar" da barra do manual traz de volta para cá */}
                <Button label="Abrir" icon="pi pi-eye" size="small" outlined onClick={() => navegar(`/manuais/${q}${sufixo(q)}`)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="doc-area" aria-labelledby="doc-propostas">
        <header className="doc-area-cabeca">
          <h2 id="doc-propostas"><i className="pi pi-briefcase" aria-hidden="true" /> Proposta comercial</h2>
          <p>Nome do cliente, percentual e se a cobrança é sobre o honorário médico ou sobre a oportunidade captada. Gera o PDF e guarda quem gerou e quando.</p>
        </header>
        <div className="doc-grade">
          <article className="doc-cartao doc-cartao--acao">
            <h3>Propostas</h3>
            <p className="doc-desc">
              {propostas === null ? 'Carregando…' : `${propostas.length} ${propostas.length === 1 ? 'proposta salva' : 'propostas salvas'}.`}
            </p>
            <div className="doc-acoes">
              <Button label="Nova proposta" icon="pi pi-plus" size="small" onClick={() => navegar('/manuais/propostas')} />
            </div>
          </article>
          <article className="doc-cartao doc-cartao--lista">
            <h3>Últimas propostas</h3>
            {propostas !== null && recentes.length === 0 && <p className="doc-desc">Nenhuma proposta salva ainda.</p>}
            <ul className="doc-lista">
              {recentes.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navegar(`/manuais/propostas?id=${p.id}`)}>
                    <span className="doc-lista-nome">{p.cliente || 'Sem nome'}</span>
                    <span className="doc-lista-meta">
                      {p.tipoCliente === 'MEDICO' ? 'Médico' : 'Hospital'} · {Number(p.percentual).toLocaleString('pt-BR')}%
                      {p.atualizadoEm ? ` · ${dataCurta(p.atualizadoEm)}` : ''}{p.pdfsGerados?.length ? ` · ${p.pdfsGerados.length} PDF` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="doc-area doc-area--construcao" aria-labelledby="doc-juridicos">
        <header className="doc-area-cabeca">
          <h2 id="doc-juridicos"><i className="pi pi-wrench" aria-hidden="true" /> Documentos jurídicos <span className="doc-selo">em construção</span></h2>
          <p>Esta área ainda não está disponível.</p>
        </header>
      </section>
    </div>
  );
}

/* nome antigo mantido para quem ainda importa */
export const ManuaisPage = DocumentosPage;
