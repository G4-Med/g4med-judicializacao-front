import { useState } from 'react';
import { Button } from 'primereact/button';
import { MANUAIS, type QualManual } from './ManualPublicoPage';

/* MANUAIS NO MENU INTERNO (GO @R 19:15, "no site disponível corretamente, para nós"): a equipe abre,
   lê e copia o link público para mandar ao médico ou ao hospital. O endereço é o do domínio próprio
   (plataforma.g4med.com.br), que é o que o participante vê — nunca o endereço técnico da API. */
const BASE_PUBLICA = 'https://plataforma.g4med.com.br';

const DESCRICAO: Record<QualManual, string> = {
  medico: '1 página · como o pedido chega pelo WhatsApp, como responder, o link seguro dos documentos.',
  hospital: 'Completo · o fluxo inteiro, responsabilidades, transparência e sigilo, perguntas frequentes.',
};

export function ManuaisPage() {
  const [copiado, setCopiado] = useState<QualManual | null>(null);
  const copiar = async (q: QualManual) => {
    const url = `${BASE_PUBLICA}/manuais/${q}`;
    try { await navigator.clipboard.writeText(url); setCopiado(q); }
    catch { window.prompt('Copie o link:', url); }
  };
  return (
    <div className="page-container" style={{ padding: '1rem', maxWidth: 900 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Manuais</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Para enviar ao médico ou ao hospital. O link abre sem login, no celular, e tem o botão "Salvar em PDF".
      </p>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {(Object.keys(MANUAIS) as QualManual[]).map((q) => (
          <section key={q} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem', background: '#fff' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 .35rem' }}>{MANUAIS[q].titulo}</h2>
            <p style={{ color: '#4b5563', margin: '0 0 .75rem', fontSize: '.9rem' }}>{DESCRICAO[q]}</p>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <Button label={copiado === q ? 'Link copiado' : 'Copiar link'} icon={copiado === q ? 'pi pi-check' : 'pi pi-copy'}
                size="small" onClick={() => copiar(q)} />
              <Button label="Abrir" icon="pi pi-external-link" size="small" outlined
                onClick={() => window.open(`${BASE_PUBLICA}/manuais/${q}`, '_blank', 'noopener')} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
