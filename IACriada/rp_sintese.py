"""Sintese LLM pos-dados RP — resposta coerente sem inventar fatos."""

from __future__ import annotations

import json

from rp_entidades import extrair_entidades_rp


def validar_escopo_resposta(pergunta: str, dados: dict) -> str | None:
    """
    Retorna mensagem de erro se a resposta nao atende ao escopo da pergunta.
    None = ok.
    """
    if not dados.get("ok"):
        return None
    ent = extrair_entidades_rp(pergunta)
    action = dados.get("action") or ""
    kind = dados.get("kind") or ""

    if ent.get("escopo_pedido") and action == "agregarPecasAbertos":
        alvo = ent.get("cliente") or ent.get("codigo") or "esse pedido"
        return (
            f"A pergunta pede dados de {alvo}, mas a consulta retornou totais de todos os pedidos abertos."
        )

    if ent.get("cliente") and kind == "pecas_por_tamanho_abertos":
        return f"A pergunta pede tamanhos do cliente {ent['cliente']}, nao da fila inteira."

    if ent.get("quer_tamanhos") and kind == "detalhe_pedido":
        facts = dados.get("facts") or {}
        pedido = facts.get("pedido") if isinstance(facts, dict) else None
        if pedido and not (pedido.get("produtos") or []):
            return "Pedido encontrado, mas sem produtos/tamanhos na planilha."

    return None


def deve_sintetizar_rp(pergunta: str, dados: dict) -> bool:
    if not dados.get("ok"):
        return False
    kind = dados.get("kind") or ""
    if kind in ("tamanhos_pedido", "detalhe_pedido", "busca_pedidos"):
        return True
    ent = extrair_entidades_rp(pergunta)
    return bool(ent.get("cliente") and ent.get("quer_tamanhos"))


def sintetizar_resposta_rp(
    pergunta: str,
    texto_factual: str,
    dados: dict,
    modelo: str | None,
) -> str | None:
    """Reorganiza a resposta factual com LLM; retorna None se indisponivel."""
    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        return None

    facts = dados.get("facts") or {}
    bloco_facts = ""
    if isinstance(facts, dict) and facts:
        try:
            bloco_facts = json.dumps(facts, ensure_ascii=False, indent=0)[:4000]
        except (TypeError, ValueError):
            bloco_facts = str(facts)[:4000]

    prompt = (
        "Voce e o ADNY. O operador fez uma pergunta sobre pedidos da Adonay.\n"
        "Use APENAS os dados abaixo. NUNCA invente clientes, tamanhos ou quantidades.\n"
        "Responda em portugues do Brasil, direto e organizado.\n"
        "Se a pergunta pede tamanhos e quantidades de UM pedido, liste tamanho: quantidade.\n"
        "Se faltar dado, diga claramente o que nao veio da planilha.\n\n"
        f"PERGUNTA: {pergunta}\n\n"
        f"RESPOSTA FACTUAL (base obrigatoria):\n{texto_factual}\n"
    )
    if bloco_facts:
        prompt += f"\nDADOS JSON (referencia):\n{bloco_facts}\n"

    try:
        resp = _request_ollama(
            {
                "model": nome,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=90,
        )
        texto = (resp.get("message") or {}).get("content", "").strip()
        return texto or None
    except Exception:
        return None
