"""Agente Gerente Fila — atualiza snapshot RP e resume status de producao."""

from __future__ import annotations

import json

from observador_store import ler_snapshot


def executar(pergunta: str, params: dict | None = None, modelo: str | None = None) -> dict:
    from observador import refresh_snapshot_rp

    resultado = refresh_snapshot_rp()
    snap = resultado.get("snapshot") or ler_snapshot()
    fila = snap.get("fila_rp") or {}
    erro = fila.get("erro") or resultado.get("fila_rp", {}).get("erro")

    if erro:
        resposta = f"Nao consegui atualizar a fila RP: {erro}"
    else:
        por_etapa = fila.get("por_etapa") or {}
        etapas_txt = ", ".join(f"{k}: {v}" for k, v in sorted(por_etapa.items(), key=lambda x: -x[1]))
        resposta = (
            f"Fila RP atualizada ({snap.get('atualizado_em', 'agora')}).\n"
            f"Pedidos em aberto: {fila.get('total_abertos', 0)}\n"
            f"Por etapa: {etapas_txt or 'nenhum'}\n\n"
            "Abra a Fila RP no menu lateral para ver a fila visual completa."
        )

    return {
        "resposta": resposta,
        "modelo": "gerente_fila",
        "passos": [{"agente": "gerente_fila", "total_abertos": fila.get("total_abertos", 0)}],
        "meta": {
            "route": "atualizar_status_de_producao_na_tela",
            "agente": "gerente_fila",
            "fila_rp": fila,
            "ok": not bool(erro),
        },
    }
