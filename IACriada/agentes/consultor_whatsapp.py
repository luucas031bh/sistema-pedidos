"""Consultor WhatsApp — busca mensagens reais capturadas pelo observador."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from historico_db import salvar_ultimo_resultado
from observador import status_observador
from observador_store import carregar_mensagens_whatsapp, contar_mensagens_whatsapp

_TZ_BR = ZoneInfo("America/Sao_Paulo")


def _inicio_hoje_utc() -> datetime:
    agora = datetime.now(_TZ_BR)
    inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio.astimezone(timezone.utc)


def _pergunta_pediu_hoje(pergunta: str) -> bool:
    return "hoje" in (pergunta or "").lower()


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


def _parse_periodo(pergunta: str) -> tuple[datetime | None, timedelta, str]:
    """Retorna (desde_fixo, fallback_delta, rotulo). desde_fixo tem prioridade."""
    n = (pergunta or "").lower()
    if "hoje" in n:
        return _inicio_hoje_utc(), timedelta(hours=24), "hoje"

    m = re.search(
        r"(?:ultim(?:os|as)?|nos?\s+ultim(?:os|as)?)\s+(\d+)\s*(minut|hora|dia|semana)",
        n,
    )
    if m:
        qtd = int(m.group(1))
        un = m.group(2)
        if un.startswith("minut"):
            td = timedelta(minutes=qtd)
        elif un.startswith("hora"):
            td = timedelta(hours=qtd)
        elif un.startswith("dia"):
            td = timedelta(days=qtd)
        else:
            td = timedelta(weeks=qtd)
        return None, td, _periodo_label(td)

    if "minut" in n:
        td = timedelta(minutes=60)
        return None, td, _periodo_label(td)
    if "hora" in n:
        td = timedelta(hours=24)
        return None, td, _periodo_label(td)
    if "dia" in n or "semana" in n:
        td = timedelta(days=7)
        return None, td, _periodo_label(td)
    td = timedelta(hours=24)
    return None, td, _periodo_label(td)


def _desde_para_pergunta(pergunta: str) -> tuple[datetime, str]:
    fixo, delta, rotulo = _parse_periodo(pergunta)
    if fixo is not None:
        return fixo, rotulo
    return datetime.now(timezone.utc) - delta, rotulo


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


def _eh_pergunta_contagem_pura(pergunta: str) -> bool:
    n = re.sub(r"\s+", " ", (pergunta or "").strip().lower())
    if re.search(r"^quant[ao]s?\s+mensag", n):
        return True
    if re.search(r"quant[ao]s?\s+mensag", n) and len(n.split()) <= 10:
        return True
    return False


def _formatar_mensagem(m: dict, idx: int | None = None) -> str:
    tel = m.get("telefone") or "?"
    nome = (m.get("nome") or "").strip()
    rotulo = f"{nome} ({tel})" if nome else tel
    ts = m.get("ts") or "?"
    intent = m.get("intencao") or "outro"
    texto = (m.get("texto") or "").strip()
    prefix = f"{idx}. " if idx is not None else ""
    return f'{prefix}{rotulo} [{intent}] {ts}\n   "{texto[:300]}"'


def _formatar_resposta_curta(mensagens: list[dict], rotulo_periodo: str) -> str:
    n = len(mensagens)
    if rotulo_periodo == "hoje":
        if n == 0:
            return "0 mensagem(ns) hoje."
        return f"{n} mensagem(ns) hoje. Quer ver de quais clientes?"
    if n == 0:
        return f"0 mensagem(ns) nos ultimos {rotulo_periodo}."
    return f"{n} mensagem(ns) nos ultimos {rotulo_periodo}. Quer ver de quais clientes?"


def _formatar_resposta(
    mensagens: list[dict],
    pergunta: str,
    desde: datetime,
    rotulo_periodo: str,
    status: dict,
    filtro_comercial: bool,
) -> str:
    if _eh_pergunta_contagem_pura(pergunta):
        return _formatar_resposta_curta(mensagens, rotulo_periodo)

    total_periodo = contar_mensagens_whatsapp(desde=desde)
    conectado = status.get("whatsapp_conectado")
    nome_conta = (status.get("whatsapp_nome") or "").strip()

    cab = []
    if conectado:
        cab.append(f"WhatsApp conectado{f' ({nome_conta})' if nome_conta else ''}.")
    else:
        cab.append("WhatsApp desconectado — so ha mensagens capturadas desde a ultima conexao.")
    cab.append(
        f"Periodo: {rotulo_periodo if rotulo_periodo == 'hoje' else 'ultimos ' + rotulo_periodo} "
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


def _serializar_mensagens(mensagens: list[dict]) -> list[dict]:
    out = []
    for m in mensagens:
        out.append(
            {
                "telefone": m.get("telefone"),
                "nome": m.get("nome"),
                "texto": m.get("texto"),
                "intencao": m.get("intencao"),
                "ts": m.get("ts"),
            }
        )
    return out


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    *,
    sessao: str = "padrao",
) -> dict:
    params = params or {}
    _, delta, _ = _parse_periodo(params.get("periodo") or pergunta)
    desde, rotulo = _desde_para_pergunta(params.get("periodo") or pergunta)
    sufixo = params.get("telefone_sufixo") or _parse_sufixo_telefone(pergunta)
    filtro_comercial = params.get("filtro") in ("orcamento", "preco", "comercial") or _pede_orcamento_ou_preco(
        pergunta
    )

    intencoes = None
    if filtro_comercial:
        intencoes = ["orcamento", "preco"]

    mensagens = carregar_mensagens_whatsapp(
        desde=desde,
        telefone_sufixo=sufixo,
        intencoes=intencoes,
        limite=int(params.get("limite") or 50),
    )

    if sessao:
        salvar_ultimo_resultado(
            sessao,
            "mensagens_whatsapp",
            {
                "mensagens": _serializar_mensagens(mensagens),
                "pergunta_original": pergunta,
                "periodo_horas": round(delta.total_seconds() / 3600, 2),
                "periodo_rotulo": rotulo,
                "filtro_comercial": filtro_comercial,
            },
        )

    status = status_observador()
    resposta = _formatar_resposta(mensagens, pergunta, desde, rotulo, status, filtro_comercial)

    return {
        "resposta": resposta,
        "modelo": "consultor_whatsapp",
        "passos": [
            {
                "agente": "consultor_whatsapp",
                "mensagens": len(mensagens),
                "periodo_horas": round(delta.total_seconds() / 3600, 2),
                "periodo_rotulo": rotulo,
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
