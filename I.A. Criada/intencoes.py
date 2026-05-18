"""
Camada de interpretacao natural: normalizacao, status RP e intencoes basicas.
A IA extrai intencao; o Python resolve status e consulta o backend.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from typing import Any

try:
    from rapidfuzz import fuzz, process as rf_process

    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False

# Status oficiais do RP (planilha / operacional)
STATUS_RP = [
    "ORÇAMENTO",
    "PROD ARTE",
    "INSUMOS",
    "CORTE",
    "SILK",
    "SUBLIMAÇÃO",
    "FINALIZAÇÃO",
    "ENTREGUE",
    "CANCELADO",
]

# Mapeamento status oficial -> filtros da API local (consultar_rp)
STATUS_PARA_FILTROS: dict[str, dict[str, str | None]] = {
    "ORÇAMENTO": {"etapa_producao": None, "status_operacional": "Orçamento"},
    "PROD ARTE": {"etapa_producao": "Arte", "status_operacional": None},
    "INSUMOS": {"etapa_producao": "Insumos", "status_operacional": None},
    "CORTE": {"etapa_producao": "Corte", "status_operacional": None},
    "SILK": {"etapa_producao": "Estampa", "status_operacional": None},
    "SUBLIMAÇÃO": {"etapa_producao": "Sublimação", "status_operacional": None},
    "FINALIZAÇÃO": {"etapa_producao": "Embalo", "status_operacional": None},
    "ENTREGUE": {"etapa_producao": None, "status_operacional": "Finalizado"},
    "CANCELADO": {"etapa_producao": None, "status_operacional": "Cancelado"},
}

# Aliases (ja normalizados) -> status oficial. Ordem: frases longas primeiro.
_ALIASES_RAW: list[tuple[str, str]] = [
    ("faltando material", "INSUMOS"),
    ("esperando material", "INSUMOS"),
    ("esperando insumo", "INSUMOS"),
    ("falta material", "INSUMOS"),
    ("falta insumo", "INSUMOS"),
    ("producao de arte", "PROD ARTE"),
    ("produção de arte", "PROD ARTE"),
    ("prod arte", "PROD ARTE"),
    ("prod. arte", "PROD ARTE"),
    ("em prod arte", "PROD ARTE"),
    ("orcamento", "ORÇAMENTO"),
    ("orçamento", "ORÇAMENTO"),
    ("cotacao", "ORÇAMENTO"),
    ("cotação", "ORÇAMENTO"),
    ("sublimacao", "SUBLIMAÇÃO"),
    ("sublimação", "SUBLIMAÇÃO"),
    ("finalizacao", "FINALIZAÇÃO"),
    ("finalização", "FINALIZAÇÃO"),
    ("concluido", "ENTREGUE"),
    ("concluído", "ENTREGUE"),
    ("serigrafia", "SILK"),
    ("mockup", "PROD ARTE"),
    ("desenho", "PROD ARTE"),
    ("acabamento", "FINALIZAÇÃO"),
    ("embalagem", "FINALIZAÇÃO"),
    ("insumos", "INSUMOS"),
    ("insumo", "INSUMOS"),
    ("materiais", "INSUMOS"),
    ("material", "INSUMOS"),
    ("arte", "PROD ARTE"),
    ("cortando", "CORTE"),
    ("cortar", "CORTE"),
    ("corte", "CORTE"),
    ("silk", "SILK"),
    ("tela", "SILK"),
    ("subli", "SUBLIMAÇÃO"),
    ("entregue", "ENTREGUE"),
    ("finalizado", "ENTREGUE"),
    ("cancelada", "CANCELADO"),
    ("cancelado", "CANCELADO"),
]

_ALIASES_CACHE: list[tuple[str, str]] | None = None

CONVERSA_CURTA = frozenset(
    {
        "oi",
        "ola",
        "bom dia",
        "boa tarde",
        "boa noite",
        "obrigado",
        "obrigada",
        "valeu",
        "ok",
        "certo",
        "entendi",
        "correta acao",
        "perfeito",
        "show",
        "blz",
        "beleza",
        "tchau",
    }
)

PERGUNTA_INICIOS = (
    "quantas",
    "quanto",
    "qual",
    "quais",
    "como",
    "quando",
    "onde",
    "por que",
    "porque",
    "o que",
    "que horas",
    "me diga",
    "explique",
)

VERBOS_COMANDO = (
    "abrir",
    "abre",
    "abra",
    "executar",
    "executa",
    "buscar",
    "busca",
    "procurar",
    "procure",
    "listar",
    "lista",
    "mostrar",
    "mostra",
    "me mostra",
    "me mostrar",
    "me ve",
    "me vê",
    "me fala",
    "me diga",
    "leia",
    "ler",
    "encontrar",
    "encontre",
    "liste",
    "quais",
    "quantos",
    "quantas",
)

VERBOS_PROGRAMA = (
    "photoshop",
    "corel",
    "coreldraw",
    "illustrator",
    "chrome",
    "firefox",
    "word",
    "excel",
    "vscode",
    "notepad",
)

TEMA_PEDIDOS = (
    "pedido",
    "pedidos",
    " rp",
    "rp ",
    "fila",
    "status",
    "producao",
    "etapa",
    "entrega",
    "financeiro",
    "relatorio",
    "orcamento",
    "insumo",
    "material",
    "arte",
    "corte",
    "silk",
    "sublim",
)

PADROES_REPETIR = (
    "faz o mesmo",
    "faça o mesmo",
    "faca o mesmo",
    "mesma coisa",
    "igual mas",
    "de novo mas",
    "repete",
    "repetir",
    "agora com",
    "mas agora",
    "mas com",
)

INTENCOES_SEM_FERRAMENTA = frozenset({"conversa", "pergunta"})

INTENCOES_RP_DADOS = frozenset(
    {
        "consultar_pedido",
        "buscar_pedidos_status",
        "buscar_pedidos_atrasados",
        "buscar_pedidos_entrega",
        "navegar_rp",
    }
)

LIMIAR_FUZZY = 0.78


def normalizar_texto(texto: str) -> str:
    """Minusculo, sem acento, espacos simples, pontuacao leve removida."""
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^\w\s./-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return _singular_simples(t)


def _singular_simples(texto: str) -> str:
    """Plural -> singular basico em palavras comuns."""
    palavras = []
    for p in texto.split():
        if len(p) > 4 and p.endswith("s") and not p.endswith("ss"):
            if p.endswith("oes"):
                palavras.append(p[:-3] + "ao")
            elif p.endswith("ais"):
                palavras.append(p[:-1])
            else:
                palavras.append(p[:-1])
        else:
            palavras.append(p)
    return " ".join(palavras)


def _aliases_status() -> list[tuple[str, str]]:
    global _ALIASES_CACHE
    if _ALIASES_CACHE is None:
        _ALIASES_CACHE = sorted(
            [(normalizar_texto(a), s) for a, s in _ALIASES_RAW],
            key=lambda x: -len(x[0]),
        )
    return _ALIASES_CACHE


def _norm_status_oficial(status: str) -> str:
    return normalizar_texto(status)


def _score_fuzzy(a: str, b: str) -> float:
    if _HAS_RAPIDFUZZ:
        return fuzz.ratio(a, b) / 100.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _alias_no_texto(alias: str, n: str) -> bool:
    """Evita 'corte' em 'corel' ou 'acao' em 'finalizacao'."""
    if not alias or not n:
        return False
    if " " in alias:
        return alias in n
    if len(alias) < 5:
        return bool(re.search(rf"\b{re.escape(alias)}\b", n))
    return bool(re.search(rf"\b{re.escape(alias)}\b", n)) or alias in n


def resolver_status(texto: str, limiar: float = LIMIAR_FUZZY) -> str | None:
    """
    Resolve status oficial do RP a partir de texto livre.
    Aliases primeiro; fuzzy depois. Retorna None se confianca baixa.
    """
    if not (texto or "").strip():
        return None

    n = normalizar_texto(texto)

    aliases = _aliases_status()
    for alias, oficial in aliases:
        if len(alias) < 3:
            continue
        if _alias_no_texto(alias, n):
            return oficial

    # Palavras isoladas / tokens
    tokens = [t for t in n.split() if len(t) >= 4]
    candidatos_norm = [_norm_status_oficial(s) for s in STATUS_RP]
    candidatos_norm.extend(a for a, _ in aliases if len(a) >= 4)

    for tok in tokens:
        for alias, oficial in aliases:
            if tok == alias and _alias_no_texto(alias, n):
                return oficial

    alvos = list(dict.fromkeys(candidatos_norm + [_norm_status_oficial(s) for s in STATUS_RP]))
    melhor_score = 0.0
    melhor_status: str | None = None

    for tok in tokens:
        if len(tok) < 5:
            continue
        if _HAS_RAPIDFUZZ:
            hit = rf_process.extractOne(
                tok,
                alvos,
                scorer=fuzz.ratio,
                score_cutoff=int(limiar * 100),
            )
            if hit:
                score = hit[1] / 100.0
                alvo_norm = hit[0]
            else:
                continue
        else:
            matches = difflib.get_close_matches(tok, alvos, n=1, cutoff=limiar)
            if not matches:
                continue
            alvo_norm = matches[0]
            score = _score_fuzzy(tok, alvo_norm)

        if score > melhor_score:
            melhor_score = score
            for oficial in STATUS_RP:
                if _norm_status_oficial(oficial) == alvo_norm:
                    melhor_status = oficial
                    break
            if not melhor_status:
                for alias, oficial in aliases:
                    if alias == alvo_norm:
                        melhor_status = oficial
                        break

    if melhor_score >= limiar:
        return melhor_status
    return None


def status_para_filtros_api(status_oficial: str | None) -> dict[str, Any]:
    """Converte status RP oficial em etapa_producao / status_operacional da API."""
    if not status_oficial:
        return {"etapa_producao": None, "status_operacional": None, "status_rp": None}
    base = STATUS_PARA_FILTROS.get(status_oficial, {})
    return {
        "status_rp": status_oficial,
        "etapa_producao": base.get("etapa_producao"),
        "status_operacional": base.get("status_operacional"),
    }


def extrair_filtros_rp(texto: str) -> dict[str, Any]:
    """Filtros para listar_pedidos_rp a partir de linguagem natural."""
    n = normalizar_texto(texto)
    status = resolver_status(texto)
    filtros = {
        "etapa_producao": None,
        "status_operacional": None,
        "status_rp": None,
        "apenas_abertos": True,
    }
    if status:
        filtros.update(status_para_filtros_api(status))
    else:
        # Fallback legado (etapas antigas do assistente)
        legado = {
            "arte": "Arte",
            "insumo": "Insumos",
            "corte": "Corte",
            "estampa": "Estampa",
            "costura": "Costura",
            "embalo": "Embalo",
            "aguardando retirada": "Aguardando retirada",
        }
        for chave, valor in legado.items():
            if chave in n:
                filtros["etapa_producao"] = valor
                break
        if "atrasad" in n:
            filtros["status_operacional"] = "Atrasado"

    if any(x in n for x in ("todos", "historico", "incluir finalizados", "planilha inteira")):
        filtros["apenas_abertos"] = False
    if "aberto" in n or "abertos" in n or "fila" in n:
        filtros["apenas_abertos"] = True
    return filtros


def _extrair_codigo(texto: str) -> str | None:
    m = re.search(r"\b(\d{4})\b", texto)
    return m.group(1) if m else None


def _pede_repetir_contexto(n: str) -> bool:
    return any(p in n for p in PADROES_REPETIR)


def _ultima_intencao_rp_historico(
    historico: list | None, sessao: str | None = None
) -> dict | None:
    if historico:
        for msg in reversed(historico):
            if msg.get("role") != "user":
                continue
            prev = detectar_intencao_basica(msg.get("content", ""), historico=None)
            if prev["intencao"] in INTENCOES_RP_DADOS and prev.get("params", {}).get(
                "status_rp"
            ):
                return prev
            if prev["intencao"] in INTENCOES_RP_DADOS and prev["executar"]:
                return prev
    if sessao:
        try:
            from historico_db import carregar_contexto_rp

            ctx = carregar_contexto_rp(sessao)
            if ctx and ctx.get("params"):
                return {
                    "intencao": ctx.get("intencao", "buscar_pedidos_status"),
                    "executar": True,
                    "confianca": 0.85,
                    "params": ctx.get("params", {}),
                }
        except ImportError:
            pass
    return None


def _aplicar_repetir_contexto(
    texto: str, n: str, base: dict, historico: list | None, sessao: str | None = None
) -> dict:
    """faz o mesmo mas com corte -> repete intencao, troca status."""
    ult = _ultima_intencao_rp_historico(historico, sessao=sessao)
    if not ult:
        return base

    novo_status = resolver_status(texto)
    if not novo_status:
        # So o trecho apos "com/agora"
        for sep in ("mas com", "mas agora", "agora com", "com os de", "com "):
            if sep in n:
                pedaco = n.split(sep, 1)[-1].strip()
                novo_status = resolver_status(pedaco)
                if novo_status:
                    break

    params = dict(base.get("params") or {})
    if novo_status:
        params.update(status_para_filtros_api(novo_status))
    elif ult.get("params"):
        params.update(
            {
                k: ult["params"].get(k)
                for k in (
                    "status_rp",
                    "etapa_producao",
                    "status_operacional",
                    "apenas_abertos",
                )
            }
        )

    return {
        "intencao": ult["intencao"],
        "executar": True,
        "confianca": 0.88,
        "params": params,
        "repetiu_contexto": True,
    }


def _tem_verbo_comando(n: str) -> bool:
    return any(v in n for v in VERBOS_COMANDO)


def _tema_pedidos(n: str) -> bool:
    return any(k in n for k in TEMA_PEDIDOS) or resolver_status(n) is not None


def _e_pergunta(raw: str, n: str) -> bool:
    if "?" in raw:
        return True
    return any(n.startswith(p) or f" {p}" in n for p in PERGUNTA_INICIOS)


def detectar_intencao_basica(
    texto: str, historico: list | None = None, sessao: str | None = None
) -> dict:
    """
    Classifica intencao antes de ferramentas.
    Padrao: conversa (nao executar).
    """
    raw = (texto or "").strip()
    vazio = {
        "intencao": "conversa",
        "executar": False,
        "confianca": 1.0,
        "params": {},
    }
    if not raw:
        return vazio

    n = normalizar_texto(raw)
    params: dict[str, Any] = {
        "texto_original": raw,
        "codigo": _extrair_codigo(raw),
        "status_rp": None,
        "etapa_producao": None,
        "status_operacional": None,
        "apenas_abertos": True,
    }

    if _pede_repetir_contexto(n) and (historico or sessao):
        rep = _aplicar_repetir_contexto(raw, n, vazio, historico, sessao=sessao)
        if rep.get("repetiu_contexto"):
            return rep

    if n in CONVERSA_CURTA:
        return {
            "intencao": "conversa",
            "executar": False,
            "confianca": 0.9,
            "params": params,
        }

    if _e_pergunta(raw, n) and not _tem_verbo_comando(n) and not _tema_pedidos(n):
        return {
            "intencao": "pergunta",
            "executar": False,
            "confianca": 0.9,
            "params": params,
        }

    tem_verbo = _tem_verbo_comando(n)

    # Abrir programa (antes de resolver status RP — evita 'corel' -> corte)
    if tem_verbo and any(p in n for p in VERBOS_PROGRAMA) and not params.get("codigo"):
        return {
            "intencao": "abrir_programa",
            "executar": True,
            "confianca": 0.9,
            "params": params,
        }

    # Abrir RP no navegador
    if any(k in n for k in (" rp", "rp ", "fila do rp", "sistema rp", "fila rp")) and any(
        v in n for v in ("abrir", "abre", "abra")
    ):
        return {
            "intencao": "abrir_pedido_rp",
            "executar": True,
            "confianca": 0.9,
            "params": params,
        }

    # Codigo fonte (nao misturar com dados vivos)
    try:
        from consultar_sistema_pedidos import tema_sistema_pedidos

        if tema_sistema_pedidos(raw):
            return {
                "intencao": "consultar_sistema",
                "executar": True,
                "confianca": 0.9,
                "params": params,
            }
    except ImportError:
        pass

    filtros = extrair_filtros_rp(raw)
    params.update(filtros)

    # --- RP: dados vivos (apos comandos de programa/pasta) ---
    status_resolvido = params.get("status_rp")

    if any(k in n for k in ("atrasad", "atraso", "atrasados")) and _tema_pedidos(n):
        return {
            "intencao": "buscar_pedidos_atrasados",
            "executar": True,
            "confianca": 0.9,
            "params": {**params, "status_operacional": "Atrasado"},
        }

    if any(k in n for k in ("entrega", "entregar", "entregas")) and _tema_pedidos(n):
        return {
            "intencao": "buscar_pedidos_entrega",
            "executar": True,
            "confianca": 0.88,
            "params": params,
        }

    if (
        status_resolvido
        or params.get("etapa_producao")
        or params.get("status_operacional")
    ) and _tema_pedidos(n):
        return {
            "intencao": "buscar_pedidos_status",
            "executar": True,
            "confianca": 0.92,
            "params": params,
        }

    if _tema_pedidos(n) and (
        _tem_verbo_comando(n)
        or "status" in n
        or any(
            k in n
            for k in (
                "financeiro",
                "relatorio",
                "resumo",
                "fila",
                "detalhe",
                "detalhes",
            )
        )
    ):
        if params.get("codigo") or any(
            k in n for k in ("detalhe", "detalhes", "dados do pedido")
        ):
            return {
                "intencao": "consultar_pedido",
                "executar": True,
                "confianca": 0.9,
                "params": params,
            }
        return {
            "intencao": "buscar_pedidos_status",
            "executar": True,
            "confianca": 0.85,
            "params": params,
        }

    # Ler PDF
    if ("ler" in n or "leia" in n) and "pdf" in n:
        return {
            "intencao": "ler_pdf",
            "executar": True,
            "confianca": 0.9,
            "params": params,
        }

    # Cliente + codigo
    if params.get("codigo"):
        if "pasta" in n and tem_verbo:
            return {
                "intencao": "abrir_pasta_cliente",
                "executar": True,
                "confianca": 0.85,
                "params": params,
            }
        if any(t in n for t in ("cdr", "psd", "pdf", "corel", "photoshop")) and tem_verbo:
            return {
                "intencao": "abrir_arquivo_cliente",
                "executar": True,
                "confianca": 0.85,
                "params": params,
            }
        if tem_verbo and ("listar" in n or "lista" in n or "arquivos" in n):
            return {
                "intencao": "listar_arquivos_cliente",
                "executar": True,
                "confianca": 0.85,
                "params": params,
            }
        if tem_verbo:
            return {
                "intencao": "abrir_arquivo_cliente",
                "executar": True,
                "confianca": 0.75,
                "params": params,
            }

    if tem_verbo and ("abrir" in n or "abre" in n) and not params.get("codigo"):
        if any(p in n for p in VERBOS_PROGRAMA):
            return {
                "intencao": "abrir_programa",
                "executar": True,
                "confianca": 0.75,
                "params": params,
            }

    if tem_verbo and any(v in n for v in ("buscar", "busca", "procurar", "encontrar")):
        return {
            "intencao": "buscar_arquivo",
            "executar": True,
            "confianca": 0.8,
            "params": params,
        }

    if _e_pergunta(raw, n):
        return {
            "intencao": "pergunta",
            "executar": False,
            "confianca": 0.9,
            "params": params,
        }

    if n in CONVERSA_CURTA or (len(n.split()) <= 3 and not tem_verbo):
        return {
            "intencao": "conversa",
            "executar": False,
            "confianca": 0.85,
            "params": params,
        }

    return {
        "intencao": "conversa",
        "executar": False,
        "confianca": 0.6,
        "params": params,
    }


def deve_permitir_ferramenta(texto: str, intencao: str) -> bool:
    """So permite tool se intencao for clara e executavel."""
    if intencao in INTENCOES_SEM_FERRAMENTA:
        return False
    basica = detectar_intencao_basica(texto)
    if not basica.get("executar"):
        return False
    if basica["confianca"] < 0.7:
        return False
    return basica["intencao"] == intencao or intencao in (
        "navegar_rp",
        "consultar_rp",
        "consultar_sistema",
        "abrir_pedido_rp",
        "buscar_arquivo",
    )


def intencao_para_legacy(intencao: str) -> str:
    """Mapeia intencao fina para intencao usada em seguranca.py."""
    mapa = {
        "buscar_pedidos_status": "navegar_rp",
        "buscar_pedidos_atrasados": "navegar_rp",
        "buscar_pedidos_entrega": "navegar_rp",
        "consultar_pedido": "navegar_rp",
        "listar_arquivos_cliente": "abrir_pasta_cliente",
    }
    return mapa.get(intencao, intencao)


def tema_consulta_rp_viva(texto: str) -> bool:
    """Se deve consultar planilha RP (nao codigo fonte)."""
    try:
        from consultar_sistema_pedidos import tema_sistema_pedidos

        if tema_sistema_pedidos(texto):
            return False
    except ImportError:
        pass
    b = detectar_intencao_basica(texto)
    if b["intencao"] in INTENCOES_RP_DADOS:
        return True
    n = normalizar_texto(texto)
    return _tema_pedidos(n)
