"""Treino/benchmark do ADNY — indexa codigo, gera manifesto, valida gabarito, salva memoria."""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

from config import PASTA, path_contexto_pasta, path_sistema_pedidos
from gerar_manifesto_sistema import carregar_manifesto, gerar_manifesto_sistema
from historico_db import listar_memoria_verificada, salvar_memoria_verificada
from indexador_sistema_pedidos import estatisticas_sistema_index, indexar_sistema_pedidos

BENCHMARK_PATH = PASTA / "benchmark_perguntas.json"


def _carregar_benchmark() -> list[dict]:
    if not BENCHMARK_PATH.is_file():
        raise FileNotFoundError(f"Benchmark nao encontrado: {BENCHMARK_PATH}")
    return json.loads(BENCHMARK_PATH.read_text(encoding="utf-8"))


def _get_nested(obj: dict, path: str):
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _chamar_funcao(modulo: str, funcao: str, kwargs: dict | None) -> dict:
    mod = importlib.import_module(modulo)
    fn = getattr(mod, funcao)
    return fn(**(kwargs or {}))


def _validar_item(item: dict, manifesto: dict) -> tuple[bool, str, str]:
    """Retorna (ok, resposta_esperada, resposta_obtida)."""
    tipo = item.get("tipo") or ""

    if tipo == "manifesto_contains":
        lista = manifesto.get(item.get("lista") or "") or []
        valor = item.get("valor") or ""
        ok = valor in lista
        return ok, valor, str(lista)

    if tipo == "manifesto_mapa_gas":
        funcao = item.get("funcao_python") or ""
        gas = item.get("gas")
        mapa = manifesto.get("mapa_python_gas") or []
        if "gas" in item:
            ok = any(m.get("funcao") == funcao and m.get("gas") == gas for m in mapa)
        else:
            ok = any(m.get("funcao") == funcao for m in mapa)
        return ok, f"{funcao} -> {gas}", str([m for m in mapa if m.get("funcao") == funcao])

    if tipo == "manifesto_rota_agente":
        rota = item.get("rota") or ""
        agente_esperado = item.get("agente") or ""
        rotas = manifesto.get("rotas_adny") or {}
        agente = (rotas.get(rota) or {}).get("agente")
        ok = agente == agente_esperado
        return ok, agente_esperado, str(agente)

    if tipo == "manifesto_campo":
        campo = item.get("campo") or ""
        contem = item.get("contem") or ""
        val = _get_nested(manifesto, campo) or ""
        ok = contem.lower() in str(val).lower()
        return ok, contem, str(val)

    if tipo == "rota":
        from orquestrador import _detectar_rota_heuristica

        pergunta = item.get("pergunta") or ""
        esperada = item.get("rota_esperada") or ""
        obtida = _detectar_rota_heuristica(pergunta).get("route") or ""
        return obtida == esperada, esperada, obtida

    if tipo == "rota_decidir":
        from orquestrador import decidir_rota

        pergunta = item.get("pergunta") or ""
        esperada = item.get("rota_esperada") or ""
        obtida = decidir_rota(pergunta).get("route") or ""
        return obtida == esperada, esperada, obtida

    if tipo == "termos_contem":
        mod = importlib.import_module(item.get("modulo") or "termos_manifesto")
        fn = getattr(mod, item.get("funcao") or "termos_fila_rp")
        manifesto_arg = manifesto if item.get("passar_manifesto") else None
        termos = fn(manifesto_arg) if manifesto_arg is not None else fn()
        valor = (item.get("valor") or "").lower()
        ok = valor in termos
        return ok, valor, str(len(termos))

    if tipo == "indice_min":
        stats = estatisticas_sistema_index()
        n = int(stats.get("arquivos") or 0)
        minimo = int(item.get("min_arquivos") or 1)
        ok = stats.get("indexado") and n >= minimo
        return ok, f">= {minimo} arquivos", f"{n} indexados"

    if tipo == "funcao_valor":
        try:
            resultado = _chamar_funcao(
                item.get("modulo") or "consultar_rp",
                item.get("funcao") or "",
                item.get("kwargs") or {},
            )
        except Exception as exc:
            return False, item.get("campo") or "ok", f"erro: {exc}"

        if not resultado.get("ok", True) and resultado.get("erro"):
            return False, "ok", str(resultado.get("erro"))

        campo = item.get("campo") or ""
        val = _get_nested(resultado, campo) if "." in campo else resultado.get(campo)
        tipo_val = item.get("tipo_valor") or "int_min"
        minimo = item.get("min", 0)

        if tipo_val == "int_min":
            try:
                ok = int(val) >= int(minimo)
            except (TypeError, ValueError):
                ok = False
            return ok, f">= {minimo}", str(val)

        if tipo_val == "float_min":
            try:
                ok = float(val) >= float(minimo)
            except (TypeError, ValueError):
                ok = False
            return ok, f">= {minimo}", str(val)

        return val is not None, str(campo), str(val)

    if tipo == "funcao_ok":
        try:
            resultado = _chamar_funcao(
                item.get("modulo") or "consultar_rp",
                item.get("funcao") or "",
                item.get("kwargs") or {},
            )
        except Exception as exc:
            return False, "sucesso", f"erro: {exc}"
        ok = bool(resultado.get("sucesso") or resultado.get("ok") or resultado.get("stats"))
        return ok, "sucesso", str(list(resultado.keys())[:6])

    if tipo == "arquivo_existe":
        rel = item.get("caminho_relativo") or ""
        p = path_contexto_pasta() / rel
        ok = p.is_file()
        return ok, rel, str(p)

    if tipo == "planejamento_fontes":
        pergunta = item.get("pergunta") or ""
        mod = importlib.import_module(item.get("modulo") or "agentes.investigador")
        fn = getattr(mod, item.get("funcao") or "_planejar_coleta")
        fontes = fn(pergunta)
        esperadas = item.get("fontes_contem") or []
        ok = all(f in fontes for f in esperadas)
        return ok, str(esperadas), str(fontes)

    if tipo == "leitor_contem":
        from leitor_sistema import resposta_direta_roantone

        pergunta = item.get("pergunta") or ""
        contem = item.get("contem") or ""
        obtida = resposta_direta_roantone(pergunta) or ""
        ok = contem.lower() in obtida.lower()
        return ok, contem, obtida[:120]

    if tipo == "wpp_parece":
        from wpp_leitor import parece_pergunta_whatsapp

        pergunta = item.get("pergunta") or ""
        esperado = bool(item.get("valor", True))
        obtido = parece_pergunta_whatsapp(pergunta)
        return obtido == esperado, str(esperado), str(obtido)

    if tipo == "wpp_sequencia_periodos":
        from wpp_leitor import PERIODO_24H, PERIODO_7D

        esperados = item.get("periodos") or ["24 horas", "7 dias"]
        obtidos = [PERIODO_24H[1], PERIODO_7D[1]]
        ok = obtidos[: len(esperados)] == esperados
        return ok, str(esperados), str(obtidos)

    if tipo == "rp_entidades":
        from rp_entidades import extrair_entidades_rp

        pergunta = item.get("pergunta") or ""
        campo = item.get("campo") or "cliente"
        ent = extrair_entidades_rp(pergunta)
        if "valor_bool" in item:
            esperado = bool(item.get("valor_bool"))
            obtido = bool(ent.get(campo))
            return obtido == esperado, str(esperado), str(obtido)
        esperado = (item.get("valor") or "").strip()
        obtido = str(ent.get(campo) or "").strip()
        ok = obtido.lower() == esperado.lower() or esperado.lower() in obtido.lower()
        return ok, esperado, obtido

    if tipo == "rp_deve_tamanhos_pedido":
        from rp_entidades import deve_buscar_tamanhos_pedido

        pergunta = item.get("pergunta") or ""
        esperado = bool(item.get("valor", True))
        obtido = deve_buscar_tamanhos_pedido(pergunta)
        return obtido == esperado, str(esperado), str(obtido)

    if tipo == "rp_formatador_contem":
        from rp_formatadores import format_tamanhos_pedido

        fixture = {
            "sucesso": True,
            "pedido": {
                "id": "TEST-1",
                "cliente": {"nome": "Cliente Teste", "telefone": "11999999999"},
                "statusOperacional": "Em produção",
                "totalPecas": 10,
                "produtos": [
                    {
                        "tipoPeca": "Camiseta",
                        "tipoMalha": "PV",
                        "corMalha": "Preta",
                        "tamanhos": [
                            {"tamanho": "P", "quantidade": 10},
                            {"tamanho": "M", "quantidade": 5},
                        ],
                    }
                ],
            },
        }
        texto = format_tamanhos_pedido(fixture)
        contem = item.get("contem") or ""
        ok = contem.lower() in texto.lower()
        return ok, contem, texto[:120]

    return False, "?", f"tipo desconhecido: {tipo}"


