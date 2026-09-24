import { isValidElement, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import React from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Checkbox } from 'primereact/checkbox';
import api from '../../services/api';
import { CHAVE_PADRAO, DICIONARIO_COLUNAS, normalizarOcultas, verbete } from './dicionarioColunas';
import { useAccess } from '../../access/AccessContext';

/** Quem é o GUIA das colunas (@R 23/09 15:33): o que ele escolhe numa tela é o padrão de quem não escolheu. */
const GUIA_COLUNAS = 'rapha';

/**
 * Personalização de colunas POR USUÁRIO (task #228, @R 27/08 19:46: "botão que
 * podemos ocultar as colunas de cada tabela e deixar salvo para cada usuário").
 *
 * Uso na página:
 *   const colunasCfg = useColunasVisiveis('juridico');
 *   ...  {colunasCfg.botao}  ...
 *   <DataTable ...>{colunasCfg.filtrar(<> ...colunas... </>)}</DataTable>
 *
 * Como funciona: filtrar() varre os children (Column elements), identifica cada
 * coluna pelo `field` (colunas SEM field — expander, seleção, Ações — são de
 * sistema e ficam SEMPRE visíveis) e remove as que o usuário ocultou. A escolha
 * grava no servidor (/preferencias/colunas_ocultas:<tela>/) — vale em qualquer
 * máquina — com localStorage como cache/fallback (API fora nunca quebra a tela).
 */

interface ColunaInfo { id: string; label: string }

/** Duas listas de colunas ocultas são a MESMA coisa? (ordem não importa) */
function mesmaLista(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort().join('|');
  const y = [...b].sort().join('|');
  return x === y;
}

function rotuloDe(el: any, fallback: string): string {
  const h = el.props?.header;
  if (typeof h === 'string') return h;
  if (isValidElement(h)) {
    const kids = React.Children.toArray((h.props as any)?.children ?? []);
    const texto = kids.find((k) => typeof k === 'string');
    if (typeof texto === 'string' && texto.trim()) return texto.trim();
  }
  return fallback;
}

function achatar(nodes: ReactNode): any[] {
  const out: any[] = [];
  React.Children.forEach(nodes as any, (n: any) => {
    if (n === null || n === undefined || n === false) return;
    if (Array.isArray(n)) { out.push(...achatar(n)); return; }
    if (isValidElement(n) && n.type === React.Fragment) {
      out.push(...achatar((n.props as any).children));
      return;
    }
    out.push(n);
  });
  return out;
}

/**
 * ORDEM DAS COLUNAS (@R 24/09 02:52: "criar em Colunas para alterar a ordem ... para facilitar eu
 * manejar a ordem das colunas"). `ordem` é a lista de `field` que o usuário arrumou. Coluna que não
 * está nela (coluna nova, criada depois que ele arrumou) entra logo depois da vizinha que a precedia
 * no código — nunca some e nunca vai parar no fim da tabela sem motivo. Lista vazia = ordem do código.
 */
export function ordenarCampos(doCodigo: string[], ordem: string[]): string[] {
  const presentes = new Set(doCodigo);
  const saida = ordem.filter((f, i) => presentes.has(f) && ordem.indexOf(f) === i);
  doCodigo.forEach((f, i) => {
    if (saida.includes(f)) return;
    let pos = 0;
    for (let k = i - 1; k >= 0; k--) {
      const j = saida.indexOf(doCodigo[k]);
      if (j >= 0) { pos = j + 1; break; }
    }
    saida.splice(pos, 0, f);
  });
  return saida;
}

