"""Formatacao de respostas RP (port de respostas.js do bot)."""

from __future__ import annotations

from consultar_rp import id_busca_pedido, nome_cliente, pedido_conta_kpi, pedido_esta_aberto


def fmt_money(valor) -> str:
    if valor is None:
        return "—"
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return "—"
    s = f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def linha_pedido_resumo(p: dict, idx: int) -> str:
    pid = p.get("id") or "—"
    nome = nome_cliente(p)
    st = str(p.get("statusOperacional") or "").strip() or "—"
    fin = p.get("financeiro") or {}
    total = fmt_money(fin.get("totalPedido"))
    pecas = p.get("totalPecas", "—")
    return f"{idx + 1}. {nome} {id_busca_pedido(p)} · {pecas} pc · {total} · {st}"


def linha_pedido_simples(p: dict) -> str:
    return f"{nome_cliente(p)} {id_busca_pedido(p)}"


def format_lista_abertos(pedidos: list, max_linhas: int = 500) -> str:
    abertos = [p for p in (pedidos or []) if pedido_esta_aberto(p)]
    if not abertos:
        return "Nenhum pedido em aberto."
    slice_p = abertos[:max_linhas]
    linhas = [linha_pedido_simples(p) for p in slice_p]
    cab = f"Pedidos em aberto ({len(abertos)}"
    if len(abertos) > max_linhas:
        cab += f", mostrando {max_linhas}"
    cab += "):\n"
    out = cab + "\n".join(linhas)
    if len(abertos) > max_linhas:
        out += '\n\n(Refine com "busca (termo)".)'
    return out


def format_lista_filtrada(pedidos: list, titulo: str = "Pedidos", max_linhas: int = 500) -> str:
    if not pedidos:
        return f"{titulo}: nenhum pedido encontrado."
    slice_p = pedidos[:max_linhas]
    linhas = [linha_pedido_simples(p) for p in slice_p]
    cab = f"{titulo} ({len(pedidos)}"
    if len(pedidos) > max_linhas:
        cab += f", mostrando {max_linhas}"
    cab += "):\n"
    out = cab + "\n".join(linhas)
    if len(pedidos) > max_linhas:
        out += f"\n\n(+{len(pedidos) - max_linhas} omitidos)"
    return out


def format_busca_multipla(data: dict, max_linhas: int = 15) -> str:
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'falha ao buscar'}"
    lista = data.get("pedidos") or []
    if not lista:
        return "Nenhum pedido encontrado para esse termo."
    slice_p = lista[:max_linhas]
    linhas = [linha_pedido_resumo(p, i) for i, p in enumerate(slice_p)]
    msg = f"Encontrados {len(lista)} pedido(s)"
    if len(lista) > max_linhas:
        msg += f" (mostrando {max_linhas})"
    msg += ":\n" + "\n".join(linhas)
    if len(lista) > max_linhas:
        msg += "\n\n(Seja mais especifico no termo.)"
    return msg


def format_busca_um(data: dict) -> str:
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'nao encontrado'}"
    p = data.get("pedido")
    if not p:
        return "Pedido nao encontrado."
    fin = p.get("financeiro") or {}
    linhas = [
        f"Pedido {p.get('id', '—')}",
        f"Cliente: {nome_cliente(p)} ({(p.get('cliente') or {}).get('telefone', '—')})",
        f"ID busca: {id_busca_pedido(p)}",
        f"Status: {p.get('statusOperacional') or '—'}",
        f"Etapa producao: {p.get('etapaProducaoAtual') or '—'}",
        f"Pecas: {p.get('totalPecas', '—')} · Total: {fmt_money(fin.get('totalPedido'))}",
        f"Pago: {fmt_money(fin.get('valorEntrada'))} · Restante: {fmt_money(fin.get('restante'))}",
        f"Pedido: {p.get('datas', {}).get('pedido', '—')} · Entrega: {p.get('datas', {}).get('entrega', '—')}",
    ]
    produtos = p.get("produtos") or []
    if produtos:
        linhas.append(f"Produtos: {len(produtos)} linha(s) no pedido.")
        for i, prod in enumerate(produtos[:5]):
            linhas.append(
                f"  - {prod.get('tipoPeca', '?')} | {prod.get('tipoMalha', '?')} | "
                f"{prod.get('corMalha', '?')} | {prod.get('detalhesPeca', prod.get('detalhePeca', ''))}"
            )
    obs = str(p.get("observacoes") or "").strip()
    if obs:
        linhas.append(f"Obs: {obs[:500]}{'…' if len(obs) > 500 else ''}")
    return "\n".join(linhas)


