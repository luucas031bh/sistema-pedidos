"""Consulta pedidos do RP (Google Apps Script) — somente leitura, sem abrir navegador."""

from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

from config import carregar_config

_CACHE: dict = {"ts": 0.0, "pedidos": None}
_CACHE_TTL = 90

ETAPAS_PRODUCAO = (
    "Pedido em Aberto",
    "Arte",
    "Insumos",
    "Corte",
    "Estampa",
    "Costura",
    "Embalo",
    "Aguardando retirada",
)

STATUS_OPERACIONAIS = (
    "Novo pedido",
    "Pendente",
    "Orçamento",
    "Orcamento",
    "Em produção",
    "Em producao",
    "Atrasado",
    "Cancelado",
    "Travado",
    "Finalizado",
)


def _norm(texto: str) -> str:
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def apps_script_url() -> str:
    cfg = carregar_config()
    url = (
        cfg.get("rp_apps_script_url")
        or cfg.get("apps_script_url")
        or (cfg.get("rp") or {}).get("apps_script_url")
        or ""
    ).strip()
    if not url:
        url = (
            "https://script.google.com/macros/s/AKfycby9LFyzYkXW_Zo9i_u3jdGfRweu5UaDvf4PsGWyTh8UB0hXGEls2l_oELjJSDkpZwDoAQ/exec"
        )
    return url


def gas_get(action: str, params: dict | None = None, timeout: int = 120) -> dict:
    """GET generico ao Web App (espelha Bot-ADNY/gas.js)."""
    p = {"action": action, **(params or {})}
    base = apps_script_url().rstrip("/")
    qs = urllib.parse.urlencode(
        {k: v for k, v in p.items() if v is not None and str(v) != ""}
    )
    url = f"{base}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "AdonayAssistente/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        return {"sucesso": False, "erro": f"Falha de rede ao consultar RP: {exc}"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"sucesso": False, "erro": "Resposta invalida do RP (nao e JSON)"}


def _fetch_json(params: dict, timeout: int = 120) -> dict:
    action = params.get("action", "listarPedidos")
    extra = {k: v for k, v in params.items() if k != "action"}
    return gas_get(action, extra, timeout=timeout)


def _carregar_pedidos(force: bool = False) -> tuple[list, str | None]:
    agora = time.time()
    if (
        not force
        and _CACHE.get("pedidos") is not None
        and agora - float(_CACHE.get("ts", 0)) < _CACHE_TTL
    ):
        return _CACHE["pedidos"], None

    data = gas_get("listarPedidos", {"acao": "listarPedidos"})
    if not data.get("sucesso", data.get("success")):
        return [], data.get("erro") or data.get("error") or "Erro ao listar pedidos"

    pedidos = data.get("pedidos") or data.get("data") or []
    if not isinstance(pedidos, list):
        return [], "Formato de pedidos inesperado"

    _CACHE["ts"] = agora
    _CACHE["pedidos"] = pedidos
    return pedidos, None


def id_busca_pedido(pedido: dict) -> str:
    ib = pedido.get("idBusca")
    if ib is not None and str(ib).strip():
        return str(ib).strip().zfill(4)[-4:]
    tel = (pedido.get("cliente") or {}).get("telefone", "")
    digitos = re.sub(r"\D", "", str(tel))
    if len(digitos) >= 4:
        return digitos[-4:]
    pid = str(pedido.get("id") or "")
    m = re.search(r"-(\d{4})-", pid)
    if m:
        return m.group(1)
    return "????"


def nome_cliente(pedido: dict) -> str:
    return str((pedido.get("cliente") or {}).get("nome") or "Sem nome").strip()


def pedido_esta_aberto(pedido: dict) -> bool:
    s = _norm(str(pedido.get("statusOperacional") or ""))
    if not s:
        return True
    if s in ("entregue", "finalizado", "cancelado"):
        return False
    if "cancel" in s:
        return False
    return True


