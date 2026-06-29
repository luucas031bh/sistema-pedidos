"""Orquestrador hub ADNY — LLM central roteia JSON, Python executa agente fixo."""

from __future__ import annotations

import json
import re
import urllib.error
from pathlib import Path

from config import PASTA, cfg_observador

_RULES_PATH = PASTA / "routing_rules.json"
_ROTA_PADRAO = "verificar_atendimentos_ou_orcamentos"

_SAUDACOES = frozenset(
    {
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
        "hello",
        "hi",
        "salve",
        "fala",
        "opa",
        "tudo bem",
        "td bem",
        "como vai",
        "help",
        "ajuda",
        "menu",
    }
)


def _carregar_rules() -> dict:
    if not _RULES_PATH.is_file():
        return {"rotas_validas": [_ROTA_PADRAO], "aliases": {}}
    try:
        return json.loads(_RULES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"rotas_validas": [_ROTA_PADRAO], "aliases": {}}


def _rotas_validas() -> set[str]:
    rules = _carregar_rules()
    return set(rules.get("rotas_validas") or [_ROTA_PADRAO])


def _normalizar_rota(route: str) -> str:
    r = (route or "").strip()
    if not r:
        return _ROTA_PADRAO
    aliases = _carregar_rules().get("aliases") or {}
    return aliases.get(r, r)


def _eh_saudacao(mensagem: str) -> bool:
    n = re.sub(r"\s+", " ", (mensagem or "").strip().lower())
    n = n.rstrip("!.?")
    if n in _SAUDACOES:
        return True
    if len(n.split()) <= 3 and any(n.startswith(s) for s in ("oi", "ola", "olá", "bom ", "boa ")):
        return True
    return False


def _detectar_rota_heuristica(mensagem: str) -> dict:
    n = (mensagem or "").lower()

    if _eh_saudacao(mensagem):
        return {"route": _ROTA_PADRAO, "params": {"tipo": "saudacao"}}

    if any(k in n for k in ("malha", "consumo de tecido", "gasto de malha", "metros de malha")) and any(
        k in n for k in ("calcular", "calculo", "cálculo", "quanto", "gasto", "consumo", "pedido")
    ):
        return {"route": "calcular_gasto_de_malha_por_pedido", "params": {"consulta": mensagem}}

    if any(
        k in n
        for k in (
            "codigo",
            "código",
            "github",
            "repositorio",
            "repositório",
            "apps script",
            "funcionalidade",
            "implementar",
            "criar funcao",
            "criar função",
            "developer",
            "sistema-pedidos",
        )
    ) and any(k in n for k in ("criar", "nova", "implement", "codigo", "código", "funcao", "função", "como funciona")):
        return {"route": "criar_nova_funcionalidade_no_codigo", "params": {"consulta": mensagem}}

    if any(
        k in n
        for k in (
            "atualizar fila",
            "atualiza fila",
            "refresh",
            "atualizar status",
            "status de producao",
            "status de produção",
            "atualizar rp",
            "sync rp",
        )
    ):
        return {"route": "atualizar_status_de_producao_na_tela", "params": {}}

    if any(
        k in n
        for k in (
            "atendimento",
            "sem resposta",
            "conversas",
            "orcamento",
            "orçamento",
            "cliente pedindo",
            "algum cliente",
            "tem algum",
            "solicitou orcamento",
            "solicitou orçamento",
            "pediu orcamento",
            "pediu orçamento",
        )
    ) and not any(k in n for k in ("whatsapp", "wpp", "fila rp", "insumos na fila", "pedidos em")):
        filtro = ""
        if any(k in n for k in ("orcamento", "orçamento", "cotacao", "cotação")):
            filtro = "orcamento"
        return {"route": _ROTA_PADRAO, "params": {"filtro": filtro} if filtro else {}}

    if any(
        k in n
        for k in (
            "mensagem",
            "mensagens",
            "ultima",
            "última",
            "ultimos",
            "últimos",
            "recebida",
            "recebidas",
            "telefone",
            "final ",
            "minut",
            " hora",
            " dias",
            "orcamento",
            "orçamento",
            "preco",
            "preço",
        )
    ) and any(k in n for k in ("whatsapp", "wpp")):
        filtro = ""
        if any(
            k in n
            for k in ("orcamento", "orçamento", "preco", "preço", "cotacao", "cotação", "solicitou", "pediu")
        ):
            filtro = "comercial"
        return {
            "route": "consultar_mensagens_whatsapp",
            "params": {"consulta": mensagem, "filtro": filtro},
        }

    if any(
        k in n
        for k in (
            "atendimento",
            "conectad",
            "conectado",
            "observador",
        )
    ) and any(k in n for k in ("whatsapp", "wpp")):
        return {"route": _ROTA_PADRAO, "params": {}}

    if any(
        k in n
        for k in (
            "pedido",
            "pedidos",
            "fila",
            " rp",
            "rp ",
            "insumos",
            "arte",
            "financeiro",
            "status",
            "etapa",
            "producao",
            "produção",
        )
    ) and not any(k in n for k in ("abrir", "abre", "corel", "photoshop", "pasta", "cdr", "psd")):
        return {"route": "consultar_fila_rp", "params": {"consulta": mensagem}}

    return {"route": _ROTA_PADRAO, "params": {}}


