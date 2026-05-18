"""Testes da camada de interpretacao natural (intencoes.py)."""

from intencao import classificar_intencao
from intencoes import normalizar_texto, resolver_status

CASOS = [
    ("quantas horas?", False, "pergunta", None),
    ("obrigado", False, "conversa", None),
    ("abrir photoshop", True, "abrir_programa", None),
    ("buscar pedidos em insumo", True, "buscar_pedidos_status", "INSUMOS"),
    ("buscar pedidos em insumos", True, "buscar_pedidos_status", "INSUMOS"),
    ("pedidos esperando material", True, "buscar_pedidos_status", "INSUMOS"),
    ("me mostra os que estao em arte", True, "buscar_pedidos_status", "PROD ARTE"),
    ("listar pedidos em orcamento", True, "buscar_pedidos_status", "ORÇAMENTO"),
    ("quais estao faltando material?", True, "buscar_pedidos_status", "INSUMOS"),
    ("me ve os pedidos em corte", True, "buscar_pedidos_status", "CORTE"),
]


def test_resolver_status():
    ok = 0
    for entrada, esperado in [
        ("INSUMOS", "INSUMOS"),
        ("insumo", "INSUMOS"),
        ("esperando insumo", "INSUMOS"),
        ("faltando material", "INSUMOS"),
        ("prod arte", "PROD ARTE"),
        ("orcamento", "ORÇAMENTO"),
        ("sublimacao", "SUBLIMAÇÃO"),
    ]:
        got = resolver_status(entrada)
        if got == esperado:
            ok += 1
            print(f"OK  resolver_status({entrada!r}) -> {got}")
        else:
            print(f"FAIL resolver_status({entrada!r}) -> {got} (esperado {esperado})")
    return ok


def test_detectar():
    ok = 0
    fail = 0
    for texto, espera_exec, intencao, status in CASOS:
        r = classificar_intencao(texto)
        det = r.get("intencao_detalhada") or r["intencao"]
        exec_ok = r["executar"] == espera_exec
        int_ok = det == intencao or r["intencao"] == intencao
        st = r.get("params", {}).get("status_rp")
        st_ok = status is None or st == status
        if exec_ok and int_ok and st_ok:
            print(
                f"OK  {texto!r} -> {det} exec={r['executar']} status={st}"
            )
            ok += 1
        else:
            print(
                f"FAIL {texto!r} -> {det} exec={r['executar']} status={st} "
                f"(esperado exec={espera_exec}, int={intencao}, status={status})"
            )
            fail += 1
    return ok, fail


def test_repetir_contexto():
    hist = [
        {"role": "user", "content": "buscar pedidos em insumo"},
        {"role": "assistant", "content": "lista..."},
    ]
    r = classificar_intencao("faz o mesmo mas com corte", historico=hist)
    det = r.get("intencao_detalhada")
    st = r.get("params", {}).get("status_rp")
    ok = (
        r["executar"]
        and det == "buscar_pedidos_status"
        and st == "CORTE"
    )
    print(
        f"{'OK' if ok else 'FAIL'} repetir contexto -> {det} status={st} "
        f"repetiu={r.get('repetiu_contexto')}"
    )
    return 1 if ok else 0


def main():
    print("=== normalizar_texto ===")
    print(repr(normalizar_texto("  INSUMOS  ")))
    print()
    print("=== resolver_status ===")
    rs = test_resolver_status()
    print()
    print("=== detectar_intencao_basica ===")
    ok, fail = test_detectar()
    print()
    print("=== contexto historico ===")
    rep = test_repetir_contexto()
    total_fail = fail + (0 if rep else 1)
    print(f"\n{ok + rs + rep} ok, {total_fail} falhas")
    return 0 if total_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