def pedido_conta_kpi(pedido: dict) -> bool:
    """Alinhado a pedidoContaNosIndicadores da home."""
    s = _norm(str(pedido.get("statusOperacional") or ""))
    return s not in ("orcamento", "orçamento")


def _match_etapa(pedido: dict, etapa: str) -> bool:
    alvo = _norm(etapa)
    atual = _norm(str(pedido.get("etapaProducaoAtual") or ""))
    return atual == alvo or alvo in atual or atual in alvo


def _match_status_op(pedido: dict, status: str) -> bool:
    alvo = _norm(status)
    atual = _norm(str(pedido.get("statusOperacional") or ""))
    return atual == alvo or alvo in atual


def extrair_filtros_do_texto(texto: str) -> dict:
    from intencoes import extrair_filtros_rp

    out = extrair_filtros_rp(texto)
    out.setdefault("cliente", None)
    return out


def segunda_domingo_semana(ref: date | None = None) -> tuple[str, str]:
    ref = ref or date.today()
    wd = ref.weekday()
    seg = ref - timedelta(days=wd)
    dom = seg + timedelta(days=6)
    return seg.isoformat(), dom.isoformat()


def buscar_pedido_rp(termo: str) -> dict:
    return gas_get("buscarPedido", {"termo": termo.strip()})


def buscar_pedidos_rp(termo: str) -> dict:
    return gas_get("buscarPedidos", {"termo": termo.strip()})


def contar_etapa_producao_rp(
    etapa: str,
    apenas_abertos: bool = True,
    excluir_cancelados: bool = True,
) -> dict:
    return gas_get(
        "contarPorEtapaProducao",
        {
            "etapa": etapa,
            "apenasAbertosOperacional": "true" if apenas_abertos else "false",
            "excluirCancelados": "true" if excluir_cancelados else "false",
        },
    )


def entregas_periodo_rp(data_inicio: str, data_fim: str) -> dict:
    return gas_get(
        "listarPedidosEntregaPeriodo",
        {"dataInicio": data_inicio, "dataFim": data_fim},
    )


def agregar_pecas_abertos_rp(cor: str | None = None) -> dict:
    return gas_get("agregarPecasAbertos", {"cor": cor or ""})


def relatorio_periodo_rp(
    data_inicio: str,
    data_fim: str,
    dimensao: str = "tipoMalha",
    nivel: str = "item",
) -> dict:
    return gas_get(
        "relatorioPedidos",
        {
            "dataInicio": data_inicio,
            "dataFim": data_fim,
            "dimensao": dimensao,
            "nivel": nivel,
        },
    )


def estatisticas_rp() -> dict:
    data = gas_get("getStats")
    if data.get("stats"):
        return {"sucesso": True, "stats": data["stats"]}
    return data


def obter_dados_rp() -> dict:
    return gas_get("obterDados")


