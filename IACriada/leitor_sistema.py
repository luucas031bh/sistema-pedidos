"""Pesquisa tipo Ctrl+F — repo, ROANTONE, manifesto, WhatsApp e OneDrive."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import path_sistema_pedidos
from gerar_manifesto_sistema import carregar_manifesto

RE_CODIGO_ROANTONE = re.compile(r"\b([A-Z]{2}\d{3})\b", re.I)
RE_CLIENTE_COD = re.compile(
    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,25}?)\s*(\d{4})\b",
    re.UNICODE,
)

_CACHE_ROANTONE: dict | None = None


def _norm(texto: str) -> str:
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _tokens(consulta: str) -> list[str]:
    n = _norm(consulta)
    stop = {
        "como",
        "qual",
        "quais",
        "onde",
        "o",
        "a",
        "os",
        "as",
        "de",
        "do",
        "da",
        "em",
        "no",
        "na",
        "que",
        "e",
        "eh",
        "é",
        "um",
        "uma",
        "para",
        "por",
        "me",
        "fala",
        "diga",
        "explica",
        "sobre",
        "cor",
        "cores",
        "roantone",
        "sistema",
        "buscar",
        "procurar",
        "leitor",
    }
    partes = re.findall(r"[a-z0-9_./-]{2,}", n)
    out: list[str] = []
    for p in partes:
        if p not in stop and len(p) >= 2:
            out.append(p)
    for cod in RE_CODIGO_ROANTONE.findall(consulta or ""):
        out.append(cod.upper())
    return list(dict.fromkeys(out))[:24]


def _carregar_roantone() -> dict:
    global _CACHE_ROANTONE
    if _CACHE_ROANTONE is not None:
        return _CACHE_ROANTONE
    p = path_sistema_pedidos() / "ROANTONE" / "data" / "colors.json"
    if not p.is_file():
        _CACHE_ROANTONE = {}
        return _CACHE_ROANTONE
    try:
        _CACHE_ROANTONE = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        _CACHE_ROANTONE = {}
    return _CACHE_ROANTONE


def _formatar_cor_roantone(codigo: str, dados: dict) -> str:
    hexv = dados.get("hex") or "?"
    r, g, b = dados.get("r"), dados.get("g"), dados.get("b")
    linhas = [
        f"ROANTONE {codigo.upper()}: {hexv}",
    ]
    if r is not None and g is not None and b is not None:
        linhas.append(f"RGB: {r}, {g}, {b}")
    receita = dados.get("receita") or []
    if receita:
        linhas.append("Receita:")
        for item in receita:
            tinta = item.get("tinta") or "?"
            pct = item.get("pct")
            linhas.append(f"  - {tinta}: {pct}%")
    bases = dados.get("bases") or []
    if bases:
        linhas.append(f"Bases: {', '.join(bases)}")
    linhas.append("Fonte: ROANTONE/data/colors.json")
    return "\n".join(linhas)


def buscar_roantone(consulta: str) -> list[dict]:
    cores = _carregar_roantone()
    if not cores:
        return []
    achados: list[dict] = []
    codigos = [c.upper() for c in RE_CODIGO_ROANTONE.findall(consulta or "")]
    if not codigos:
        n = _norm(consulta)
        if "roantone" in n or "receita" in n or "tinta" in n:
            for tok in _tokens(consulta):
                if RE_CODIGO_ROANTONE.fullmatch(tok):
                    codigos.append(tok.upper())
    vistos: set[str] = set()
    for cod in codigos:
        if cod in vistos:
            continue
        vistos.add(cod)
        dados = cores.get(cod)
        if not dados:
            achados.append(
                {
                    "fonte": "roantone",
                    "caminho": "ROANTONE/data/colors.json",
                    "trecho": f"Codigo {cod} nao encontrado no catalogo ROANTONE.",
                    "relevancia": 0.3,
                    "codigo": cod,
                    "encontrado": False,
                }
            )
            continue
        achados.append(
            {
                "fonte": "roantone",
                "caminho": "ROANTONE/data/colors.json",
                "trecho": _formatar_cor_roantone(cod, dados),
                "relevancia": 1.0,
                "codigo": cod,
                "encontrado": True,
                "dados": dados,
            }
        )
    return achados


def buscar_repositorio(consulta: str, limite: int = 10) -> list[dict]:
    from consultar_sistema_pedidos import pesquisar_repositorio

    ctx = pesquisar_repositorio(consulta, limite=limite)
    if not ctx.get("ok"):
        return []
    achados: list[dict] = []
    for t in ctx.get("trechos_detalhe") or []:
        achados.append(
            {
                "fonte": "repositorio",
                "caminho": t.get("caminho") or "?",
                "trecho": (t.get("conteudo") or "")[:1200],
                "relevancia": 0.7,
            }
        )
    return achados


def buscar_manifesto(consulta: str) -> list[dict]:
    m = carregar_manifesto()
    if not m:
        return []
    n = _norm(consulta)
    achados: list[dict] = []

    for action in m.get("gas_actions") or []:
        if action.lower() in n or action.lower() in _tokens(consulta):
            achados.append(
                {
                    "fonte": "manifesto",
                    "caminho": "data/sistema_manifest.json",
                    "trecho": f"Apps Script action: {action}",
                    "relevancia": 0.85,
                }
            )

    for etapa in m.get("etapas_producao") or []:
        if _norm(etapa) in n:
            achados.append(
                {
                    "fonte": "manifesto",
                    "caminho": "data/sistema_manifest.json",
                    "trecho": f"Etapa de producao valida: {etapa}",
                    "relevancia": 0.8,
                }
            )

    for item in m.get("mapa_python_gas") or []:
        fn = item.get("funcao") or ""
        gas = item.get("gas") or ""
        if fn.lower() in n or (gas and gas.lower() in n):
            achados.append(
                {
                    "fonte": "manifesto",
                    "caminho": "data/sistema_manifest.json",
                    "trecho": f"Python {fn} → GAS {gas or '(local)'}: {item.get('descricao', '')}",
                    "relevancia": 0.82,
                }
            )

    if "roantone" in n:
        achados.append(
            {
                "fonte": "manifesto",
                "caminho": "ROANTONE/",
                "trecho": "ROANTONE 2025 — catalogo de cores em ROANTONE/data/colors.json (consulta offline).",
                "relevancia": 0.9,
            }
        )

    for mod, desc in (m.get("modulos_frontend") or {}).items():
        if _norm(mod) in n or any(t in _norm(desc) for t in _tokens(consulta)):
            achados.append(
                {
                    "fonte": "manifesto",
                    "caminho": f"sistema-pedidos/{mod}",
                    "trecho": f"Modulo frontend: {mod} — {desc}",
                    "relevancia": 0.88,
                }
            )

    if any(k in n for k in ("calculadora", "malha", "rendimento", "tubular", "ramada")):
        achados.append(
            {
                "fonte": "manifesto",
                "caminho": "CalculadoraMalha/index.html",
                "trecho": (
                    "Calculadora de Malha — campos: Largura (m), Tipo (ramada/tubular), "
                    "Rendimento (m/kg), Preco/kg. Usa tabela de pecas por lote por tamanho."
                ),
                "relevancia": 0.92,
            }
        )

    return achados[:8]


def buscar_whatsapp_texto(consulta: str, limite: int = 15) -> list[dict]:
    from observador_store import carregar_mensagens_whatsapp

    termos = _tokens(consulta)
    if not termos:
        return []
    desde = datetime.now(timezone.utc) - timedelta(days=30)
    msgs = carregar_mensagens_whatsapp(desde=desde, limite=500)
    achados: list[dict] = []
    for m in msgs:
        blob = _norm(f"{m.get('nome')} {m.get('telefone')} {m.get('texto')}")
        if not any(t in blob for t in termos):
            continue
        achados.append(
            {
                "fonte": "whatsapp",
                "caminho": "whatsapp_mensagens.jsonl",
                "trecho": (
                    f"{m.get('nome') or m.get('telefone')} [{m.get('ts')}]: "
                    f"{(m.get('texto') or '')[:200]}"
                ),
                "relevancia": 0.65,
            }
        )
        if len(achados) >= limite:
            break
    return achados


def buscar_onedrive(consulta: str, limite: int = 12) -> list[dict]:
    from indexador_onedrive import buscar, buscar_por_termo

    achados: list[dict] = []
    m = RE_CLIENTE_COD.search(consulta or "")
    if m:
        cliente, cod = m.group(1).strip().title(), m.group(2)
        for row in buscar(cliente, cod, limite=limite):
            achados.append(
                {
                    "fonte": "onedrive",
                    "caminho": row.get("caminho_completo") or "?",
                    "trecho": f"{row.get('nome_arquivo')} — cliente {row.get('cliente')} {row.get('ultimos_4_digitos')}",
                    "relevancia": 0.88,
                }
            )
        if achados:
            return achados

    for row in buscar_por_termo(consulta, limite=limite):
        achados.append(
            {
                "fonte": "onedrive",
                "caminho": row.get("caminho_completo") or "?",
                "trecho": row.get("nome_arquivo") or "?",
                "relevancia": 0.6,
            }
        )
    return achados


def pesquisar_sistema(
    consulta: str,
    *,
    fontes: list[str] | None = None,
    limite_por_fonte: int = 10,
) -> dict:
    """Busca em todas as fontes configuradas. Retorna achados ordenados por relevancia."""
    todas = fontes or ("roantone", "repositorio", "manifesto", "whatsapp", "onedrive")
    achados: list[dict] = []

    if "roantone" in todas:
        achados.extend(buscar_roantone(consulta))
    if "repositorio" in todas:
        achados.extend(buscar_repositorio(consulta, limite=limite_por_fonte))
    if "manifesto" in todas:
        achados.extend(buscar_manifesto(consulta))
    if "whatsapp" in todas:
        achados.extend(buscar_whatsapp_texto(consulta, limite=limite_por_fonte))
    if "onedrive" in todas:
        achados.extend(buscar_onedrive(consulta, limite=limite_por_fonte))

    achados.sort(key=lambda a: float(a.get("relevancia") or 0), reverse=True)

    return {
        "ok": True,
        "consulta": consulta,
        "achados": achados,
        "total": len(achados),
        "tokens": _tokens(consulta),
    }


def resposta_direta_roantone(consulta: str) -> str | None:
    """Resposta factual para codigo ROANTONE (sem LLM)."""
    achados = buscar_roantone(consulta)
    encontrados = [a for a in achados if a.get("encontrado")]
    if len(encontrados) == 1:
        return encontrados[0]["trecho"]
    if len(encontrados) > 1:
        return "\n\n".join(a["trecho"] for a in encontrados)
    return None


def formatar_achados(achados: list[dict], max_itens: int = 8) -> str:
    if not achados:
        return "Nenhum resultado encontrado no sistema (repo, ROANTONE, manifesto, WhatsApp, OneDrive)."
    linhas = [f"Encontrei {len(achados)} resultado(s):\n"]
    for i, a in enumerate(achados[:max_itens], 1):
        fonte = a.get("fonte") or "?"
        caminho = a.get("caminho") or "?"
        trecho = (a.get("trecho") or "").strip()
        linhas.append(f"--- [{i}] {fonte}: {caminho} ---")
        linhas.append(trecho)
        linhas.append("")
    if len(achados) > max_itens:
        linhas.append(f"(+ {len(achados) - max_itens} resultados omitidos)")
    return "\n".join(linhas).strip()


def parece_consulta_leitor(mensagem: str) -> bool:
    """Heuristica: pergunta de busca no sistema (Ctrl+F)."""
    n = _norm(mensagem)
    if RE_CODIGO_ROANTONE.search(mensagem or ""):
        return True
    if any(
        k in n
        for k in (
            "roantone",
            "qual cor",
            "que cor",
            "receita da cor",
            "receita de cor",
            "onde esta",
            "onde está",
            "onde fica",
            "buscar no sistema",
            "procurar no sistema",
            "ctrl+f",
            "leitor",
            "listarPedidos",
            "code.gs",
            "qual action",
            "qual acao",
            "apps script",
            "tinta",
            "catalogo de cor",
            "catálogo de cor",
        )
    ):
        return True
    if any(k in n for k in ("buscar", "procurar", "achar", "encontrar")) and any(
        k in n for k in ("arquivo", "pasta", "codigo", "código", "funcao", "função", "sistema", "cor")
    ):
        return True
    return False
