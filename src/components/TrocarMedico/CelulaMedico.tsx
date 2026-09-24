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
/**
 * O MODAL, exportado separado (19/09): a tela "2. Selecionar Médico" tinha um Dialog
 * PRÓPRIO que só sabia trocar — sem "Adicionar ao orçamento" e sem a ordenação por
 * área. O @R clicou em "Selecionar médico" lá e viu HOME CARE para uma cirurgia
 * cerebral, o mesmo bug já curado aqui. Peça provada numa tela não é peça instalada
 * nas outras: extraindo o modal, as duas telas passam a usar a MESMA peça.
 */
export function ModalMedico({
  row,
  medicos,
  aberto,
  aoFechar,
  aoTrocar,
}: {
  row: any;
  medicos: any[];
  aberto: boolean;
  aoFechar: () => void;
  aoTrocar: (info: { id: number; idMedico: number; nomeMedico?: string }) => void | Promise<void>;
}) {
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  // @R 19/09: "ver o médico atual e selecionar MAIS UM para o orçamento". A tabela
  // OrderCotacaoCandidato e as rotas já existiam (0 linhas porque o único caminho que a
  // equipe usa — este modal — só sabia TROCAR). Aqui o modal ganha a segunda ação.
  const [convidados, setConvidados] = useState<any[]>([]);
  const [erroConvite, setErroConvite] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setEscolhido(null);
    listarCandidatosCotacao(row.id)
      .then((r: any) => setConvidados(r?.data?.candidatos ?? r?.data ?? []))
      .catch(() => setConvidados([]));   // lista vazia não é erro: a maioria dos pedidos ainda não tem convidado
  }, [aberto, row?.id]);

  const nome = row?.medico || '—';

  // ⚠ ORDENA POR QUEM ATENDE A ÁREA DO PEDIDO — @R, print de 19/09: para IMPLANTE DE
  // ELETRODO CEREBRAL PROFUNDO (área Neurocirurgia) o seletor oferecia BUONA VITA, que é
  // HOME CARE. O dropdown listava todos em ordem alfabética, sem cruzar com a área.
  // Home care para cirurgia cerebral, com nome plausível na lista.
  //
  // FAIL-VISIBLE, não fail-closed: quem não atende CONTINUA na lista, só vai para o fim
  // e marcado. Às vezes a pessoa SABE que aquele hospital faz e o cadastro é que está
  // atrasado — esconder seria trocar um erro por outro, e o escondido é pior porque
  // ninguém descobre.
  const semAcento = (v: any) => String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  const areaPedido = semAcento(row?.area);

  const atende = (m: any) => {
    if (!areaPedido) return true;                    // sem área declarada, ninguém é despriorizado
    const lista = [m?.especialidade, ...(m?.especialidades ?? [])].map(semAcento).filter(Boolean);
    if (!lista.length) return true;                  // cadastro sem especialidade: não acusamos
    return lista.some((e: string) => e === areaPedido
      || e.startsWith(areaPedido + ' ') || areaPedido.startsWith(e + ' '));
  };

  const opcoesMedicos = (() => {
    const base = (medicos ?? []).map((m: any) => ({
      label: m.nomeSistema || m.nomeCompleto,
      value: m.id,
      _atende: atende(m),
      // Briefing (@R 24/09): a busca do seletor olha o NOME e também o que ele OPERA — quem
      // digita "aneurisma" ou "hemodiálise" acha o vascular mesmo sem lembrar o nome dele.
      _busca: [m.nomeSistema, m.nomeCompleto, m.especialidade, ...(m.especialidades ?? []),
               m.subespecialidade, m.keywords, m.briefing].filter(Boolean).join(' '),
    }));
    const sim = base.filter((o) => o._atende);
    const nao = base.filter((o) => !o._atende);
    return [
      ...sim,
      ...nao.map((o) => ({ ...o, label: `${o.label}  · não marcou ${row?.area ?? 'esta área'}` })),
    ];
  })();

  // ⚠ O AVISO PERGUNTA OUTRA COISA que o `_atende`: quem está SEM especialidade cadastrada
  // entra na lista de cima (não o acusamos sem saber), mas ele NÃO conta como alguém que
  // marcou a área. Testado antes de publicar: com a regra ingênua, bastava 1 cliente sem
  // cadastro para o aviso nunca aparecer — e é justamente quando ninguém marcou que a
  // pessoa precisa ser avisada.
  const alguemMarcouAArea = (medicos ?? []).some((m: any) => {
    const lista = [m?.especialidade, ...(m?.especialidades ?? [])].map(semAcento).filter(Boolean);
    return lista.length > 0 && lista.some((e: string) => e === areaPedido
      || e.startsWith(areaPedido + ' ') || areaPedido.startsWith(e + ' '));
  });
  const nenhumAtende = !!areaPedido && (medicos ?? []).length > 0 && !alguemMarcouAArea;

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
      aoFechar();
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
    <Dialog
      header="Médicos do orçamento"
      visible={aberto}
      style={{ width: '28rem', maxWidth: '96vw' }}
      onHide={aoFechar}
      modal
    >
      <p className="mc-celula-medico__atual">
        Hoje com <strong>{nome}</strong>
        {row?.paciente ? <> · pedido de <strong>{row.paciente}</strong></> : null}
      </p>
      {nenhumAtende && (
        <p style={{ color: '#b45309', marginBottom: 6 }}>
          Nenhum cliente marcou <strong>{row?.area}</strong> nas especialidades atendidas.
          A lista continua completa — marque a especialidade em Clientes, ou escolha assim mesmo
          se souber que o prestador faz.
        </p>
      )}
      <div className="field">
        <label>Novo médico{areaPedido ? <small style={{ opacity: .7, fontWeight: 400 }}> · quem atende {row?.area} aparece primeiro</small> : null}</label>
        <Dropdown
          value={escolhido}
          options={opcoesMedicos}
          onChange={(e) => setEscolhido(e.value)}
          placeholder="Selecione o médico"
          filter
          filterBy="_busca"
          filterPlaceholder="Nome ou o que ele opera (ex.: aneurisma, joelho)"
          style={{ width: '100%' }}
        />
        {(() => {
          const b = (medicos ?? []).find((m: any) => m.id === escolhido)?.briefing;
          return escolhido ? (
            <div className="briefing-medico" aria-live="polite">
              <strong>O que ele opera:</strong>{' '}
              {b ? <span style={{ whiteSpace: 'pre-wrap' }}>{b}</span>
                 : <em>sem briefing no cadastro (preencha em Clientes)</em>}
            </div>
          ) : null;
        })()}
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
        <Button label="Cancelar" text onClick={aoFechar} />
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
  );
}

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
  const nome = row?.medico || '—';
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
          onClick={(e) => { e.stopPropagation(); setAberto(true); }}
        />
      )}
      <ModalMedico row={row} medicos={medicos} aberto={aberto}
        aoFechar={() => setAberto(false)} aoTrocar={aoTrocar} />
    </span>
  );
}
