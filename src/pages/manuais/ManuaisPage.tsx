import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { MANUAIS, type QualManual } from './ManualPublicoPage';
import './propostas.css';

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
  // @R 19:32: "no manual ... podemos colocar o nome do hospital, visualizarmos e podermos salvar" — o nome vai
  // no link (?para=) e aparece no topo do manual e no PDF; o link com o nome é o que se manda ao cliente.
  const [para, setPara] = useState<Record<QualManual, string>>({ medico: '', hospital: '' });
  const navegar = useNavigate();
  const urlDe = (q: QualManual) => `${BASE_PUBLICA}/manuais/${q}${para[q].trim() ? `?para=${encodeURIComponent(para[q].trim())}` : ''}`;
  const copiar = async (q: QualManual) => {
    const url = urlDe(q);
    try { await navigator.clipboard.writeText(url); setCopiado(q); }
    catch { window.prompt('Copie o link:', url); }
  };
  return (
    <div className="mc-pagina-g4" style={{ maxWidth: 1100 }}>
      <div className="g4-cabecalho">
        <div>
          <h1>Manuais e proposta comercial</h1>
          <p>Para enviar ao médico ou ao hospital. O link abre sem login, no celular, e tem o botão "Salvar em PDF".</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {(Object.keys(MANUAIS) as QualManual[]).map((q) => (
          <section key={q} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem', background: '#fff' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 .35rem' }}>{MANUAIS[q].titulo}</h2>
            <p style={{ color: '#4b5563', margin: '0 0 .75rem', fontSize: '.9rem' }}>{DESCRICAO[q]}</p>
            <label htmlFor={`para-${q}`} style={{ fontSize: '.8rem', color: '#5b6b7a' }}>Para (nome do {q === 'hospital' ? 'hospital' : 'médico'}, opcional)</label>
            <InputText id={`para-${q}`} value={para[q]} onChange={(e) => { setPara((p) => ({ ...p, [q]: e.target.value })); setCopiado(null); }}
              placeholder={q === 'hospital' ? 'ex.: Hospital Santa Rita' : 'ex.: Dr. Fulano'} style={{ width: '100%', margin: '.25rem 0 .75rem' }} />
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <Button label={copiado === q ? 'Link copiado' : 'Copiar link'} icon={copiado === q ? 'pi pi-check' : 'pi pi-copy'}
                size="small" onClick={() => copiar(q)} />
              <Button label="Abrir" icon="pi pi-external-link" size="small" outlined
                onClick={() => window.open(urlDe(q), '_blank', 'noopener')} />
            </div>
          </section>
        ))}
        <section style={{ border: '1px solid #c2ecd7', borderRadius: 10, padding: '1rem', background: '#f5fbf8' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 .35rem' }}>Proposta comercial</h2>
          <p style={{ color: '#4b5563', margin: '0 0 .75rem', fontSize: '.9rem' }}>
            Nome do cliente, percentual e se a cobrança é sobre o honorário médico ou sobre a oportunidade captada.
            Gera o PDF e guarda quem gerou e quando; dá para abrir, editar e gerar de novo.
          </p>
          <Button label="Abrir propostas" icon="pi pi-briefcase" size="small" onClick={() => navegar('/manuais/propostas')} />
        </section>
      </div>
    </div>
  );
}
