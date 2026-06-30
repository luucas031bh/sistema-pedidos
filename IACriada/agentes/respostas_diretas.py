"""Respostas factuais diretas — memoria, manifesto e RP sem depender da LLM."""

from __future__ import annotations

import re
import unicodedata

from consultar_rp import (
    contar_etapa_producao_rp,
    extrair_filtros_do_texto,
    listar_pedidos_rp,
    resumo_financeiro_rp,
)
from gerar_manifesto_sistema import carregar_manifesto
from historico_db import buscar_memoria_similar


def _norm(texto: str) -> str:
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _fmt_moeda(val: float) -> str:
    return f"R$ {float(val):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _ok(texto: str, fonte: str, extra_meta: dict | None = None) -> dict:
    meta = {"route": "resposta_direta", "agente": "respostas_diretas", "fonte": fonte}
    if extra_meta:
        meta.update(extra_meta)
    return {
        "resposta": texto,
        "modelo": "respostas_diretas",
        "passos": [{"agente": "respostas_diretas", "fonte": fonte}],
        "meta": meta,
    }


def _tentar_memoria_verificada(pergunta: str) -> dict | None:
    item = buscar_memoria_similar(pergunta, limiar=0.85)
    if not item:
        return None
    obtida = (item.get("resposta_obtida") or item.get("resposta_esperada") or "").strip()
    if not obtida or obtida.startswith("[") or obtida.startswith("{"):
        return None
    if item.get("fonte") in ("planejamento_fontes", "rota"):
        return None
    return _ok(
        obtida,
        "memoria",
        {"memoria_id": item.get("benchmark_id"), "similaridade": item.get("similaridade")},
    )


def _tentar_manifesto(pergunta: str) -> dict | None:
    m = carregar_manifesto()
    if not m:
        return None
    n = _norm(pergunta)

    if "qual action" in n or "qual acao" in n:
        if "lista pedido" in n or "listar pedido" in n:
            return _ok("A action do Apps Script que lista pedidos e: listarPedidos.", "manifesto")
        if "estatistica" in n or "stats" in n:
            return _ok("A action de estatisticas compactas e: getStats.", "manifesto")
        if "etapa" in n or "contar" in n:
            return _ok("A action de contagem por etapa e: contarPorEtapaProducao.", "manifesto")

    if "qual agente" in n or "qual rota" in n:
        rotas = m.get("rotas_adny") or {}
        if "whatsapp" in n or "wpp" in n:
            info = rotas.get("consultar_mensagens_whatsapp") or {}
            return _ok(
                f"Consultas WhatsApp: rota consultar_mensagens_whatsapp → agente {info.get('agente')}.",
                "manifesto",
            )
        if "fila" in n or " rp" in f" {n}" or n.startswith("rp "):
            info = rotas.get("consultar_fila_rp") or {}
            return _ok(f"Consultas da fila RP: rota consultar_fila_rp → agente {info.get('agente')}.", "manifesto")
        if "resumo" in n or "geral" in n:
            info = rotas.get("investigar_sistema") or {}
            return _ok(f"Perguntas genericas: rota investigar_sistema → agente {info.get('agente')}.", "manifesto")

    if "de onde vem" in n or "fonte dos dados" in n:
        fontes = m.get("fontes_dados_vivos") or {}
        if "whatsapp" in n or "wpp" in n:
            return _ok(str(fontes.get("whatsapp") or "Log local whatsapp_mensagens.jsonl."), "manifesto")
        if "rp" in n or "pedido" in n:
            return _ok(str(fontes.get("rp") or "Apps Script via consultar_rp."), "manifesto")

    return None


def _eh_relatorio_aberto(pergunta: str) -> bool:
    n = _norm(pergunta)
    return any(k in n for k in ("relatorio", "relatório", "resumo geral", "panorama", "detalh"))


def _tentar_rp_numerico(pergunta: str) -> dict | None:
    if _eh_relatorio_aberto(pergunta):
        return None

    n = _norm(pergunta)
    filtros = extrair_filtros_do_texto(pergunta)
    etapa = filtros.get("etapa_producao")

    if any(k in n for k in ("total a receber", "quanto tenho a receber", "valor a receber", "a receber")):
        if any(k in n for k in ("relatorio", "relatório", "detalh")):
            return None
        try:
            r = resumo_financeiro_rp()
            if not r.get("ok"):
                return _ok(f"Nao consegui consultar o RP: {r.get('erro')}", "rp_erro")
            val = (r.get("totais") or {}).get("valor_a_receber") or 0
            return _ok(f"Total a receber nos pedidos abertos: {_fmt_moeda(val)}.", "rp_financeiro")
        except Exception as exc:
            return _ok(f"Erro ao consultar financeiro RP: {exc}", "rp_erro")

    if etapa and any(k in n for k in ("quantos", "quantas", "numero", "número", "clientes", "pedidos")):
        try:
            r = contar_etapa_producao_rp(etapa)
            total = int(r.get("total") or 0)
            return _ok(f"{total} pedido(s) na etapa {etapa}.", "rp_etapa")
        except Exception as exc:
            return _ok(f"Erro ao contar etapa {etapa}: {exc}", "rp_erro")

    if any(k in n for k in ("quantos pedidos em aberto", "quantas pedidos em aberto", "total de pedidos abertos")):
        try:
            r = listar_pedidos_rp(apenas_abertos=True)
            if not r.get("ok"):
                return _ok(f"Nao consegui listar pedidos: {r.get('erro')}", "rp_erro")
            total = int(r.get("total") or 0)
            return _ok(f"{total} pedido(s) em aberto no RP.", "rp_total")
        except Exception as exc:
            return _ok(f"Erro ao listar pedidos: {exc}", "rp_erro")

    return None


def _tentar_leitor(pergunta: str) -> dict | None:
    from leitor_sistema import resposta_direta_roantone

    direta = resposta_direta_roantone(pergunta)
    if direta:
        return _ok(direta, "leitor_roantone", {"route": "pesquisar_sistema"})
    return None


def tentar_resposta_direta(pergunta: str) -> dict | None:
    """Retorna resposta factual ou None para continuar roteamento normal."""
    for fn in (_tentar_leitor, _tentar_rp_numerico, _tentar_manifesto, _tentar_memoria_verificada):
        out = fn(pergunta)
        if out:
            return out
    return None
