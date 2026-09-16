import { useEffect, useState } from 'react';
import { getPreferencia, salvarPreferencia } from '../../services/api/orders';
import './AvisoNovidade.css';

/**
 * AVISO DE NOVIDADE — conta ao colaborador o que mudou, e sai de cena quando ele pedir.
 *
 * Mandato @R 16/09/2026: "colocar um aviso para cada colaborador para aparecer em cada
 * tela e, se ele não quiser mais saber do aviso, ele marca — e pode reativar o aviso na
 * caixa, para ajudar ele a saber da funcionalidade".
 *
 * POR QUE NÃO É O PrimeiraVisitaInfo: aquele explica a ETAPA (o que a tela faz) e some
 * sozinho depois da 1ª visita. Este anuncia uma FUNCIONALIDADE NOVA e só some quando a
 * pessoa disser que já sabe — são coisas diferentes, e misturá-las faria o aviso de
 * novidade desaparecer para quem nunca o leu.
 *
 * POR COLABORADOR, ¬POR NAVEGADOR: a dispensa fica em PreferenciaUsuario (no servidor).
 * O PrimeiraVisitaInfo usa localStorage, e por isso reaparece quando a pessoa troca de
 * computador — o que aqui seria pior, porque avisaria de novo quem já disse que sabe.
 * Fallback: se o servidor não responder, o aviso APARECE (erra para informar, não para
 * calar — quem não quer, dispensa de novo em 1 clique).
 */

const CHAVE = 'avisos_dispensados';

export type NovidadeId = 'ficha-pedido' | 'voltar-fase';

const NOVIDADES: Record<NovidadeId, { titulo: string; texto: string; comoUsar: string }> = {
  'ficha-pedido': {
    titulo: 'Novo: a ficha do pedido',
    texto:
      'Agora dá para ver tudo o que foi feito em cada fase de um pedido — o que foi preenchido, ' +
      'por quem, quando, e os arquivos que entraram em cada etapa.',
    comoUsar: 'Clique em "Ficha do pedido" na linha do pedido.',
  },
  'voltar-fase': {
    titulo: 'Novo: voltar o pedido para a fase anterior',
    texto:
      'Avançou um pedido sem querer? Agora dá para voltar. O sistema mostra quem fez a mudança ' +
      'e quando, pede confirmação, e recusa se o pedido já tiver andado de novo.',
    comoUsar: 'Clique em "Voltar fase" na linha do pedido.',
  },
};

export function AvisoNovidade({ id }: { id: NovidadeId }) {
  const [visivel, setVisivel] = useState(false);
  const [dispensados, setDispensados] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    getPreferencia(CHAVE)
      .then((r) => {
        if (!vivo) return;
        const lista: string[] = r.data?.valor?.ids ?? [];
        setDispensados(lista);
        setVisivel(!lista.includes(id));
      })
      .catch(() => {
        // servidor mudo: mostra. Errar informando custa 1 clique; errar calando esconde
        // a funcionalidade de quem nunca soube dela.
        if (vivo) setVisivel(true);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  if (!visivel) return null;
  const n = NOVIDADES[id];

  const dispensar = async () => {
    setVisivel(false);
    const novos = Array.from(new Set([...dispensados, id]));
    try {
      await salvarPreferencia(CHAVE, { ids: novos });
      setDispensados(novos);
    } catch {
      /* não gravou: volta a aparecer no próximo carregamento — é o lado seguro */
    }
  };

  return (
    <div className="avn" role="status">
      <div className="avn__cabecalho">
        <span className="avn__selo">novidade</span>
        <strong>{n.titulo}</strong>
        <button type="button" className="avn__fechar" onClick={() => setVisivel(false)} aria-label="Fechar por agora">
          ✕
        </button>
      </div>
      <p className="avn__texto">{n.texto}</p>
      <p className="avn__como">{n.comoUsar}</p>
      <div className="avn__rodape">
        <span className="avn__dica">Pode reativar depois em Ajuda → Avisos.</span>
        <button type="button" className="avn__ok" onClick={dispensar}>
          Já sei, não mostrar mais
        </button>
      </div>
    </div>
  );
}

/** Reativar os avisos — o "pode reativar na caixa" do mandato. Vive na Ajuda. */
export async function reativarAvisos(): Promise<boolean> {
  try {
    await salvarPreferencia(CHAVE, { ids: [] });
    return true;
  } catch {
    return false;
  }
}

export default AvisoNovidade;
