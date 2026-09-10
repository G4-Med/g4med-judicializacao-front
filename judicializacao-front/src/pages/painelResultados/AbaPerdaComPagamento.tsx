import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import { getPerdasComPagamento } from '../../services/api/perdasComPagamento';
import type { PerdaComPagamentoItem } from '../../services/api/perdasComPagamento';
import { cabecalhoComHint, EXPLICA_STATUS } from '../../components/ColunasIdentificacao/colunasIdentificacao';

/**
 * ABA ⑤ — PERDA COM PAGAMENTO: o pedido está marcado como perda e o Estado pagou no mesmo CNJ.
 *
 * POR QUE ESTA ABA EXISTE (@R 09/09, cartão tela_resultados_versoes): dos 355 pedidos marcados
 * como perda, 192 têm empenho do Estado no processo. Eles não tinham lugar em aba nenhuma e
 * ficavam escondidos dentro de "Perdas", como se fossem dinheiro que não entrou.
 *
 * O USO QUE O @R DECLAROU (falsificador do plano, respondido por ele): COBRAR — "com os 114 na
 * tela eu consigo ESCOLHER quais processos investigar". Por isso esta tela é uma FILA DE
 * INVESTIGAÇÃO e **não tem total somado em lugar nenhum**. Um total aqui seria uma promessa de
 * receita que o dado não sustenta.
 *
 * ⚠ A REGRA QUE ESTA TELA NÃO PODE QUEBRAR: pagamento no mesmo CNJ ≠ comissão nossa. Quem
 * recebe do Estado é o médico representado; só há comissão se `favorecido` for o `medico`
 * daquele pedido. Médico e favorecido saem LADO A LADO porque a comparação é do humano.
 *
 * AS DUAS DIMENSÕES SÃO COLUNAS SEPARADAS DE PROPÓSITO (decisão 610dcedd49, depois de duas
 * refutações medidas): "o que a régua sabe" e "o que a nossa coleta tem" são perguntas
 * ortogonais. Espremidas numa coluna só, os rótulos somavam 122 num universo de 192 e 70 linhas
 * ficavam sem categoria — e a coluna de procedência é justamente onde o leitor deposita
 * confiança.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Cor por procedência — semântica, ¬decoração. */
function severidadeRegua(p: PerdaComPagamentoItem['procedenciaRegua']) {
  if (p === 'CONFIRMADO') return 'success' as const;
  if (p === 'REVISAR_MANUAL') return 'warning' as const;
  if (p === 'RASTREADO') return 'info' as const;
  return 'secondary' as const; // FORA_DO_ALCANCE — ausência de informação, ¬veredito negativo
}

const ROTULO_REGUA: Record<PerdaComPagamentoItem['procedenciaRegua'], string> = {
  CONFIRMADO: 'Régua confirma',
  REVISAR_MANUAL: 'Revisar',
  RASTREADO: 'Rastreado',
  // Nome honesto: ninguém vai perguntar, porque nem entrou no radar. "A perguntar"
  // prometeria um perguntador que não existe.
  FORA_DO_ALCANCE: 'Régua nunca olhou',
};

