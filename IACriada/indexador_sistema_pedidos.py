"""Indexa o repositorio local sistema-pedidos (somente leitura)."""

from __future__ import annotations

import os
import re
import sqlite3
import time
from pathlib import Path

from config import path_sistema_pedidos, path_sistema_pedidos_db

EXTENSOES = {
    ".gs",
    ".js",
    ".html",
    ".css",
    ".json",
    ".md",
    ".txt",
    ".bat",
    ".example",
    ".env",
}
IGNORAR_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".cursor",
}
IGNORAR_ARQUIVOS = {
    "package-lock.json",
}
MAX_ARQUIVO_BYTES = 400_000
CHUNK_CHARS = 6000
CHUNK_OVERLAP = 400

SCHEMA = """
CREATE TABLE IF NOT EXISTS arquivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caminho TEXT UNIQUE NOT NULL,
    nome TEXT,
    extensao TEXT,
    tamanho INTEGER,
    modificado REAL
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arquivo_id INTEGER NOT NULL,
    indice INTEGER NOT NULL,
    conteudo TEXT NOT NULL,
    FOREIGN KEY (arquivo_id) REFERENCES arquivos(id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    caminho,
    nome,
    conteudo,
    tokenize='unicode61'
);
"""


def _conectar() -> sqlite3.Connection:
    db = path_sistema_pedidos_db()
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _ler_texto(fp: Path) -> str | None:
    try:
        raw = fp.read_bytes()
    except OSError:
        return None
    if len(raw) > MAX_ARQUIVO_BYTES:
        raw = raw[:MAX_ARQUIVO_BYTES]
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _chunks(texto: str) -> list[str]:
    if not texto:
        return []
    if len(texto) <= CHUNK_CHARS:
        return [texto]
    partes = []
    i = 0
    while i < len(texto):
        partes.append(texto[i : i + CHUNK_CHARS])
        i += CHUNK_CHARS - CHUNK_OVERLAP
    return partes


def indexar_sistema_pedidos(progresso=None) -> dict:
    raiz = path_sistema_pedidos()
    if not raiz.is_dir():
        return {"erro": f"Pasta nao encontrada: {raiz}", "total_arquivos": 0}

    conn = _conectar()
    conn.execute("DELETE FROM chunks_fts")
    conn.execute("DELETE FROM chunks")
    conn.execute("DELETE FROM arquivos")
    conn.commit()

    total_arquivos = 0
    total_chunks = 0
    inicio = time.time()

    for dirpath, dirnames, filenames in os.walk(raiz):
        dirnames[:] = [d for d in dirnames if d not in IGNORAR_DIRS]
        for fn in filenames:
            if fn in IGNORAR_ARQUIVOS or fn.startswith("."):
                continue
            fp = Path(dirpath) / fn
            ext = fp.suffix.lower()
            if ext not in EXTENSOES and fn not in (".env.example",):
                continue
            if ext == ".json" and "package-lock" in fn:
                continue

            texto = _ler_texto(fp)
            if texto is None:
                continue

            rel = str(fp.relative_to(raiz)).replace("\\", "/")
            try:
                stat = fp.stat()
                mod = stat.st_mtime
                tam = stat.st_size
            except OSError:
                mod = 0
                tam = len(texto.encode("utf-8", errors="replace"))

            cur = conn.execute(
                """
                INSERT INTO arquivos (caminho, nome, extensao, tamanho, modificado)
                VALUES (?, ?, ?, ?, ?)
                """,
                (rel, fn, ext, tam, mod),
            )
            aid = cur.lastrowid
            total_arquivos += 1

            for idx, ch in enumerate(_chunks(texto)):
                cur2 = conn.execute(
                    "INSERT INTO chunks (arquivo_id, indice, conteudo) VALUES (?, ?, ?)",
                    (aid, idx, ch),
                )
                cid = cur2.lastrowid
                conn.execute(
                    "INSERT INTO chunks_fts(rowid, caminho, nome, conteudo) VALUES (?, ?, ?, ?)",
                    (cid, rel, fn, ch),
                )
                total_chunks += 1

            if progresso and total_arquivos % 10 == 0:
                progresso(total_arquivos)

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "total_arquivos": total_arquivos,
        "total_chunks": total_chunks,
        "pasta": str(raiz),
        "segundos": round(time.time() - inicio, 1),
    }


def estatisticas_sistema_index() -> dict:
    db = path_sistema_pedidos_db()
    if not db.is_file():
        return {"indexado": False, "arquivos": 0, "chunks": 0}
    conn = _conectar()
    arq = conn.execute("SELECT COUNT(*) FROM arquivos").fetchone()[0]
    ch = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    conn.close()
    return {
        "indexado": arq > 0,
        "arquivos": arq,
        "chunks": ch,
        "pasta": str(path_sistema_pedidos()),
    }


def listar_arquivos_indexados(limite: int = 200) -> list[dict]:
    conn = _conectar()
    rows = conn.execute(
        """
        SELECT caminho, nome, extensao, tamanho
        FROM arquivos ORDER BY caminho LIMIT ?
        """,
        (limite,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