def _parse_rota_llm(bruto: str) -> dict | None:
    bruto = (bruto or "").strip()
    m = re.search(r"\{[\s\S]*\}", bruto)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    route = _normalizar_rota((obj.get("route") or "").strip())
    if not route:
        return None
    return {"route": route, "params": obj.get("params") or {}}


def decidir_rota(mensagem: str, historico: list | None = None, modelo: str | None = None) -> dict:
    validas = _rotas_validas()
    heur = _detectar_rota_heuristica(mensagem)
    heur["route"] = _normalizar_rota(heur["route"])
    if heur["route"] in validas and heur["route"] != _ROTA_PADRAO:
        return heur
    if heur.get("params", {}).get("tipo") == "saudacao":
        return heur

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if nome:
        rules = _carregar_rules()
        rotas_txt = json.dumps(sorted(validas), ensure_ascii=False)
        regras_txt = json.dumps(rules.get("routing_rules") or {}, ensure_ascii=False, indent=0)
        prompt = (
            "Voce e o Orquestrador ADNY (Hub-and-Spoke). "
            "Analise a mensagem do operador e responda SOMENTE JSON valido: "
            '{"route": "...", "params": {}}\n'
            f"Rotas validas: {rotas_txt}\n"
            f"Regras: {regras_txt}\n"
            "Mapeamento:\n"
            "- verificar_atendimentos_ou_orcamentos: oi, status geral, orcamentos no snapshot\n"
            "- consultar_mensagens_whatsapp: buscar mensagens no log whatsapp\n"
            "- consultar_fila_rp: pedidos, etapas, financeiro RP\n"
            "- atualizar_status_de_producao_na_tela: refresh da fila visual\n"
            "- calcular_gasto_de_malha_por_pedido: calculo de malha\n"
            "- criar_nova_funcionalidade_no_codigo: perguntas sobre codigo\n"
            "NUNCA invente rota fora da lista.\n\n"
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

    if heur["route"] in validas:
        return heur
    return {"route": _ROTA_PADRAO, "params": {}}


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
    route = _normalizar_rota(rota.get("route", _ROTA_PADRAO))
    params = rota.get("params") or {}
    ctx = ctx or {}

    if route == "consultar_mensagens_whatsapp":
        from agentes.consultor_whatsapp import executar as consultor_executar

        out = consultor_executar(mensagem, params, modelo)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        meta["agente"] = "consultor_whatsapp"
        out["meta"] = meta
        return out

    if route == _ROTA_PADRAO:
        from agentes.sintetizador import executar

        out = executar(mensagem, params, modelo)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        meta["agente"] = "sintetizador"
        out["meta"] = meta
        return out

    if route == "consultar_fila_rp":
        from agente import _tentar_resposta_rp_direta, resolver_modelo

        nome = resolver_modelo(modelo) or "rp_direto"
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
                "passos": [{"agente": "rp_direto", "rp_direto": True}],
                "meta": {"route": route, "rp_direto": True},
            }
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        meta["agente"] = "rp_direto"
        out["meta"] = meta
        return out

    if route == "atualizar_status_de_producao_na_tela":
        from agentes.gerente_fila import executar as gerente_executar

        out = gerente_executar(mensagem, params, modelo)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    if route == "calcular_gasto_de_malha_por_pedido":
        from agentes.calculadora_malha import executar as calc_executar

        out = calc_executar(mensagem, params, modelo)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    if route == "criar_nova_funcionalidade_no_codigo":
        from agentes.developer_local import executar as dev_executar

        out = dev_executar(mensagem, params, modelo, historico=historico)
        meta = out.get("meta") or {}
        meta["route"] = route
        meta["provedor"] = "adonay"
        out["meta"] = meta
        return out

    from agentes.sintetizador import executar

    out = executar(mensagem, params, modelo)
    meta = out.get("meta") or {}
    meta["route"] = _ROTA_PADRAO
    meta["provedor"] = "adonay"
    meta["agente"] = "sintetizador"
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
