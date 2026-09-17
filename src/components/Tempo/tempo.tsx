import { Tag } from 'primereact/tag';

/**
 * TEMPO DECORRIDO — duas medidas diferentes, e só a precisão que o dado sustenta.
 *
 * @R 17/09: ⟦"um pedido entrou agora mas o tempo no funil está 0d 15h... tem minutos,
 * concorda?"⟧ + ⟦"temos o tempo desde a chegada, e temos o tempo na fase"⟧ +
 * ⟦"corrigir frontend para ficar correto a informação e sem dubiedade"⟧.
 *
 * O QUE ESTAVA ERRADO (medido em produção, 17/09 16:0x): três pedidos que chegaram às
 * 09:18, 15:21 e 15:52 mostravam TODOS "0d 16h". Não era imprecisão — era o mesmo
 * número para tempos diferentes, porque o cálculo comparava a hora ATUAL com a
 * meia-noite daquele dia. O "16h" era o relógio da parede, não o tempo do pedido.
 *
 * AS DUAS MEDIDAS, que o sistema tinha misturado num único rótulo "Dias":
 *   · DESDE A CHEGADA — o pedido entrou há quanto tempo (a régua dos 5 dias)
 *   · NESTA FASE      — está parado nesta etapa há quanto tempo
 * Um pedido pode ter chegado há 60 dias e estar nesta fase há 2. Antes, 11 telas
 * chamavam as duas de "Dias" — quem lia não tinha como saber qual das duas via.
 *
 * PRECISÃO HONESTA: só 9,6% dos pedidos têm hora de chegada confiável (os outros
 * vieram da carga histórica, sem hora). Onde a hora existe, mostra "há 25 min"; onde
 * não existe, mostra "3 dias" e para. Exibir "3d 7h" para um dado que só tem a data
 * não é arredondar — é inventar uma precisão que o leitor não tem como questionar.
 */

export function textoTempo(minutos: number | null | undefined,
                           dias: number | null | undefined,
                           comHora: boolean | undefined): string {
  if (comHora && minutos !== null && minutos !== undefined) {
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    if (h < 24) return `${h}h ${minutos % 60}min`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  if (dias === null || dias === undefined) return '—';
  if (dias === 0) return 'hoje';
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export function TempoDecorrido({
  minutos, dias, comHora, teto, oQueConta,
}: {
  minutos?: number | null;
  dias?: number | null;
  comHora?: boolean;
  /** dias a partir dos quais fica vermelho (SLA). Sem teto, nunca alarma. */
  teto?: number;
  /** o que esta medida conta — vai para o hover, para a coluna nunca ser ambígua */
  oQueConta: string;
}) {
  if ((dias === null || dias === undefined) && (minutos === null || minutos === undefined)) {
    return <span className="sm-sla-vazio">—</span>;
  }
  const d = dias ?? 0;
  const estourou = teto !== undefined && d > teto;
  const quase = teto !== undefined && !estourou && d >= teto - 1;
  return (
    <Tag
      value={textoTempo(minutos, dias, comHora)}
      severity={estourou ? 'danger' : quase ? 'warning' : 'success'}
      icon={estourou ? 'pi pi-exclamation-triangle' : 'pi pi-clock'}
      title={`${oQueConta}.${comHora ? '' : ' Chegada registrada sem hora — por isso a contagem é em dias.'}`
        + (teto !== undefined ? ` Teto: ${teto} dias.` : '')}
    />
  );
}
