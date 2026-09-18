/** A faixa de preço que a PEÇA revelou — a mesma célula em toda tela que precisa dela.
 *
 *  @R 18/09, olhando a fase 2: ⟦"eu não vi aqui em um pedido na fase 2 ele agora com os
 *  orçamentos separados"⟧. Eu tinha entregado só na fase 3 (onde o pedido ao médico é
 *  feito) e na ficha. Mas a fase 2 é onde se ESCOLHE o médico — escolher sem saber por
 *  quanto aquilo costuma ser cotado naquele processo é escolher no escuro.
 *
 *  POR QUE COMPONENTE, E NÃO COPIAR A CÉLULA: copiada, ela diverge no primeiro ajuste —
 *  e a cópia que ninguém revisa é justamente a que continua mentindo. Já paguei esse
 *  preço nesta base (o dossiê da ficha existia em 1 tela e faltava em 6).
 */
export interface FaixaOrcamentoPeca { n: number; menor: number; maior: number }

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FaixaDaPeca({ faixa }: { faixa?: FaixaOrcamentoPeca | null }) {
  if (!faixa || !faixa.n) {
    return (
      <span className="ident-vazio"
        title="Nenhum orçamento lido das peças deste pedido — pode ser que não haja peça anexada, ou que a peça não traga valores.">
        —
      </span>
    );
  }
  return (
    <span className="om-orcpeca"
      title={`${faixa.n} orçamento(s) lido(s) das peças deste processo · abra a ficha do pedido para ver prestador, página e link. Leitura automática: é proposta, não valor conferido.`}>
      {faixa.menor === faixa.maior ? brl(faixa.menor) : `${brl(faixa.menor)} – ${brl(faixa.maior)}`}
      <span className="om-orcpeca__n">{faixa.n}\u00d7</span>
    </span>
  );
}
