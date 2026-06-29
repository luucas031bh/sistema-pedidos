"""Agente Sintetizador — le snapshot e formata resposta para chatbox."""

from __future__ import annotations

import json
import re
import urllib.error

from observador_store import ler_snapshot, listar_conversas_ativas


def _status_whatsapp() -> dict:
    from observador import status_observador

    return status_observador()


def _msg_sem_conversas(pergunta: str, metricas: dict, status: dict) -> str:
    stats = status.get("observador_stats") or {}
    pergunta_l = (pergunta or "").lower()
    conectado = status.get("whatsapp_conectado")
    nome = (status.get("whatsapp_nome") or "").strip()

    if conectado:
        rotulo = f"WhatsApp conectado{f' ({nome})' if nome else ''}."
        obs = (
            f" Observador ativo: {stats.get('dms_recebidas', 0)} DM(s) recebida(s), "
            f"{stats.get('dms_encaminhadas', 0)} relevante(s) gravada(s), "
            f"{stats.get('dms_ignoradas', 0)} filtrada(s) (oi, ok, etc.)."
        )
        if "sem resposta" in pergunta_l:
            n = metricas.get("sem_resposta_24h", 0)
            return (
                f"{rotulo}{obs} "
                f"No painel: {n} conversa(s) sem resposta ha 24h ou mais."
            )
        if any(k in pergunta_l for k in ("conectad", "lendo", "le o wpp", "le o whats", "observador")):
            return f"Sim — {rotulo}{obs} Respostas da IA ficam neste chatbox; o bot nao responde no WhatsApp."
        return (
            f"{rotulo}{obs} "
            "Nenhuma conversa relevante no painel ainda — aguarde DMs com orcamento, pedido ou duvida tecnica."
        )

    return (
        "WhatsApp nao conectado no momento. "
        "Use o botao Conectar WhatsApp (QR) na barra lateral e escaneie no celular."
    )


def _filtrar_conversas(conversas: list, params: dict, pergunta: str) -> list:
    filtro = (params.get("filtro") or "").lower()
    pergunta_l = pergunta.lower()

    if filtro == "orcamento" or any(
        k in pergunta_l for k in ("orcamento", "orçamento", "cotacao", "cotação")
    ):
        return [c for c in conversas if c.get("intencao") == "orcamento"]
    if filtro == "sem_resposta" or "sem resposta" in pergunta_l:
        return [c for c in conversas if (c.get("sem_resposta_horas") or 0) >= 1]
    if filtro == "duvida" or "duvida" in pergunta_l or "dúvida" in pergunta_l:
        return [c for c in conversas if c.get("intencao") == "duvida"]
    return conversas


def _formatar_lista(conversas: list, pergunta: str, metricas: dict, status: dict) -> str:
    if not conversas:
        return _msg_sem_conversas(pergunta, metricas, status)
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

    contexto = (
        f"[Snapshot ADNY atualizado em {snap.get('atualizado_em', '?')}]\n"
        f"WhatsApp conectado: {status.get('whatsapp_conectado')}\n"
        f"Conta: {status.get('whatsapp_nome') or status.get('whatsapp_bot') or '?'}\n"
        f"Observador: {status.get('observador_stats')}\n"
        f"Metricas: orcamentos_pendentes={metricas.get('orcamentos_pendentes', 0)}, "
        f"sem_resposta_24h={metricas.get('sem_resposta_24h', 0)}\n"
        f"Fila RP abertos: {fila.get('total_abertos', '?')}\n"
        f"Por etapa: {json.dumps(fila.get('por_etapa') or {}, ensure_ascii=False)}\n\n"
        f"Conversas filtradas ({len(filtradas)}):\n"
        f"{_formatar_lista(filtradas, pergunta, metricas, status)}\n"
        "[/Snapshot]"
    )

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    factual = _formatar_lista(filtradas, pergunta, metricas, status)
    if not filtradas:
        return {
            "resposta": factual,
            "modelo": "heuristica",
            "passos": [{"agente": "sintetizador", "conversas": 0}],
            "meta": {
                "route": "verificar_atendimentos",
                "agente": "sintetizador",
                "conversas": 0,
                "metricas": metricas,
            },
        }
    if not nome:
        return {
            "resposta": factual,
            "modelo": "heuristica",
            "passos": [{"agente": "sintetizador", "conversas": len(filtradas)}],
            "meta": {
                "route": "verificar_atendimentos",
                "agente": "sintetizador",
                "conversas": len(filtradas),
                "metricas": metricas,
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
                            "Voce e o assistente ADNY. Responda em portugues do Brasil, "
                            "informal e claro. Use APENAS os dados do snapshot abaixo. "
                            "Nao invente clientes ou pedidos. "
                            "Se WhatsApp conectado=true, NUNCA diga para escanear QR."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"{contexto}\n\nPergunta do operador: {pergunta}",
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

    if not texto:
        texto = factual

    return {
        "resposta": texto,
        "modelo": nome,
        "passos": [{"agente": "sintetizador", "conversas": len(filtradas)}],
        "meta": {
            "route": "verificar_atendimentos",
            "agente": "sintetizador",
            "conversas": len(filtradas),
            "metricas": metricas,
        },
    }