def preparar_sistema(*, reindexar: bool = True) -> dict:
    """Indexa repo + gera manifesto."""
    resultado: dict = {"indexacao": None, "manifesto": None}

    if reindexar:
        raiz = path_sistema_pedidos()
        if not raiz.is_dir():
            resultado["indexacao"] = {"erro": f"Pasta nao encontrada: {raiz}"}
        else:
            resultado["indexacao"] = indexar_sistema_pedidos()

    resultado["manifesto"] = gerar_manifesto_sistema()
    return resultado


def rodar_benchmark(*, apenas_obrigatorios: bool = False) -> dict:
    manifesto = carregar_manifesto() or gerar_manifesto_sistema()
    itens = _carregar_benchmark()

    resultados = []
    ok_count = 0
    fail_count = 0
    skip_count = 0

    for item in itens:
        bid = item.get("id") or "?"
        pergunta = item.get("pergunta") or bid
        obrigatorio = item.get("obrigatorio", True)

        if apenas_obrigatorios and not obrigatorio:
            skip_count += 1
            continue

        try:
            ok, esperada, obtida = _validar_item(item, manifesto)
        except Exception as exc:
            ok, esperada, obtida = False, "?", f"excecao: {exc}"

        if ok:
            ok_count += 1
            salvar_memoria_verificada(
                bid,
                pergunta,
                str(esperada),
                str(obtida),
                fonte=item.get("tipo") or "",
            )
        else:
            fail_count += 1

        resultados.append(
            {
                "id": bid,
                "pergunta": pergunta,
                "ok": ok,
                "obrigatorio": obrigatorio,
                "esperada": esperada,
                "obtida": obtida,
            }
        )

    total = ok_count + fail_count
    pct = round(100.0 * ok_count / total, 1) if total else 0.0
    obrig = [r for r in resultados if r.get("obrigatorio")]
    ok_obrig = sum(1 for r in obrig if r["ok"])
    pct_obrig = round(100.0 * ok_obrig / len(obrig), 1) if obrig else 0.0

    return {
        "total": total,
        "ok": ok_count,
        "fail": fail_count,
        "skip": skip_count,
        "percentual": pct,
        "percentual_obrigatorio": pct_obrig,
        "ok_obrigatorio": ok_obrig,
        "total_obrigatorio": len(obrig),
        "resultados": resultados,
    }


