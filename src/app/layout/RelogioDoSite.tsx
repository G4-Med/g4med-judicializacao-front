/** Data e hora de agora na barra do topo (@R 21/09/2026 15:29: "ter uma parte que traz o dia de
 *  hoje e o horário no site para sabermos").
 *
 *  POR QUE: as filas mostram "há N dias" e "chegou 26/08 01:44" — ler isso exige saber que dia é
 *  hoje sem sair da tela. O relógio usa sempre o fuso de Brasília (America/Sao_Paulo), não o do
 *  computador de quem abre: quem trabalha com prazo de ofício não pode ver outra hora por estar
 *  num micro com fuso errado. Atualiza a cada 15 s — minuto é a precisão que importa aqui.
 */
import { useEffect, useState } from 'react';

const FORMATO_DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
});
const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
});

export function RelogioDoSite() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const dia = FORMATO_DIA.format(agora).replace(/\.,?/, ',');
  const hora = FORMATO_HORA.format(agora);
  return (
    <span className="mc-relogio" title="Data e hora de agora (horário de Brasília)" aria-live="off">
      <i className="pi pi-calendar" aria-hidden="true" />
      <span className="mc-relogio__dia">{dia}</span>
      <strong className="mc-relogio__hora">{hora}</strong>
    </span>
  );
}
