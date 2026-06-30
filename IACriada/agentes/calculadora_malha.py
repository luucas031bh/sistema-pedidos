"""Agente Calculadora de Malha — wizard conversacional (espelha CalculadoraMalha web)."""

from __future__ import annotations

import re

from calculadora_malha_core import (
    CAMPOS_WIZARD,
    calcular_orcamento,
    extrair_pecas_do_pedido,
    extrair_primeiro_numero,
    formatar_resultado_calculo,
    normalizar_numero,
)
from historico_db import carregar_pedido_ativo, carregar_wizard_malha, limpar_wizard_malha, salvar_wizard_malha
from rp_entidades import extrair_cliente, extrair_codigo_busca
from rp_router import _resolver_pedido_por_termo

_REFERENCIA_PEDIDO_SESSAO = (
    "esse pedido",
    "deste pedido",
    "desse pedido",
    "o mesmo pedido",
    "mesmo pedido",
    "pedido acima",
    "pedido anterior",
    "pedido citado",
    "o pedido",
)


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


def _referencia_pedido_implicita(pergunta: str) -> bool:
    n = (pergunta or "").lower()
    if any(k in n for k in _REFERENCIA_PEDIDO_SESSAO):
        return True
    if re.search(r"\b(?:esse|este|desse|deste)\b", n) and "pedido" in n:
        return True
    return False


def _resolver_termo_pedido(pergunta: str, sessao: str) -> str | None:
    if _referencia_pedido_implicita(pergunta):
        ativo = carregar_pedido_ativo(sessao)
        if ativo:
            return ativo.get("termo") or ativo.get("id_busca") or ativo.get("cliente")

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


def _parse_largura(texto: str) -> float | None:
    bruto = (texto or "").strip()
    n = bruto.lower()

    m = re.search(r"largura[^0-9]{0,25}(1[,.]?\s*80|1\.8|1[,.]?\s*20|1\.2)", n)
    if m:
        frag = m.group(1)
        if "1,2" in frag or "1.2" in frag or "20" in frag.replace(" ", ""):
            return 1.20
        return 1.80

    if re.search(r"1[,.]?\s*80|1\.8\b|\bramada\b", n) and not re.search(
        r"1[,.]?\s*20|1\.2\b", n
    ):
        return 1.80

    if re.search(r"1[,.]?\s*20|1\.2\b|\b120\b", n):
        return 1.20

    val = extrair_primeiro_numero(bruto)
    if val in (1.2, 1.20, 120):
        return 1.20
    if val in (1.8, 1.80, 180):
        return 1.80
    if val and 1.0 <= val <= 2.5:
        return round(val, 2)
    return None


def _parse_tipo(texto: str) -> str | None:
    n = (texto or "").lower()
    if "tubular" in n:
        return "tubular"
    if "ramada" in n:
        return "ramada"
    bruto = (texto or "").strip().lower()
    if bruto in ("ramada", "tubular"):
        return bruto
    return None


def _parse_rendimento(texto: str) -> float | None:
    n = (texto or "").lower()
    padroes = (
        r"rendimento\s*[:\-]?\s*(\d+[,.]?\d*)",
        r"(\d+[,.]?\d*)\s*metros?\s*(?:de|por|/)\s*(?:1\s*)?kg",
        r"(\d+[,.]?\d*)\s*m\s*/\s*kg",
        r"(?:sao|são)\s*(\d+[,.]?\d*)\s*metros?",
        r"(\d+[,.]?\d*)\s*metros?\s*(?:por|de)\s*(?:1\s*)?quilo",
    )
    for pat in padroes:
        m = re.search(pat, n)
        if m:
            val = normalizar_numero(m.group(1))
            if val and 0.3 <= val <= 30:
                return val

    if re.search(r"metro|rendimento|m/kg|por\s*kg", n):
        m = re.search(r"(\d+[,.]?\d*)\s*metros?", n)
        if m:
            val = normalizar_numero(m.group(1))
            if val and val not in (1.2, 1.20, 1.8, 1.80):
                return val

    val = extrair_primeiro_numero(texto)
    if val and val not in (1.2, 1.20, 1.8, 1.80, 120, 180) and 0.3 <= val <= 30:
        return val
    return None


def _parse_preco(texto: str) -> float | None:
    n = (texto or "").lower()
    padroes = (
        r"(?:preco|preço|preco/kg|preço/kg|custa)\s*[:\-]?\s*(?:r\$?\s*)?(\d+[,.]?\d*)",
        r"r\$\s*(\d+[,.]?\d*)",
        r"(\d+[,.]?\d*)\s*reais",
        r"(\d+[,.]?\d*)\s*r\$",
    )
    for pat in padroes:
        m = re.search(pat, n)
        if m:
            val = normalizar_numero(m.group(1))
            if val and val > 0:
                return val

    if "preco" in n or "preço" in n or "reais" in n or "r$" in n:
        val = extrair_primeiro_numero(texto)
        if val and val > 0:
            return val
    return None


