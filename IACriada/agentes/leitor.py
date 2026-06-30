"""Agente LEITOR — pesquisa Ctrl+F em todo o ecossistema Adonay."""

from __future__ import annotations

from leitor_sistema import (
    formatar_achados,
    parece_consulta_leitor,
    pesquisar_sistema,
    resposta_direta_roantone,
)


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
) -> dict:
    params = params or {}
    consulta = params.get("consulta") or pergunta
    fontes = params.get("fontes")

    direta = resposta_direta_roantone(consulta)
    if direta:
        return {
            "resposta": direta,
            "modelo": "leitor_direto",
            "passos": [{"agente": "leitor", "modo": "roantone_direto"}],
            "meta": {
                "route": "pesquisar_sistema",
                "agente": "leitor",
                "direto": True,
                "fonte": "roantone",
            },
        }

    resultado = pesquisar_sistema(consulta, fontes=fontes)
    achados = resultado.get("achados") or []

    if not achados:
        return {
            "resposta": (
                "Nao encontrei nada no sistema para essa busca. "
                "Verifique se o repo esta indexado e se o termo existe "
                "(ROANTONE, Code.gs, WhatsApp log, OneDrive)."
            ),
            "modelo": "leitor",
            "passos": [{"agente": "leitor", "total": 0}],
            "meta": {"route": "pesquisar_sistema", "agente": "leitor", "total": 0},
        }

    top = achados[0]
    if float(top.get("relevancia") or 0) >= 0.95 and len(achados) == 1:
        return {
            "resposta": top.get("trecho") or formatar_achados(achados, 1),
            "modelo": "leitor_direto",
            "passos": [{"agente": "leitor", "total": 1, "fonte": top.get("fonte")}],
            "meta": {
                "route": "pesquisar_sistema",
                "agente": "leitor",
                "direto": True,
                "fonte": top.get("fonte"),
            },
        }

    bloco = formatar_achados(achados, max_itens=8)

    from agente import _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        return {
            "resposta": bloco,
            "modelo": "leitor_sem_llm",
            "passos": [{"agente": "leitor", "total": len(achados), "llm": False}],
            "meta": {
                "route": "pesquisar_sistema",
                "agente": "leitor",
                "total": len(achados),
            },
        }

    prompt = (
        "Voce e o LEITOR da Adonay. Responda em portugues do Brasil usando APENAS os achados abaixo. "
        "Cite a fonte (roantone, repositorio, manifesto, whatsapp, onedrive). "
        "Se a pergunta pede uma cor ROANTONE, informe hex, RGB e receita de tintas. "
        "NUNCA invente dados que nao estejam nos achados.\n\n"
        f"PERGUNTA: {consulta}\n\n"
        f"ACHADOS:\n{bloco}"
    )

    try:
        dados = _request_ollama(
            {
                "model": nome,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=90,
        )
        texto = dados.get("message", {}).get("content", "").strip() or bloco
    except Exception:
        texto = bloco

    return {
        "resposta": texto,
        "modelo": nome,
        "passos": [{"agente": "leitor", "total": len(achados), "llm": True}],
        "meta": {
            "route": "pesquisar_sistema",
            "agente": "leitor",
            "total": len(achados),
            "tokens": resultado.get("tokens"),
        },
    }


__all__ = ["executar", "parece_consulta_leitor"]
