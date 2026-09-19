import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { trocarMedicoOrcamento, convidarCandidatoCotacao, listarCandidatosCotacao } from '../../services/api/orders';
import { useEffect } from 'react';
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
  // @R 19/09: "ver o médico atual e selecionar MAIS UM para o orçamento". A tabela
  // OrderCotacaoCandidato e as rotas já existiam (0 linhas porque o único caminho que a
  // equipe usa — este modal — só sabia TROCAR). Aqui o modal ganha a segunda ação.
  const [convidados, setConvidados] = useState<any[]>([]);
  const [erroConvite, setErroConvite] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    listarCandidatosCotacao(row.id)
      .then((r: any) => setConvidados(r?.data?.candidatos ?? r?.data ?? []))
      .catch(() => setConvidados([]));   // lista vazia não é erro: a maioria dos pedidos ainda não tem convidado
  }, [aberto, row?.id]);

  const nome = row?.medico || '—';

  /** Adiciona SEM tirar o atual — é a diferença inteira em relação a "Confirmar médico". */
  const adicionar = async () => {
    if (!escolhido) return;
    setSalvando(true);
    setErroConvite(null);
    try {
      await convidarCandidatoCotacao(row.id, escolhido);
      const r: any = await listarCandidatosCotacao(row.id);
      setConvidados(r?.data?.candidatos ?? r?.data ?? []);
      setEscolhido(null);
    } catch (err: any) {
      setErroConvite(err?.response?.data?.error || 'Não consegui adicionar este médico ao orçamento.');
    } finally {
      setSalvando(false);
    }
  };

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
        header="Médicos do orçamento"
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
        {convidados.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600 }}>Já convidados para orçar</label>
            <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>
              {convidados.map((c: any) => (
                <li key={c.id ?? c.idMedico}>
                  {c.nomeMedico || c.medico || `médico ${c.idMedico}`}
                  {c.situacao ? <small style={{ opacity: .7 }}> · {c.situacao}</small> : null}
                  {c.valorRespondido ? <small style={{ opacity: .7 }}> · R$ {c.valorRespondido}</small> : null}
                  {c.vencedor ? <strong> · vencedor</strong> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {erroConvite && <p style={{ color: '#b91c1c' }}>{erroConvite}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <Button label="Cancelar" text onClick={() => setAberto(false)} />
          {/* ADICIONAR mantém o atual e convida mais um; TROCAR substitui. São ações
              diferentes e ficam separadas de propósito — juntar as duas num botão só foi
              o que deixou a cotação com vários médicos sem caminho na tela. */}
          <Button
            label="Adicionar ao orçamento"
            icon="pi pi-user-plus"
            severity="help"
            outlined
            disabled={!escolhido}
            loading={salvando}
            onClick={adicionar}
          />
          <Button
            label="Trocar (substitui o atual)"
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
