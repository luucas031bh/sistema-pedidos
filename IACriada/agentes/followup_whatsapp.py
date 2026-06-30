"""Follow-up conversacional sobre ultima consulta WhatsApp (sem nova busca)."""

from __future__ import annotations

import re
import time

from historico_db import carregar_ultimo_resultado

_TTL_SEG = 86400  # 24h — persiste apos fechar navegador (mesma sessao SQLite)

_REFERENCIAL = (
    "de quais",
    "quais deles",
    "o que cada um",
    "o que cada uma",
    "e esses",
    "e essas",
    "desses",
    "dessas",
    "deles",
    "delas",
    "quais sao",
    "quais são",
    "quem sao",
    "quem são",
    "e desses",
    "e dessas",
    "desses quantos",
    "dessas quantas",
    "quantos eram",
    "quantas eram",
    "quantos desses",
    "quantas dessas",
)

_OBJETO_PROPRIO = (
    r"\d+\s+(cliente|mensagem|pedido)",
    r"ultim[oa]s?\s+\d+",
    r"(hoje|ontem|semana|mes)\b",
    r"(antes|anterior)\s+(da?|de)\b",
    r"\b(de|da|do)\s+[A-Z][a-z]+",
)


def _normalizar(pergunta: str) -> str:
    return re.sub(r"\s+", " ", (pergunta or "").strip().lower())


def _resultado_valido(ultimo: dict | None) -> bool:
    if not ultimo or ultimo.get("tipo") != "mensagens_whatsapp":
        return False
    ts = ultimo.get("atualizado_em")
    if ts and (time.time() - float(ts)) > _TTL_SEG:
        return False
    msgs = (ultimo.get("dados") or {}).get("mensagens")
    return isinstance(msgs, list)


def _tem_referencia(n: str) -> bool:
    if any(p in n for p in _REFERENCIAL):
        return True
    return bool(re.search(r"\b(deles|delas|desses|dessas|esses|essas)\b", n))


def detectar_followup_whatsapp(pergunta: str, sessao: str) -> bool:
    """True se a pergunta parece continuar a ultima consulta WhatsApp guardada."""
    n = _normalizar(pergunta)

    if len(n.split()) >= 9:
        return False

    if not _tem_referencia(n):
        return False

    for pat in _OBJETO_PROPRIO:
        flags = re.I if pat != r"\b(de|da|do)\s+[A-Z][a-z]+" else 0
        if re.search(pat, pergunta, flags):
            return False

    if any(k in n for k in ("pedido", "pedidos", "fila rp", " insumos", "financeiro rp")):
        return False

    ultimo = carregar_ultimo_resultado(sessao)
    return _resultado_valido(ultimo)


def _rotulo_cliente(m: dict) -> str:
    tel = m.get("telefone") or "?"
    nome = (m.get("nome") or "").strip()
    return f"{nome} ({tel})" if nome else str(tel)


def _intencao_humana(m: dict) -> str:
    intent = (m.get("intencao") or "outro").strip()
    texto = (m.get("texto") or "").strip()
    if intent in ("orcamento", "preco", "duvida"):
        return intent
    if texto:
        return f'{intent} — "{texto[:60]}"'
    return intent


def responder_followup_whatsapp(pergunta: str, sessao: str) -> dict | None:
    ultimo = carregar_ultimo_resultado(sessao) or {}
    dados = ultimo.get("dados") or {}
    mensagens: list[dict] = list(dados.get("mensagens") or [])
    n = _normalizar(pergunta)

    if any(k in n for k in ("quantos eram", "quantas eram", "quantos desses", "quantas dessas")) and any(
        k in n for k in ("orcamento", "orçamento", "preco", "preço", "comercial")
    ):
        com = [m for m in mensagens if (m.get("intencao") or "") in ("orcamento", "preco")]
        resposta = (
            f"Dos {len(mensagens)} mensagem(ns) da consulta anterior, "
            f"{len(com)} eram orcamento ou preco."
        )
        if com:
            resposta += "\n" + "\n".join(f"· {_rotulo_cliente(m)}" for m in com[:20])
        modo = "contagem_orcamento"

    elif any(k in n for k in ("o que cada", "o que quer", "querem", "intencao", "intenção")):
        if not mensagens:
            resposta = "Nao ha mensagens na consulta anterior."
        else:
            linhas = [f"· {_rotulo_cliente(m)}: {_intencao_humana(m)}" for m in mensagens[:30]]
            resposta = "Intencao de cada um (consulta anterior):\n" + "\n".join(linhas)
        modo = "intencoes"

    elif any(
        k in n
        for k in (
            "de quais",
            "quais cliente",
            "quem sao",
            "quem são",
            "quais sao",
            "quais são",
            "lista",
            "listar",
            "mostra",
            "mostre",
        )
    ):
        clientes_salvos = dados.get("clientes") or []
        if clientes_salvos:
            linhas = []
            for c in clientes_salvos[:80]:
                nome = (c.get("nome") or "").strip()
                tel = c.get("telefone") or "?"
                rot = f"{nome} ({tel})" if nome else tel
                linhas.append(f"· {rot} — {c.get('mensagens', 0)} msg(s)")
            resposta = f"{len(clientes_salvos)} cliente(s) da consulta anterior:\n" + "\n".join(linhas)
        else:
            vistos: dict[str, dict] = {}
            for m in mensagens:
                tel = m.get("telefone") or "?"
                if tel not in vistos:
                    vistos[tel] = m
            if not vistos:
                resposta = "Nenhum cliente na consulta anterior."
            else:
                linhas = [_rotulo_cliente(vistos[t]) for t in vistos]
                resposta = f"{len(linhas)} cliente(s) da consulta anterior:\n" + "\n".join(linhas)
        modo = "clientes"

    else:
        return None

    return {
        "resposta": resposta,
        "modelo": "followup_whatsapp",
        "passos": [{"agente": "followup_whatsapp", "modo": modo, "mensagens": len(mensagens)}],
        "meta": {
            "route": "consultar_mensagens_whatsapp",
            "agente": "followup_whatsapp",
            "followup": True,
            "mensagens": len(mensagens),
        },
    }
