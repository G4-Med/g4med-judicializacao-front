import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import medico from './conteudo/MANUAL_MEDICO.md?raw';
import hospital from './conteudo/MANUAL_HOSPITAL.md?raw';
import { markdownParaHtml } from './markdownSimples';
import './manuais.css';

/* MANUAIS PÚBLICOS (aliança produto-manuais · GO @R 21/09 19:15): página sem login, feita para
   o celular, que a Valéria (ou qualquer um da equipe) envia ao médico ou ao hospital. "Salvar em
   PDF" é a impressão do navegador — o PDF é sempre o texto que está no ar, nunca uma versão velha. */

export const MANUAIS = {
  medico: { titulo: 'Guia rápido para o médico', texto: medico },
  hospital: { titulo: 'Manual do hospital participante', texto: hospital },
} as const;
export type QualManual = keyof typeof MANUAIS;

export function ManualPublicoPage() {
  const { qual = '' } = useParams();
  const [busca] = useSearchParams();
  const para = (busca.get('para') || '').trim().slice(0, 120);   // @R 19:32: o nome do cliente no topo
  const manual = MANUAIS[qual as QualManual];
  const html = useMemo(() => (manual ? markdownParaHtml(manual.texto) : ''), [manual]);

  const navegar = useNavigate();
  const local = useLocation();
  // Voltar (@R 23/09 16:52: "a barra tem que ter o botão para voltar, para a tela anterior"). Com histórico
  // dentro do site → volta 1; aberto direto (link colado) por alguém da equipe logado → Documentos; o médico
  // ou o hospital que abriu pelo WhatsApp não tem "tela anterior" no site e não vê o botão.
  const temHistorico = local.key !== 'default';
  const logado = (() => { try { return !!localStorage.getItem('access_token'); } catch { return false; } })();
  const voltar = () => (temHistorico ? navegar(-1) : navegar('/documentos'));

  useEffect(() => { document.title = manual ? `${manual.titulo}${para ? ` · ${para}` : ''} · G4MED` : 'Manuais · G4MED'; }, [manual, para]);

  if (!manual) {
    return (
      <div className="manual-pagina">
        <main className="manual-corpo">
          <p>Manual não encontrado. Os manuais disponíveis são:</p>
          <ul>
            <li><Link to="/manuais/medico">Guia rápido para o médico</Link></li>
            <li><Link to="/manuais/hospital">Manual do hospital participante</Link></li>
          </ul>
        </main>
      </div>
    );
  }

  return (
    <div className="manual-pagina">
      <header className="manual-topo">
        <div className="manual-topo-esq">
          {(temHistorico || logado) && (
            <button type="button" className="manual-voltar" onClick={voltar} aria-label="Voltar para a tela anterior">
              <i className="pi pi-arrow-left" aria-hidden="true" /> Voltar
            </button>
          )}
          <span className="manual-marca">G<b>4</b>MED</span>
        </div>
        <button type="button" className="manual-pdf" onClick={() => window.print()}>Salvar em PDF</button>
      </header>
      {/* só no papel: a barra escura some na impressão, a marca e o título ficam */}
      <div className="manual-impresso" aria-hidden="true">
        <span className="manual-marca">G<b>4</b>MED</span>
        <span>{manual.titulo}</span>
      </div>
      {para && <div className="manual-para">Preparado para <b>{para}</b></div>}
      {/* conteúdo fixo, escapado pelo conversor antes de qualquer marcação */}
      <main className="manual-corpo" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
