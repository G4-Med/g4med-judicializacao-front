#!/usr/bin/env python3
"""GATE: hint de coluna reusado em campos DIFERENTES — o padrão que gerou 9 hints mentirosos.

CICATRIZ 2026-09-10 (cartão perguntas_medcheck_5decisoes, decisão STATUS-OPERADORES): o texto
`cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')` estava copiado em
9 colunas. Só 2 eram de fato `statusProcesso`. As outras 7 descreviam o campo ERRADO:

  ClientesPage          field="status" (boolean ativo/inativo)  -> hint falava de funil de pedido
  UsuariosPage          field="isActive" (conta de acesso)      -> idem
  ResultadosFinanceiros field="statusCirurgia"                  -> idem
  ProtocoladosPage      status literal 'Protocolado'            -> idem
  EmailsPage            status do monitor de e-mail             -> idem
  MonitorIntegracao     status de integração e de execução (×2) -> idem

POR QUE UM GATE E NÃO SÓ A CORREÇÃO: a correção morre no próximo copy-paste. Um hint errado NÃO
quebra o build, NÃO aparece em teste de render e NÃO dá warning — ele só ensina o operador errado,
em silêncio, por meses. É a definição de erro que precisa de gate.

O PREDICADO: se a MESMA string de explicação aparece em `cabecalhoComHint` de colunas com `field`
DIFERENTES, é copy-paste — porque um texto que descreve dois campos distintos está errado em pelo
menos um. Colunas com o MESMO field podem legitimamente compartilhar o texto (é a mesma coisa em
duas telas), então isso NÃO acusa.

LIMITE HONESTO: casa `field="..."` na mesma linha ou nas 3 acima do `cabecalhoComHint`. Coluna sem
`field` (só `body=`) não tem campo declarado para comparar — ela é CONTADA e reportada como
`sem-field`, nunca silenciada, mas não pode ser julgada por este predicado. Regex, ¬AST: heurística
barata sobre JSX, e o número é PISO, não teto.

Uso:  python3 scripts/gate_hints_campo_errado.py [--json]
Exit: 0 limpo · 1 achou hint compartilhado entre fields diferentes · 2 alvo ausente
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

__hook_meta__ = {
    "category": "gate-de-projeto",
    "trigger": "manual / pre-commit (¬hook de sessão)",
    # AXIOMA 4 — os DOIS nomes desligam. O prefixado existe porque o registro de guardas do sistema
    # (guardas_do_sistema/guardas_registry.py) procura `SUPERMENTE_*_OFF`; o curto é o que um dev do
    # front adivinha sem ler nada. Dois nomes é redundância barata, ¬ambiguidade.
    "kill_switch": "SUPERMENTE_MEDCHECK_GATE_HINTS_OFF",
    "kill_switch_alias": "MEDCHECK_GATE_HINTS_OFF",
    "fail_mode": "fail-closed",
}

# 7ª garantia declarada como CÓDIGO, ¬só em docstring: o leitor do registro remove comentários
# antes de procurar, então declaração que vive em prosa não conta. Descobri sendo barrado por ele.
#   fail-closed  = na dúvida este gate FALHA (exit != 0); nunca devolve 0 por não ter medido.
#   alvo ausente = exit 2 · exceção = propaga · arquivo ilegível = lê com replace e SEGUE (entra na
#   contagem, nunca é pulado em silêncio) · 0 hints = exit 0 COM o número impresso, para que ficar
#   cego seja visível. Gate que engole erro e devolve 0 mente sobre ter rodado — a mesma classe de
#   bug que ele existe para pegar.
FAIL_MODE = "fail-closed"
KILL_SWITCHES = ("SUPERMENTE_MEDCHECK_GATE_HINTS_OFF", "MEDCHECK_GATE_HINTS_OFF")

RAIZ = Path(__file__).resolve().parent.parent / "src"
# captura a explicação (2º argumento) de cabecalhoComHint('Titulo', 'explicacao')
RE_HINT = re.compile(r"cabecalhoComHint\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)")
RE_FIELD = re.compile(r'field="([^"]+)"')

# ═══ SINÔNIMOS DECLARADOS ═══
# Fields com NOMES diferentes que carregam o MESMO dado — compartilhar o hint entre eles é
# correto, e acusá-los faria o gate virar ruído. @M115: guard mais caro de obedecer que de burlar
# é desligado na primeira rodada, e um gate desligado protege zero.
#
# A REGRA para entrar aqui: a equivalência tem de ser MEDIDA no código (a linha do mapeamento),
# ¬suposta pelo nome parecido. Cada grupo carrega onde foi medido. Grupo sem prova ¬entra.
SINONIMOS: tuple[tuple[frozenset[str], str], ...] = (
    (frozenset({"valor", "valorOrcamento"}),
     "MEDIDO: PerdasPage.tsx:114 `valor: valorOrcamento || o.refPreco || 0` e "
     "ProtocoladosPage.tsx:196 `valor: o.valorOrcamento ?? o.refPreco ?? 0` — `valor` é o "
     "valorOrcamento com fallback. ⚠ DÍVIDA declarada: quando cai no refPreco o hint "
     "'valor do orçamento que enviamos' fica impreciso (refPreco é referência, ¬o que enviamos). "
     "Imprecisão pequena e conhecida; ¬é campo errado, por isso sinônimo e ¬achado."),
    (frozenset({"dataEnvio", "dataEnvioOrcamento"}),
     "MEDIDO: ParaProtocolarPage.tsx:154 `dataEnvioOrcamento: o.dataStatusOrcamento` e "
     "EnviadoSesPage.tsx:48 `dataEnvio` — as duas telas mostram a data do envio do orçamento com "
     "nomes locais diferentes. ⚠ DÍVIDA: a de ParaProtocolar vem de dataStatusOrcamento, que é a "
     "data do STATUS e não necessariamente do envio. Vale conferir com quem opera."),
)


def _mesmo_dado(campos: set[str]) -> bool:
    """True se TODOS os campos do grupo estão num único conjunto de sinônimos declarados.
    Fail-closed: 2 campos que caem em grupos DIFERENTES, ou algum fora de qualquer grupo,
    devolve False — na dúvida o gate acusa e o humano tria."""
    for grupo, _razao in SINONIMOS:
        if campos <= grupo:
            return True
    return False


def main() -> int:
    for k in KILL_SWITCHES:
        if os.environ.get(k) == "1":
            print(f"gate_hints_campo_errado: DESLIGADO por {k}=1")
            return 0
    if not RAIZ.is_dir():
        print(f"gate_hints_campo_errado: src não encontrado em {RAIZ} — exit 2 (fail-closed: "
              f"ausência de alvo ¬é ausência de problema)", file=sys.stderr)
        return 2

    por_texto: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    sem_field = 0
    total = 0

    for arq in sorted(RAIZ.rglob("*.tsx")):
        linhas = arq.read_text(encoding="utf-8", errors="replace").splitlines()
        for i, linha in enumerate(linhas):
            for m in RE_HINT.finditer(linha):
                total += 1
                explicacao = m.group(2)
                campo = None
                for cand in [linha] + linhas[max(0, i - 3):i][::-1]:
                    f = RE_FIELD.search(cand)
                    if f:
                        campo = f.group(1)
                        break
                if campo is None:
                    sem_field += 1
                    continue
                rel = str(arq.relative_to(RAIZ.parent))
                por_texto[explicacao][campo].append(f"{rel}:{i + 1}")

    achados = []
    isentos = 0
    for texto, campos in por_texto.items():
        if len(campos) > 1:
            if _mesmo_dado(set(campos)):
                isentos += 1          # sinônimo declarado e MEDIDO — contado, ¬escondido
                continue
            achados.append({"explicacao": texto[:120],
                            "campos": {c: locs for c, locs in campos.items()},
                            "n_campos": len(campos)})
    achados.sort(key=lambda a: -a["n_campos"])

    if "--json" in sys.argv:
        print(json.dumps({"ok": not achados, "hints_com_field": total - sem_field,
                          "sem_field": sem_field, "isentos_sinonimo": isentos,
                          "achados": achados},
                         ensure_ascii=False, indent=1))
        return 1 if achados else 0

    print(f"gate_hints_campo_errado: {total} hint(s) · {total - sem_field} com field · "
          f"{sem_field} sem field (¬julgáveis, reportados ¬silenciados) · "
          f"{isentos} isento(s) por sinônimo MEDIDO")
    if not achados:
        print("  OK — nenhuma explicação compartilhada entre campos diferentes.")
        return 0
    print(f"  ✗ {len(achados)} explicação(ões) reusada(s) em campos DIFERENTES:")
    for a in achados:
        print(f"\n  «{a['explicacao']}»")
        for campo, locs in a["campos"].items():
            print(f"      field={campo}")
            for loc in locs:
                print(f"        {loc}")
    print("\n  Um texto que descreve 2 campos distintos está errado em pelo menos um deles.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
