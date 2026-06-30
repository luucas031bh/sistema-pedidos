"""Extracao de entidades em perguntas sobre o RP (cliente, escopo, tipo de dado)."""

from __future__ import annotations

import re
import unicodedata

_STOP_CLIENTE = frozenset(
    {
        "rp",
        "pedido",
        "pedidos",
        "aberto",
        "abertos",
        "insumos",
        "arte",
        "somente",
        "smente",
        "apenas",
        "so",
        "só",
        "tamanho",
        "tamanhos",
        "quantidade",
        "quantidades",
        "peca",
        "pecas",
        "peça",
        "peças",
        "cliente",
        "detalhe",
        "detalhes",
        "buscar",
        "busca",
        "procurar",
        "encontrar",
        "informacao",
        "informações",
        "informacoes",
        "dados",
        "saber",
        "preciso",
        "quero",
        "qual",
        "quais",
        "me",
        "fala",
        "diga",
        "mostra",
        "mostrar",
        "lista",
        "listar",
        "do",
        "da",
        "de",
        "dos",
        "das",
        "a",
        "o",
        "as",
        "os",
        "e",
        "em",
        "no",
        "na",
        "nos",
        "nas",
        "por",
        "para",
        "com",
        "sem",
        "apenas",
    }
)

_PADROES_CLIENTE = (
    re.compile(
        r"(?:pedido|cliente)\s+(?:do|da|de)\s+(?:o\s+|a\s+)?([a-zA-ZÀ-ú][\wÀ-ú\s]{1,45})",
        re.I,
    ),
    re.compile(
        r"(?:do|da)\s+(?:pedido|cliente)\s+(?:do|da|de)?\s*(?:o\s+|a\s+)?([a-zA-ZÀ-ú][\wÀ-ú\s]{1,45})",
        re.I,
    ),
    re.compile(
        r"(?:tamanhos?|quantidades?|pecas?|peças?)\s+(?:do|da|de)\s+(?:pedido\s+)?(?:do|da|de)?\s*"
        r"(?:o\s+|a\s+)?([a-zA-ZÀ-ú][\wÀ-ú\s]{1,45})",
        re.I,
    ),
    re.compile(
        r"(?:peiddo|pedido)\s+(?:peiddo|pedido\s+)+([a-zA-ZÀ-ú][\wÀ-ú\s]{2,45})",
        re.I,
    ),
    re.compile(
        r"(?:peiddo|pedido)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)",
    ),
    re.compile(
        r"(?:resumo|detalhe|detalhes|dados)\s+(?:do|da|de)\s+(?:pedido\s+)?(?:do|da|de)?\s*"
        r"(?:o\s+|a\s+)?([a-zA-ZÀ-ú][\wÀ-ú\s]{2,45})",
        re.I,
    ),
)


def _norm(texto: str) -> str:
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _limpar_nome_cliente(bruto: str) -> str | None:
    termo = re.sub(r"\s+", " ", (bruto or "").strip())
    termo = re.sub(r"[?.!,;:]+$", "", termo).strip()
    if not termo or len(termo) < 2:
        return None
    palavras = []
    for w in termo.split():
        nw = _norm(w)
        if nw in _STOP_CLIENTE:
            continue
        if nw.isdigit() and len(nw) == 4:
            continue
        palavras.append(w)
    if not palavras:
        return None
    nome = " ".join(palavras)
    if len(_norm(nome)) < 3:
        return None
    return nome


def extrair_cliente(texto: str) -> str | None:
    """Extrai nome de cliente de frases como 'pedido do Carlos Bastos'."""
    raw = (texto or "").strip()
    for pat in _PADROES_CLIENTE:
        m = pat.search(raw)
        if m:
            nome = _limpar_nome_cliente(m.group(1))
            if nome:
                return nome
    return None


def extrair_codigo_busca(texto: str) -> str | None:
    m = re.search(r"\b(\d{4})\b", texto or "")
    return m.group(1) if m else None


def escopo_pedido_unico(texto: str, cliente: str | None = None) -> bool:
    """True quando a pergunta restringe a um pedido/cliente especifico."""
    n = _norm(texto or "")
    if cliente:
        return True
    if extrair_codigo_busca(texto or ""):
        return True
    if any(
        k in n
        for k in (
            "somente",
            "smente",
            "apenas",
            " so ",
            " só ",
            "desse pedido",
            "deste pedido",
            "dessa cliente",
            "desse cliente",
            "pedido do",
            "pedido da",
            "cliente ",
        )
    ):
        return True
    if re.search(r"\b(?:do|da)\s+(?:pedido|cliente)\b", n):
        return True
    return False


def quer_lista_tamanhos(texto: str) -> bool:
    n = _norm(texto or "")
    if not quer_tamanhos_ou_quantidades(texto):
        return False
    return any(k in n for k in ("lista", "listar", "liste", "listagem", "enumera", "faça uma lista", "faca uma lista"))


