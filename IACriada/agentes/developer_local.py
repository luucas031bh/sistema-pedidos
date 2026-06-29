"""Agente Developer Local — consulta codigo indexado do sistema-pedidos."""

from __future__ import annotations


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    *,
    historico: list | None = None,
) -> dict:
    from agente import SISTEMA_CODIGO, _request_ollama, resolver_modelo
    from consultar_sistema_pedidos import buscar_contexto, tema_sistema_pedidos

    texto = pergunta if tema_sistema_pedidos(pergunta) else f"codigo sistema pedidos: {pergunta}"
    ctx = buscar_contexto(texto)

    if not ctx.get("ok"):
        return {
            "resposta": ctx.get("erro") or "Nao foi possivel ler o projeto sistema-pedidos.",
            "modelo": "developer_local",
            "passos": [{"agente": "developer_local", "erro": True}],
            "meta": {"route": "criar_nova_funcionalidade_no_codigo", "agente": "developer_local"},
        }

    bloco = ctx.get("contexto") or ""
    if not bloco.strip():
        return {
            "resposta": "Indice do codigo vazio. Indexe o repositorio sistema-pedidos primeiro.",
            "modelo": "developer_local",
            "passos": [{"agente": "developer_local"}],
            "meta": {"route": "criar_nova_funcionalidade_no_codigo", "agente": "developer_local"},
        }

    nome = resolver_modelo(modelo)
    if not nome:
        arquivos = ctx.get("arquivos") or []
        return {
            "resposta": f"Encontrei {ctx.get('trechos', 0)} trecho(s) em: {', '.join(arquivos[:6])}.",
            "modelo": "developer_local",
            "passos": [{"agente": "developer_local", "trechos": ctx.get("trechos", 0)}],
            "meta": {"route": "criar_nova_funcionalidade_no_codigo", "agente": "developer_local"},
        }

    try:
        dados = _request_ollama(
            {
                "model": nome,
                "messages": [
                    {"role": "system", "content": SISTEMA_CODIGO + "\n" + bloco[:28000]},
                    {"role": "user", "content": pergunta},
                ],
                "stream": False,
                "options": {"temperature": 0.1},
            },
            timeout=120,
        )
        texto_resp = dados.get("message", {}).get("content", "").strip()
    except Exception as exc:
        texto_resp = f"Erro ao consultar codigo: {exc}"

    return {
        "resposta": texto_resp or "Sem resposta do Developer Local.",
        "modelo": nome,
        "passos": [{"agente": "developer_local", "arquivos": len(ctx.get("arquivos") or [])}],
        "meta": {
            "route": "criar_nova_funcionalidade_no_codigo",
            "agente": "developer_local",
            "sistema_codigo": True,
        },
    }
