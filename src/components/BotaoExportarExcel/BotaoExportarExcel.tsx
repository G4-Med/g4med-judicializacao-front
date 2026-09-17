import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import api from '../../services/api';

/**
 * Baixar Excel em TODA tabela (task #227, @R 27/08 19:32-19:37):
 *  - exporta TODOS os registros (não só a página visível da paginação);
 *  - se há filtro ativo (visiveis ≠ todos), PERGUNTA: filtrados ou completos;
 *  - toda exportação vira RASTRO de auditoria no backend (quem, tela, escopo,
 *    nº de linhas) — fail-soft: falha no log nunca bloqueia o download.
 * xlsx entra por import dinâmico (não pesa o bundle de quem nunca exporta).
 */

const MONETARIO = /valor|pago|empenhad|total|preco|preço/i;
const eData = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Lista de objetos vira colunas de RESUMO: dinheiro soma, data vira primeiro/último,
 *  o resto vira os valores distintos concatenados. Antes a lista inteira era DESCARTADA —
 *  foi assim que o pagamento (empenhos[]) sumiu do Excel (@R 31/08). */
function achatarLista(prefixo: string, itens: any[], out: Record<string, any>) {
  out[`${prefixo}_qtd`] = itens.length;
  if (!itens.length) return;
  if (!itens.every((i) => i && typeof i === 'object')) {
    out[prefixo] = itens.map(String).join(' | ').slice(0, 300);
    return;
  }
  for (const k of [...new Set(itens.flatMap((i) => Object.keys(i)))]) {
    const vals = itens.map((i) => i[k]).filter((v) => v !== null && v !== undefined && v !== '');
    if (!vals.length) continue;
    if (vals.every((v) => typeof v === 'number') && MONETARIO.test(k)) {
      out[`${prefixo}_${k}_total`] = vals.reduce((a: number, b: number) => a + b, 0);
    } else if (vals.every(eData)) {
      const ord = [...vals].sort();
      out[`${prefixo}_${k}_primeiro`] = ord[0];
      out[`${prefixo}_${k}_ultimo`] = ord[ord.length - 1];
    } else {
      out[`${prefixo}_${k}`] = [...new Set(vals.map(String))].join(' | ').slice(0, 300);
    }
  }
}

/** Achata UMA linha: escalares direto, objeto vira `pai_filho`, lista vira resumo.
 *  As colunas que o operador procura primeiro (CNJ, SEI, quanto pagaram e quando)
 *  nascem NA FRENTE — o resto vem depois, na ordem natural. */
const flatten = (linha: Record<string, any>) => {
  const out: Record<string, any> = {
    id: linha.id ?? '',
    paciente: linha.paciente ?? '',
    cnj: linha.nprocesso ?? '',
    sei: linha.numeroSei ?? '',
    valorPago: '',
    dataPagamento: '',
  };
  const e548 = linha.empenho548;
  const emps: any[] = Array.isArray(linha.empenhos) ? linha.empenhos : [];
  const pago = e548?.pago ?? (emps.length
    ? emps.reduce((a, e) => a + (Number(e?.valorPago) || 0), 0) : null);
  const datas = emps.map((e) => e?.dataPagamento).filter(eData).sort();
  out.valorPago = pago ?? '';
  out.dataPagamento = e548?.ultimoPagamento ?? (datas.length ? datas[datas.length - 1] : '');

  for (const [k, v] of Object.entries(linha)) {
    if (k in out) continue;
    if (v === null || v === undefined) { out[k] = ''; continue; }
    if (k === 'cadastro' && typeof v === 'object' && 'completos' in (v as any)) {
      out[k] = `${(v as any).completos}/${(v as any).total}`; continue;
    }
    if (Array.isArray(v)) { achatarLista(k, v, out); continue; }
    if (typeof v === 'object') {                       // objeto vira pai_filho (1 nível)
      for (const [k2, v2] of Object.entries(v as any)) {
        if (v2 && typeof v2 === 'object') continue;
        out[`${k}_${k2}`] = v2 ?? '';
      }
      continue;
    }
    out[k] = v;
  }
  return out;
};

async function gerarXlsx(dados: any[], nome: string) {
  const XLSX = await import('xlsx');
  const linhas = dados.map(flatten);
  // união das chaves: se a 1ª linha não tem pagamento, a coluna não pode sumir do arquivo
  const header = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const ws = XLSX.utils.json_to_sheet(linhas, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 30));
  const hoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `medcheck_${nome}_${hoje}.xlsx`);
}

interface Props {
  todos: any[];
  visiveis?: any[];          // linhas pós-filtro (onValueChange); ausente = sem noção de filtro
  nome: string;              // slug da tela (vai no nome do arquivo e no log)
}

export function BotaoExportarExcel({ todos, visiveis, nome }: Props) {
  const [perguntando, setPerguntando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const filtrado = !!visiveis && visiveis.length !== todos.length;

  const exportar = async (escopo: 'filtrado' | 'completo') => {
    const dados = escopo === 'filtrado' && visiveis ? visiveis : todos;
    if (!dados.length) { alert('Nada para exportar.'); return; }
    setExportando(true);
    try {
      await gerarXlsx(dados, nome);
      // rastro de auditoria — fire-and-forget (@R: "colocar para rastrear no log")
      api.post('/auditoria/exportacao/', { tela: nome, escopo, linhas: dados.length })
        .catch(() => undefined);
    } catch {
      alert('Erro ao gerar o Excel.');
    } finally {
      setExportando(false);
      setPerguntando(false);
    }
  };

  return (
    <>
      <Button label="Baixar Excel" icon="pi pi-file-excel" size="small" outlined
        severity="success" loading={exportando} className="botao-exportar-excel"
        onClick={() => (filtrado ? setPerguntando(true) : exportar('completo'))} />
      <Dialog header="Baixar Excel" visible={perguntando} modal
        style={{ width: '26rem', maxWidth: '94vw' }} onHide={() => setPerguntando(false)}>
        <p>A tabela está <strong>filtrada</strong>. O que você quer baixar?</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button label={`Filtrados (${visiveis?.length ?? 0})`} icon="pi pi-filter"
            severity="success" onClick={() => exportar('filtrado')} />
          <Button label={`Completos (${todos.length})`} icon="pi pi-table" outlined
            onClick={() => exportar('completo')} />
        </div>
      </Dialog>
    </>
  );
}