def quer_resumo_pedido(texto: str) -> bool:
    """True quando pede resumo/detalhe de um pedido (nao resumo financeiro da fila)."""
    n = _norm(texto or "")
    if any(k in n for k in ("resumo financeiro", "financeiro da fila", "financeiro dos pedidos")):
        return False
    return any(
        k in n
        for k in (
            "resumo do pedido",
            "resumo pedido",
            "faça um resumo",
            "faca um resumo",
            "me faz um resumo",
            "traga o resumo",
            "traga resumo",
            "me traga o resumo",
            "detalhe do pedido",
            "detalhes do pedido",
            "informacoes do pedido",
            "informações do pedido",
            "dados do pedido",
            "todas as informacoes",
            "todas as informações",
        )
    )


def quer_tamanhos_ou_quantidades(texto: str) -> bool:
    n = _norm(texto or "")
    return any(
        k in n
        for k in (
            "tamanho",
            "tamanhos",
            "quantidade",
            "quantidades",
            "pecas por",
            "peças por",
            "qtd",
            "grade",
        )
    )


def extrair_entidades_rp(texto: str) -> dict:
    """
    Entidades uteis ao roteamento RP.

    Returns:
        cliente, codigo, escopo_pedido, quer_tamanhos, termo_busca
    """
    raw = (texto or "").strip()
    cliente = extrair_cliente(raw)
    codigo = extrair_codigo_busca(raw)
    escopo = escopo_pedido_unico(raw, cliente)
    quer_tamanhos = quer_tamanhos_ou_quantidades(raw)
    termo = codigo or cliente
    if not termo:
        m = re.search(
            r"(?:busca|buscar|pedido|cliente|detalhe|detalhes)\s+(?:do|da|de)?\s*"
            r"([a-zA-ZÀ-ú][\wÀ-ú\s]{1,40})",
            raw,
            re.I,
        )
        if m:
            termo = _limpar_nome_cliente(m.group(1))
    return {
        "cliente": cliente,
        "codigo": codigo,
        "escopo_pedido": escopo,
        "quer_tamanhos": quer_tamanhos,
        "termo_busca": termo,
    }


def deve_buscar_tamanhos_pedido(texto: str) -> bool:
    """True se a pergunta pede grade de UM pedido, nao agregado da fila."""
    ent = extrair_entidades_rp(texto)
    if not ent.get("quer_tamanhos"):
        return False
    if not ent.get("escopo_pedido"):
        return False
    return bool(ent.get("cliente") or ent.get("codigo") or ent.get("termo_busca"))


def candidatos_busca_cliente(termo: str) -> list[str]:
    """Termos alternativos para busca (sobrenome, correcao leve de typo)."""
    base = (termo or "").strip()
    if not base:
        return []
    vistos: set[str] = set()
    out: list[str] = []

    def _add(t: str) -> None:
        t = re.sub(r"\s+", " ", (t or "").strip())
        if not t:
            return
        key = _norm(t)
        if key not in vistos:
            vistos.add(key)
            out.append(t)

    _add(base)
    partes = [p for p in base.split() if len(p) > 1]
    if len(partes) >= 2:
        _add(" ".join(partes[-2:]))
    if partes:
        _add(partes[-1])

    n = _norm(base)
    correcoes = (
        ("carloso", "carlos"),
        ("carlosoo", "carlos"),
        ("bastoos", "bastos"),
    )
    for err, ok in correcoes:
        if err in n:
            _add(re.sub(err, ok, base, flags=re.I))
            if partes:
                _add(re.sub(err, ok, partes[0], flags=re.I) + " " + " ".join(partes[1:]))

    return out


def escolher_pedido_por_nome(pedidos: list, termo: str) -> dict | None:
    """Escolhe o pedido mais proximo do nome buscado."""
    if not pedidos:
        return None
    if len(pedidos) == 1:
        return pedidos[0]

    try:
        from rapidfuzz import fuzz
    except ImportError:
        import difflib

        termo_n = _norm(termo)
        melhor = None
        melhor_score = 0.0
        for p in pedidos:
            from consultar_rp import nome_cliente

            nome = _norm(nome_cliente(p))
            score = difflib.SequenceMatcher(None, termo_n, nome).ratio()
            if score > melhor_score:
                melhor_score = score
                melhor = p
        return melhor if melhor_score >= 0.55 else pedidos[0]

    termo_n = _norm(termo)
    melhor = None
    melhor_score = 0
    for p in pedidos:
        from consultar_rp import nome_cliente

        nome = _norm(nome_cliente(p))
        score = max(
            fuzz.partial_ratio(termo_n, nome),
            fuzz.token_set_ratio(termo_n, nome),
        )
        if score > melhor_score:
            melhor_score = score
            melhor = p
    return melhor if melhor_score >= 55 else pedidos[0]
