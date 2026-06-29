"""Persistencia snapshot pedidos.json, historico e memoria por cliente."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from config import (
    path_clientes_memoria,
    path_contexto_pasta,
    path_historico_interacoes,
    path_pedidos_json,
)


def _iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _norm_tel(telefone: str) -> str:
    return re.sub(r"\D", "", telefone or "") or "desconhecido"


def snapshot_vazio() -> dict:
    return {
        "atualizado_em": _iso_now(),
        "fila_rp": {"total_abertos": 0, "por_etapa": {}, "erro": None},
        "whatsapp": {"conversas_ativas": []},
        "metricas": {"orcamentos_pendentes": 0, "sem_resposta_24h": 0},
    }


def ler_snapshot() -> dict:
    p = path_pedidos_json()
    if not p.is_file():
        return snapshot_vazio()
    try:
        dados = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(dados, dict):
            return dados
    except (json.JSONDecodeError, OSError):
        pass
    return snapshot_vazio()


def escrever_snapshot(dados: dict) -> None:
    path_contexto_pasta()
    dest = path_pedidos_json()
    tmp = dest.with_suffix(".json.tmp")
    payload = dict(dados)
    payload["atualizado_em"] = _iso_now()
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(dest)


def append_evento(tipo: str, payload: dict | None = None) -> None:
    path_contexto_pasta()
    linha = {
        "ts": _iso_now(),
        "tipo": tipo,
        "payload": payload or {},
    }
    with open(path_historico_interacoes(), "a", encoding="utf-8") as f:
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")


def _pasta_cliente(telefone: str) -> Path:
    tel = _norm_tel(telefone)
    p = path_clientes_memoria() / tel
    p.mkdir(parents=True, exist_ok=True)
    return p


def salvar_mensagem_cliente(
    telefone: str,
    texto: str,
    *,
    timestamp: str | None = None,
    nome: str | None = None,
    origem: str = "cliente",
) -> None:
    pasta = _pasta_cliente(telefone)
    ts = timestamp or _iso_now()
    msg = {
        "ts": ts,
        "origem": origem,
        "texto": texto,
    }
    with open(pasta / "mensagens.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    meta_path = pasta / "meta.json"
    meta = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
    meta.update(
        {
            "telefone": _norm_tel(telefone),
            "nome": nome or meta.get("nome") or "",
            "ultima_msg": texto[:500],
            "ultima_msg_em": ts,
            "atualizado_em": _iso_now(),
        }
    )
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def ler_meta_cliente(telefone: str) -> dict:
    meta_path = _pasta_cliente(telefone) / "meta.json"
    if not meta_path.is_file():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def listar_conversas_ativas() -> list[dict]:
    snap = ler_snapshot()
    return list(snap.get("whatsapp", {}).get("conversas_ativas") or [])


def atualizar_conversa_snapshot(conversa: dict) -> None:
    snap = ler_snapshot()
    conversas = snap.setdefault("whatsapp", {}).setdefault("conversas_ativas", [])
    tel = _norm_tel(conversa.get("telefone", ""))
    idx = next(
        (i for i, c in enumerate(conversas) if _norm_tel(c.get("telefone", "")) == tel),
        None,
    )
    if idx is not None:
        conversas[idx] = {**conversas[idx], **conversa}
    else:
        conversas.append(conversa)
    _recalcular_metricas(snap)
    escrever_snapshot(snap)


def _recalcular_metricas(snap: dict) -> None:
    conversas = snap.get("whatsapp", {}).get("conversas_ativas") or []
    orc = sum(1 for c in conversas if c.get("intencao") == "orcamento")
    sem_24h = sum(
        1
        for c in conversas
        if (c.get("sem_resposta_horas") or 0) >= 24
    )
    snap["metricas"] = {
        "orcamentos_pendentes": orc,
        "sem_resposta_24h": sem_24h,
    }


def merge_fila_rp(snap: dict, fila: dict) -> dict:
    snap = dict(snap)
    snap["fila_rp"] = fila
    _recalcular_metricas(snap)
    return snap


def carregar_todas_metas_clientes() -> list[dict]:
    raiz = path_clientes_memoria()
    if not raiz.is_dir():
        return []
    out = []
    for pasta in raiz.iterdir():
        if not pasta.is_dir():
            continue
        meta_path = pasta / "meta.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            out.append(meta)
        except (json.JSONDecodeError, OSError):
            continue
    return out


def horas_desde(iso_ts: str | None) -> float:
    if not iso_ts:
        return 0.0
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        return max(0.0, delta.total_seconds() / 3600.0)
    except (ValueError, TypeError):
        return 0.0


def telefone_valido(telefone: str) -> bool:
    """Telefone real: so digitos, minimo 10 (sem inventar placeholders)."""
    tel = _norm_tel(telefone)
    if tel == "desconhecido" or len(tel) < 10:
        return False
    return True


def limpar_conversas_whatsapp_snapshot() -> dict:
    """Remove conversas WhatsApp do snapshot; mantem fila RP."""
    snap = ler_snapshot()
    snap.setdefault("whatsapp", {})["conversas_ativas"] = []
    _recalcular_metricas(snap)
    escrever_snapshot(snap)
    return snap
