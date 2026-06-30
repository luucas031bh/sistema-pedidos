"""Leitura progressiva do log WhatsApp — 24h → 7 dias → oferta 1 mes."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from observador_store import carregar_mensagens_whatsapp, contar_mensagens_whatsapp

_TZ_BR = ZoneInfo("America/Sao_Paulo")

PERIODO_24H = (timedelta(hours=24), "24 horas")
PERIODO_7D = (timedelta(days=7), "7 dias")
PERIODO_30D = (timedelta(days=30), "30 dias (1 mes)")

LIMITE_MENSAGENS = 5000


@dataclass
class ResultadoColeta:
    mensagens: list[dict]
    desde: datetime
    rotulo: str
    periodo_horas: float
    total_log_periodo: int
    clientes: list[dict]
    expandiu: bool
    pedir_confirmacao_mes: bool
    periodo_forcado: str | None = None


def _inicio_hoje_utc() -> datetime:
    agora = datetime.now(_TZ_BR)
    inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio.astimezone(timezone.utc)


def _desde_delta(delta: timedelta) -> datetime:
    return datetime.now(timezone.utc) - delta


def pediu_periodo_explicito(pergunta: str) -> tuple[datetime, str] | None:
    """Se o usuario fixou periodo, nao expande automaticamente."""
    n = (pergunta or "").lower()
    if "hoje" in n and "ontem" not in n:
        return _inicio_hoje_utc(), "hoje"

    m = re.search(
        r"(?:ultim(?:os|as)?|nos?\s+ultim(?:os|as)?)\s+(\d+)\s*(minut|hora|dia|semana|mes|mês)",
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
        elif un.startswith("seman"):
            td = timedelta(weeks=qtd)
        else:
            td = timedelta(days=min(qtd * 30, 30))
        rotulo = f"{qtd} {un}(s)"
        return _desde_delta(td), rotulo

    if re.search(r"\b1\s*mes\b|\bum\s*mes\b|\b30\s*dias?\b", n):
        return _desde_delta(PERIODO_30D[0]), PERIODO_30D[1]

    if re.search(r"\b7\s*dias?\b|\bum\s*semana\b|\b1\s*semana\b", n):
        return _desde_delta(PERIODO_7D[0]), PERIODO_7D[1]

    return None


def confirmou_busca_um_mes(pergunta: str) -> bool:
    n = (pergunta or "").lower().strip()
    if re.search(r"\b(sim|ok|pode|quero|confirma)\b", n) and re.search(
        r"\b(mes|mês|30\s*dia|um\s*mes)\b", n
    ):
        return True
    if re.search(r"\bbusca(r)?\s+(no\s+)?(ultimo\s+)?mes\b", n):
        return True
    if re.search(r"\bultim[oa]s?\s+30\s*dias?\b", n):
        return True
    return False


def parece_pergunta_whatsapp(pergunta: str) -> bool:
    n = (pergunta or "").lower()
    if any(k in n for k in ("whatsapp", "wpp", "whats", "zap")):
        return True
    if re.search(r"quant[ao]s?\s+mensag", n):
        return True
    if ("mensagem" in n or "mensagens" in n) and any(
        k in n for k in ("receb", "mandou", "escreveu", "cliente", "hoje", "hora", " dia")
    ):
        return True
    if "conversa" in n and any(k in n for k in ("cliente", "atendimento", "receb", "wpp")):
        return True
    if "cliente" in n and any(
        k in n for k in ("mensag", "wpp", "whatsapp", "24", "hora", "hoje", "semana", "atendimento")
    ):
        return True
    if any(k in n for k in ("atendimento", "sem resposta")) and "pedido" not in n:
        if any(k in n for k in ("mensag", "conversa", "cliente", "24", "hora", "hoje")):
            return True
    return False


def _filtrar_mensagens(
    mensagens: list[dict],
    *,
    telefone_sufixo: str | None = None,
    intencoes: list[str] | None = None,
    termo_texto: str | None = None,
) -> list[dict]:
    sufixo = re.sub(r"\D", "", telefone_sufixo or "")
    ints = set(intencoes or [])
    termo = (termo_texto or "").lower().strip()
    out: list[dict] = []
    for m in mensagens:
        tel = re.sub(r"\D", "", m.get("telefone") or "")
        if sufixo and not tel.endswith(sufixo):
            continue
        if ints and (m.get("intencao") or "") not in ints:
            continue
        if termo:
            blob = f"{m.get('nome')} {m.get('texto')}".lower()
            if termo not in blob:
                continue
        out.append(m)
    return out


def listar_clientes(mensagens: list[dict]) -> list[dict]:
    por_tel: dict[str, dict] = {}
    for m in mensagens:
        tel = m.get("telefone") or "?"
        if tel not in por_tel:
            por_tel[tel] = {
                "telefone": tel,
                "nome": (m.get("nome") or "").strip(),
                "mensagens": 0,
                "ultima_ts": m.get("ts") or "",
                "ultimo_texto": (m.get("texto") or "")[:80],
            }
        por_tel[tel]["mensagens"] += 1
        ts = m.get("ts") or ""
        if ts >= por_tel[tel]["ultima_ts"]:
            por_tel[tel]["ultima_ts"] = ts
            por_tel[tel]["ultimo_texto"] = (m.get("texto") or "")[:80]
            if m.get("nome"):
                por_tel[tel]["nome"] = m.get("nome")
    return sorted(por_tel.values(), key=lambda c: c.get("ultima_ts") or "", reverse=True)


def _carregar_periodo(
    desde: datetime,
    *,
    telefone_sufixo: str | None = None,
    intencoes: list[str] | None = None,
    termo_texto: str | None = None,
) -> list[dict]:
    brutas = carregar_mensagens_whatsapp(
        desde=desde,
        telefone_sufixo=None,
        intencoes=None,
        limite=LIMITE_MENSAGENS,
    )
    return _filtrar_mensagens(
        brutas,
        telefone_sufixo=telefone_sufixo,
        intencoes=intencoes,
        termo_texto=termo_texto,
    )


def _tem_resultado(mensagens: list[dict], exigir_filtro: bool) -> bool:
    if mensagens:
        return True
    return not exigir_filtro


def coletar_progressivo(
    pergunta: str,
    *,
    telefone_sufixo: str | None = None,
    intencoes: list[str] | None = None,
    termo_texto: str | None = None,
    forcar_dias: int | None = None,
) -> ResultadoColeta:
    exigir = bool(telefone_sufixo or intencoes or termo_texto)

    if forcar_dias is not None:
        delta = timedelta(days=forcar_dias)
        desde = _desde_delta(delta)
        rotulo = PERIODO_30D[1] if forcar_dias >= 28 else f"{forcar_dias} dias"
        msgs = _carregar_periodo(
            desde,
            telefone_sufixo=telefone_sufixo,
            intencoes=intencoes,
            termo_texto=termo_texto,
        )
        return ResultadoColeta(
            mensagens=msgs,
            desde=desde,
            rotulo=rotulo,
            periodo_horas=round(delta.total_seconds() / 3600, 2),
            total_log_periodo=contar_mensagens_whatsapp(desde=desde),
            clientes=listar_clientes(msgs),
            expandiu=False,
            pedir_confirmacao_mes=False,
            periodo_forcado=rotulo,
        )

    explicito = pediu_periodo_explicito(pergunta)
    if explicito:
        desde, rotulo = explicito
        delta = datetime.now(timezone.utc) - desde
        msgs = _carregar_periodo(
            desde,
            telefone_sufixo=telefone_sufixo,
            intencoes=intencoes,
            termo_texto=termo_texto,
        )
        pedir_mes = not msgs and delta <= PERIODO_7D[0]
        return ResultadoColeta(
            mensagens=msgs,
            desde=desde,
            rotulo=rotulo,
            periodo_horas=round(delta.total_seconds() / 3600, 2),
            total_log_periodo=contar_mensagens_whatsapp(desde=desde),
            clientes=listar_clientes(msgs),
            expandiu=False,
            pedir_confirmacao_mes=pedir_mes,
            periodo_forcado=rotulo,
        )

    sequencia = [PERIODO_24H, PERIODO_7D]
    expandiu = False
    ultimo_vazio: ResultadoColeta | None = None

    for i, (delta, rotulo) in enumerate(sequencia):
        desde = _desde_delta(delta)
        msgs = _carregar_periodo(
            desde,
            telefone_sufixo=telefone_sufixo,
            intencoes=intencoes,
            termo_texto=termo_texto,
        )
        if _tem_resultado(msgs, exigir):
            return ResultadoColeta(
                mensagens=msgs,
                desde=desde,
                rotulo=rotulo,
                periodo_horas=round(delta.total_seconds() / 3600, 2),
                total_log_periodo=contar_mensagens_whatsapp(desde=desde),
                clientes=listar_clientes(msgs),
                expandiu=i > 0,
                pedir_confirmacao_mes=False,
            )
        ultimo_vazio = ResultadoColeta(
            mensagens=[],
            desde=desde,
            rotulo=rotulo,
            periodo_horas=round(delta.total_seconds() / 3600, 2),
            total_log_periodo=contar_mensagens_whatsapp(desde=desde),
            clientes=[],
            expandiu=i > 0,
            pedir_confirmacao_mes=False,
        )
        expandiu = True

    base = ultimo_vazio or ResultadoColeta(
        mensagens=[],
        desde=_desde_delta(PERIODO_7D[0]),
        rotulo=PERIODO_7D[1],
        periodo_horas=168.0,
        total_log_periodo=0,
        clientes=[],
        expandiu=True,
        pedir_confirmacao_mes=True,
    )
    base.pedir_confirmacao_mes = True
    return base


def mensagem_pedir_um_mes(pergunta_original: str, rotulo_ultimo: str) -> str:
    return (
        f"Nao encontrei mensagens no log nas ultimas {rotulo_ultimo} "
        f"(pergunta: «{pergunta_original[:80]}»).\n\n"
        "Tambem busquei nos ultimos 7 dias sem resultado com esses criterios.\n\n"
        "Quer que eu busque no **ultimo mes (30 dias)**? "
        "Responda por exemplo: *sim, busca 1 mes* ou *ultimos 30 dias*."
    )
