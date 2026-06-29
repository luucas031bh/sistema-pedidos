"""Orquestrador hub — LLM escolhe rota JSON, Python executa agente fixo."""

from __future__ import annotations

import json
import re
import urllib.error
from pathlib import Path

from config import PASTA, cfg_observador

_RULES_PATH = PASTA / "routing_rules.json"


def _carregar_rules() -> dict:
    if not _RULES_PATH.is_file():
        return {"rotas_validas": ["conversa_geral"]}
    try:
        return json.loads(_RULES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"rotas_validas": ["conversa_geral"]}


def _rotas_validas() -> set[str]:
    rules = _carregar_rules()
    return set(rules.get("rotas_validas") or ["conversa_geral"])


def _detectar_rota_heuristica(mensagem: str) -> dict:
    n = (mensagem or "").lower()
    if any(
        k in n
        for k in (
            "orcamento",
            "orçamento",
            "atendimento",
            "cliente pedindo",
            "whatsapp",
            "wpp",
            "sem resposta",
            "conversas",
            "conectad",
            "conectado",
            "lendo o w",
            "esta lendo",
            "está lendo",
            "observador",
        )
    ):
        filtro = ""
        if "orcamento" in n or "orçamento" in n:
            filtro = "orcamento"
        elif "sem resposta" in n:
            filtro = "sem_resposta"
        return {"route": "verificar_atendimentos", "params": {"filtro": filtro}}
    if any(
        k in n
        for k in (
            "pedido",
            "pedidos",
            "fila",
            "rp",
            "insumos",
            "arte",
            "financeiro",
            "status",
        )
    ):
        return {"route": "consultar_fila_rp", "params": {"consulta": mensagem}}
    if any(
        k in n
        for k in ("abrir", "abre", "corel", "photoshop", "pasta", "cdr", "psd")
    ):
        return {"route": "acao_adonay", "params": {}}
    return {"route": "conversa_geral", "params": {}}


def _parse_rota_llm(bruto: str) -> dict | None:
    bruto = (bruto or "").strip()
    m = re.search(r"\{[\s\S]*\}", bruto)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    route = (obj.get("route") or "").strip()
    if not route:
        return None
    return {"route": route, "params": obj.get("params") or {}}


def decidir_rota(mensagem: str, historico: list | None = None, modelo: str | None = None) -> dict:
    from agente import _request_ollama, resolver_modelo

    validas = _rotas_validas()
    nome = resolver_modelo(modelo)

    if nome:
        rules = _carregar_rules()
        rotas_txt = json.dumps(list(validas), ensure_ascii=False)
        regras_txt = json.dumps(rules.get("routing_rules") or {}, ensure_ascii=False, indent=0)
        prompt = (
            "Voce e o roteador ADNY. Analise a mensagem do operador e responda "
            "SOMENTE um JSON valido: {\"route\": \"...\", \"params\": {}}\n"
            f"Rotas validas: {rotas_txt}\n"
            f"Descricoes: {regras_txt}\n"
            "Use verificar_atendimentos para whatsapp/orcamentos/atendimentos.\n"
            "Use consultar_fila_rp para pedidos/fila/status RP.\n"
            "Use acao_adonay para abrir programas/arquivos/pastas.\n"
            "Use conversa_geral para o resto.\n\n"
            f"Mensagem: {mensagem}"
        )
        try:
            dados = _request_ollama(
                {
                    "model": nome,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=45,
            )
            parsed = _parse_rota_llm(dados.get("message", {}).get("content", ""))
            if parsed and parsed["route"] in validas:
                return parsed
        except (urllib.error.URLError, ConnectionError):
            pass

    rota = _detectar_rota_heuristica(mensagem)
    if rota["route"] not in validas:
        rota["route"] = "conversa_geral"
    return rota


def executar_rota(
    rota: dict,
    mensagem: str,
    historico: list | None,
    sessao: str,
    modelo: str | None,
    *,
    permitir_internet: bool = False,
    ctx: dict | None = None,
) -> dict:
    route = rota.get("route", "conversa_geral")
    params = rota.get("params") or {}
    ctx = ctx or {}

    if route == "verificar_atendimentos":
        from agentes.sintetizador import executar

        out = executar(mensagem, params, modelo)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    if route == "consultar_fila_rp":
        from agente import _tentar_resposta_rp_direta, resolver_modelo

        nome = resolver_modelo(modelo)
        if not nome:
            raise ConnectionError("Modelo Ollama indisponivel")
        out = _tentar_resposta_rp_direta(
            mensagem, nome, historico=historico, sessao=sessao, forcar=True
        )
        if out is None:
            from rp_router import montar_resposta_rp_direta, rotear_pergunta_rp

            dados = rotear_pergunta_rp(mensagem, params)
            resposta = montar_resposta_rp_direta(dados) or "Nao consegui consultar o RP."
            out = {
                "resposta": resposta,
                "modelo": nome,
                "passos": [{"rp_direto": True}],
                "meta": {"route": route, "rp_direto": True},
            }
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    if route == "acao_adonay":
        from agente import chat_com_ferramentas, resolver_modelo

        nome = resolver_modelo(modelo)
        if not nome:
            raise ConnectionError("Modelo Ollama indisponivel")
        msgs = historico or [{"role": "user", "content": mensagem}]
        out = chat_com_ferramentas(
            msgs,
            modelo,
            permitir_internet=permitir_internet,
            sessao=sessao,
            ctx=ctx,
        )
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    from provedores_llm import chat_ollama_simples

    out = chat_ollama_simples(mensagem, modelo, historico)
    meta = out.get("meta") or {}
    meta["route"] = "conversa_geral"
    meta["provedor"] = "adonay"
    out["meta"] = meta
    return out


def rotear_pergunta_chatbox(
    mensagem: str,
    historico: list | None,
    sessao: str,
    modelo: str | None = None,
    *,
    permitir_internet: bool = False,
    ctx: dict | None = None,
) -> dict:
    if not cfg_observador().get("usar_orquestrador_hub", True):
        from agente import chat_com_ferramentas, resolver_modelo

        nome = resolver_modelo(modelo)
        if not nome:
            raise ConnectionError("Modelo Ollama indisponivel")
        msgs = historico or [{"role": "user", "content": mensagem}]
        out = chat_com_ferramentas(
            msgs, modelo, permitir_internet=permitir_internet, sessao=sessao, ctx=ctx
        )
        meta = out.get("meta") or {}
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    rota = decidir_rota(mensagem, historico, modelo)
    out = executar_rota(
        rota,
        mensagem,
        historico,
        sessao,
        modelo,
        permitir_internet=permitir_internet,
        ctx=ctx,
    )
    meta = out.get("meta") or {}
    meta["routing"] = rota
    out["meta"] = meta
    return out
