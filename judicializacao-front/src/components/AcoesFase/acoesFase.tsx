/**
 * Coluna "Ações" da fase — a decisão de cada paciente ao lado do nome, em toda tela.
 *
 * @R 29/08 13:26 ("trazer as ações sempre para o lado do paciente… sempre à esquerda… lixeira e
 * ações são os que levam a decisão do fluxo") + mapa validado 13:34 ("corrigir cada área").
 * Censo 29/08: as ações viviam na 12ª–15ª coluna de 16–29 (Selecionar Médico: 13ª–15ª de 28) —
 * invisíveis sem rolar. Aqui: 1 botão PRINCIPAL com o nome da decisão + secundárias em ícone +
 * lixeira em vermelho, separada. A coluna é CONGELADA (frozen) — não some ao rolar; para isso a
 * DataTable precisa de `scrollable` (as colunas ▸ # Paciente também congelam).
 */
import React from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { cabecalhoComHint } from '../ColunasIdentificacao/colunasIdentificacao';
import { BotaoExcluir } from '../ExpansorPedido/colunaExcluirAdmin';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import './acoesFase.css';

export interface AcaoFase {
  /** Texto do botão — a DECISÃO ("Selecionar médico", "Enviar orçamento", "Protocolar"). */
  label: string;
  icon?: string;
  onClick: (linha: any) => void;
  severity?: 'secondary' | 'success' | 'info' | 'warning' | 'danger' | 'help';
  tooltip?: string;
  loading?: (linha: any) => boolean;
  disabled?: (linha: any) => boolean;
  visivel?: (linha: any) => boolean;
  /** Secundária mostrada com texto (não só ícone) — para decisões de peso, como Perda. */
  comTexto?: boolean;
}

export interface OpcoesAcoesFase {
  principal?: AcaoFase;
  secundarias?: AcaoFase[];
  /** Callback após mover para a lixeira; omitir = sem lixeira nesta tela. */
  excluir?: () => void;
  /** Esconde o botão "Ficha" nesta tela (default: aparece em TODAS). */
  semFicha?: boolean;
  /** Render livre (telas que já têm seus templates de botão): vai antes da lixeira. */
  corpo?: (linha: any) => React.ReactNode;
  readOnly?: boolean;
  hint?: string;
  largura?: string;
}

function BotaoAcao({ a, r, principal }: { a: AcaoFase; r: any; principal?: boolean }) {
  if (a.visivel && !a.visivel(r)) return null;
  const soIcone = !principal && !a.comTexto;
  return (
    <Button
      label={soIcone ? '' : a.label}
      icon={a.icon}
      size="small"
      outlined={!principal}
      severity={a.severity}
      className={principal ? 'mc-acao mc-acao--principal' : 'mc-acao mc-acao--secundaria'}
      tooltip={soIcone ? (a.tooltip ?? a.label) : a.tooltip}
      tooltipOptions={{ position: 'bottom' }}
      loading={a.loading?.(r) ?? false}
      disabled={a.disabled?.(r) ?? false}
      onClick={() => a.onClick(r)}
      aria-label={a.label}
    />
  );
}

/** O ⓘ que abre a ficha — mesma posição em toda tela, para virar reflexo. */
function BotaoFicha({ r }: { r: any }) {
  const ficha = useFichaPedido();
  const id = r?.id ?? r?.orderId ?? r?.order_id;
  if (!ficha.disponivel || !id) return null;
  return (
    <Button
      icon="pi pi-history"
      size="small"
      outlined
      severity="secondary"
      className="mc-acao mc-acao--secundaria mc-acao--ficha"
      tooltip="Ficha do pedido: o que foi preenchido em cada fase, por quem, quando, e os arquivos de cada etapa. É também por aqui que se volta o pedido para a fase anterior."
      tooltipOptions={{ position: 'bottom' }}
      onClick={() => ficha.abrir(Number(id))}
      aria-label="Ficha do pedido"
    />
  );
}

/** Célula: [ficha] [principal] [secundárias…] │ [🗑] */
export function CelulaAcoesFase({ r, o }: { r: any; o: OpcoesAcoesFase }) {
  return (
    <div className="mc-acoes">
      {!o.semFicha && <BotaoFicha r={r} />}
      {o.corpo?.(r)}
      {o.principal && <BotaoAcao a={o.principal} r={r} principal />}
      {(o.secundarias ?? []).map((a) => <BotaoAcao key={a.label} a={a} r={r} />)}
      {o.excluir && (
        <span className="mc-acoes-lixeira">
          <BotaoExcluir linha={r} aoExcluir={o.excluir} />
        </span>
      )}
    </div>
  );
}

/** A coluna, para colar logo depois de "Paciente" em toda tela de fase. */
export function colunaAcoesFase(o: OpcoesAcoesFase) {
  // Em modo leitura não há o que DECIDIR — mas consultar a ficha é justamente o que
  // quem só lê precisa. A coluna sobrevive com o ⟲ sozinho, em vez de sumir inteira.
  if (o.readOnly) {
    if (o.semFicha) return null;
    o = { semFicha: false, hint: 'Consulta: a ficha do pedido mostra o que foi feito em cada fase.', largura: '5rem' } as OpcoesAcoesFase;
  }
  const decisoes = [o.hint ? null : null, o.principal?.label, ...(o.secundarias ?? []).map((a) => a.label), o.excluir ? 'Lixeira' : null]
    .filter(Boolean).join(' · ');
  return (
    <Column
      key="col-acoes-fase"
      header={cabecalhoComHint('Ações', o.hint ?? `O que decidir para este paciente nesta fase: ${decisoes}. O ⟲ abre a ficha do pedido (o que já foi feito em cada fase, e como voltar uma fase). A coluna fica fixa — não some ao rolar.`)}
      frozen
      alignFrozen="left"
      style={{ minWidth: o.largura ?? '14rem' }}
      bodyStyle={{ textAlign: 'left' }}
      body={(r: any) => <CelulaAcoesFase r={r} o={o} />}
    />
  );
}
