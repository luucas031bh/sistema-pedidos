"""Termos de roteamento gerados a partir do manifesto do sistema."""

from __future__ import annotations

_TERMOS_INVESTIGAR_PRIORITARIO = (
    "quantos clientes",
    "quantas clientes",
    "atrasad",
    "resumo geral",
    "panorama",
    "como esta tudo",
    "como está tudo",
    "situacao geral",
    "situação geral",
    "overview",
    "relatorio geral",
    "relatório geral",
    "me faz um resumo",
    "visao geral",
    "visão geral",
)

_TERMOS_INVESTIGAR_BASE = (
    "relatorio",
    "relatório",
    "resumo geral",
    "panorama",
    "como esta tudo",
    "como está tudo",
    "situacao geral",
    "situação geral",
    "overview",
    "quantos clientes",
    "quantas pedidos",
    "quantos pedidos",
    "valor total",
    "total a receber",
    "financeiro da semana",
    "financeiro do mes",
    "financeiro do mês",
    "entregas de hoje",
    "entregas desta semana",
    "atrasados",
    "atrasado",
    "como funciona",
    "o que voce sabe",
    "o que você sabe",
    "me explica o sistema",
    "visao geral",
    "visão geral",
)

_TERMOS_FILA_RP_BASE = (
    "pedido",
    "pedidos",
    "fila",
    " rp",
    "rp ",
    "financeiro",
    "status",
    "etapa",
    "producao",
    "produção",
)

_EXCLUIR_FILA_RP = ("abrir", "abre", "corel", "photoshop", "pasta", "cdr", "psd")

_GAS_IGNORAR = frozenset({"string", "true", "online"})


def _carregar_manifesto() -> dict:
    try:
        from gerar_manifesto_sistema import carregar_manifesto, gerar_manifesto_sistema

        return carregar_manifesto() or gerar_manifesto_sistema(salvar=False)
    except ImportError:
        return {}


def termos_investigar_prioritario() -> tuple[str, ...]:
    return _TERMOS_INVESTIGAR_PRIORITARIO


def termos_investigar(manifesto: dict | None = None) -> tuple[str, ...]:
    m = manifesto or _carregar_manifesto()
    extras: list[str] = []
    for status in m.get("status_operacionais") or []:
        extras.append(status.lower())
    vistos: set[str] = set()
    resultado: list[str] = []
    for t in _TERMOS_INVESTIGAR_BASE + tuple(extras):
        if t not in vistos:
            vistos.add(t)
            resultado.append(t)
    return tuple(resultado)


def termos_fila_rp(manifesto: dict | None = None) -> tuple[str, ...]:
    m = manifesto or _carregar_manifesto()
    extras = [e.lower() for e in (m.get("etapas_producao") or [])]
    extras += [
        "insumos",
        "arte",
        "corte",
        "estampa",
        "costura",
        "embalo",
    ]
    vistos: set[str] = set()
    resultado: list[str] = []
    for t in _TERMOS_FILA_RP_BASE + tuple(extras):
        if t not in vistos:
            vistos.add(t)
            resultado.append(t)
    return tuple(resultado)


def excluir_fila_rp() -> tuple[str, ...]:
    return _EXCLUIR_FILA_RP


def gas_actions_validas(manifesto: dict | None = None) -> list[str]:
    m = manifesto or _carregar_manifesto()
    return [a for a in (m.get("gas_actions") or []) if a not in _GAS_IGNORAR]
