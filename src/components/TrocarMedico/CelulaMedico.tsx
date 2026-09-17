import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { trocarMedicoOrcamento } from '../../services/api/orders';
import './CelulaMedico.css';

/**
 * TROCAR O MÉDICO SEM ABRIR O PEDIDO (@R 17/09/2026): "quero um lapis ao lado do medico
 * para trocar o médico rapido, e com isso ele atualiza a linha da tabela".
 *
 * POR QUE NA CÉLULA, SE JÁ DAVA PARA TROCAR: dava — mas só depois de abrir o pedido,
 * rolar até o rodapé do detalhe e achar o botão. Quem está varrendo a lista para
 * redistribuir a fila faz isso N vezes seguidas, e cada troca custava quatro cliques e a
 * perda do lugar na tabela. O lápis fica onde a decisão é tomada: ao lado do nome.
 *
 * POR QUE O LÁPIS SÓ APARECE NO HOVER/FOCO: a coluna é lida muito mais vezes do que é
 * editada. Um ícone permanente em toda linha compete com o nome — que é o dado. No toque
 * (onde não existe hover) o CSS mantém o lápis visível, senão a função sumiria no celular.
 *
 * ATUALIZAR A LINHA É RESPONSABILIDADE DE QUEM CHAMA (`aoTrocar`): esta célula não sabe
 * de onde vieram os dados da tabela. Ela avisa que trocou e devolve o nome novo; a página
 * recarrega (ou corrige a linha) com a régua dela. Assim a mesma peça serve as telas de
 * fase sem que nenhuma delas precise adivinhar o estado da outra.
 */
export function CelulaMedico({
  row,
  medicos,
  aoTrocar,
  somenteLeitura,
}: {
  row: any;
  medicos: any[];
  aoTrocar: (info: { id: number; idMedico: number; nomeMedico?: string }) => void | Promise<void>;
  somenteLeitura?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const nome = row?.medico || '—';

  const confirmar = async () => {
    if (!escolhido) return;
    setSalvando(true);
    try {
      const resp: any = await trocarMedicoOrcamento(row.id, escolhido);
      setAberto(false);
      await aoTrocar({
        id: row.id,
        idMedico: escolhido,
        nomeMedico: resp?.data?.nomeMedico,
      });
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Não foi possível trocar o médico.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <span className="mc-celula-medico">
      <span>{nome}</span>
      {!somenteLeitura && (
        <Button
          icon="pi pi-pencil"
          text
          rounded
          className="mc-celula-medico__lapis"
          aria-label={`Trocar o médico deste pedido (hoje: ${nome})`}
          tooltip="Trocar o médico deste pedido"
          onClick={(e) => {
            e.stopPropagation();
            setEscolhido(null);
            setAberto(true);
          }}
        />
      )}

      <Dialog
        header="Trocar médico"
        visible={aberto}
        style={{ width: '28rem', maxWidth: '96vw' }}
        onHide={() => setAberto(false)}
        modal
      >
        <p className="mc-celula-medico__atual">
          Hoje com <strong>{nome}</strong>
          {row?.paciente ? <> · pedido de <strong>{row.paciente}</strong></> : null}
        </p>
        <div className="field">
          <label>Novo médico</label>
          <Dropdown
            value={escolhido}
            options={medicos.map((m: any) => ({
              label: m.nomeSistema || m.nomeCompleto,
              value: m.id,
            }))}
            onChange={(e) => setEscolhido(e.value)}
            placeholder="Selecione o médico"
            filter
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button label="Cancelar" text onClick={() => setAberto(false)} />
          <Button
            label="Confirmar médico"
            icon="pi pi-check"
            disabled={!escolhido}
            loading={salvando}
            onClick={confirmar}
          />
        </div>
      </Dialog>
    </span>
  );
}
