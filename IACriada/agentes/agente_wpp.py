"""Agente WPP — le todas as conversas do periodo (24h → 7d → oferta 1 mes)."""

from __future__ import annotations

import re

from historico_db import carregar_ultimo_resultado, salvar_ultimo_resultado
from observador import status_observador
from wpp_leitor import (
    PERIODO_30D,
    ResultadoColeta,
    coletar_progressivo,
    confirmou_busca_um_mes,
    listar_clientes,
    mensagem_pedir_um_mes,
)


def _parse_sufixo_telefone(pergunta: str) -> str | None:
    n = pergunta or ""
    m = re.search(r"final\s+(?:do\s+)?(?:telefone\s+)?(?:n[uú]mero\s+)?(\d{4,})", n, re.I)
    if m:
        return m.group(1)[-4:]
    m = re.search(r"(\d{4})\s*(?:$|[^\d])", n)
    if m and any(k in n.lower() for k in ("telefone", "numero", "número", "final", "cliente")):
        return m.group(1)
    return None


def _pede_orcamento_ou_preco(pergunta: str) -> bool:
    n = (pergunta or "").lower()
    return any(
        k in n
        for k in (
            "orcamento",
            "orçamento",
            "cotacao",
            "cotação",
            "preco",
            "preço",
            "valor",
            "quanto custa",
            "solicitou",
            "pediu",
            "pedindo",
        )
    )


def _pede_lista_clientes(pergunta: str) -> bool:
    n = (pergunta or "").lower()
    if any(k in n for k in ("de quais clientes", "quais clientes", "todos os clientes", "lista de clientes")):
        return True
    if "cliente" in n and any(k in n for k in ("quais", "todos", "lista", "listar", "mostra", "mostre")):
        return True
    if re.search(r"quant[ao]s?\s+clientes", n):
        return True
    return False


def _pede_contagem_mensagens(pergunta: str) -> bool:
    n = re.sub(r"\s+", " ", (pergunta or "").strip().lower())
    return bool(re.search(r"quant[ao]s?\s+mensag", n))


def _rotulo_cliente(c: dict) -> str:
    tel = c.get("telefone") or "?"
    nome = (c.get("nome") or "").strip()
    return f"{nome} ({tel})" if nome else str(tel)


def _formatar_mensagem(m: dict, idx: int | None = None) -> str:
    tel = m.get("telefone") or "?"
    nome = (m.get("nome") or "").strip()
    rotulo = f"{nome} ({tel})" if nome else tel
    ts = m.get("ts") or "?"
    intent = m.get("intencao") or "outro"
    texto = (m.get("texto") or "").strip()
    prefix = f"{idx}. " if idx is not None else ""
    return f'{prefix}{rotulo} [{intent}] {ts}\n   "{texto[:300]}"'


def _serializar_mensagens(mensagens: list[dict]) -> list[dict]:
    return [
        {
            "telefone": m.get("telefone"),
            "nome": m.get("nome"),
            "texto": m.get("texto"),
            "intencao": m.get("intencao"),
            "ts": m.get("ts"),
        }
        for m in mensagens
    ]


def _salvar_contexto(
    sessao: str,
    pergunta: str,
    coleta: ResultadoColeta,
    *,
    aguardando_mes: bool = False,
    filtro_comercial: bool = False,
) -> None:
    if not sessao:
        return
    salvar_ultimo_resultado(
        sessao,
        "mensagens_whatsapp",
        {
            "mensagens": _serializar_mensagens(coleta.mensagens),
            "clientes": coleta.clientes,
            "pergunta_original": pergunta,
            "periodo_horas": coleta.periodo_horas,
            "periodo_rotulo": coleta.rotulo,
            "filtro_comercial": filtro_comercial,
            "aguardando_confirmacao_mes": aguardando_mes,
            "expandiu_periodo": coleta.expandiu,
        },
    )


def detectar_confirmacao_mes(pergunta: str, sessao: str) -> bool:
    if not confirmou_busca_um_mes(pergunta):
        return False
    ultimo = carregar_ultimo_resultado(sessao) or {}
    if ultimo.get("tipo") != "mensagens_whatsapp":
        return confirmou_busca_um_mes(pergunta)
    dados = ultimo.get("dados") or {}
    return bool(dados.get("aguardando_confirmacao_mes")) or confirmou_busca_um_mes(pergunta)


