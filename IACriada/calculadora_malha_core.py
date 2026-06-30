"""Motor da Calculadora de Malha (espelha CalculadoraMalha/index.html)."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from config import path_sistema_pedidos

TABELA_PADRAO = {
    "versao": "1.0",
    "descricao": "Tabela de referencia de rendimento",
    "dados": [
        {
            "largura": 1.80,
            "tipo": "ramada",
            "tamanhos": {
                "4": {"metros_por_lote": 1.50, "pecas_por_lote": 4},
                "6": {"metros_por_lote": 1.50, "pecas_por_lote": 4},
                "8": {"metros_por_lote": 1.50, "pecas_por_lote": 4},
                "10": {"metros_por_lote": 1.70, "pecas_por_lote": 4},
                "12": {"metros_por_lote": 1.70, "pecas_por_lote": 4},
                "14": {"metros_por_lote": 1.70, "pecas_por_lote": 4},
                "PP": {"metros_por_lote": 2.10, "pecas_por_lote": 3},
                "P": {"metros_por_lote": 2.10, "pecas_por_lote": 3},
                "M": {"metros_por_lote": 2.10, "pecas_por_lote": 3},
                "G": {"metros_por_lote": 2.40, "pecas_por_lote": 3},
                "GG": {"metros_por_lote": 2.40, "pecas_por_lote": 3},
                "G1": {"metros_por_lote": 1.20, "pecas_por_lote": 2},
                "G2": {"metros_por_lote": 1.20, "pecas_por_lote": 2},
                "G3": {"metros_por_lote": 1.30, "pecas_por_lote": 2},
                "G4": {"metros_por_lote": 1.30, "pecas_por_lote": 2},
                "G5": {"metros_por_lote": 1.30, "pecas_por_lote": 2},
            },
        },
        {
            "largura": 1.20,
            "tipo": "tubular",
            "tamanhos": {
                "4": {"metros_por_lote": 1.40, "pecas_por_lote": 6},
                "6": {"metros_por_lote": 1.40, "pecas_por_lote": 6},
                "8": {"metros_por_lote": 1.40, "pecas_por_lote": 6},
                "10": {"metros_por_lote": 1.70, "pecas_por_lote": 5},
                "12": {"metros_por_lote": 1.70, "pecas_por_lote": 5},
                "14": {"metros_por_lote": 1.70, "pecas_por_lote": 5},
                "PP": {"metros_por_lote": 1.00, "pecas_por_lote": 2},
                "P": {"metros_por_lote": 1.00, "pecas_por_lote": 2},
                "M": {"metros_por_lote": 1.00, "pecas_por_lote": 2},
                "G": {"metros_por_lote": 1.20, "pecas_por_lote": 2},
                "GG": {"metros_por_lote": 1.20, "pecas_por_lote": 2},
                "G1": {"metros_por_lote": 2.40, "pecas_por_lote": 3},
                "G2": {"metros_por_lote": 2.40, "pecas_por_lote": 3},
                "G3": {"metros_por_lote": 2.50, "pecas_por_lote": 3},
                "G4": {"metros_por_lote": 2.50, "pecas_por_lote": 3},
                "G5": {"metros_por_lote": 2.60, "pecas_por_lote": 3},
            },
        },
    ],
}

CAMPOS_WIZARD = (
    ("largura", "Largura da malha (m)", "Informe a largura: **1,80** (ramada) ou **1,20** (tubular)."),
    ("tipo", "Tipo da malha", "Informe o tipo: **ramada** ou **tubular**."),
    (
        "rendimento_m_por_kg",
        "Rendimento (m por kg)",
        "Quantos **metros de malha** saem de **1 kg**? (ex.: 4,5)",
    ),
    ("preco_por_kg", "Preco por kg (R$)", "Qual o **preco por kg** da malha em reais? (ex.: 35,00)"),
)


def normalizar_chave_tamanho(tamanho: str) -> str:
    s = str(tamanho or "").strip().upper()
    s = s.replace("（", "(").replace("）", ")")
    return s


def extrair_primeiro_numero(valor) -> float | None:
    """Extrai o primeiro numero de texto com unidades (ex.: '2,4 metros', 'R$ 35')."""
    s = str(valor or "").strip()
    if not s:
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)", s)
    if not m:
        return None
    return normalizar_numero(m.group(1))


def normalizar_numero(valor) -> float | None:
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    s = str(valor).strip()
    if not s:
        return None
    m = re.match(r"^(\d+(?:[.,]\d+)?)", s.replace(" ", ""))
    if m:
        s = m.group(1)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return extrair_primeiro_numero(valor)


def carregar_tabela_rendimento() -> dict:
    """Tenta ler JSON exportado; senao usa padrao do frontend."""
    candidatos = [
        path_sistema_pedidos() / "CalculadoraMalha" / "tabela_rendimento.json",
        Path(__file__).resolve().parent / "data" / "tabela_rendimento.json",
    ]
    for p in candidatos:
        if p.is_file():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
    return TABELA_PADRAO


def buscar_referencia(tabela: dict, largura: float, tipo: str, tamanho: str) -> dict | None:
    dados = tabela.get("dados") or []
    chave = normalizar_chave_tamanho(tamanho)
    tipo_l = (tipo or "").strip().lower()
    for grupo in dados:
        if float(grupo.get("largura") or 0) != float(largura):
            continue
        if str(grupo.get("tipo") or "").lower() != tipo_l:
            continue
        tamanhos = grupo.get("tamanhos") or {}
        ref = tamanhos.get(chave)
        if ref:
            return ref
        if "(BL)" in chave or " BL" in chave:
            base = re.sub(r"\s*\(BL\)", "", chave).strip()
            base = re.sub(r"\s+BL$", "", base).strip()
            ref = tamanhos.get(base)
            if ref:
                return ref
        # PP(BL) sem parenteses
        if chave.endswith("(BL)") or re.search(r"^[A-Z0-9]+\(BL\)$", chave):
            base = re.sub(r"\(BL\)$", "", chave).strip()
            ref = tamanhos.get(base)
            if ref:
                return ref
    return None


def extrair_pecas_do_pedido(pedido: dict) -> list[dict]:
    out: list[dict] = []
    for prod in pedido.get("produtos") or []:
        for tm in prod.get("tamanhos") or []:
            if not isinstance(tm, dict):
                continue
            tam = str(tm.get("tamanho") or "").strip()
            qtd = int(tm.get("quantidade") or 0)
            if tam and qtd > 0:
                out.append({"tamanho": tam, "quantidade": qtd})
    return out


def calcular_orcamento(
    inputs: dict,
    pecas: list[dict],
    tabela: dict | None = None,
    *,
    usar_ceil_por_lote: bool = True,
) -> dict:
    tabela = tabela or carregar_tabela_rendimento()
    largura = float(inputs["largura"])
    tipo = str(inputs["tipo"]).strip().lower()
    rendimento = float(inputs["rendimento_m_por_kg"])
    preco = float(inputs["preco_por_kg"])

    resultados = []
    metros_total = kg_total = custo_total = total_pecas = 0.0

    for peca in pecas:
        tamanho = normalizar_chave_tamanho(peca.get("tamanho"))
        qtd = float(peca.get("quantidade") or 0)
        if qtd <= 0:
            continue

        referencia = buscar_referencia(tabela, largura, tipo, tamanho)
        if not referencia:
            resultados.append(
                {
                    "tamanho": tamanho,
                    "quantidade": int(qtd),
                    "erro": "Referencia nao encontrada na tabela de rendimento",
                }
            )
            continue

        metros_por_lote = float(referencia["metros_por_lote"])
        pecas_por_lote = float(referencia["pecas_por_lote"])
        pecas_por_metro = pecas_por_lote / metros_por_lote

        if usar_ceil_por_lote:
            lotes = math.ceil(qtd / pecas_por_lote)
            metros_necessarios = lotes * metros_por_lote
        else:
            metros_necessarios = qtd / pecas_por_metro

        kg_necessarios = metros_necessarios / rendimento
        custo_malha = kg_necessarios * preco
        custo_por_peca = custo_malha / qtd

        resultados.append(
            {
                "tamanho": tamanho,
                "quantidade": int(qtd),
                "pecas_por_metro": pecas_por_metro,
                "metros_necessarios": metros_necessarios,
                "kg_necessarios": kg_necessarios,
                "custo_malha": custo_malha,
                "custo_por_peca": custo_por_peca,
            }
        )
        metros_total += metros_necessarios
        kg_total += kg_necessarios
        custo_total += custo_malha
        total_pecas += qtd

    return {
        "resultados": resultados,
        "totais": {
            "metros_total": metros_total,
            "kg_total": kg_total,
            "custo_total": custo_total,
            "total_pecas": int(total_pecas),
            "custo_medio_por_peca": custo_total / total_pecas if total_pecas else 0,
        },
        "inputs": inputs,
    }


def fmt_moeda(valor: float) -> str:
    s = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def fmt_decimal(valor: float, casas: int = 3) -> str:
    return f"{valor:.{casas}f}".replace(".", ",")


def formatar_resultado_calculo(calc: dict, pedido_resumo: str = "") -> str:
    linhas = ["**Calculadora de Malha** — mesmo calculo do sistema web.", ""]
    if pedido_resumo:
        linhas.append(pedido_resumo)
        linhas.append("")
    inp = calc.get("inputs") or {}
    linhas.extend(
        [
            f"Largura: {inp.get('largura')} m · Tipo: {inp.get('tipo')}",
            f"Rendimento: {inp.get('rendimento_m_por_kg')} m/kg · Preco: {fmt_moeda(float(inp.get('preco_por_kg') or 0))}/kg",
            "",
            "**Por tamanho:**",
        ]
    )
    for r in calc.get("resultados") or []:
        if r.get("erro"):
            linhas.append(f"- {r['tamanho']}: {r['quantidade']} pc — {r['erro']}")
            continue
        linhas.append(
            f"- {r['tamanho']}: {r['quantidade']} pc → "
            f"{fmt_decimal(r['metros_necessarios'])} m · "
            f"{fmt_decimal(r['kg_necessarios'])} kg · "
            f"{fmt_moeda(r['custo_malha'])}"
        )
    tot = calc.get("totais") or {}
    linhas.extend(
        [
            "",
            "**TOTAIS:**",
            f"Metros: {fmt_decimal(float(tot.get('metros_total') or 0))} m",
            f"Peso: {fmt_decimal(float(tot.get('kg_total') or 0))} kg",
            f"Custo malha: {fmt_moeda(float(tot.get('custo_total') or 0))}",
            f"Total pecas: {tot.get('total_pecas', 0)}",
            f"Custo medio/peca: {fmt_moeda(float(tot.get('custo_medio_por_peca') or 0))}",
        ]
    )
    return "\n".join(linhas)
