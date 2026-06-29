"""Agente Observador — eventos WhatsApp e refresh RP."""

from __future__ import annotations

import json
import re
import urllib.error

from config import cfg_observador
from observador_store import (
    append_evento,
    atualizar_conversa_snapshot,
    carregar_todas_metas_clientes,
    escrever_snapshot,
    horas_desde,
    ler_snapshot,
    merge_fila_rp,
    salvar_mensagem_cliente,
    snapshot_vazio,
)

_TERMOS_ORCAMENTO = (
    "orcamento",
    "orçamento",
    "preco",
    "preço",
    "cotacao",
    "cotação",
    "camisa",
    "camiseta",
    "moletom",
    "malha",
    "estampa",
    "silk",
    "gola",
    "quantidade",
    "peca",
    "peça",
)


def _classificar_heuristica(texto: str) -> dict:
    n = (texto or "").lower()
    n = re.sub(r"[^\w\s]", " ", n)
    if any(t in n for t in _TERMOS_ORCAMENTO):
        return {"intencao": "orcamento", "resumo": texto[:200], "entidades": {}}
    if "?" in texto or any(
        k in n for k in ("duvida", "dúvida", "como", "quando", "onde", "qual")
    ):
        return {"intencao": "duvida", "resumo": texto[:200], "entidades": {}}
    if any(k in n for k in ("pedido", "status", "entrega", "prazo")):
        return {"intencao": "status_pedido", "resumo": texto[:200], "entidades": {}}
    return {"intencao": "outro", "resumo": texto[:200], "entidades": {}}


def classificar_texto_llm(texto: str, modelo: str | None = None) -> dict:
    cfg = cfg_observador()
    if not cfg.get("classificar_llm", True):
        return _classificar_heuristica(texto)

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        return _classificar_heuristica(texto)

    prompt = (
        "Classifique a mensagem de cliente de confeccao. "
        'Responda SOMENTE JSON: {"intencao":"orcamento|duvida|status_pedido|outro",'
        '"resumo":"...", "entidades":{}}\n\n'
        f"Mensagem: {texto}"
    )
    try:
        dados = _request_ollama(
            {
                "model": nome,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=60,
        )
        bruto = dados.get("message", {}).get("content", "").strip()
        m = re.search(r"\{[\s\S]*\}", bruto)
        if m:
            obj = json.loads(m.group(0))
            if obj.get("intencao"):
                return obj
    except (urllib.error.URLError, json.JSONDecodeError, ConnectionError):
        pass
    return _classificar_heuristica(texto)


def registrar_whatsapp_evento(
    telefone: str,
    texto: str,
    timestamp: str | None = None,
    nome: str | None = None,
    *,
    classificar: bool = True,
) -> dict:
    salvar_mensagem_cliente(telefone, texto, timestamp=timestamp, nome=nome)
    append_evento(
        "whatsapp_in",
        {"telefone": telefone, "texto": texto[:300], "nome": nome or ""},
    )

    clf = classificar_texto_llm(texto) if classificar else _classificar_heuristica(texto)
    ts = timestamp or ""
    horas = horas_desde(ts)

    conversa = {
        "telefone": re.sub(r"\D", "", telefone or ""),
        "nome": nome or "",
        "ultima_msg": texto[:500],
        "ultima_msg_em": ts,
        "sem_resposta_horas": round(horas, 1),
        "intencao": clf.get("intencao", "outro"),
        "resumo": clf.get("resumo", texto[:200]),
        "relevante": True,
    }
    atualizar_conversa_snapshot(conversa)
    return {"ok": True, "conversa": conversa, "classificacao": clf}


def refresh_snapshot_rp() -> dict:
    from consultar_rp import listar_pedidos_rp, pedido_esta_aberto

    snap = ler_snapshot()
    erro = None
    total = 0
    por_etapa: dict[str, int] = {}

    try:
        r = listar_pedidos_rp(apenas_abertos=True, limite=0)
        if not r.get("ok"):
            erro = r.get("erro") or "Erro ao listar pedidos"
        else:
            pedidos = r.get("pedidos_raw") or []
            abertos = [p for p in pedidos if pedido_esta_aberto(p)]
            total = len(abertos)
            for p in abertos:
                etapa = str(p.get("etapaProducaoAtual") or "Sem etapa")
                por_etapa[etapa] = por_etapa.get(etapa, 0) + 1
    except Exception as exc:
        erro = str(exc)

    fila = {"total_abertos": total, "por_etapa": por_etapa, "erro": erro}
    snap = merge_fila_rp(snap, fila)
    escrever_snapshot(snap)
    append_evento("snapshot_rp", {"total_abertos": total, "erro": erro})
    return {"ok": erro is None, "fila_rp": fila, "snapshot": snap}


def rebuild_snapshot_completo() -> dict:
    snap = snapshot_vazio()
    fila_res = refresh_snapshot_rp()
    snap = fila_res.get("snapshot") or ler_snapshot()

    conversas = []
    for meta in carregar_todas_metas_clientes():
        tel = meta.get("telefone") or ""
        if not tel:
            continue
        horas = horas_desde(meta.get("ultima_msg_em"))
        conversas.append(
            {
                "telefone": tel,
                "nome": meta.get("nome") or "",
                "ultima_msg": meta.get("ultima_msg") or "",
                "ultima_msg_em": meta.get("ultima_msg_em") or "",
                "sem_resposta_horas": round(horas, 1),
                "intencao": meta.get("intencao") or "outro",
                "resumo": meta.get("resumo") or meta.get("ultima_msg") or "",
                "relevante": True,
            }
        )

    snap.setdefault("whatsapp", {})["conversas_ativas"] = conversas
    from observador_store import _recalcular_metricas

    _recalcular_metricas(snap)
    escrever_snapshot(snap)
    return snap


def status_observador() -> dict:
    snap = ler_snapshot()
    conversas = snap.get("whatsapp", {}).get("conversas_ativas") or []
    return {
        "atualizado_em": snap.get("atualizado_em"),
        "conversas_ativas": len(conversas),
        "metricas": snap.get("metricas") or {},
        "fila_rp": snap.get("fila_rp") or {},
    }
