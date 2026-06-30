"""Agente WPP — le todas as conversas do periodo (24h → 7d → oferta 1 mes)."""

from __future__ import annotations

import re

from historico_db import carregar_ultimo_resultado, salvar_ultimo_resultado
from observador import status_observador
from wpp_analise import enriquecer_mensagem, formatar_linha_mensagem, montar_contexto_analise
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
    m = enriquecer_mensagem(m)
    prefix = f"{idx}. " if idx is not None else ""
    return prefix + formatar_linha_mensagem(m)


def _serializar_mensagens(mensagens: list[dict]) -> list[dict]:
    out = []
    for raw in mensagens:
        m = enriquecer_mensagem(raw)
        out.append(
            {
                "telefone": m.get("telefone"),
                "nome": m.get("nome"),
                "texto": m.get("texto"),
                "intencao": m.get("intencao"),
                "ts": m.get("ts"),
                "data_hora_br": m.get("data_hora_br"),
                "direcao": m.get("direcao"),
                "tom": m.get("tom"),
                "autor": m.get("autor"),
            }
        )
    return out


def _resposta_simples(pergunta: str, coleta: ResultadoColeta, filtro_comercial: bool) -> bool:
    """Contagem ou lista de clientes — resposta direta sem LLM."""
    if _pede_contagem_mensagens(pergunta) and not _pede_lista_clientes(pergunta):
        return True
    if _pede_lista_clientes(pergunta):
        return True
    return False


def _deve_usar_llm(pergunta: str, coleta: ResultadoColeta) -> bool:
    if not coleta.mensagens:
        return False
    n = (pergunta or "").lower()
    if any(
        k in n
        for k in (
            "resumo",
            "organiz",
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
            "detalhe",
            "explica",
            "contexto",
            "situacao",
            "situação",
            "pedido",
            "mandou",
            "escreveu",
            "disse",
        )
    ):
        return True
    return len((pergunta or "").split()) >= 5


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

    if _resposta_simples(pergunta, coleta, filtro_comercial) or aguardando or not coleta.mensagens:
        resposta = _montar_resposta(pergunta, coleta, filtro_comercial)
    else:
        texto_factual, facts = montar_contexto_analise(pergunta, coleta)
        resposta = texto_factual
        if modelo and _deve_usar_llm(pergunta, coleta):
            from agentes.interpretador import sintetizar_whatsapp

            sintetizada = sintetizar_whatsapp(
                pergunta,
                texto_factual,
                facts=facts,
                modelo=modelo,
                forcar_llm=True,
            )
            if sintetizada and sintetizada.strip():
                cab = f"WhatsApp — {coleta.rotulo} · {len(coleta.clientes)} contato(s) · {len(coleta.mensagens)} msg(s)\n\n"
                resposta = cab + sintetizada.strip()
        elif len(texto_factual) > 12000:
            resposta = texto_factual[:12000] + "\n\n… (analise truncada; use LLM para resumo completo)"

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
            "llm_analise": bool(modelo and _deve_usar_llm(pergunta, coleta)),
        },
    }


# Compatibilidade com nome antigo
def executar_consultor(*args, **kwargs):
    return executar(*args, **kwargs)
