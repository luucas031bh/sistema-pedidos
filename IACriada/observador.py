"""Agente Observador — eventos WhatsApp e refresh RP."""

from __future__ import annotations

import json
import re
import urllib.error

from config import cfg_observador
from observador_store import (
    append_evento,
    append_mensagem_global,
    atualizar_conversa_snapshot,
    carregar_todas_metas_clientes,
    escrever_snapshot,
    horas_desde,
    ler_snapshot,
    merge_fila_rp,
    salvar_mensagem_cliente,
    snapshot_vazio,
    telefone_valido,
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


_TERMOS_PRECO = (
    "preco",
    "preço",
    "valor",
    "quanto custa",
    "quanto fica",
    "quanto sai",
    "tabela",
    "custa",
)


def classificar_intencao_mensagem(texto: str) -> str:
    """Classificacao rapida para indexacao (sem inventar dados)."""
    n = (texto or "").lower()
    n = re.sub(r"[^\w\s]", " ", n)
    if any(t in n for t in _TERMOS_ORCAMENTO):
        return "orcamento"
    if any(t in n for t in _TERMOS_PRECO):
        return "preco"
    if "?" in (texto or "") or any(
        k in n for k in ("duvida", "dúvida", "como", "quando", "onde", "qual")
    ):
        return "duvida"
    if any(k in n for k in ("pedido", "status", "entrega", "prazo")):
        return "status_pedido"
    return "outro"


def _classificar_heuristica(texto: str) -> dict:
    intent = classificar_intencao_mensagem(texto)
    return {"intencao": intent, "resumo": texto[:200], "entidades": {}}


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
    if not telefone_valido(telefone):
        return {"ok": False, "erro": "telefone_invalido"}
    if not (texto or "").strip():
        return {"ok": False, "erro": "texto_vazio"}

    salvar_mensagem_cliente(telefone, texto, timestamp=timestamp, nome=nome)
    clf = classificar_texto_llm(texto) if classificar else _classificar_heuristica(texto)
    intencao = clf.get("intencao") or classificar_intencao_mensagem(texto)
    append_mensagem_global(
        telefone,
        texto,
        timestamp=timestamp,
        nome=nome,
        intencao=intencao,
    )
    append_evento(
        "whatsapp_in",
        {"telefone": telefone, "texto": texto[:300], "nome": nome or "", "intencao": intencao},
    )

    ts = timestamp or ""
    horas = horas_desde(ts)
    resumo_real = (texto or "").strip()[:200]

    conversa = {
        "telefone": re.sub(r"\D", "", telefone or ""),
        "nome": (nome or "").strip(),
        "ultima_msg": texto[:500],
        "ultima_msg_em": ts,
        "sem_resposta_horas": round(horas, 1),
        "intencao": intencao,
        "resumo": resumo_real,
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
                "resumo": (meta.get("ultima_msg") or "")[:200],
                "relevante": True,
            }
        )

    snap.setdefault("whatsapp", {})["conversas_ativas"] = conversas
    from observador_store import _recalcular_metricas

    _recalcular_metricas(snap)
    escrever_snapshot(snap)
    return snap


def status_observador() -> dict:
    from config import PASTA, cfg_whatsapp_modo
    from datetime import datetime, timezone
    from observador_store import contar_mensagens_whatsapp

    snap = ler_snapshot()
    conversas = snap.get("whatsapp", {}).get("conversas_ativas") or []

    bot_status: dict = {}
    status_path = PASTA / "whatsapp-bot" / "connection_status.json"
    if status_path.is_file():
        try:
            bot_status = json.loads(status_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            bot_status = {}

    stats: dict = {}
    stats_path = PASTA / "whatsapp-bot" / "observador_stats.json"
    if stats_path.is_file():
        try:
            stats = json.loads(stats_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            stats = {}

    qr_path = PASTA / "whatsapp-qr.png"
    conexao = bot_status.get("connection") or "desconhecido"

    def _recente(iso_ts: str | None, segundos: float = 90) -> bool:
        if not iso_ts:
            return False
        try:
            dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            delta = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
            return delta.total_seconds() <= segundos
        except (ValueError, TypeError):
            return False

    try:
        import servicos_launcher as svc

        bot_rodando = svc.whatsapp_rodando()
    except Exception:
        bot_rodando = False

    tem_bot = bool(bot_status.get("bot"))
    whatsapp_conectado = conexao == "open" or (
        bot_rodando
        and tem_bot
        and not bot_status.get("logged_out")
        and conexao in ("open", "reconnecting")
        and _recente(
            bot_status.get("ultima_conexao_em")
            or bot_status.get("atualizado_em"),
            120,
        )
    )

    return {
        "atualizado_em": snap.get("atualizado_em"),
        "conversas_ativas": len(conversas),
        "metricas": snap.get("metricas") or {},
        "fila_rp": snap.get("fila_rp") or {},
        "whatsapp_modo": cfg_whatsapp_modo(),
        "whatsapp_bot_rodando": bot_rodando,
        "whatsapp_conectado": whatsapp_conectado,
        "whatsapp_aguardando_qr": qr_path.is_file() or conexao == "qr",
        "whatsapp_bot": bot_status.get("bot") or None,
        "whatsapp_nome": bot_status.get("nome") or "",
        "whatsapp_connection": conexao,
        "mensagens_no_log": contar_mensagens_whatsapp(),
        "observador_stats": {
            "dms_recebidas": stats.get("dms_recebidas", 0),
            "dms_ignoradas": stats.get("dms_ignoradas", 0),
            "dms_encaminhadas": stats.get("dms_encaminhadas", 0),
            "dms_falha_envio": stats.get("dms_falha_envio", 0),
            "ultima_dm_em": stats.get("ultima_dm_em"),
            "ultima_encaminhada_em": stats.get("ultima_encaminhada_em"),
        },
    }
