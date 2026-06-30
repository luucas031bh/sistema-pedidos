"""Busca e contexto sobre o codigo local sistema-pedidos."""

from __future__ import annotations

import re
import sqlite3
import unicodedata
from pathlib import Path

from config import path_sistema_pedidos, path_sistema_pedidos_db
from indexador_sistema_pedidos import estatisticas_sistema_index, indexar_sistema_pedidos

MAX_CONTEXTO_CHARS = 28_000
MAX_TRECHOS = 12


def _norm(texto: str) -> str:
    t = (texto or "").strip().lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def tema_sistema_pedidos(texto: str) -> bool:
    """Pergunta sobre codigo/repositorio (nao dados vivos da planilha)."""
    n = _norm(texto)
    raw = (texto or "").lower()

    if "sistema-pedidos" in raw or "sistema pedidos" in n:
        if not _parece_pergunta_dados_vivos(n):
            return True

    sinais_fortes = (
        "code.gs",
        "config.js",
        "home.js",
        "script.js",
        "nlintent",
        "bot-adny",
        "bot adny",
        "bot-tipocs",
        "doget",
        "dopost",
        "apps script",
        "sistema-pedidos",
        "sistema pedidos",
        "codigo fonte",
        "código fonte",
    )
    if any(s in n or s in raw for s in sinais_fortes):
        if not _parece_pergunta_dados_vivos(n):
            return True

    sinais_contexto = (
        "repositorio",
        "repositório",
        "github",
        "google sheets",
        "planilha",
        "como funciona",
        "o que faz",
        "onde esta",
        "onde está",
        "qual arquivo",
        "quais arquivos",
        "estrutura",
        "explica",
        "explicar",
        "funcao",
        "função",
        "arquivo",
        "pasta do projeto",
        "projeto pedidos",
    )
    if any(s in n or s in raw for s in sinais_contexto):
        if any(
            k in n
            for k in (
                "sistema",
                "rp",
                "pedido",
                "projeto",
                "codigo",
                "code",
                "bot",
                "gas",
                "gs",
                "doget",
                "dopost",
            )
        ):
            if not _parece_pergunta_dados_vivos(n):
                return True
    return False


def _parece_pergunta_dados_vivos(n: str) -> bool:
    """Distingue 'pedidos em arte' (planilha) de 'como lista pedidos' (codigo)."""
    if any(
        k in n
        for k in (
            "pedidos em",
            "pedidos com",
            "status em",
            "status de",
            "em aberto",
            "resumo financeiro",
            "valor recebido",
            "fila",
            "quantos pedidos",
            "quantas pedidos",
            "liste os pedidos",
            "lista os pedidos",
            "me mostrar todos os pedidos",
            "me fala os pedidos",
        )
    ):
        return True
    etapas = ("arte", "insumos", "corte", "estampa", "costura", "embalo")
    if any(e in n for e in etapas) and "pedido" in n:
        if not any(k in n for k in ("como", "onde", "qual arquivo", "code", "funcao", "função")):
            return True
    return False


def _conectar() -> sqlite3.Connection:
    db = path_sistema_pedidos_db()
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    return conn


def _tokens_busca(texto: str) -> list[str]:
    n = _norm(texto)
    stop = {
        "como",
        "qual",
        "quais",
        "onde",
        "o",
        "a",
        "os",
        "as",
        "de",
        "do",
        "da",
        "em",
        "no",
        "na",
        "que",
        "e",
        "eh",
        "é",
        "um",
        "uma",
        "para",
        "por",
        "me",
        "fala",
        "diga",
        "explica",
        "sistema",
        "pedidos",
        "pedido",
        "rp",
        "sobre",
        "funciona",
    }
    partes = re.findall(r"[a-z0-9_./-]{2,}", n)
    out = []
    for p in partes:
        if p not in stop and len(p) >= 2:
            out.append(p)
    for nome in (
        "code.gs",
        "home.js",
        "config.js",
        "script.js",
        "nlintent.js",
        "gas.js",
        "listarpedidos",
        "buscarpedido",
    ):
        if nome.replace(".", "") in n.replace(".", "") or nome in n:
            out.append(nome.replace(".gs", ".gs"))
    return list(dict.fromkeys(out))[:20]