def format_relatorio(data: dict) -> str:
    if not data.get("sucesso"):
        return f"Relatorio: {data.get('erro') or 'erro'}"
    periodo = data.get("periodo") or {}
    grupos = data.get("grupos") or []
    totais = data.get("totais") or {}
    dim = data.get("dimensao", "—")
    nivel = data.get("nivel", "—")
    head = (
        f"Relatorio {periodo.get('inicio')} -> {periodo.get('fim')}\n"
        f"Dimensao: {dim} · Nivel: {nivel}\n"
    )
    tot = (
        f"Totais: R$ {totais.get('valor', '—')} · "
        f"{totais.get('pecas', '—')} pc · {totais.get('pedidos', '—')} pedidos\n"
    )
    top = [
        f"{i + 1}. {g.get('chave')}: R$ {g.get('valor')} ({g.get('pecas')} pc, {g.get('pedidos')} ped.)"
        for i, g in enumerate(grupos[:25])
    ]
    return head + tot + ("\n".join(top) if top else "(Sem grupos.)")


def format_contagem_etapa(data: dict) -> str:
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'contagem'}"
    ids = (data.get("ids") or [])[:30]
    total = data.get("total", 0)
    etapa = data.get("etapa", "—")
    extra = ""
    if total > len(ids):
        extra = f"\n(+{total - len(ids)} IDs omitidos)"
    ids_txt = ", ".join(ids) if ids else ""
    return f"Etapa {etapa}: {total} pedido(s)\n{('IDs: ' + ids_txt) if ids_txt else ''}{extra}"


def format_entregas_periodo(data: dict, max_linhas: int = 40) -> str:
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'lista'}"
    ped = data.get("pedidos") or []
    periodo = data.get("periodo") or {}
    if not ped:
        return (
            f"Nenhum pedido com entrega entre {periodo.get('inicio')} e {periodo.get('fim')}."
        )
    slice_p = ped[:max_linhas]
    linhas = []
    for i, p in enumerate(slice_p):
        busca = p.get("idBusca") or id_busca_pedido(p) if isinstance(p, dict) else "—"
        if not isinstance(p, dict):
            continue
        cliente = p.get("cliente") if isinstance(p.get("cliente"), str) else nome_cliente(p)
        prod = p.get("resumoProduto") or "—"
        linhas.append(
            f"{i + 1}. Cliente: {cliente} | ID: {p.get('id')} | Busca: {busca} | "
            f"Status: {p.get('statusOperacional', '—')} | Prod: {prod}\n"
            f"   Entrega: {p.get('entrega', '—')}"
        )
    out = (
        f"Entregas no periodo ({periodo.get('inicio')} -> {periodo.get('fim')})\n"
        f"Total: {len(ped)}\n\n" + "\n".join(linhas)
    )
    if len(ped) > max_linhas:
        out += f"\n\n(Mostrando {max_linhas} de {len(ped)}.)"
    return out


def format_tamanhos_pedido(data: dict) -> str:
    """Tamanhos e quantidades de um pedido (produtos[].tamanhos[])."""
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'nao encontrado'}"
    p = data.get("pedido")
    if not p:
        return "Pedido nao encontrado."
    produtos = p.get("produtos") or []
    linhas = [
        f"Pedido {p.get('id', '—')} · Cliente: {nome_cliente(p)} · ID busca: {id_busca_pedido(p)}",
        f"Status: {p.get('statusOperacional') or '—'} · Total pecas: {p.get('totalPecas', '—')}",
        "",
        "Tamanhos e quantidades:",
    ]
    total_qtd = 0
    tem_grade = False
    for i, prod in enumerate(produtos):
        tamanhos = prod.get("tamanhos") or []
        if not tamanhos:
            continue
        tem_grade = True
        titulo = (
            f"{prod.get('tipoPeca', '?')} | {prod.get('tipoMalha', '?')} | "
            f"{prod.get('corMalha', '?')}"
        )
        det = prod.get("detalhesPeca") or prod.get("detalhePeca") or ""
        if det:
            titulo += f" | {det}"
        linhas.append(f"\nProduto {i + 1}: {titulo}")
        agregado: dict[str, int] = {}
        for tm in tamanhos:
            if not isinstance(tm, dict):
                continue
            tam = str(tm.get("tamanho") or "").strip()
            if not tam:
                continue
            qtd = int(tm.get("quantidade") or 0)
            if qtd <= 0:
                continue
            agregado[tam] = agregado.get(tam, 0) + qtd
            total_qtd += qtd
        for tam in sorted(agregado.keys(), key=lambda x: (len(x), x)):
            linhas.append(f"  · {tam}: {agregado[tam]} pc")
    if not tem_grade:
        return (
            f"Pedido {p.get('id', '—')} — {nome_cliente(p)}: "
            "nenhum tamanho/quantidade cadastrado nos produtos deste pedido."
        )
    linhas.append(f"\nTotal (soma das grades): {total_qtd} pc")
    return "\n".join(linhas)


