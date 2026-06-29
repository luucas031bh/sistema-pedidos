"""Consultor WhatsApp — busca mensagens reais capturadas pelo observador."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from observador import status_observador
from observador_store import carregar_mensagens_whatsapp, contar_mensagens_whatsapp


def _parse_periodo(pergunta: str) -> timedelta:
    n = (pergunta or "").lower()
    m = re.search(
        r"(?:ultim(?:os|as)?|nos?\s+ultim(?:os|as)?)\s+(\d+)\s*(minut|hora|dia|semana)",
        n,
    )
    if m:
        qtd = int(m.group(1))
        un = m.group(2)
        if un.startswith("minut"):
            return timedelta(minutes=qtd)
        if un.startswith("hora"):
            return timedelta(hours=qtd)
        if un.startswith("dia"):
            return timedelta(days=qtd)
        if un.startswith("semana"):
            return timedelta(weeks=qtd)
    if "minut" in n:
        return timedelta(minutes=60)
    if "hora" in n:
        return timedelta(hours=24)
    if "dia" in n or "semana" in n:
        return timedelta(days=7)
    return timedelta(hours=24)


def _parse_sufixo_telefone(pergunta: str) -> str | None:
    n = pergunta or ""
    m = re.search(r"final\s+(?:do\s+)?(?:telefone\s+)?(?:n[uú]mero\s+)?(\d{4,})", n, re.I)
    if m:
        return m.group(1)[-4:]
    m = re.search(r"(\d{4})\s*(?:$|[^\d])", n)
    if m and any(k in n.lower() for k in ("telefone", "numero", "número", "final", "cliente")):
        return m.group(1)
    return None


def _pede_orcamento_ou_preco(pergunta: str) -> bool:
    n = (pergunta or "").lower()
    return any(
        k in n
        for k in (
            "orcamento",
            "orçamento",
            "cotacao",
            "cotação",
            "preco",
            "preço",
            "valor",
            "quanto custa",
            "solicitou",
            "pediu",
            "pedindo",
        )
    )


def _formatar_mensagem(m: dict, idx: int | None = None) -> str:
    tel = m.get("telefone") or "?"
    nome = (m.get("nome") or "").strip()
    rotulo = f"{nome} ({tel})" if nome else tel
    ts = m.get("ts") or "?"
    intent = m.get("intencao") or "outro"
    texto = (m.get("texto") or "").strip()
    prefix = f"{idx}. " if idx is not None else ""
    return f"{prefix}{rotulo} [{intent}] {ts}\n   \"{texto[:300]}\""


def _periodo_label(td: timedelta) -> str:
    s = int(td.total_seconds())
    if s < 3600:
        m = max(1, s // 60)
        return f"{m} minuto(s)"
    if s < 86400:
        h = max(1, s // 3600)
        return f"{h} hora(s)"
    d = max(1, s // 86400)
    return f"{d} dia(s)"


def _formatar_resposta(
    mensagens: list[dict],
    pergunta: str,
    periodo: timedelta,
    status: dict,
    filtro_comercial: bool,
) -> str:
    total_periodo = contar_mensagens_whatsapp(
        desde=datetime.now(timezone.utc) - periodo
    )
    stats = status.get("observador_stats") or {}
    conectado = status.get("whatsapp_conectado")
    nome_conta = (status.get("whatsapp_nome") or "").strip()

    cab = []
    if conectado:
        cab.append(f"WhatsApp conectado{f' ({nome_conta})' if nome_conta else ''}.")
    else:
        cab.append("WhatsApp desconectado — so ha mensagens capturadas desde a ultima conexao.")
    cab.append(
        f"Periodo: ultimos {_periodo_label(periodo)} "
        f"({total_periodo} msg no log, {len(mensagens)} apos filtros)."
    )
    if filtro_comercial:
        cab.append("Filtro: orcamento ou preco.")

    if not mensagens:
        cab.append(
            "Nenhuma mensagem encontrada com esses criterios. "
            "Mensagens so entram no log depois que o bot esta conectado."
        )
        return "\n".join(cab)

    linhas = ["\n".join(cab), ""]
    vistos: set[str] = set()
    for i, m in enumerate(mensagens, 1):
        linhas.append(_formatar_mensagem(m, i))
        vistos.add(m.get("telefone") or "")

    if filtro_comercial:
        linhas.append(f"\nTotal: {len(mensagens)} mensagem(ns) comerciais de {len(vistos)} cliente(s).")
    else:
        linhas.append(f"\nTotal: {len(mensagens)} mensagem(ns) de {len(vistos)} cliente(s).")
    return "\n".join(linhas)


def executar(pergunta: str, params: dict | None = None, modelo: str | None = None) -> dict:
    params = params or {}
    periodo = _parse_periodo(params.get("periodo") or pergunta)
    sufixo = params.get("telefone_sufixo") or _parse_sufixo_telefone(pergunta)
    filtro_comercial = params.get("filtro") in ("orcamento", "preco", "comercial") or _pede_orcamento_ou_preco(
        pergunta
    )

    intencoes = None
    if filtro_comercial:
        intencoes = ["orcamento", "preco"]

    desde = datetime.now(timezone.utc) - periodo
    mensagens = carregar_mensagens_whatsapp(
        desde=desde,
        telefone_sufixo=sufixo,
        intencoes=intencoes,
        limite=int(params.get("limite") or 50),
    )

    status = status_observador()
    resposta = _formatar_resposta(mensagens, pergunta, periodo, status, filtro_comercial)

    return {
        "resposta": resposta,
        "modelo": "consultor_whatsapp",
        "passos": [
            {
                "agente": "consultor_whatsapp",
                "mensagens": len(mensagens),
                "periodo_horas": round(periodo.total_seconds() / 3600, 2),
            }
        ],
        "meta": {
            "route": "consultar_mensagens_whatsapp",
            "agente": "consultor_whatsapp",
            "mensagens": len(mensagens),
            "filtro_comercial": filtro_comercial,
            "telefone_sufixo": sufixo,
        },
    }