def _montar_resposta(pergunta: str, coleta: ResultadoColeta, filtro_comercial: bool) -> str:
    status = status_observador()
    conectado = status.get("whatsapp_conectado")
    nome_conta = (status.get("whatsapp_nome") or "").strip()

    if coleta.pedir_confirmacao_mes and not coleta.mensagens:
        return mensagem_pedir_um_mes(pergunta, coleta.rotulo)

    cab = []
    if conectado:
        cab.append(f"WhatsApp conectado{f' ({nome_conta})' if nome_conta else ''}.")
    else:
        cab.append("WhatsApp desconectado — so ha mensagens capturadas desde a ultima conexao do bot.")

    rotulo = coleta.rotulo
    if coleta.expandiu and coleta.mensagens:
        cab.append(f"Busca ampliada automaticamente para: ultimos {rotulo}.")
    else:
        cab.append(f"Periodo: ultimos {rotulo}.")

    cab.append(
        f"{coleta.total_log_periodo} mensagem(ns) no log no periodo; "
        f"{len(coleta.mensagens)} apos filtros; "
        f"{len(coleta.clientes)} cliente(s) distintos."
    )
    if filtro_comercial:
        cab.append("Filtro: orcamento ou preco.")

    if _pede_contagem_mensagens(pergunta) and not _pede_lista_clientes(pergunta):
        n = len(coleta.mensagens)
        nc = len(coleta.clientes)
        if n == 0:
            return "\n".join(cab) + "\n\nNenhuma mensagem encontrada."
        return (
            "\n".join(cab)
            + f"\n\n{n} mensagem(ns) de {nc} cliente(s). "
            + "Quer ver a lista de clientes ou o detalhe das mensagens?"
        )

    if _pede_lista_clientes(pergunta):
        if not coleta.clientes:
            return "\n".join(cab) + "\n\nNenhum cliente encontrado no periodo."
        linhas = [f"· {_rotulo_cliente(c)} — {c['mensagens']} msg(s)" for c in coleta.clientes[:80]]
        return "\n".join(cab) + f"\n\n{len(coleta.clientes)} cliente(s):\n" + "\n".join(linhas)

    if not coleta.mensagens:
        return (
            "\n".join(cab)
            + "\n\nNenhuma mensagem encontrada. Mensagens so entram no log com o bot conectado."
        )

    max_exibir = 40
    linhas = ["\n".join(cab), ""]
    for i, m in enumerate(coleta.mensagens[:max_exibir], 1):
        linhas.append(_formatar_mensagem(m, i))
    if len(coleta.mensagens) > max_exibir:
        linhas.append(f"\n(+ {len(coleta.mensagens) - max_exibir} mensagens omitidas)")
    linhas.append(
        f"\nTotal: {len(coleta.mensagens)} mensagem(ns) de {len(coleta.clientes)} cliente(s)."
    )
    return "\n".join(linhas)


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    *,
    sessao: str = "padrao",
) -> dict:
    params = params or {}
    sufixo = params.get("telefone_sufixo") or _parse_sufixo_telefone(pergunta)
    filtro_comercial = params.get("filtro") in ("orcamento", "preco", "comercial") or _pede_orcamento_ou_preco(
        pergunta
    )
    intencoes = ["orcamento", "preco"] if filtro_comercial else None

    forcar_dias = params.get("forcar_dias")
    if forcar_dias is None and params.get("periodo_dias"):
        forcar_dias = int(params["periodo_dias"])
    if forcar_dias is None and confirmou_busca_um_mes(pergunta):
        forcar_dias = 30

    ultimo = carregar_ultimo_resultado(sessao) or {}
    if (
        forcar_dias is None
        and confirmou_busca_um_mes(pergunta)
        and (ultimo.get("dados") or {}).get("aguardando_confirmacao_mes")
    ):
        forcar_dias = 30
        pergunta = (ultimo.get("dados") or {}).get("pergunta_original") or pergunta

    coleta = coletar_progressivo(
        pergunta,
        telefone_sufixo=sufixo,
        intencoes=intencoes,
        forcar_dias=forcar_dias,
    )

    aguardando = coleta.pedir_confirmacao_mes and not coleta.mensagens
    _salvar_contexto(sessao, pergunta, coleta, aguardando_mes=aguardando, filtro_comercial=filtro_comercial)

    resposta = _montar_resposta(pergunta, coleta, filtro_comercial)

    usar_llm = (
        modelo
        and coleta.mensagens
        and not _pede_contagem_mensagens(pergunta)
        and not _pede_lista_clientes(pergunta)
        and len(pergunta.split()) >= 6
    )

    if usar_llm:
        from agente import _request_ollama, resolver_modelo

        nome = resolver_modelo(modelo)
        if nome:
            ctx_msgs = "\n".join(_formatar_mensagem(m) for m in coleta.mensagens[:35])
            prompt = (
                "Voce e o Agente WPP da Adonay. Responda em portugues usando APENAS as mensagens abaixo. "
                f"Periodo: {coleta.rotulo}. NUNCA invente clientes ou textos.\n\n"
                f"PERGUNTA: {pergunta}\n\nMENSAGENS:\n{ctx_msgs}"
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
                txt = dados.get("message", {}).get("content", "").strip()
                if txt:
                    resposta = f"{coleta.rotulo} — {len(coleta.clientes)} cliente(s)\n\n{txt}"
            except Exception:
                pass

    return {
        "resposta": resposta,
        "modelo": "agente_wpp",
        "passos": [
            {
                "agente": "agente_wpp",
                "mensagens": len(coleta.mensagens),
                "clientes": len(coleta.clientes),
                "periodo": coleta.rotulo,
                "expandiu": coleta.expandiu,
                "pedir_mes": coleta.pedir_confirmacao_mes,
            }
        ],
        "meta": {
            "route": "consultar_mensagens_whatsapp",
            "agente": "agente_wpp",
            "mensagens": len(coleta.mensagens),
            "clientes": len(coleta.clientes),
            "periodo_rotulo": coleta.rotulo,
            "expandiu_periodo": coleta.expandiu,
            "aguardando_confirmacao_mes": aguardando,
            "filtro_comercial": filtro_comercial,
        },
    }


# Compatibilidade com nome antigo
def executar_consultor(*args, **kwargs):
    return executar(*args, **kwargs)
