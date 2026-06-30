"""Agente Calculadora de Malha — wizard conversacional (espelha CalculadoraMalha web)."""

from __future__ import annotations

import re

from calculadora_malha_core import (
    CAMPOS_WIZARD,
    calcular_orcamento,
    extrair_pecas_do_pedido,
    formatar_resultado_calculo,
    normalizar_numero,
)
from historico_db import carregar_pedido_ativo, carregar_wizard_malha, limpar_wizard_malha, salvar_wizard_malha
from rp_entidades import extrair_codigo_busca, extrair_cliente
from rp_router import _resolver_pedido_por_termo


def parece_calculadora_malha(texto: str) -> bool:
    n = (texto or "").lower()
    return any(
        k in n
        for k in (
            "calculadora malha",
            "calculadoramalha",
            "calculadora de malha",
            "quantidade de malha",
            "quanto de malha",
            "metros de malha",
            "consumo de malha",
            "gasto de malha",
            "kg de malha",
            "malha preciso",
            "preciso de malha",
        )
    )


def sessao_malha_ativa(sessao: str) -> bool:
    w = carregar_wizard_malha(sessao)
    return bool(w and w.get("ativo"))


def _resolver_termo_pedido(pergunta: str, sessao: str) -> str | None:
    codigo = extrair_codigo_busca(pergunta)
    if codigo:
        return codigo
    cliente = extrair_cliente(pergunta)
    if cliente:
        return cliente
    ativo = carregar_pedido_ativo(sessao)
    if ativo:
        return ativo.get("termo") or ativo.get("id_busca") or ativo.get("cliente")
    return None


def _parse_resposta_campo(campo: str, texto: str) -> float | str | None:
    bruto = (texto or "").strip()
    n = bruto.lower()

    if campo == "largura":
        m = re.search(r"1[,.]?\s*80|1\.8|180", n)
        if m or "ramada" in n and "1,2" not in n and "1.2" not in n:
            return 1.80
        m = re.search(r"1[,.]?\s*20|1\.2|120", n)
        if m or "tubular" in n:
            return 1.20
        val = normalizar_numero(bruto)
        if val in (1.2, 1.20, 120):
            return 1.20
        if val in (1.8, 1.80, 180):
            return 1.80
        if val and 1.0 <= val <= 2.5:
            return round(val, 2)
        return None

    if campo == "tipo":
        if "tubular" in n:
            return "tubular"
        if "ramada" in n:
            return "ramada"
        if bruto.strip().lower() in ("ramada", "tubular"):
            return bruto.strip().lower()
        return None

    if campo in ("rendimento_m_por_kg", "preco_por_kg"):
        val = normalizar_numero(bruto)
        if val is not None and val > 0:
            return val
        return None

    return bruto or None


def _pergunta_proximo_campo(estado: dict) -> str:
    passo = int(estado.get("passo") or 0)
    if passo >= len(CAMPOS_WIZARD):
        return ""
    _campo, titulo, ajuda = CAMPOS_WIZARD[passo]
    pedido = estado.get("pedido_resumo") or ""
    linhas = [
        "**Calculadora de Malha** (mesma logica do sistema web).",
        "",
    ]
    if pedido:
        linhas.append(pedido)
        linhas.append("")
    linhas.extend(
        [
            f"Ja tenho as quantidades por tamanho do pedido.",
            f"Preciso de mais **{len(CAMPOS_WIZARD) - passo}** dado(s) para calcular.",
            "",
            f"**{passo + 1}/{len(CAMPOS_WIZARD)} — {titulo}**",
            ajuda,
            "",
            "_Responda com um valor por mensagem. Digite **cancelar** para sair._",
        ]
    )
    return "\n".join(linhas)