def listar_pedidos_rp(
    etapa_producao: str | None = None,
    status_operacional: str | None = None,
    apenas_abertos: bool = True,
    cliente: str | None = None,
    limite: int = 0,
) -> dict:
    pedidos, erro = _carregar_pedidos()
    if erro:
        return {"ok": False, "erro": erro}

    filtrados = pedidos
    if apenas_abertos:
        filtrados = [p for p in filtrados if pedido_esta_aberto(p)]
    if etapa_producao:
        filtrados = [p for p in filtrados if _match_etapa(p, etapa_producao)]
    if status_operacional:
        filtrados = [p for p in filtrados if _match_status_op(p, status_operacional)]
    if cliente:
        alvo = _norm(cliente)
        filtrados = [p for p in filtrados if alvo in _norm(nome_cliente(p))]

    filtrados.sort(
        key=lambda p: (
            str(p.get("datas", {}).get("entrega") or ""),
            nome_cliente(p),
        )
    )

    total = len(filtrados)
    if limite and limite > 0 and total > limite:
        mostrar = filtrados[:limite]
        truncado = True
    else:
        mostrar = filtrados
        truncado = False

    from rp_formatadores import format_lista_filtrada, linha_pedido_simples

    titulo = "Pedidos"
    if etapa_producao:
        titulo += f" em {etapa_producao}"
    if apenas_abertos:
        titulo += " (em aberto)"

    linhas = [
        {
            "cliente": nome_cliente(p),
            "id_busca": id_busca_pedido(p),
            "linha": linha_pedido_simples(p),
            "etapa_producao": p.get("etapaProducaoAtual"),
            "status_operacional": p.get("statusOperacional"),
            "id_pedido": p.get("id"),
        }
        for p in mostrar
    ]

    texto_formatado = format_lista_filtrada(mostrar, titulo=titulo, max_linhas=500)

    return {
        "ok": True,
        "total": total,
        "mostrando": len(linhas),
        "truncado": truncado,
        "filtros": {
            "etapa_producao": etapa_producao,
            "status_operacional": status_operacional,
            "apenas_abertos": apenas_abertos,
            "cliente": cliente,
        },
        "pedidos": linhas,
        "pedidos_raw": mostrar,
        "texto_formatado": texto_formatado,
    }


def resumo_financeiro_rp(incluir_historico: bool = False) -> dict:
    pedidos, erro = _carregar_pedidos()
    if erro:
        return {"ok": False, "erro": erro}

    abertos = [p for p in pedidos if pedido_esta_aberto(p)]
    stats = None
    if incluir_historico:
        st = estatisticas_rp()
        if st.get("sucesso") or st.get("stats"):
            stats = st.get("stats") or st

    from rp_formatadores import format_resumo_financeiro

    texto = format_resumo_financeiro(abertos, stats)
    kpi = [p for p in abertos if pedido_conta_kpi(p)]
    total = sum((p.get("financeiro") or {}).get("totalPedido") or 0 for p in kpi)
    recebido = sum((p.get("financeiro") or {}).get("valorEntrada") or 0 for p in kpi)

    return {
        "ok": True,
        "kind": "resumo_financeiro",
        "pedidos_abertos": abertos,
        "stats": stats,
        "totais": {
            "pedidos": len(kpi),
            "valor_total": total,
            "valor_recebido": recebido,
            "valor_a_receber": total - recebido,
        },
        "texto_formatado": texto,
    }


def consultar_pedidos_rp(consulta: str = "", **kwargs) -> dict:
    filtros = extrair_filtros_do_texto(consulta) if consulta else {}
    etapa = kwargs.get("etapa_producao") or filtros.get("etapa_producao")
    status_op = kwargs.get("status_operacional") or filtros.get("status_operacional")
    apenas = kwargs.get("apenas_abertos", filtros.get("apenas_abertos", True))
    cliente = kwargs.get("cliente") or filtros.get("cliente")
    limite = int(kwargs.get("limite") or 0)

    return listar_pedidos_rp(
        etapa_producao=etapa,
        status_operacional=status_op,
        apenas_abertos=apenas,
        cliente=cliente,
        limite=limite,
    )


def consultar_automatico(texto: str, params: dict | None = None) -> dict:
    """Legado: delega ao roteador quando disponivel."""
    try:
        from rp_router import rotear_pergunta_rp

        return rotear_pergunta_rp(texto, params)
    except ImportError:
        pass
    p = params or {}
    etapa = p.get("etapa_producao")
    status_op = p.get("status_operacional")
    if not etapa and not status_op:
        extra = extrair_filtros_do_texto(texto)
        etapa = extra.get("etapa_producao")
        status_op = extra.get("status_operacional")
    return listar_pedidos_rp(
        etapa_producao=etapa,
        status_operacional=status_op,
        apenas_abertos=p.get("apenas_abertos", True),
        cliente=p.get("cliente"),
    )