export function useColunasVisiveis(tela: string) {
  const chave = `colunas_ocultas:${tela}`;
  const lsKey = `mc_${chave}`;
  const lsGuia = `mc_guia_${chave}`;
  const { profile } = useAccess() as any;
  const souGuia = profile?.username === GUIA_COLUNAS;
  const [temPropria, setTemPropria] = useState<boolean | null>(null);   // null = ainda não sei
  // @R 29/08 13:28: o PADRÃO (todas as telas) manda; a escolha POR TELA sobrescreve; e coluna
  // marcada como opcional no dicionário NASCE DESMARCADA para quem nunca configurou nada.
  const [ocultas, setOcultas] = useState<string[]>(() => {
    try {
      const daTela = localStorage.getItem(lsKey);
      if (daTela) return normalizarOcultas(JSON.parse(daTela));
      const doGuia = localStorage.getItem(lsGuia);
      if (doGuia) return normalizarOcultas(JSON.parse(doGuia));
      const doPadrao = localStorage.getItem(`mc_${CHAVE_PADRAO}`);
      if (doPadrao) return normalizarOcultas(JSON.parse(doPadrao));
    } catch { /* storage indisponível */ }
    return DICIONARIO_COLUNAS.filter((v) => v.padraoOculta).map((v) => v.id);
  });
  const [ordem, setOrdem] = useState<string[]>(() => {
    for (const k of [lsKey + ':ordem', lsGuia + ':ordem', `mc_${CHAVE_PADRAO}:ordem`]) {
      try { const v = localStorage.getItem(k); if (v) return JSON.parse(v); } catch { /* fail-soft */ }
    }
    return [];
  });
  const lerOrdem = (valor: any, cache: string) => {
    const o = Array.isArray(valor?.ordem) ? valor.ordem.filter((x: unknown) => typeof x === 'string') : [];
    setOrdem((atual) => (atual.join('|') === o.join('|') ? atual : o));
    try { localStorage.setItem(cache + ':ordem', JSON.stringify(o)); } catch { /* fail-soft */ }
  };
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const conhecidas = useRef<ColunaInfo[]>([]);
  const assinaturaConhecida = useRef<string>('');
  const pendenteAviso = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    // 1º a preferência DESTA tela; se o usuário nunca mexeu nela, cai no PADRÃO de todas as telas.
    api.get(`/preferencias/${encodeURIComponent(chave)}/`)
      .then(({ data }) => {
        const doServidor = Array.isArray(data?.valor?.ocultas) ? normalizarOcultas(data?.valor?.ocultas) : undefined;
        if (Array.isArray(doServidor)) {
          // CURA DO LOOP: só troca o estado se a lista REALMENTE mudou. Um setOcultas com a
          // mesma lista re-monta as colunas do cabeçalho, e o HeaderCell do PrimeReact
          // (useEffect sem deps) reage à troca chamando setState de novo — o vaivém que
          // produzia "Maximum update depth exceeded" ao trocar de tela.
          setOcultas((atual) => (mesmaLista(atual, doServidor) ? atual : doServidor));
          lerOrdem(data?.valor, lsKey);
          try { localStorage.setItem(lsKey, JSON.stringify(doServidor)); } catch { /* cheio/bloqueado */ }
          setTemPropria(true);
          return;
        }
        setTemPropria(false);
        try { localStorage.removeItem(lsKey); } catch { /* fail-soft */ }
        // 2º o GUIA (@R 23/09 15:33): as colunas que o rapha escolheu nesta tela valem para quem não escolheu as suas
        return api.get(`/preferencias-sistema/${encodeURIComponent(chave)}/`).then(({ data: dg }) => {
          const doGuia = Array.isArray(dg?.valor?.ocultas) ? normalizarOcultas(dg?.valor?.ocultas) : undefined;
          if (Array.isArray(doGuia)) {
            setOcultas((atual) => (mesmaLista(atual, doGuia) ? atual : doGuia));
            lerOrdem(dg?.valor, lsGuia);
            try { localStorage.setItem(lsGuia, JSON.stringify(doGuia)); } catch { /* fail-soft */ }
            return;
          }
          return api.get(`/preferencias/${encodeURIComponent(CHAVE_PADRAO)}/`).then(({ data: d2 }) => {
          const doPadrao = Array.isArray(d2?.valor?.ocultas) ? normalizarOcultas(d2?.valor?.ocultas) : undefined;
          if (Array.isArray(doPadrao)) {
            setOcultas((atual) => (mesmaLista(atual, doPadrao) ? atual : doPadrao));
            lerOrdem(d2?.valor, `mc_${CHAVE_PADRAO}`);
            try { localStorage.setItem(`mc_${CHAVE_PADRAO}`, JSON.stringify(doPadrao)); } catch { /* fail-soft */ }
          }
          });
        });
      })
      .catch(() => undefined);   // API fora → fica o cache local
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const salvar = (novas: string[], novaOrdem: string[] = ordem) => {
    setOcultas(novas);
    setOrdem(novaOrdem);
    setTemPropria(true);
    try {
      localStorage.setItem(lsKey, JSON.stringify(novas));
      localStorage.setItem(lsKey + ':ordem', JSON.stringify(novaOrdem));
    } catch { /* fail-soft */ }
    api.put(`/preferencias/${encodeURIComponent(chave)}/`, { valor: { ocultas: novas, ordem: novaOrdem } })
      .catch(() => undefined);
  };
  /** Move a coluna `id` para a posição da coluna `alvo` (arrastar) ou 1 casa (setas). */
  const mover = (id: string, alvo: string) => {
    const atual = conhecidas.current.map((c) => c.id);
    const de = atual.indexOf(id);
    const para = atual.indexOf(alvo);
    if (de < 0 || para < 0 || de === para) return;
    atual.splice(de, 1);
    atual.splice(para, 0, id);
    salvar(ocultas, atual);
  };

  // "Usar o padrão do Rapha": apaga a escolha própria desta tela e lê o guia de novo.
  const voltarAoGuia = () => {
    try { localStorage.removeItem(lsKey); localStorage.removeItem(lsKey + ':ordem'); } catch { /* fail-soft */ }
    api.delete(`/preferencias/${encodeURIComponent(chave)}/`).catch(() => undefined).finally(() => {
      setTemPropria(false);
      api.get(`/preferencias-sistema/${encodeURIComponent(chave)}/`).then(({ data }) => {
        const g = Array.isArray(data?.valor?.ocultas) ? normalizarOcultas(data?.valor?.ocultas) : undefined;
        if (Array.isArray(g)) {
          setOcultas(g);
          lerOrdem(data?.valor, lsGuia);
          try { localStorage.setItem(lsGuia, JSON.stringify(g)); } catch { /* fail-soft */ }
        }
      }).catch(() => undefined);
    });
  };

  const filtrar = (children: ReactNode) => {
    const crus = achatar(children);
    const campoDe = (el: any): string | null =>
      (typeof el?.props?.field === 'string' && el.props.field ? el.props.field : null);
    // Só as colunas de DADOS trocam de lugar entre si; as de sistema (expander, seleção, Ações)
    // ficam exatamente onde o código as pôs.
    const posicoes = crus.map((el, i) => (campoDe(el) ? i : -1)).filter((i) => i >= 0);
    const porCampo = new Map<string, any[]>();
    posicoes.forEach((i) => {
      const f = campoDe(crus[i]) as string;
      porCampo.set(f, [...(porCampo.get(f) ?? []), crus[i]]);
    });
    const doCodigo = [...porCampo.keys()];
    const ordenados = ordenarCampos(doCodigo, ordem).flatMap((f) => porCampo.get(f) ?? []);
    const els = [...crus];
    posicoes.forEach((pos, k) => { els[pos] = ordenados[k]; });
    const achadas: ColunaInfo[] = [];
    let sistema = 0;
    // Conta quantas vezes cada chave já saiu NESTA passada (ver DESEMPATE abaixo).
    const usadas = new Map<string, number>();
    const resultado = els
      .filter((el) => {
        const field = el?.props?.field;
        if (typeof field !== 'string' || !field) return true;   // coluna de sistema
        achadas.push({ id: field, label: rotuloDe(el, verbete(field)?.nome ?? field) });   // título que não é texto (ex.: Re-pedido) usa o nome do dicionário
        return !ocultas.includes(field);
      })
      // @R 29/08 14:47 — CURA DO LOOP "Maximum update depth exceeded".
      // O HeaderCell do PrimeReact 10.9 tem um useEffect SEM array de dependências: a cada
      // render ele compara a coluna com a da renderização anterior e, se `sortable` mudou,
      // chama setState. Sem `key`, o React reaproveita a mesma célula para colunas DIFERENTES
      // quando a lista visível muda (ocultar coluna, preferência que chega da API) — a célula
      // vê sortable diferente, dispara setState, re-renderiza, e o ciclo nunca fecha.
      // Com key estável por coluna, cada célula fica casada com a SUA coluna e o efeito para.
      .map((el) => {
        if (!isValidElement(el)) return el;
        const pr = el.props as any;
        // Identidade ESTÁVEL por coluna. Para as colunas de sistema (sem `field`:
        // expander, seleção, Ações) a chave NÃO pode depender da posição — elas
        // aparecem/somem conforme permissão e preferência, e uma chave por índice
        // faria o React casar a célula do cabeçalho com a coluna ERRADA. Foi essa
        // troca de par que fazia o PrimeReact disparar setState em cadeia
        // ("Maximum update depth exceeded") ao trocar de tela.
        const base =
          typeof pr?.field === 'string' && pr.field ? `col-${pr.field}`
          : pr?.expander ? 'sys-expander'
          : pr?.selectionMode ? 'sys-selecao'
          : pr?.rowEditor ? 'sys-editor'
          : typeof pr?.header === 'string' && pr.header ? `sys-h-${pr.header}`
          : `sys-${sistema++}`;
        // ── DESEMPATE (08/09) — duas colunas com o MESMO `field` na mesma tabela geravam
        // a mesma key e o React reclamava ("Encountered two children with the same key,
        // col-nprocesso"), podendo duplicar/omitir células em silêncio. Acontece de forma
        // legítima: um `field` pode ser exibido duas vezes com recortes diferentes (ex.
        // o número do processo como texto e como link). A chave precisa ser estável POR
        // COLUNA, não por campo — então o 2º repetido vira `col-x#2`, e a estabilidade
        // (que é o que curou o "Maximum update depth" acima) se mantém: a mesma coluna,
        // na mesma posição da lista, recebe sempre o mesmo sufixo.
        const n = (usadas.get(base) ?? 0) + 1;
        usadas.set(base, n);
        const chaveCol = n === 1 ? base : `${base}#${n}`;
        if (n > 1 && import.meta.env.DEV) {
          // Só em desenvolvimento: nomeia o culpado para quem for arrumar a origem.
          // Em produção seria ruído para o usuário, e a key já está correta de qualquer forma.
          console.warn(
            `[colunas] "${tela}": ${n} colunas com field="${pr?.field}" (header: ${
              typeof pr?.header === 'string' ? pr.header : '—'
            }). Key desempatada para "${chaveCol}" — confira se a repetição é intencional.`,
          );
        }
        return React.cloneElement(el as any, { key: chaveCol });
      });
    // registra o cardápio de colunas p/ o painel de "Colunas" — comparando só os IDs
    // (string estável) e SEM setState durante o render (era a 2ª ponta do loop).
    const assinatura = achadas.map((c) => c.id).join('|');
    if (assinatura !== assinaturaConhecida.current) {
      assinaturaConhecida.current = assinatura;
      conhecidas.current = achadas;
      pendenteAviso.current = true;
    }
    return resultado;
  };

  // O aviso de "o cardápio de colunas mudou" sai DEPOIS do render (nunca durante),
  // e só quando o painel está aberto — quem lê `conhecidas.current` é o diálogo.
  useEffect(() => {
    if (pendenteAviso.current) {
      pendenteAviso.current = false;
      if (aberto) force((v) => v + 1);
    }
  });

  const botao = (
    <>
      <Button label="Colunas" icon="pi pi-sliders-h" size="small" outlined severity="secondary"
        className="botao-colunas" onClick={() => setAberto(true)}
        title="Escolha quais colunas aparecem e em que ordem — a escolha fica salva para o seu usuário" />
      <Dialog header="Colunas: quais aparecem e em que ordem" visible={aberto} modal onHide={() => setAberto(false)}
        style={{ width: '28rem', maxWidth: '94vw' }}>
        <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: 'var(--text-color-secondary, #6b7280)' }}>
          {souGuia
            ? <>Você é o <strong>guia</strong>: o que marcar aqui vira o padrão desta tela para quem não escolheu as próprias colunas.</>
            : temPropria
              ? <>Você está usando as <strong>suas</strong> colunas nesta tela.</>
              : <>Você está vendo o <strong>padrão do sistema</strong> (colunas do Rapha). Se mudar, passa a valer a sua escolha.</>}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conhecidas.current.map((c, i, lista) => (
            <div key={c.id} draggable
              onDragStart={() => setArrastando(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (arrastando) mover(arrastando, c.id); setArrastando(null); }}
              onDragEnd={() => setArrastando(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', borderRadius: 4,
                background: arrastando === c.id ? 'var(--surface-200, #e5e7eb)' : undefined }}>
              <i className="pi pi-bars" style={{ cursor: 'grab', color: 'var(--text-color-secondary, #9ca3af)', fontSize: '.75rem' }}
                title="Arraste para mudar a posição da coluna" />
              <Checkbox inputId={`col-vis-${c.id}`} checked={!ocultas.includes(c.id)}
                onChange={(e) => salvar(e.checked
                  ? ocultas.filter((o) => o !== c.id)
                  : [...ocultas, c.id])} />
              <label htmlFor={`col-vis-${c.id}`} style={{ flex: 1, cursor: 'pointer' }}
                title={verbete(c.id)?.oQueE ?? c.label}>{c.label}</label>
              <Button icon="pi pi-angle-up" text rounded size="small" disabled={i === 0}
                aria-label={`Subir ${c.label}`} title="Subir (fica mais à esquerda na tabela)"
                onClick={() => mover(c.id, lista[i - 1].id)} style={{ width: 26, height: 26 }} />
              <Button icon="pi pi-angle-down" text rounded size="small" disabled={i === lista.length - 1}
                aria-label={`Descer ${c.label}`} title="Descer (fica mais à direita na tabela)"
                onClick={() => mover(c.id, lista[i + 1].id)} style={{ width: 26, height: 26 }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
          <Button label="O que é cada coluna" text size="small" icon="pi pi-question-circle"
            onClick={() => { window.location.href = '/configuracoes-colunas'; }}
            title="Abre Configurações › Colunas: explica cada coluna e deixa definir o padrão de todas as telas" />
          <Button label="Mostrar todas" text size="small" onClick={() => salvar([])} />
          {ordem.length > 0 && (
            <Button label="Ordem padrão" text size="small" icon="pi pi-sort-alt"
              title="Volta as colunas à ordem original da tela (mantém as que você escondeu)"
              onClick={() => salvar(ocultas, [])} />
          )}
          {!souGuia && temPropria && (
            <Button label="Usar o padrão do Rapha" text size="small" icon="pi pi-replay" onClick={voltarAoGuia}
              title="Apaga a sua escolha nesta tela e volta às colunas que o Rapha deixou como padrão" />
          )}
          <Button label="Fechar" size="small" onClick={() => setAberto(false)} />
        </div>
      </Dialog>
    </>
  );

  return { filtrar, botao, ocultas, ordem };
}
