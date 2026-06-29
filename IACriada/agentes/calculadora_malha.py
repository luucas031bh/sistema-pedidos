"""Agente Calculadora Mecanica — malha por pedido (Fase 2)."""

from __future__ import annotations

import re


def executar(pergunta: str, params: dict | None = None, modelo: str | None = None) -> dict:
    codigo = None
    m = re.search(r"\b(\d{4})\b", pergunta or "")
    if m:
        codigo = m.group(1)

    resposta = (
        "Agente Calculadora de Malha (Fase 2 — esqueleto ativo).\n\n"
        "Este agente calculara consumo de malha por pedido com base nos dados da planilha RP "
        "(tipo de peca, tamanhos, quantidades).\n\n"
    )
    if codigo:
        resposta += (
            f"Pedido mencionado: {codigo}. "
            "Quando a calculadora estiver completa, retornarei metros/consumo por malha.\n\n"
        )
        try:
            from consultar_rp import buscar_pedido_rp

            r = buscar_pedido_rp(codigo)
            if r.get("ok") and r.get("pedido"):
                p = r["pedido"]
                malha = p.get("malha") or p.get("Malha") or "?"
                pecas = p.get("totalPecas") or p.get("quantidade") or "?"
                resposta += f"Dados atuais do RP: malha={malha}, total pecas={pecas}."
            else:
                resposta += "Nao encontrei esse pedido no RP agora."
        except Exception as exc:
            resposta += f"Consulta RP: {exc}"
    else:
        resposta += "Informe o codigo do pedido (4 digitos) para eu buscar malha e pecas no RP."

    return {
        "resposta": resposta,
        "modelo": "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "codigo": codigo}],
        "meta": {
            "route": "calcular_gasto_de_malha_por_pedido",
            "agente": "calculadora_malha",
            "fase": "2_esqueleto",
        },
    }
