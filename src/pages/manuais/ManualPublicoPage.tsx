import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  const manual = MANUAIS[qual as QualManual];
  const html = useMemo(() => (manual ? markdownParaHtml(manual.texto) : ''), [manual]);

  useEffect(() => { document.title = manual ? `${manual.titulo} · G4MED` : 'Manuais · G4MED'; }, [manual]);

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
        <span className="manual-marca">G<b>4</b>MED</span>
        <button type="button" className="manual-pdf" onClick={() => window.print()}>Salvar em PDF</button>
      </header>
      {/* conteúdo fixo, escapado pelo conversor antes de qualquer marcação */}
      <main className="manual-corpo" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
