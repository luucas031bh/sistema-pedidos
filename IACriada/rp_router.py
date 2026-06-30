"""Roteamento deterministico de perguntas sobre o RP."""

from __future__ import annotations

import re
from datetime import date

from consultar_rp import (
    agregar_pecas_abertos_rp,
    buscar_pedido_rp,
    buscar_pedidos_rp,
    contar_etapa_producao_rp,
    entregas_periodo_rp,
    extrair_filtros_do_texto,
    listar_pedidos_rp,
    relatorio_periodo_rp,
    resumo_financeiro_rp,
    segunda_domingo_semana,
    _norm,
)
from rp_formatadores import format_intent_fallback
from rp_entidades import (
    candidatos_busca_cliente,
    escolher_pedido_por_nome,
    extrair_entidades_rp,
)


def _extrair_datas_iso(texto: str) -> list[str]:
    encontradas = re.findall(r"\b(20\d{2}-\d{2}-\d{2})\b", texto)
    if len(encontradas) >= 2:
        return encontradas[:2]
    encontradas_br = re.findall(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", texto)
    if len(encontradas_br) >= 2:
        out = []
        for d, m, y in encontradas_br[:2]:
            out.append(f"{y}-{int(m):02d}-{int(d):02d}")
        return out
    return []


def _extrair_etapa(texto_norm: str) -> str | None:
    filtros = extrair_filtros_do_texto(texto_norm)
    return filtros.get("etapa_producao") or filtros.get("status_operacional")


def _extrair_termo_busca(texto: str, texto_norm: str) -> str | None:
    ent = extrair_entidades_rp(texto)
    if ent.get("termo_busca"):
        return ent["termo_busca"]
    m = re.search(r"\b(\d{4})\b", texto)
    if m:
        return m.group(1)
    return None


def _resolver_pedido_por_termo(termo: str) -> dict:
    """buscarPedido com candidatos e fuzzy quando ha varios resultados."""
    termo = (termo or "").strip()
    if not termo:
        return {"sucesso": False, "erro": "Informe cliente, codigo ou nome do pedido"}

    for cand in candidatos_busca_cliente(termo):
        data = buscar_pedido_rp(cand)
        if data.get("sucesso") and data.get("pedido"):
            return data

    for cand in candidatos_busca_cliente(termo):
        multi = buscar_pedidos_rp(cand)
        if not multi.get("sucesso"):
            continue
        lista = multi.get("pedidos") or []
        if not lista:
            continue
        escolhido = escolher_pedido_por_nome(lista, termo)
        if escolhido:
            return {"sucesso": True, "pedido": escolhido}

    return {"sucesso": False, "erro": "Pedido nao encontrado"}


def rotear_tamanhos_pedido_especifico(raw: str, params: dict | None = None) -> dict | None:
    """API publica: tamanhos de um pedido (cliente/codigo)."""
    p = params or {}
    n = _norm(raw)
    return _rota_tamanhos_pedido_especifico(raw, n, p)


def _rota_tamanhos_pedido_especifico(raw: str, n: str, p: dict) -> dict | None:
    """Tamanhos/quantidades de UM pedido (cliente ou codigo), nao da fila inteira."""
    ent = extrair_entidades_rp(raw)
    if not ent.get("quer_tamanhos"):
        return None

    termo = p.get("codigo") or p.get("cliente") or ent.get("codigo") or ent.get("cliente")
    if not termo and ent.get("escopo_pedido"):
        termo = ent.get("termo_busca")

    if not termo:
        return None
    if not ent.get("escopo_pedido") and not ent.get("cliente") and not ent.get("codigo"):
        return None

    data = _resolver_pedido_por_termo(str(termo))
    txt = format_intent_fallback("tamanhos_pedido", data)
    return {
        "ok": bool(data.get("sucesso")),
        "action": "buscarPedido",
        "kind": "tamanhos_pedido",
        "facts": data,
        "texto_formatado": txt,
        "erro": data.get("erro") if not data.get("sucesso") else None,
    }


def tema_parece_rp(texto: str) -> bool:
    """Detecta se a mensagem parece consulta ao sistema de pedidos."""
    try:
        from intencoes import tema_consulta_rp_viva

        if tema_consulta_rp_viva(texto):
            return True
    except ImportError:
        pass
    return _tema_rp(_norm(texto or ""))


def _tema_rp(texto_norm: str) -> bool:
    if any(
        k in texto_norm
        for k in (
            "pedido",
            "pedidos",
            " rp",
            "rp ",
            "fila",
            "status",
            "producao",
            "produção",
            "etapa",
            "entrega",
            "malha",
            "peca",
            "peça",
            "financeiro",
            "relatorio",
            "relatório",
            "resumo",
            "valor",
            "recebido",
            "receber",
            "faturamento",
            "planilha",
        )
    ):
        return True
    etapas_chave = (
        "arte",
        "insumos",
        "corte",
        "estampa",
        "costura",
        "embalo",
        "aguardando",
    )
    return any(e in texto_norm for e in etapas_chave)


def rotear_pergunta_rp(texto: str, params: dict | None = None) -> dict:
    """
    Retorna dict com ok, action, kind, facts, texto_formatado.
    """
    raw = (texto or "").strip()
    n = _norm(raw)
    p = params or {}

    if not _tema_rp(n) and not p.get("forcar_rp"):
        return {"ok": False, "erro": "Nao e consulta ao RP", "action": "none"}

    # Resumo financeiro (aceita typos: relatorioo, financeir)
    if any(
        k in n
        for k in (
            "resumo financeiro",
            "relatorio financeiro",
            "relatorioo financeiro",
            "financeiro",
            "financeir",
            "faturamento",
            "valor recebido",
            "valor a receber",
            "quanto tenho",
            "quanto falta",
            "kpi",
            "indicadores",
        )
    ) and any(
        k in n
        for k in (
            "pedido",
            "pedidos",
            "trabalho",
            "aberto",
            "abertos",
            "fila",
            "rp",
            "resumo",
            "relatorio",
            "relatorioo",
        )
    ):
        incluir_hist = any(
            x in n for x in ("historico", "histórico", "todos", "planilha", "geral")
        )
        r = resumo_financeiro_rp(incluir_historico=incluir_hist)
        if not r.get("ok"):
            return r
        return {
            "ok": True,
            "action": "resumo_financeiro",
            "kind": "resumo_financeiro",
            "facts": r,
            "texto_formatado": r.get("texto_formatado", ""),
        }

    # Detalhe de um pedido
    if any(
        k in n
        for k in ("detalhe", "detalhes", "informacoes do pedido", "informações", "dados do pedido")
    ) or (("pedido" in n or "cliente" in n) and re.search(r"\b\d{4}\b", raw)):
        termo = p.get("codigo") or p.get("cliente") or _extrair_termo_busca(raw, n)
        if termo:
            data = _resolver_pedido_por_termo(str(termo))
            txt = format_intent_fallback("detalhe_pedido", data)
            return {
                "ok": bool(data.get("sucesso")),
                "action": "buscarPedido",
                "kind": "detalhe_pedido",
                "facts": data,
                "texto_formatado": txt,
            }

    # Tamanhos/quantidades de UM pedido (antes do agregado global)
    rota_pedido = _rota_tamanhos_pedido_especifico(raw, n, p)
    if rota_pedido is not None:
        return rota_pedido

    # Busca multipla
    if any(k in n for k in ("busca", "buscar", "procurar", "encontrar")) and (
        "pedido" in n or "cliente" in n or "rp" in n
    ):
        termo = _extrair_termo_busca(raw, n)
        if termo:
            data = buscar_pedidos_rp(termo)
            txt = format_intent_fallback("busca_pedidos", data)
            return {
                "ok": True,
                "action": "buscarPedidos",
                "kind": "busca_pedidos",
                "facts": data,
                "texto_formatado": txt,
            }

    # Relatorio agregado por periodo (somente com datas explicitas)
    datas = _extrair_datas_iso(raw)
    if ("relatorio" in n or "relatório" in n) and len(datas) >= 2:
        dim = "tipoMalha"
        if "cor" in n:
            dim = "corMalha"
        elif "status" in n:
            dim = "status"
        elif "peca" in n or "peça" in n:
            dim = "tipoPeca"
        data = relatorio_periodo_rp(datas[0], datas[1], dimensao=dim)
        txt = format_intent_fallback("relatorio_periodo", data)
        return {
            "ok": True,
            "action": "relatorioPedidos",
            "kind": "relatorio_periodo",
            "facts": data,
            "texto_formatado": txt,
        }

    # Entregas da semana / periodo
    if any(k in n for k in ("entrega", "entregar", "entregas")) and any(
        k in n for k in ("semana", "periodo", "período", "hoje", "mes", "mês")
    ):
        if "semana" in n:
            ini, fim = segunda_domingo_semana()
        else:
            datas = _extrair_datas_iso(raw)
            if len(datas) >= 2:
                ini, fim = datas[0], datas[1]
            else:
                ini, fim = segunda_domingo_semana()
        data = entregas_periodo_rp(ini, fim)
        txt = format_intent_fallback("entregas_no_periodo", data)
        return {
            "ok": True,
            "action": "listarPedidosEntregaPeriodo",
            "kind": "entregas_no_periodo",
            "facts": data,
            "texto_formatado": txt,
        }

    # Pecas por tamanho
    if any(k in n for k in ("tamanho", "tamanhos", "pecas por", "peças por")):
        cor = None
        m = re.search(r"cor\s+(\w+)", n)
        if m:
            cor = m.group(1)
        elif "preta" in n or "preto" in n:
            cor = "preta"
        data = agregar_pecas_abertos_rp(cor)
        txt = format_intent_fallback("pecas_por_tamanho_abertos", data)
        return {
            "ok": True,
            "action": "agregarPecasAbertos",
            "kind": "pecas_por_tamanho_abertos",
            "facts": data,
            "texto_formatado": txt,
        }

    # Contagem por etapa
    if any(k in n for k in ("quantos", "quantas", "numero de", "número de", "contagem")):
        etapa = _extrair_etapa(n) or p.get("etapa_producao")
        if etapa:
            data = contar_etapa_producao_rp(etapa)
            txt = format_intent_fallback("contagem_etapa_producao", data)
            return {
                "ok": True,
                "action": "contarPorEtapaProducao",
                "kind": "contagem_etapa_producao",
                "facts": data,
                "texto_formatado": txt,
            }

    # Lista / relatorio informal por etapa (padrao mais comum)
    etapa = p.get("etapa_producao") or _extrair_etapa(n)
    filtros = extrair_filtros_do_texto(raw)
    apenas = p.get("apenas_abertos", filtros.get("apenas_abertos", True))
    if "todos" in n or "todas" in n:
        apenas = False
    elif "aberto" in n or "abertos" in n or "fila" in n:
        apenas = True

    if etapa or any(
        k in n
        for k in (
            "lista",
            "listar",
            "liste",
            "mostra",
            "mostrar",
            "me fala",
            "me diga",
            "quais",
            "relatorio",
            "relatório",
            "faça",
            "faca",
            "gere",
            "monte",
        )
    ) or ("relatorio" in n or "relatório" in n):
        r = listar_pedidos_rp(
            etapa_producao=etapa,
            status_operacional=p.get("status_operacional") or filtros.get("status_operacional"),
            apenas_abertos=apenas,
            cliente=p.get("cliente"),
            limite=0,
        )
        if not r.get("ok"):
            return r
        return {
            "ok": True,
            "action": "listarPedidos",
            "kind": "lista_filtrada",
            "facts": r,
            "total": r.get("total"),
            "texto_formatado": r.get("texto_formatado", ""),
        }

    if ("relatorio" in n or "relatório" in n) and len(datas) < 2:
        return {
            "ok": False,
            "action": "relatorioPedidos",
            "erro": "Periodo nao informado",
            "texto_formatado": (
                "Para relatorio agregado por periodo, informe duas datas "
                "(YYYY-MM-DD ou DD/MM/AAAA). Para listar pedidos em uma etapa, "
                "diga por exemplo: pedidos em aberto em Insumos."
            ),
        }

    # Fila geral
    if "fila" in n or "abertos" in n:
        r = listar_pedidos_rp(apenas_abertos=True, limite=0)
        return {
            "ok": True,
            "action": "listarPedidos",
            "kind": "lista_pedidos",
            "facts": {"sucesso": True, "pedidos": r.get("pedidos_raw", [])},
            "texto_formatado": r.get("texto_formatado", ""),
        }

    return {
        "ok": False,
        "action": "none",
        "erro": "Nao entendi a consulta ao RP. Seja mais especifico (etapa, periodo, cliente ou codigo).",
        "texto_formatado": "",
    }


def montar_resposta_rp_direta(dados: dict) -> str | None:
    """
    Monta resposta final a partir dos dados reais do RP.
    Retorna None apenas se a mensagem nao for tema RP.
    """
    if dados.get("erro") == "Nao e consulta ao RP":
        return None

    txt = (dados.get("texto_formatado") or "").strip()
    if not txt:
        if not dados.get("ok"):
            return (
                "Nao consegui consultar o sistema de pedidos agora: "
                f"{dados.get('erro') or 'erro desconhecido'}."
            )
        return "Consulta ao RP concluida, mas nao ha dados para exibir."

    facts = dados.get("facts") or {}
    total = dados.get("total")
    if total is None and isinstance(facts, dict):
        total = facts.get("total")

    if dados.get("ok"):
        action = dados.get("action", "")
        if action == "resumo_financeiro":
            cab = "Resumo financeiro (dados reais da planilha, pedidos em aberto):\n\n"
        elif action == "listarPedidos" and total is not None:
            cab = (
                f"Pedidos no RP — consultados na planilha agora ({total} encontrado(s)). "
                "Somente esta lista:\n\n"
            )
        elif action == "contarPorEtapaProducao":
            cab = "Contagem no RP (planilha):\n\n"
        elif action == "buscarPedido":
            kind = dados.get("kind") or ""
            if kind == "tamanhos_pedido":
                cab = "Tamanhos e quantidades do pedido (planilha RP):\n\n"
            else:
                cab = "Detalhe do pedido (sistema RP):\n\n"
        else:
            cab = "Consulta ao RP (dados reais da planilha, agora):\n\n"
        rodape = "\n\n— Fonte: planilha do sistema de pedidos (nao inventar outros nomes)."
        return cab + txt + rodape

    return txt
