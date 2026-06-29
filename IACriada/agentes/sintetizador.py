"""Agente Sintetizador — Atendente do chatbox (le pedidos.json, resposta factual)."""

from __future__ import annotations

import json
import re
import urllib.error

from observador_store import ler_snapshot, listar_conversas_ativas


def _status_whatsapp() -> dict:
    from observador import status_observador

    return status_observador()


def _formatar_etapas(por_etapa: dict) -> str:
    if not por_etapa:
        return "sem dados"
    partes = [f"{k}: {v}" for k, v in sorted(por_etapa.items(), key=lambda x: -x[1])]
    return ", ".join(partes[:8])


def montar_briefing_adny(pergunta: str, snap: dict, status: dict) -> str:
    """Resposta factual integrada — estagiario ADNY (sem inventar dados)."""
    metricas = snap.get("metricas") or {}
    fila = snap.get("fila_rp") or {}
    stats = status.get("observador_stats") or {}
    conectado = status.get("whatsapp_conectado")
    nome = (status.get("whatsapp_nome") or "").strip()
    msg_log = status.get("mensagens_no_log", 0)
    enc = stats.get("dms_encaminhadas", 0)

    linhas = ["Oi! Sou o ADNY — assistente integrado da Adonay Confecoes.", ""]

    if conectado:
        linhas.append(f"WhatsApp: conectado{f' ({nome})' if nome else ''}.")
        linhas.append(
            f"Observador: {msg_log} msg no log · {enc} encaminhada(s) ao servidor."
        )
    else:
        linhas.append("WhatsApp: desconectado — use Conectar WhatsApp (QR) na barra lateral.")

    total_rp = fila.get("total_abertos")
    linhas.append(f"Fila RP: {total_rp if total_rp is not None else '?'} pedido(s) em aberto.")
    etapas = fila.get("por_etapa") or {}
    if etapas:
        linhas.append(f"Por etapa: {_formatar_etapas(etapas)}.")

    linhas.append(
        f"Metricas snapshot: orcamentos_pendentes={metricas.get('orcamentos_pendentes', 0)}, "
        f"sem_resposta_24h={metricas.get('sem_resposta_24h', 0)}."
    )
    linhas.append("")
    linhas.append("Pergunte em linguagem natural, por exemplo:")
    linhas.append("· ultimas mensagens whatsapp nas ultimas 24 horas")
    linhas.append("· algum cliente pedindo orcamento?")
    linhas.append("· pedidos em insumos na fila RP")
    linhas.append("· resumo financeiro dos pedidos em aberto")
    linhas.append("")
    linhas.append("Respostas so neste chat — nao envio mensagem no WhatsApp do cliente.")

    pergunta_l = (pergunta or "").lower()
    if not _eh_saudacao_pura(pergunta_l):
        conversas = listar_conversas_ativas()
        if conversas:
            linhas.append("")
            linhas.append(f"No painel: {len(conversas)} conversa(s) capturada(s).")

    return "\n".join(linhas)


def _eh_saudacao_pura(pergunta_l: str) -> bool:
    n = re.sub(r"\s+", " ", pergunta_l.strip()).rstrip("!.?")
    return n in {
        "oi",
        "ola",
        "olá",
        "oie",
        "eai",
        "e ai",
        "bom dia",
        "boa tarde",
        "boa noite",
        "hey",
        "hi",
        "salve",
        "fala",
        "opa",
        "ajuda",
        "help",
        "menu",
    }


def _msg_sem_conversas(pergunta: str, metricas: dict, status: dict, snap: dict) -> str:
    if (pergunta or "").strip().lower() in {"oi", "ola", "olá"} or (
        len((pergunta or "").split()) <= 2 and "oi" in (pergunta or "").lower()
    ):
        return montar_briefing_adny(pergunta, snap, status)

    stats = status.get("observador_stats") or {}
    pergunta_l = (pergunta or "").lower()
    conectado = status.get("whatsapp_conectado")
    nome = (status.get("whatsapp_nome") or "").strip()
    msg_log = status.get("mensagens_no_log", 0)

    if conectado:
        rotulo = f"WhatsApp conectado{f' ({nome})' if nome else ''}."
        obs = (
            f" Log: {msg_log} msg · {stats.get('dms_encaminhadas', 0)} encaminhada(s)."
        )
        if "sem resposta" in pergunta_l:
            n = metricas.get("sem_resposta_24h", 0)
            return f"{rotulo}{obs} Sem resposta ha 24h: {n} conversa(s)."
        if any(k in pergunta_l for k in ("conectad", "observador", "lendo")):
            return f"Sim — {rotulo}{obs} Respostas ficam neste chatbox."
        fila = snap.get("fila_rp") or {}
        return (
            f"{rotulo}{obs} "
            f"Fila RP: {fila.get('total_abertos', '?')} abertos. "
            "Nenhuma conversa relevante no painel ainda — aguarde DMs ou pergunte sobre a fila RP."
        )

    return montar_briefing_adny(pergunta, snap, status)


