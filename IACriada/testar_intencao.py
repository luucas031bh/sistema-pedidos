"""Testes de aceite Fase 1 - classificador de intencao."""

from intencao import classificar_intencao

CASOS = [
    ("quantas horas?", False, ("pergunta", "conversa")),
    ("obrigado", False, ("conversa",)),
    ("correta acao", False, ("conversa",)),
    ("abrir photoshop", True, ("abrir_programa",)),
    ("abrir corel", True, ("abrir_programa",)),
    ("abrir pasta do Victor 0032", True, ("abrir_pasta_cliente", "abrir_arquivo_cliente")),
    ("abrir CDR do Victor 0032", True, ("abrir_arquivo_cliente",)),
    (
        "me fala todos os pedidos que estao em status de ARTE",
        True,
        ("navegar_rp", "consultar_rp"),
    ),
    ("quais pedidos estao em arte no rp", True, ("navegar_rp", "consultar_rp")),
    (
        "faça relatorio dos pedidos em abertos que estao com insumos",
        True,
        ("navegar_rp",),
    ),
    ("resumo financeiro de todo o trabalho", True, ("navegar_rp",)),
    ("abrir fila do rp", True, ("abrir_pedido_rp",)),
]


def main():
    ok = 0
    fail = 0
    for texto, espera_exec, intencoes_ok in CASOS:
        r = classificar_intencao(texto)
        exec_ok = r["executar"] == espera_exec
        int_ok = r["intencao"] in intencoes_ok
        if exec_ok and int_ok:
            print(f"OK  {texto!r} -> {r['intencao']} exec={r['executar']}")
            ok += 1
        else:
            print(
                f"FAIL {texto!r} -> {r['intencao']} exec={r['executar']} "
                f"(esperado exec={espera_exec}, intencao in {intencoes_ok})"
            )
            fail += 1
    print(f"\n{ok} ok, {fail} falhas")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
