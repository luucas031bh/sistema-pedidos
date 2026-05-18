"""Testes do roteador RP (aceite + opcional API real)."""

import os
import sys

from intencao import classificar_intencao
from rp_router import rotear_pergunta_rp

CASOS_INTENCAO = [
    ("faça relatorio dos pedidos em abertos que estao com insumos", "navegar_rp"),
    ("resumo financeiro de todo o trabalho", "navegar_rp"),
    ("me fala todos os pedidos que estao em status de ARTE", "navegar_rp"),
    ("detalhes do pedido 3727", "navegar_rp"),
]

CASOS_ROTEADOR_OFFLINE = [
    "faça relatorio dos pedidos em abertos que estao com insumos",
    "resumo financeiro de todo o trabalho",
    "quantos pedidos estao em arte",
]


def main():
    ok = 0
    fail = 0

    for texto, intencao_esperada in CASOS_INTENCAO:
        r = classificar_intencao(texto)
        if r["intencao"] == intencao_esperada and r["executar"]:
            print(f"OK intencao  {texto[:50]!r} -> {r['intencao']}")
            ok += 1
        else:
            print(
                f"FAIL intencao {texto[:50]!r} -> {r['intencao']} exec={r['executar']} "
                f"(esperado {intencao_esperada})"
            )
            fail += 1

    api = os.environ.get("TESTAR_RP_API", "1") != "0"
    if api:
        for texto in CASOS_ROTEADOR_OFFLINE:
            try:
                res = rotear_pergunta_rp(texto)
                if res.get("ok") and res.get("texto_formatado"):
                    print(f"OK router   {texto[:45]!r} action={res.get('action')}")
                    ok += 1
                elif res.get("texto_formatado"):
                    print(f"OK router   {texto[:45]!r} (msg: {res.get('texto_formatado')[:60]})")
                    ok += 1
                else:
                    print(f"FAIL router {texto[:45]!r} -> {res}")
                    fail += 1
            except Exception as exc:
                print(f"FAIL router {texto[:45]!r} EXC: {exc}")
                fail += 1
    else:
        print("(API desligada: TESTAR_RP_API=0)")

    print(f"\n{ok} ok, {fail} falhas")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