export function AbaPerdaComPagamento() {
  const [itens, setItens] = useState<PerdaComPagamentoItem[]>([]);
  const [resumo, setResumo] = useState<{ semProfissional: number; comProfissional: number;
    comData: number; semData: number; compartilhado: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [soCobravel, setSoCobravel] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await getPerdasComPagamento();
      // `?? []` de propósito: backend mais velho que este front devolve a aba vazia,
      // nunca um crash (mesma disciplina da AbaVerificar).
      setItens(r?.itens ?? []);
      setResumo({
        semProfissional: r?.semProfissional ?? 0,
        comProfissional: r?.comProfissional ?? 0,
        comData: r?.resumoColeta?.comDataColetada ?? 0,
        semData: r?.resumoColeta?.semDataColetada ?? 0,
        compartilhado: r?.cnjCompartilhado ?? 0,
      });
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a fila. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (soCobravel && i.semProfissional) return false;
      if (!t) return true;
      return [i.paciente, i.medico, i.favorecido, i.cnj]
        .some((c) => (c ?? '').toLowerCase().includes(t));
    });
  }, [itens, busca, soCobravel]);

  if (carregando) return <p className="mc-vazio">Carregando a fila…</p>;
  if (erro) return <p className="mc-vazio">{erro}</p>;

  return (
    <div className="aba-perda-pagamento">
      <p className="mc-explicacao">
        Pedidos marcados como <strong>perda</strong> em que o Estado <strong>pagou</strong> alguém
        no mesmo processo. Esta é uma <strong>fila para investigar</strong>, não dinheiro a
        receber: só há comissão nossa se o <em>favorecido</em> do pagamento for o <em>médico</em>
        do pedido — compare as duas colunas.
      </p>

      {resumo && (
        <div className="mc-chips" role="group" aria-label="Resumo da fila">
          <Tag severity="info" value={`${itens.length} na fila`} />
          <Tag
            severity="success"
            value={`${resumo.comProfissional} com médico nosso`}
            /* A fila cobrável é esta, ¬o total: sem médico nosso não há comissão possível,
               qualquer que seja o favorecido. */
          />
          <Tag severity="secondary" value={`${resumo.semProfissional} sem profissional`} />
          <Tag severity="warning" value={`${resumo.semData} sem data coletada`} />
          {resumo.compartilhado > 0 && (
            <Tag severity="danger" value={`${resumo.compartilhado} com CNJ compartilhado`} />
          )}
        </div>
      )}

      <div className="mc-filtros">
        <InputText
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar paciente, médico, favorecido ou CNJ"
          aria-label="Buscar na fila"
        />
        <label className="mc-check">
          <input
            type="checkbox"
            checked={soCobravel}
            onChange={(e) => setSoCobravel(e.target.checked)}
          />
          <span>Só os que têm médico nosso</span>
        </label>
      </div>

      <DataTable
        value={linhas}
        paginator
        rows={20}
        aria-label="Perdas com pagamento do Estado"
        emptyMessage="Nenhum pedido nesta situação."
      >
        <Column field="orderId" header="#" sortable style={{ minWidth: '4rem' }} />
        <Column field="paciente" header="Paciente" sortable style={{ minWidth: '14rem' }} />
        <Column
          header="Médico do pedido"
          sortable
          sortField="medico"
          style={{ minWidth: '13rem' }}
          body={(i: PerdaComPagamentoItem) =>
            i.semProfissional
              ? <span className="mc-sem-profissional" title="Não tínhamos quem operasse — não há médico nosso a quem uma comissão pudesse ser devida">
                  sem profissional
                </span>
              : (i.medico ?? '—')}
        />
        <Column
          field="favorecido"
          header="Quem o Estado pagou"
          sortable
          style={{ minWidth: '15rem' }}
          body={(i: PerdaComPagamentoItem) => i.favorecido ?? '—'}
        />
        <Column
          header="Valor pago"
          sortable
          sortField="valorPago"
          style={{ minWidth: '9rem' }}
          body={(i: PerdaComPagamentoItem) =>
            i.valorPago != null ? MOEDA.format(Number(i.valorPago)) : '—'}
        />
        <Column
          header="Pago em"
          sortable
          sortField="dataPagamento"
          style={{ minWidth: '10rem' }}
          body={(i: PerdaComPagamentoItem) =>
            /* Vazio aqui NÃO significa "não pagaram": significa que o nosso coletor não foi
               buscar a data. Por isso o texto diz de quem é a falta. */
            i.dataPagamentoColetada && i.dataPagamento
              ? new Date(i.dataPagamento).toLocaleDateString('pt-BR')
              : <span className="mc-nao-coletado" title="O pagamento existe; a data ainda não foi coletada por nós">
                  não coletada
                </span>}
        />
        <Column
          header="Régua 548"
          sortable
          sortField="procedenciaRegua"
          style={{ minWidth: '11rem' }}
          body={(i: PerdaComPagamentoItem) => (
            <Tag severity={severidadeRegua(i.procedenciaRegua)}
                 value={ROTULO_REGUA[i.procedenciaRegua]} />
          )}
        />
        <Column field="statusPerda" header={cabecalhoComHint('Motivo da perda', EXPLICA_STATUS.statusPerda)}
          sortable style={{ minWidth: '13rem' }} />
        <Column
          header="CNJ"
          style={{ minWidth: '13rem' }}
          body={(i: PerdaComPagamentoItem) => (
            <span>
              {i.cnj}
              {i.cnjCompartilhado && (
                <Tag
                  severity="danger"
                  value="compartilhado"
                  title="Este CNJ tem pedidos de pacientes diferentes — confira a quem o pagamento pertence antes de agir"
                  style={{ marginLeft: '.4rem' }}
                />
              )}
            </span>
          )}
        />
      </DataTable>
    </div>
  );
}