def _parse_resposta_campo(campo: str, texto: str) -> float | str | None:
    if campo == "largura":
        return _parse_largura(texto)
    if campo == "tipo":
        return _parse_tipo(texto)
    if campo == "rendimento_m_por_kg":
        return _parse_rendimento(texto)
    if campo == "preco_por_kg":
        return _parse_preco(texto)
    return None


def extrair_todos_inputs_malha(texto: str) -> dict:
    """Extrai todos os campos presentes numa frase natural."""
    out: dict = {}
    for campo, _, _ in CAMPOS_WIZARD:
        val = _parse_resposta_campo(campo, texto)
        if val is not None:
            out[campo] = val
    return out


def _proximo_passo(inputs: dict) -> int:
    for i, (campo, _, _) in enumerate(CAMPOS_WIZARD):
        if campo not in inputs:
            return i
    return len(CAMPOS_WIZARD)


def _inputs_completos(inputs: dict) -> bool:
    return _proximo_passo(inputs) >= len(CAMPOS_WIZARD)


def _titulo_campo(campo: str) -> str:
    for c, titulo, _ in CAMPOS_WIZARD:
        if c == campo:
            return titulo
    return campo


def _formatar_inputs_coletados(inputs: dict) -> str:
    if not inputs:
        return ""
    partes = []
    if "largura" in inputs:
        partes.append(f"largura {inputs['largura']} m")
    if "tipo" in inputs:
        partes.append(str(inputs["tipo"]))
    if "rendimento_m_por_kg" in inputs:
        partes.append(f"rendimento {inputs['rendimento_m_por_kg']} m/kg")
    if "preco_por_kg" in inputs:
        partes.append(f"R$ {inputs['preco_por_kg']}/kg")
    return ", ".join(partes)


def _pergunta_proximo_campo(estado: dict) -> str:
    passo = _proximo_passo(estado.get("inputs") or {})
    if passo >= len(CAMPOS_WIZARD):
        return ""
    _campo, titulo, ajuda = CAMPOS_WIZARD[passo]
    pedido = estado.get("pedido_resumo") or ""
    inputs = estado.get("inputs") or {}
    coletado = _formatar_inputs_coletados(inputs)
    linhas = [
        "**Calculadora de Malha** (mesma logica do sistema web).",
        "",
    ]
    if pedido:
        linhas.append(pedido)
        linhas.append("")
    if coletado:
        linhas.append(f"Ja tenho: {coletado}.")
        linhas.append("")
    faltam = len(CAMPOS_WIZARD) - passo
    linhas.extend(
        [
            f"Falta(m) **{faltam}** dado(s) para calcular.",
            "",
            f"**{passo + 1}/{len(CAMPOS_WIZARD)} — {titulo}**",
            ajuda,
            "",
            "Voce pode informar **varios dados de uma vez** (ex.: _1,20 tubular, rendimento 2,4 metros, R$ 35/kg_).",
            "",
            "Ao final, abrirei a [Calculadora de Malha](https://luucas031bh.github.io/sistema-pedidos/CalculadoraMalha/), "
            "preencherei os campos como voce e trarei os resultados da pagina.",
            "",
            "_Digite **cancelar** para sair._",
        ]
    )
    return "\n".join(linhas)


def _meta_wizard(estado: dict, **extra) -> dict:
    passo = _proximo_passo(estado.get("inputs") or {})
    return {
        "route": "calcular_gasto_de_malha_por_pedido",
        "agente": "calculadora_malha",
        "wizard_malha": True,
        "passo": passo + 1 if passo < len(CAMPOS_WIZARD) else len(CAMPOS_WIZARD),
        **extra,
    }


def _executar_calculo(inputs: dict, pecas: list[dict], pedido_resumo: str) -> tuple[str, str, dict]:
    """Prioriza calculadora web (Playwright); fallback motor Python local."""
    from calculadora_malha_browser import (
        browser_disponivel,
        executar_na_calculadora_web,
        formatar_resultado_web,
        usar_browser_calculadora,
    )

    if usar_browser_calculadora() and browser_disponivel():
        web = executar_na_calculadora_web(inputs, pecas)
        if web.get("ok"):
            factual = formatar_resultado_web(web, pedido_resumo)
            return factual, "calculadora_web", {"calculo_malha_web": web}

    calc = calcular_orcamento(inputs, pecas)
    factual = formatar_resultado_calculo(calc, pedido_resumo)
    aviso = ""
    if usar_browser_calculadora() and not browser_disponivel():
        aviso = (
            "\n\n_(Modo local: instale Playwright para usar a pagina "
            "https://luucas031bh.github.io/sistema-pedidos/CalculadoraMalha/ — "
            "`pip install playwright` e `playwright install chromium`.)_"
        )
    elif usar_browser_calculadora():
        aviso = "\n\n_(Fallback: motor Python — a pagina web nao respondeu.)_"
    return factual + aviso, "calculadora_python", {"calculo_malha": calc}