def _filtrar_conversas(conversas: list, params: dict, pergunta: str) -> list:
    filtro = (params.get("filtro") or "").lower()
    pergunta_l = pergunta.lower()

    if filtro == "orcamento" or any(
        k in pergunta_l for k in ("orcamento", "orçamento", "cotacao", "cotação", "pedindo orcamento", "pedindo orçamento")
    ):
        return [c for c in conversas if c.get("intencao") in ("orcamento", "preco")]
    if filtro == "sem_resposta" or "sem resposta" in pergunta_l:
        return [c for c in conversas if (c.get("sem_resposta_horas") or 0) >= 1]
    if filtro == "duvida" or "duvida" in pergunta_l or "dúvida" in pergunta_l:
        return [c for c in conversas if c.get("intencao") == "duvida"]
    return conversas


def _formatar_lista(conversas: list, pergunta: str, metricas: dict, status: dict, snap: dict) -> str:
    if not conversas:
        return _msg_sem_conversas(pergunta, metricas, status, snap)
    linhas = []
    for i, c in enumerate(conversas[:20], 1):
        tel = c.get("telefone") or ""
        nome = (c.get("nome") or "").strip()
        rotulo = f"{nome} ({tel})" if nome else tel
        linhas.append(
            f"{i}. {rotulo} — "
            f"{c.get('intencao', 'outro')}: {c.get('resumo') or c.get('ultima_msg', '')[:80]}"
        )
        if c.get("sem_resposta_horas"):
            linhas.append(f"   Sem resposta ha ~{c.get('sem_resposta_horas')}h")
    return "\n".join(linhas)


def executar(pergunta: str, params: dict | None = None, modelo: str | None = None) -> dict:
    params = params or {}
    snap = ler_snapshot()
    status = _status_whatsapp()
    conversas = listar_conversas_ativas()
    filtradas = _filtrar_conversas(conversas, params, pergunta)
    metricas = snap.get("metricas") or {}
    fila = snap.get("fila_rp") or {}

    if params.get("tipo") == "saudacao" or _eh_saudacao_pura((pergunta or "").lower()):
        texto = montar_briefing_adny(pergunta, snap, status)
        return {
            "resposta": texto,
            "modelo": "sintetizador",
            "passos": [{"agente": "sintetizador", "modo": "briefing"}],
            "meta": {
                "route": "verificar_atendimentos_ou_orcamentos",
                "agente": "sintetizador",
                "briefing": True,
            },
        }

    factual = _formatar_lista(filtradas, pergunta, metricas, status, snap)

    if not filtradas:
        return {
            "resposta": factual,
            "modelo": "sintetizador",
            "passos": [{"agente": "sintetizador", "conversas": 0}],
            "meta": {
                "route": "verificar_atendimentos_ou_orcamentos",
                "agente": "sintetizador",
                "conversas": 0,
                "metricas": metricas,
            },
        }

    contexto = (
        f"[Snapshot ADNY {snap.get('atualizado_em', '?')}]\n"
        f"WhatsApp conectado: {status.get('whatsapp_conectado')}\n"
        f"Mensagens no log: {status.get('mensagens_no_log', 0)}\n"
        f"Fila RP abertos: {fila.get('total_abertos', '?')}\n"
        f"Por etapa: {json.dumps(fila.get('por_etapa') or {}, ensure_ascii=False)}\n"
        f"Conversas ({len(filtradas)}):\n{factual}\n[/Snapshot]"
    )

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        return {
            "resposta": factual,
            "modelo": "sintetizador",
            "passos": [{"agente": "sintetizador", "conversas": len(filtradas)}],
            "meta": {
                "route": "verificar_atendimentos_ou_orcamentos",
                "agente": "sintetizador",
                "conversas": len(filtradas),
            },
        }

    try:
        dados = _request_ollama(
            {
                "model": nome,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Voce e o Sintetizador ADNY. Formate em portugues informal "
                            "APENAS com dados do snapshot. Nao invente clientes ou pedidos."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"{contexto}\n\nPergunta: {pergunta}",
                    },
                ],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=120,
        )
        texto = dados.get("message", {}).get("content", "").strip()
    except (urllib.error.URLError, ConnectionError):
        texto = factual

    return {
        "resposta": texto or factual,
        "modelo": nome,
        "passos": [{"agente": "sintetizador", "conversas": len(filtradas)}],
        "meta": {
            "route": "verificar_atendimentos_ou_orcamentos",
            "agente": "sintetizador",
            "conversas": len(filtradas),
            "metricas": metricas,
        },
    }
