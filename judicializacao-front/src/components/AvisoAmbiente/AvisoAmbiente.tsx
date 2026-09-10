/**
 * AVISO DE AMBIENTE — a faixa que diz "isto é produção" quando o localhost está falando com produção.
 *
 * GO @R 10/09/2026 (cartão perguntas_medcheck_5decisoes, decisão AMBIENTE-LOCAL): "MANTER: continua
 * apontando para produção, mas coloque um aviso visível na tela avisando que os dados são reais e
 * que editar grava em produção."
 *
 * POR QUE EXISTE (medido, ¬hipótese): o container do banco local isolado foi REMOVIDO (docker ps -a
 * não lista nenhum mssql em 10/09 — removido, não parado). Então quem sobe o front hoje aponta para
 * a API de produção, e o teste do proxy devolveu 401 do Django de produção. Para OLHAR está certo e
 * é o uso validado em 28/08. O risco é a tela NÃO dizer isso: o endereço `localhost` sugere
 * ambiente de teste, e editar um pedido ali grava no banco real que a equipe usa.
 *
 * COMO SABE: `import.meta.env.VITE_PROXY_API` — a mesma variável que o proxy do vite.config usa
 * como alvo. O prefixo `VITE_` faz o Vite expô-la ao bundle automaticamente.
 *
 * ⚠ CICATRIZ 10/09/2026, pega pelo falsificador e NÃO pela revisão: a 1ª versão usava um
 * `define: { __API_ALVO__: ... }` no vite.config. Funcionava no BUILD (provado: o domínio
 * aparecia em dist/assets/index-*.js) e NÃO funcionava no DEV — o Vite não aplica `define` na
 * transformação do módulo servido individualmente, então o literal `__API_ALVO__` chegava cru ao
 * browser. E como a leitura era `typeof __API_ALVO__ === 'string'`, não havia ReferenceError:
 * o aviso simplesmente NUNCA APARECIA, em silêncio, exatamente no ambiente (dev, localhost) onde
 * ele é a única proteção. Build verde não prova tela viva — foi o `curl` no módulo servido pelo
 * dev-server que denunciou.
 *
 * A ASSIMETRIA É O DESENHO: sem `VITE_PROXY_API` o valor é 'local' e este componente devolve `null`.
 * Aviso que aparece sempre é ruído, e ruído permanente é ignorado em duas semanas — então ele só
 * aparece quando há de fato o que avisar. É também o controle negativo do falsificador: se a faixa
 * aparecesse com backend local, o teste falharia.
 *
 * DELIBERADAMENTE NÃO É DISPENSÁVEL (sem botão de fechar): o custo de errar aqui é escrita em
 * produção. Uma faixa que o usuário fecha no primeiro minuto não protege ninguém no terceiro dia.
 */

/** Produção é reconhecida pelo domínio real, ¬por "não ser local" — assim um staging futuro
 *  não é confundido com produção nem tratado como local. */
export function alvoEhProducao(alvo: string): boolean {
  return alvo.includes('medchecksaude.com.br');
}

export function AvisoAmbiente() {
  const alvo = String(import.meta.env.VITE_PROXY_API ?? 'local');
  if (!alvoEhProducao(alvo)) return null;

  return (
    <div className="aviso-ambiente" role="alert" aria-live="polite">
      <i className="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>
        <strong>Estes dados são REAIS, de produção.</strong> Você está no endereço local, mas a tela
        está falando com o sistema que a equipe usa — <strong>qualquer edição grava em produção</strong>,
        não em ambiente de teste.
      </span>
      <code className="aviso-ambiente__alvo" title="Para onde as chamadas /api estão indo">{alvo}</code>
    </div>
  );
}