def format_agregacao_tamanhos(data: dict) -> str:
    if not data.get("sucesso"):
        return f"Erro: {data.get('erro') or 'agregacao'}"
    mapa = data.get("totaisPorTamanho") or {}
    if not mapa:
        cor = data.get("corFiltro")
        if cor:
            return f'Nenhuma peca em pedido aberto com cor contendo "{cor}".'
        return "Nenhuma peca encontrada em pedidos abertos."
    linhas = [f"· {k}: {v} pc" for k, v in mapa.items()]
    filtro = f'\nFiltro cor: {data.get("corFiltro")}\n' if data.get("corFiltro") else "\n"
    return (
        f"Pecas por tamanho (pedidos em aberto){filtro}"
        f"Total: {data.get('totalPecas')} pc · Pedidos: {data.get('pedidosComPeca')}\n\n"
        + "\n".join(linhas)
    )


def format_resumo_financeiro(
    pedidos_abertos: list,
    incluir_stats: dict | None = None,
) -> str:
    kpi = [p for p in pedidos_abertos if pedido_conta_kpi(p)]
    total = sum((p.get("financeiro") or {}).get("totalPedido") or 0 for p in kpi)
    recebido = sum((p.get("financeiro") or {}).get("valorEntrada") or 0 for p in kpi)
    a_receber = total - recebido
    pecas = sum(p.get("totalPecas") or 0 for p in kpi)
    linhas = [
        "Resumo financeiro — pedidos em aberto (fila)",
        f"Pedidos: {len(kpi)}",
        f"Pecas: {pecas}",
        f"Valor total: {fmt_money(total)}",
        f"Valor recebido: {fmt_money(recebido)}",
        f"Valor a receber: {fmt_money(a_receber)}",
    ]
    if incluir_stats:
        st = incluir_stats
        linhas.append("")
        linhas.append("Estatisticas gerais da planilha:")
        linhas.append(f"  Total de pedidos: {st.get('totalPedidos', '—')}")
        linhas.append(f"  Finalizados: {st.get('pedidosFinalizado', '—')}")
        linhas.append(f"  Cancelados: {st.get('pedidosCancelado', '—')}")
        linhas.append(f"  Valor historico (planilha): {fmt_money(st.get('valorTotal'))}")
    return "\n".join(linhas)


def format_intent_fallback(kind: str, facts: dict) -> str:
    if not facts or not isinstance(facts, dict):
        return "Sem dados."
    if kind == "contagem_etapa_producao":
        return format_contagem_etapa(facts)
    if kind == "entregas_no_periodo":
        return format_entregas_periodo(facts)
    if kind == "pecas_por_tamanho_abertos":
        return format_agregacao_tamanhos(facts)
    if kind == "lista_pedidos":
        return format_lista_abertos(facts.get("pedidos") or [])
    if kind == "lista_filtrada":
        return facts.get("texto_formatado") or format_lista_filtrada(
            facts.get("pedidos_raw") or [], facts.get("titulo", "Pedidos")
        )
    if kind == "busca_pedidos":
        return format_busca_multipla(facts)
    if kind == "detalhe_pedido":
        return format_busca_um(facts)
    if kind == "tamanhos_pedido":
        return format_tamanhos_pedido(facts)
    if kind == "relatorio_periodo":
        return format_relatorio(facts)
    if kind == "resumo_financeiro":
        return facts.get("texto_formatado") or format_resumo_financeiro(
            facts.get("pedidos_abertos") or [], facts.get("stats")
        )
    import json

    return json.dumps(facts, ensure_ascii=False)[:2000]