def treinar_ate_100(*, max_ciclos: int = 5, reindexar_sempre: bool = True) -> dict:
    historico_ciclos = []

    for ciclo in range(1, max_ciclos + 1):
        print(f"\n=== Ciclo {ciclo}/{max_ciclos} ===")
        prep = preparar_sistema(reindexar=reindexar_sempre)
        idx = prep.get("indexacao") or {}
        if idx.get("erro"):
            print(f"  AVISO indexacao: {idx['erro']}")
        elif idx.get("ok"):
            print(f"  Indexados: {idx.get('total_arquivos')} arquivos, {idx.get('total_chunks')} chunks")

        rel = rodar_benchmark()
        historico_ciclos.append({"ciclo": ciclo, **{k: rel[k] for k in rel if k != "resultados"}})

        print(f"  Obrigatorios: {rel['ok_obrigatorio']}/{rel['total_obrigatorio']} ({rel['percentual_obrigatorio']}%)")
        print(f"  Total: {rel['ok']}/{rel['total']} ({rel['percentual']}%)")

        for r in rel["resultados"]:
            if not r["ok"]:
                tag = "OBR" if r["obrigatorio"] else "opt"
                print(f"    FALHA [{tag}] {r['id']}: esperado={r['esperada']!r} obtido={r['obtida']!r}")

        if rel["percentual_obrigatorio"] >= 100.0:
            print("\n100% dos testes obrigatorios — memoria atualizada.")
            mem = listar_memoria_verificada(10)
            print(f"  Memoria verificada: {len(mem)} entradas salvas.")
            return {
                "sucesso": True,
                "ciclos": ciclo,
                "historico": historico_ciclos,
                "ultimo": rel,
                "memoria": mem,
            }

    print(f"\nNao atingiu 100% obrigatorio apos {max_ciclos} ciclos.")
    return {
        "sucesso": False,
        "ciclos": max_ciclos,
        "historico": historico_ciclos,
        "ultimo": rodar_benchmark(),
    }


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    cmd = (argv[0] if argv else "treinar").lower()

    if cmd in ("manifesto",):
        m = gerar_manifesto_sistema()
        print(json.dumps({"ok": True, "gas_actions": len(m.get("gas_actions") or [])}, ensure_ascii=False))
        return 0

    if cmd in ("benchmark", "teste"):
        rel = rodar_benchmark()
        print(json.dumps({k: rel[k] for k in rel if k != "resultados"}, ensure_ascii=False, indent=2))
        for r in rel["resultados"]:
            status = "OK" if r["ok"] else "FAIL"
            print(f"  [{status}] {r['id']}")
        return 0 if rel["percentual_obrigatorio"] >= 100 else 1

    if cmd in ("preparar", "indexar"):
        prep = preparar_sistema()
        print(json.dumps(prep, ensure_ascii=False, indent=2, default=str))
        return 0

    if cmd in ("memoria",):
        for m in listar_memoria_verificada():
            print(f"- {m['benchmark_id']}: {m['pergunta'][:60]} -> {m['resposta_esperada']}")
        return 0

    max_c = 5
    if len(argv) > 1 and argv[1].isdigit():
        max_c = int(argv[1])

    out = treinar_ate_100(max_ciclos=max_c)
    return 0 if out.get("sucesso") else 1


if __name__ == "__main__":
    raise SystemExit(main())
