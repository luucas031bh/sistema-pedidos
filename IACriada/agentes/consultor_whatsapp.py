"""Consultor WhatsApp — delega ao Agente WPP (leitura progressiva)."""

from __future__ import annotations

from agentes.agente_wpp import detectar_confirmacao_mes, executar as executar_wpp

__all__ = ["executar", "detectar_confirmacao_mes"]


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    *,
    sessao: str = "padrao",
) -> dict:
    return executar_wpp(pergunta, params, modelo, sessao=sessao)
