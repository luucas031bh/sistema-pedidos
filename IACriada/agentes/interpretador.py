"""Interpretador ADNY — LLM organiza dados factuais do agente conforme a pergunta."""

from __future__ import annotations

import json


def organizar_resposta(
    pergunta: str,
    texto_factual: str,
    facts: dict | None = None,
    modelo: str | None = None,
    *,
    contexto: str = "geral",
    forcar_llm: bool = False,
) -> str:
    """
    Reorganiza resposta factual com LLM. Se indisponivel, devolve texto_factual.
    NUNCA inventa dados alem do bloco factual.
    """
    if not texto_factual or not (forcar_llm or _deve_sintetizar(pergunta, contexto)):
        return texto_factual

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        return texto_factual

    bloco_json = ""
    if facts:
        try:
            bloco_json = json.dumps(facts, ensure_ascii=False)[:5000]
        except (TypeError, ValueError):
            bloco_json = str(facts)[:5000]

    if contexto == "whatsapp":
        prompt_sistema = (
            "Voce e o ADNY, cerebro analitico da Adonay Confeções.\n"
            "Organize em portugues do Brasil uma resposta clara a partir dos dados reais do WhatsApp.\n"
            "Use APENAS o bloco FACTUAL e o JSON — NUNCA invente contatos, mensagens, horarios ou pedidos.\n"
            "Estruture quando fizer sentido:\n"
            "1) Visao geral (periodo, quantidade de contatos/mensagens, status da conexao)\n"
            "2) Por contato/conversa: nome, telefone, data/hora de cada mensagem, quem falou "
            "(Cliente vs Adonay/equipe), intencao e tom emocional\n"
            "3) Correlacao com pedidos RP quando existir no bloco (pedido, cliente, etapa, pecas, status)\n"
            "4) Pontos de atencao (urgencia, reclamacao, orcamentos sem resposta, etc.)\n"
            "Cite datas no formato DD/MM/AAAA HH:MM como nos dados.\n"
            "Se mensagens antigas nao tiverem direcao 'saida', trate como recebidas do cliente.\n"
            "Se faltar dado, diga explicitamente — nao preencha com suposicao."
        )
    else:
        prompt_sistema = (
            "Voce e o ADNY, assistente da Adonay Confeções.\n"
            "Organize a resposta em portugues do Brasil conforme a PERGUNTA do operador.\n"
            "Use APENAS os dados do bloco FACTUAL abaixo. NUNCA invente pedidos, valores ou tamanhos.\n"
            "Se a pergunta pede resumo do pedido, mostre cliente, status, etapa, financeiro, produtos e tamanhos.\n"
            "Se pede lista de tamanhos, use formato: TAMANHO = N unidades (ex.: PP(BL) = 5 unidades).\n"
            "Se pede calculo de malha, mantenha metros, kg e custos exatamente como nos dados.\n"
            "Se faltar informacao no bloco, diga o que falta — nao preencha com suposicao."
        )

    prompt_user = (
        f"CONTEXTO: {contexto}\n\n"
        f"PERGUNTA: {pergunta}\n\n"
        f"DADOS FACTUAL:\n{texto_factual}\n"
    )
    if bloco_json:
        prompt_user += f"\nJSON (referencia):\n{bloco_json}\n"

    try:
        resp = _request_ollama(
            {
                "model": nome,
                "messages": [
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": prompt_user},
                ],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=120,
        )
        texto = (resp.get("message") or {}).get("content", "").strip()
        return texto or texto_factual
    except Exception:
        return texto_factual


def _deve_sintetizar(pergunta: str, contexto: str) -> bool:
    if contexto in ("calculadora_malha", "resumo_pedido", "lista_tamanhos", "rp_pedido", "whatsapp"):
        return True
    n = (pergunta or "").lower()
    return any(
        k in n
        for k in (
            "resumo",
            "detalhe",
            "lista",
            "organiz",
            "explica",
            "me fale",
            "me diga",
            "traga",
            "correlacion",
            "relacion",
            "analise",
            "análise",
            "conversa",
            "emocao",
            "emoção",
            "tom",
            "historico",
            "histórico",
            "contexto",
            "situacao",
            "situação",
        )
    )


def sintetizar_whatsapp(
    pergunta: str,
    texto_factual: str,
    facts: dict | None = None,
    modelo: str | None = None,
    *,
    forcar_llm: bool = False,
) -> str:
    """LLM organiza conversas WPP + correlacao RP a partir de dados factuais."""
    return organizar_resposta(
        pergunta,
        texto_factual,
        facts=facts,
        modelo=modelo,
        contexto="whatsapp",
        forcar_llm=forcar_llm,
    )