def _buscar_fts(termos: list[str], limite: int = MAX_TRECHOS) -> list[dict]:
    if not termos:
        return []
    conn = _conectar()
    # FTS query: termos unidos com OR
    q = " OR ".join(f'"{t}"' for t in termos if t)
    if not q:
        conn.close()
        return []
    try:
        rows = conn.execute(
            """
            SELECT f.rowid AS id, f.caminho, f.nome,
                   COALESCE(c.indice, 0) AS indice, f.conteudo,
                   bm25(chunks_fts) AS rank
            FROM chunks_fts f
            LEFT JOIN chunks c ON c.id = f.rowid
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (q, limite),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []
    conn.close()
    return [dict(r) for r in rows]


def _buscar_like(termos: list[str], limite: int = MAX_TRECHOS) -> list[dict]:
    if not termos:
        return []
    conn = _conectar()
    rows = []
    for t in termos[:8]:
        pat = f"%{t}%"
        part = conn.execute(
            """
            SELECT c.id, a.caminho, a.nome, c.indice, c.conteudo, 0 AS rank
            FROM chunks c
            JOIN arquivos a ON a.id = c.arquivo_id
            WHERE a.caminho LIKE ? OR a.nome LIKE ? OR c.conteudo LIKE ?
            LIMIT ?
            """,
            (pat, pat, pat, limite),
        ).fetchall()
        rows.extend(dict(r) for r in part)
    conn.close()
    vistos = set()
    unicos = []
    for r in rows:
        if r["id"] in vistos:
            continue
        vistos.add(r["id"])
        unicos.append(r)
    return unicos[:limite]


def ler_arquivo_relativo(caminho_rel: str, max_chars: int = 14_000) -> str | None:
    raiz = path_sistema_pedidos()
    fp = (raiz / caminho_rel.replace("/", "\\")).resolve()
    if not str(fp).startswith(str(raiz.resolve())):
        return None
    if not fp.is_file():
        return None
    try:
        texto = fp.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    return texto[:max_chars]


def _estrutura_resumo() -> str:
    stats = estatisticas_sistema_index()
    if not stats.get("indexado"):
        return "Indice do sistema-pedidos vazio. Clique em 'Indexar sistema' na barra lateral."
    arquivos = listar_arquivos_por_pasta()
    linhas = [
        f"Repositorio: {stats.get('pasta')}",
        f"Arquivos indexados: {stats.get('arquivos')} ({stats.get('chunks')} trechos)",
        "",
        "Pastas principais:",
    ]
    for pasta, n in arquivos[:25]:
        linhas.append(f"  - {pasta}/ ({n} arquivos)")
    return "\n".join(linhas)


def listar_arquivos_por_pasta() -> list[tuple[str, int]]:
    conn = _conectar()
    rows = conn.execute("SELECT caminho FROM arquivos").fetchall()
    conn.close()
    contagem: dict[str, int] = {}
    for r in rows:
        p = r["caminho"]
        top = p.split("/")[0] if "/" in p else "(raiz)"
        contagem[top] = contagem.get(top, 0) + 1
    return sorted(contagem.items(), key=lambda x: (-x[1], x[0]))


def buscar_contexto(pergunta: str) -> dict:
    stats = estatisticas_sistema_index()
    if not stats.get("indexado"):
        idx = indexar_sistema_pedidos()
        if idx.get("erro"):
            return {"ok": False, "erro": idx["erro"], "contexto": ""}
        stats = estatisticas_sistema_index()

    termos = _tokens_busca(pergunta)
    trechos = _buscar_fts(termos) if termos else []
    if len(trechos) < 3:
        trechos = _buscar_like(termos) or trechos

    # Arquivos mencionados explicitamente
    for m in re.finditer(
        r"([\w./-]+\.(?:gs|js|html|css|json|md))\b", pergunta, re.I
    ):
        rel = m.group(1).replace("\\", "/")
        conteudo = ler_arquivo_relativo(rel, 8000)
        if conteudo:
            trechos.insert(
                0,
                {
                    "caminho": rel,
                    "nome": Path(rel).name,
                    "indice": 0,
                    "conteudo": conteudo,
                    "rank": -1,
                },
            )

    partes = [_estrutura_resumo(), "", "=== Trechos relevantes (codigo local) ==="]
    chars = sum(len(p) for p in partes)
    arquivos_usados = []

    for t in trechos:
        bloco = (
            f"\n--- {t['caminho']} (parte {int(t.get('indice', 0)) + 1}) ---\n"
            f"{t['conteudo']}\n"
        )
        if chars + len(bloco) > MAX_CONTEXTO_CHARS:
            break
        partes.append(bloco)
        chars += len(bloco)
        if t["caminho"] not in arquivos_usados:
            arquivos_usados.append(t["caminho"])

    contexto = "\n".join(partes)
    return {
        "ok": True,
        "contexto": contexto,
        "arquivos": arquivos_usados,
        "termos": termos,
        "trechos": len(trechos),
    }


def pesquisar_repositorio(pergunta: str, *, limite: int = MAX_TRECHOS) -> dict:
    """Busca no repo indexado — sem gate tema_sistema_pedidos (agente LEITOR)."""
    stats = estatisticas_sistema_index()
    if not stats.get("indexado"):
        idx = indexar_sistema_pedidos()
        if idx.get("erro"):
            return {"ok": False, "erro": idx["erro"], "trechos_detalhe": []}

    termos = _tokens_busca(pergunta)
    trechos = _buscar_fts(termos, limite=limite) if termos else []
    if len(trechos) < 2:
        trechos = _buscar_like(termos, limite=limite) or trechos

    for m in re.finditer(
        r"([\w./-]+\.(?:gs|js|html|css|json|md))\b", pergunta, re.I
    ):
        rel = m.group(1).replace("\\", "/")
        conteudo = ler_arquivo_relativo(rel, 8000)
        if conteudo:
            trechos.insert(
                0,
                {
                    "caminho": rel,
                    "nome": Path(rel).name,
                    "indice": 0,
                    "conteudo": conteudo,
                    "rank": -1,
                },
            )

    for tok in termos:
        if re.fullmatch(r"[a-z]{2}\d{3}", tok, re.I):
            rel = "ROANTONE/data/colors.json"
            bloco = ler_arquivo_relativo(rel, 500_000)
            if bloco and tok.upper() in bloco.upper():
                idx = bloco.upper().find(f'"{tok.upper()}"')
                if idx >= 0:
                    fatia = bloco[max(0, idx - 20) : idx + 400]
                    trechos.insert(
                        0,
                        {
                            "caminho": rel,
                            "nome": "colors.json",
                            "indice": 0,
                            "conteudo": fatia,
                            "rank": -2,
                        },
                    )

    vistos: set[str] = set()
    detalhe: list[dict] = []
    for t in trechos:
        chave = f"{t.get('caminho')}:{t.get('indice')}"
        if chave in vistos:
            continue
        vistos.add(chave)
        detalhe.append(t)
        if len(detalhe) >= limite:
            break

    return {
        "ok": True,
        "trechos_detalhe": detalhe,
        "termos": termos,
        "total": len(detalhe),
    }


def responder_com_contexto(pergunta: str) -> dict:
    """Retorna contexto para injetar no agente (Ollama sintetiza com base no codigo)."""
    if not tema_sistema_pedidos(pergunta):
        return {"ok": False, "erro": "Nao e pergunta sobre o codigo do sistema"}
    ctx = buscar_contexto(pergunta)
    return ctx
