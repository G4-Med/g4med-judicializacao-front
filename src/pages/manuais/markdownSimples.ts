/* Conversor MÍNIMO de Markdown para os manuais (aliança produto-manuais, @R 21/09 19:15).
   Cobre só o que os 2 manuais usam — medido: títulos #/##, listas "-" e "1.", tabelas "|",
   **negrito**, *itálico* e linha "---". Não há biblioteca de Markdown no projeto e não vale
   trazer uma para 2 textos fixos. O texto é escapado ANTES de qualquer marcação, então nada
   do arquivo vira HTML por conta própria.
   A FONTE dos textos é da eliza-comercial (800 comercial_g4med/manuais_participante/*.md);
   conteudo/*.md aqui é a cópia publicada — atualizar copiando de lá, nunca editando aqui. */

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const emLinha = (s: string) =>
  escapar(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r/g, '').split('\n');
  const saida: string[] = [];
  let paragrafo: string[] = [];
  let lista: { tipo: 'ul' | 'ol'; itens: string[] } | null = null;
  let tabela: string[][] | null = null;

  const fecharParagrafo = () => {
    if (paragrafo.length) saida.push(`<p>${paragrafo.map(emLinha).join('<br />')}</p>`);
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista) saida.push(`<${lista.tipo}>${lista.itens.map((i) => `<li>${emLinha(i)}</li>`).join('')}</${lista.tipo}>`);
    lista = null;
  };
  const fecharTabela = () => {
    if (tabela && tabela.length) {
      const [cab, ...corpo] = tabela;
      saida.push(
        '<div class="manual-tabela"><table><thead><tr>'
        + cab.map((c) => `<th>${emLinha(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + corpo.map((l) => `<tr>${l.map((c) => `<td>${emLinha(c)}</td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>');
    }
    tabela = null;
  };
  const fecharTudo = () => { fecharParagrafo(); fecharLista(); fecharTabela(); };

  for (const bruta of linhas) {
    const l = bruta.trimEnd();
    if (!l.trim()) { fecharTudo(); continue; }
    const h = l.match(/^(#{1,3}) (.*)$/);
    if (h) { fecharTudo(); saida.push(`<h${h[1].length}>${emLinha(h[2])}</h${h[1].length}>`); continue; }
    if (/^-{3,}$/.test(l.trim())) { fecharTudo(); saida.push('<hr />'); continue; }
    if (l.trim().startsWith('|')) {
      fecharParagrafo(); fecharLista();
      const celulas = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) continue; // linha separadora do cabeçalho
      (tabela ??= []).push(celulas);
      continue;
    }
    const ul = l.match(/^\s*- (.*)$/);
    const ol = l.match(/^\s*\d+\. (.*)$/);
    if (ul || ol) {
      fecharParagrafo(); fecharTabela();
      const tipo = ul ? 'ul' : 'ol';
      if (!lista || lista.tipo !== tipo) { fecharLista(); lista = { tipo, itens: [] }; }
      lista.itens.push((ul || ol)![1]);
      continue;
    }
    fecharLista(); fecharTabela();
    paragrafo.push(l.trim());
  }
  fecharTudo();
  return saida.join('\n');
}