def _finalizar_calculo(
    pergunta: str,
    sessao: str,
    estado: dict,
    inputs: dict,
) -> dict:
    pecas = estado.get("pecas") or []
    pedido_resumo = estado.get("pedido_resumo") or ""
    factual, fonte_calc, _payload = _executar_calculo(inputs, pecas, pedido_resumo)
    limpar_wizard_malha(sessao)

    return {
        "resposta": factual,
        "modelo": "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "wizard": "concluido", "fonte": fonte_calc}],
        "meta": {
            "route": "calcular_gasto_de_malha_por_pedido",
            "agente": "calculadora_malha",
            "wizard_malha": False,
            "concluido": True,
            "fonte_calculo": fonte_calc,
        },
    }


def _aplicar_inputs_mensagem(
    pergunta: str,
    estado: dict,
) -> tuple[dict, list[str], bool]:
    """
    Mescla campos extraidos da mensagem no estado.
    Returns: (inputs atualizados, titulos registrados agora, algum valor novo)
    """
    inputs = dict(estado.get("inputs") or {})
    novos = extrair_todos_inputs_malha(pergunta)
    registrados: list[str] = []

    if not novos:
        passo = _proximo_passo(inputs)
        if passo < len(CAMPOS_WIZARD):
            campo = CAMPOS_WIZARD[passo][0]
            val = _parse_resposta_campo(campo, pergunta)
            if val is not None:
                novos = {campo: val}

    for campo, val in novos.items():
        if inputs.get(campo) != val:
            if campo not in inputs:
                registrados.append(_titulo_campo(campo))
            inputs[campo] = val

    if inputs.get("tipo") == "tubular" and "largura" not in inputs:
        inputs["largura"] = 1.20
    elif inputs.get("tipo") == "ramada" and "largura" not in inputs:
        inputs["largura"] = 1.80

    estado["inputs"] = inputs
    estado["passo"] = _proximo_passo(inputs)
    return inputs, registrados, bool(novos)


def _iniciar_wizard(pergunta: str, sessao: str) -> dict:
    termo = _resolver_termo_pedido(pergunta, sessao)
    if not termo:
        return {
            "resposta": (
                "Para calcular a malha, informe o **pedido** (nome do cliente, **4 digitos** ou _esse pedido_ "
                "apos um resumo). Ex.: _quantidade de malha do pedido Carlos Bastos_ ou _0397_."
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

    inputs, registrados, _ = _aplicar_inputs_mensagem(pergunta, estado)
    salvar_wizard_malha(sessao, estado)

    if _inputs_completos(inputs):
        return _finalizar_calculo(pergunta, sessao, estado, inputs)

    prefix = ""
    if registrados:
        prefix = f"Entendi: {_formatar_inputs_coletados(inputs)}.\n\n"

    return {
        "resposta": prefix + _pergunta_proximo_campo(estado),
        "modelo": "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "wizard": "iniciado", "pecas": len(pecas)}],
        "meta": _meta_wizard(estado),
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

    inputs, registrados, teve_novo = _aplicar_inputs_mensagem(pergunta, estado)

    if _inputs_completos(inputs):
        salvar_wizard_malha(sessao, estado)
        return _finalizar_calculo(pergunta, sessao, estado, inputs)

    if not teve_novo:
        passo = _proximo_passo(inputs)
        _, titulo, ajuda = CAMPOS_WIZARD[passo]
        return {
            "resposta": (
                f"Nao entendi os dados para **{titulo}**.\n\n"
                f"{ajuda}\n\n"
                "Pode enviar varios valores juntos (ex.: _1,20 tubular, 2,4 metros/kg, R$ 35_).\n\n"
                "_Tente de novo ou digite **cancelar**._"
            ),
            "modelo": "calculadora_malha",
            "passos": [{"agente": "calculadora_malha", "wizard": "retry", "campo": CAMPOS_WIZARD[passo][0]}],
            "meta": _meta_wizard(estado),
        }

    salvar_wizard_malha(sessao, estado)
    prefix = f"Entendi: {_formatar_inputs_coletados(inputs)}.\n\n"
    return {
        "resposta": prefix + _pergunta_proximo_campo(estado),
        "modelo": "calculadora_malha",
        "passos": [{"agente": "calculadora_malha", "wizard": "campo", "novos": registrados}],
        "meta": _meta_wizard(estado),
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