def _iniciar_wizard(pergunta: str, sessao: str) -> dict:
    termo = _resolver_termo_pedido(pergunta, sessao)
    if not termo:
        return {
            "resposta": (
                "Para calcular a malha, informe o **pedido** (nome do cliente ou **4 digitos** do telefone/ID busca). "
                "Ex.: _quantidade de malha do pedido Carlos Bastos_ ou _0397_."
            ),
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "erro": "sem_pedido"}],
            "meta": {"route": "calcular_gasto_de_malha_por_pedido", "agente": "calculadora_malha"},
        }

    data = _resolver_pedido_por_termo(str(termo))
    if not data.get("sucesso") or not data.get("pedido"):
        return {
            "resposta": f"Nao encontrei o pedido **{termo}** no RP. Confira nome ou ID de 4 digitos.",
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "termo": termo}],
            "meta": {"route": "calcular_gasto_de_malha_por_pedido", "agente": "calculadora_malha"},
        }

    pedido = data["pedido"]
    pecas = extrair_pecas_do_pedido(pedido)
    if not pecas:
        return {
            "resposta": "Pedido encontrado, mas **sem tamanhos/quantidades** cadastrados — nao da para calcular malha.",
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "sem_pecas": True}],
            "meta": {"route": "calcular_gasto_de_malha_por_pedido", "agente": "calculadora_malha"},
        }

    from consultar_rp import id_busca_pedido, nome_cliente

    resumo = (
        f"Pedido: **{pedido.get('id', '—')}** · Cliente: **{nome_cliente(pedido)}** · "
        f"ID busca: **{id_busca_pedido(pedido)}** · {len(pecas)} linha(s) de tamanho."
    )
    estado = {
        "ativo": True,
        "passo": 0,
        "inputs": {},
        "pecas": pecas,
        "pedido_resumo": resumo,
        "termo": termo,
    }
    salvar_wizard_malha(sessao, estado)
    return {
        "resposta": _pergunta_proximo_campo(estado),
        "modelo": "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "wizard": "iniciado", "pecas": len(pecas)}],
        "meta": {
            "route": "calcular_gasto_de_malha_por_pedido",
            "agente": "calculadora_malha",
            "wizard_malha": True,
            "passo": 1,
        },
    }


def _continuar_wizard(pergunta: str, sessao: str, estado: dict, modelo: str | None) -> dict:
    if re.search(r"\b(cancelar|cancela|sair|parar)\b", (pergunta or "").lower()):
        limpar_wizard_malha(sessao)
        return {
            "resposta": "Calculadora de malha cancelada.",
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "wizard": "cancelado"}],
            "meta": {"route": "calcular_gasto_de_malha_por_pedido", "agente": "calculadora_malha"},
        }

    passo = int(estado.get("passo") or 0)
    if passo >= len(CAMPOS_WIZARD):
        limpar_wizard_malha(sessao)
        return _iniciar_wizard(pergunta, sessao)

    campo, titulo, _ = CAMPOS_WIZARD[passo]
    valor = _parse_resposta_campo(campo, pergunta)
    if valor is None:
        return {
            "resposta": (
                f"Nao entendi o valor para **{titulo}**.\n\n"
                f"{CAMPOS_WIZARD[passo][2]}\n\n"
                "_Tente de novo ou digite **cancelar**._"
            ),
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "wizard": "retry", "campo": campo}],
            "meta": {
                "route": "calcular_gasto_de_malha_por_pedido",
                "agente": "calculadora_malha",
                "wizard_malha": True,
                "passo": passo + 1,
            },
        }

    inputs = dict(estado.get("inputs") or {})
    inputs[campo] = valor
    passo += 1
    estado["inputs"] = inputs
    estado["passo"] = passo

    if passo < len(CAMPOS_WIZARD):
        salvar_wizard_malha(sessao, estado)
        return {
            "resposta": f"Ok, **{titulo}** registrado.\n\n" + _pergunta_proximo_campo(estado),
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "wizard": "campo", "campo": campo}],
            "meta": {
                "route": "calcular_gasto_de_malha_por_pedido",
                "agente": "calculadora_malha",
                "wizard_malha": True,
                "passo": passo + 1,
            },
        }

    calc = calcular_orcamento(inputs, estado.get("pecas") or [])
    limpar_wizard_malha(sessao)
    factual = formatar_resultado_calculo(calc, estado.get("pedido_resumo") or "")

    from agentes.interpretador import organizar_resposta

    resposta = organizar_resposta(
        pergunta or "resultado calculadora malha",
        factual,
        {"calculo_malha": calc},
        modelo,
        contexto="calculadora_malha",
    )

    return {
        "resposta": resposta,
        "modelo": modelo or "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "wizard": "concluido"}],
        "meta": {
            "route": "calcular_gasto_de_malha_por_pedido",
            "agente": "calculadora_malha",
            "wizard_malha": False,
            "concluido": True,
        },
    }


def executar(
    pergunta: str,
    params: dict | None = None,
    modelo: str | None = None,
    sessao: str = "padrao",
) -> dict:
    estado = carregar_wizard_malha(sessao)
    if estado and estado.get("ativo"):
        return _continuar_wizard(pergunta, sessao, estado, modelo)
    return _iniciar_wizard(pergunta, sessao)
