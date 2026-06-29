"""Agente Investigador — coleta dados reais (RP + WhatsApp) e LLM interpreta."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from consultar_rp import (
    contar_etapa_producao_rp,
    entregas_periodo_rp,
    estatisticas_rp,
    extrair_filtros_do_texto,
    listar_pedidos_rp,
    resumo_financeiro_rp,
    segunda_domingo_semana,
)
from observador_store import carregar_mensagens_whatsapp


def _planejar_coleta(pergunta: str) -> list[str]:
    n = (pergunta or "").lower()

    fontes: list[str] = []

    if any(k in n for k in ("whatsapp", "wpp", "mensagem", "atendimento", "sem resposta")):
        fontes.append("whatsapp")

    if any(
        k in n
        for k in (
            "insumos",
            "corte",
            "arte",
            "costura",
            "embalo",
            "estampa",
            "etapa",
            "producao",
            "produção",
            "fila",
            "quantos pedidos",
            "quantas pedidos",
            "quantos clientes",
            "em aberto",
        )
    ):
        fontes.append("etapas")
        fontes.append("pedidos_abertos")

    if any(
        k in n
        for k in (
            "financeiro",
            "valor",
            "receber",
            "faturamento",
            "total",
            "entrada",
            "restante",
            "relatorio",
            "relatório",
            "resumo financeiro",
        )
    ):
        fontes.append("financeiro")
        fontes.append("pedidos_abertos")

    if any(
        k in n
        for k in (
            "entrega",
            "entregar",
            "entregue",
            "semana",
            "hoje",
            "amanha",
            "amanhã",
            "quinzena",
            "mes",
            "mês",
            "periodo",
            "período",
        )
    ):
        fontes.append("entregas")
        fontes.append("pedidos_abertos")

    if any(
        k in n
        for k in (
            "resumo",
            "geral",
            "panorama",
            "tudo",
            "como esta",
            "como está",
            "situacao",
            "situação",
            "overview",
        )
    ):
        fontes.append("stats")
        fontes.append("etapas")
        fontes.append("whatsapp")

    if not fontes:
        fontes.append("stats")
        fontes.append("etapas")

    vistas: set[str] = set()
    resultado: list[str] = []
    for f in fontes:
        if f not in vistas:
            vistas.add(f)
            resultado.append(f)
    return resultado


def _compactar_pedido(p: dict) -> dict:
    fin = p.get("financeiro") or {}
    datas = p.get("datas") or {}
    cli = p.get("cliente") or {}
    nome = cli.get("nome") if isinstance(cli, dict) else None
    total = fin.get("totalPedido") or p.get("valorTotal") or p.get("valor_total") or 0
    entrada = fin.get("valorEntrada") or 0
    restante = fin.get("restante")
    if restante is None and total:
        try:
            restante = float(total) - float(entrada or 0)
        except (TypeError, ValueError):
            restante = 0
    return {
        "cliente": nome or p.get("nomeCliente") or p.get("cliente") or "?",
        "etapa": p.get("etapaProducaoAtual") or p.get("etapa_producao") or "?",
        "status": p.get("statusOperacional") or p.get("status") or "?",
        "total_pecas": p.get("totalPecas") or p.get("total_pecas") or 0,
        "valor_total": total,
        "restante": restante or 0,
        "data_entrega": p.get("dataEntrega") or p.get("data_entrega") or datas.get("entrega") or "",
        "id": p.get("idBusca") or p.get("id_busca") or "",
    }


def _coletar_dados(fontes: list[str], pergunta: str) -> dict:
    dados: dict = {}
    pedidos_raw: list[dict] | None = None

    if "pedidos_abertos" in fontes:
        resultado = listar_pedidos_rp(apenas_abertos=True)
        if not resultado.get("ok"):
            raise ConnectionError(resultado.get("erro") or "Falha ao listar pedidos RP")
        pedidos_raw = resultado.get("pedidos_raw") or []
        dados["pedidos"] = [_compactar_pedido(p) for p in pedidos_raw[:50]]

    if "etapas" in fontes:
        filtros = extrair_filtros_do_texto(pergunta)
        etapa_alvo = filtros.get("etapa_producao")
        if etapa_alvo:
            resultado = contar_etapa_producao_rp(etapa_alvo)
            total = resultado.get("total") or 0
            dados["por_etapa"] = {etapa_alvo: total}
            dados["total_abertos"] = total
        else:
            if pedidos_raw is None:
                resultado = listar_pedidos_rp(apenas_abertos=True)
                if not resultado.get("ok"):
                    raise ConnectionError(resultado.get("erro") or "Falha ao listar pedidos RP")
                pedidos_raw = resultado.get("pedidos_raw") or []
            por_etapa: dict[str, int] = {}
            for p in pedidos_raw:
                et = p.get("etapaProducaoAtual") or "Sem etapa"
                por_etapa[et] = por_etapa.get(et, 0) + 1
            dados["por_etapa"] = por_etapa
            dados["total_abertos"] = sum(por_etapa.values())

    if "financeiro" in fontes:
        resultado = resumo_financeiro_rp()
        if not resultado.get("ok"):
            raise ConnectionError(resultado.get("erro") or "Falha no resumo financeiro RP")
        totais = resultado.get("totais") or {}
        dados["financeiro"] = {
            "total_a_receber": totais.get("valor_a_receber") or totais.get("a_receber") or 0,
            "total_recebido": totais.get("valor_recebido") or totais.get("entradas") or 0,
            "total_geral": totais.get("valor_total") or totais.get("valor_total") or 0,
            "total_pedidos": totais.get("pedidos") or totais.get("total_pedidos") or 0,
        }

    if "entregas" in fontes:
        ini, fim = segunda_domingo_semana()
        resultado = entregas_periodo_rp(ini, fim)
        dados["entregas_semana"] = resultado.get("pedidos") or []

    if "stats" in fontes:
        dados["stats"] = estatisticas_rp()

    if "whatsapp" in fontes:
        desde = datetime.now(timezone.utc) - timedelta(hours=24)
        msgs = carregar_mensagens_whatsapp(desde=desde, limite=30)
        dados["whatsapp"] = [
            {
                "nome": m.get("nome") or "",
                "telefone": m.get("telefone") or "",
                "intencao": m.get("intencao") or "outro",
                "texto": (m.get("texto") or "")[:100],
                "ts": m.get("ts") or "",
            }
            for m in msgs
        ]

    return dados


def _montar_contexto_llm(dados: dict, pergunta: str) -> str:
    linhas = ["=== DADOS DO SISTEMA ADONAY (coletados agora) ===\n"]

    if "total_abertos" in dados:
        linhas.append(f"Total de pedidos em aberto: {dados['total_abertos']}")

    if "por_etapa" in dados and dados["por_etapa"]:
        linhas.append("Pedidos por etapa de produção:")
        for etapa, qtd in dados["por_etapa"].items():
            linhas.append(f"  - {etapa}: {qtd} pedido(s)")

    if "financeiro" in dados:
        f = dados["financeiro"]
        linhas.append("\nResumo financeiro:")
        linhas.append(f"  - Total a receber: R$ {float(f.get('total_a_receber', 0) or 0):.2f}")
        linhas.append(f"  - Total já recebido: R$ {float(f.get('total_recebido', 0) or 0):.2f}")
        linhas.append(f"  - Valor total dos pedidos: R$ {float(f.get('total_geral', 0) or 0):.2f}")

    if "pedidos" in dados and dados["pedidos"]:
        linhas.append(f"\nLista de pedidos em aberto ({len(dados['pedidos'])} pedidos):")
        for p in dados["pedidos"]:
            linha = f"  - {p['cliente']} | Etapa: {p['etapa']} | Peças: {p['total_pecas']}"
            if p.get("data_entrega"):
                linha += f" | Entrega: {p['data_entrega']}"
            if p.get("restante") and float(p.get("restante", 0)) > 0:
                linha += f" | A receber: R$ {float(p['restante']):.2f}"
            linhas.append(linha)

    if "entregas_semana" in dados:
        ent = dados["entregas_semana"]
        linhas.append(f"\nEntregas desta semana: {len(ent)} pedido(s)")
        for e in ent[:10]:
            linhas.append(
                f"  - {e.get('nomeCliente') or e.get('cliente') or '?'} | {e.get('dataEntrega') or ''}"
            )

    if "stats" in dados and dados["stats"]:
        st = dados["stats"].get("stats") or dados["stats"]
        if isinstance(st, dict):
            linhas.append(f"\nEstatísticas gerais: {st}")

    if "whatsapp" in dados and dados["whatsapp"]:
        linhas.append(f"\nMensagens WhatsApp (últimas 24h): {len(dados['whatsapp'])} mensagem(ns)")
        for m in dados["whatsapp"]:
            rotulo = m.get("nome") or m.get("telefone") or "?"
            linhas.append(f"  - {rotulo} [{m.get('intencao')}]: {m.get('texto', '')[:80]}")

    linhas.append("\n=== FIM DOS DADOS ===")
    return "\n".join(linhas)


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    sessao: str = "padrao",
) -> dict:
    params = params or {}

    fontes = _planejar_coleta(pergunta)

    try:
        dados = _coletar_dados(fontes, pergunta)
    except Exception as e:
        return {
            "resposta": f"Erro ao coletar dados do sistema: {e}. Verifique a conexão com o Apps Script.",
            "modelo": modelo or "investigador",
            "passos": [{"agente": "investigador", "erro": str(e)}],
            "meta": {"route": "investigar_sistema", "agente": "investigador", "erro": True},
        }

    contexto = _montar_contexto_llm(dados, pergunta)

    from agente import _request_ollama, resolver_modelo

    nome_modelo = resolver_modelo(modelo)
    if not nome_modelo:
        return {
            "resposta": contexto,
            "modelo": "investigador_sem_llm",
            "passos": [{"agente": "investigador", "fontes": fontes, "llm": False}],
            "meta": {"route": "investigar_sistema", "agente": "investigador", "fontes": fontes},
        }

    prompt_sistema = (
        "Você é o ADNY, assistente da Adonay Confecções. "
        "Responda a pergunta do operador em português do Brasil, de forma direta e organizada. "
        "Use APENAS os dados fornecidos abaixo. "
        "NUNCA invente pedidos, clientes, valores ou datas que não estejam nos dados. "
        "Se a pergunta pede um número simples, responda o número e uma linha de contexto. "
        "Se a pergunta pede relatório, use tópicos com bullet points. "
        "Se os dados não têm a informação pedida, diga claramente que não encontrou."
    )

    try:
        resposta_llm = _request_ollama(
            {
                "model": nome_modelo,
                "messages": [
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": f"{contexto}\n\nPERGUNTA DO OPERADOR: {pergunta}"},
                ],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=120,
        )
        texto = resposta_llm.get("message", {}).get("content", "").strip()
    except Exception:
        texto = f"(LLM indisponível — dados brutos coletados)\n\n{contexto}"

    return {
        "resposta": texto,
        "modelo": nome_modelo,
        "passos": [{"agente": "investigador", "fontes": fontes, "llm": True}],
        "meta": {
            "route": "investigar_sistema",
            "agente": "investigador",
            "fontes": fontes,
            "dados_coletados": list(dados.keys()),
        },
    }
