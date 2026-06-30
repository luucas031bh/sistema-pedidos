"""Indexador SQLite do OneDrive TRABALHO."""

import os
import re
import sqlite3
import time
from pathlib import Path

from config import path_index_db, path_onedrive_trabalho

SCHEMA = """
CREATE TABLE IF NOT EXISTS arquivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    ultimos_4_digitos TEXT,
    ano INTEGER,
    mes INTEGER,
    tipo_arquivo TEXT,
    nome_arquivo TEXT,
    caminho_completo TEXT UNIQUE,
    data_modificacao REAL
);
CREATE INDEX IF NOT EXISTS idx_cliente_cod ON arquivos(cliente, ultimos_4_digitos);
CREATE INDEX IF NOT EXISTS idx_tipo ON arquivos(tipo_arquivo);
"""

RE_CLIENTE_COD = re.compile(
    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)\s*(\d{4})\b",
    re.UNICODE,
)
RE_ANO_MES = re.compile(r"[/\\](20\d{2})[/\\](\d{1,2})[/\\]")


def _conectar():
    db = path_index_db()
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _parse_cliente_cod(nome: str) -> tuple[str | None, str | None]:
    m = RE_CLIENTE_COD.search(nome)
    if m:
        cliente = m.group(1).strip().title()
        return cliente, m.group(2)
    m2 = re.search(r"\b(\d{4})\b", nome)
    if m2:
        cod = m2.group(1)
        parte = nome.replace(cod, "").strip()
        cliente = parte.split()[0].title() if parte.split() else None
        return cliente, cod
    return None, None


def _parse_ano_mes(caminho: str) -> tuple[int | None, int | None]:
    m = RE_ANO_MES.search(caminho)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def indexar_completo(progresso=None) -> dict:
    raiz = path_onedrive_trabalho()
    if not raiz.is_dir():
        return {"erro": f"Pasta nao encontrada: {raiz}", "total": 0}

    conn = _conectar()
    conn.execute("DELETE FROM arquivos")
    total = 0
    inicio = time.time()

    for dirpath, dirnames, filenames in os.walk(raiz):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            if fn.startswith("."):
                continue
            fp = Path(dirpath) / fn
            try:
                stat = fp.stat()
            except OSError:
                continue
            caminho = str(fp.resolve())
            ext = fp.suffix.lower()
            cliente, cod = _parse_cliente_cod(fp.parent.name)
            if not cliente:
                cliente, cod = _parse_cliente_cod(fn)
            ano, mes = _parse_ano_mes(caminho)
            if not ano:
                ano = time.localtime(stat.st_mtime).tm_year
                mes = time.localtime(stat.st_mtime).tm_mon

            conn.execute(
                """
                INSERT OR REPLACE INTO arquivos
                (cliente, ultimos_4_digitos, ano, mes, tipo_arquivo, nome_arquivo,
                 caminho_completo, data_modificacao)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cliente,
                    cod,
                    ano,
                    mes,
                    ext,
                    fn,
                    caminho,
                    stat.st_mtime,
                ),
            )
            total += 1
            if progresso and total % 500 == 0:
                progresso(total)

    conn.commit()
    conn.close()
    return {
        "ok": True,
        "total": total,
        "segundos": round(time.time() - inicio, 1),
        "pasta": str(raiz),
    }


def buscar(
    cliente: str | None = None,
    codigo: str | None = None,
    tipo_arquivo: str | None = None,
    limite: int = 25,
) -> list[dict]:
    conn = _conectar()
    q = "SELECT * FROM arquivos WHERE 1=1"
    args: list = []
    if cliente:
        q += " AND cliente LIKE ?"
        args.append(f"%{cliente.strip().title()}%")
    if codigo:
        q += " AND ultimos_4_digitos = ?"
        args.append(codigo.zfill(4)[-4:])
    if tipo_arquivo:
        ext = tipo_arquivo if tipo_arquivo.startswith(".") else f".{tipo_arquivo}"
        q += " AND tipo_arquivo = ?"
        args.append(ext.lower())
    q += " ORDER BY data_modificacao DESC LIMIT ?"
    args.append(limite)
    rows = conn.execute(q, args).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def buscar_por_termo(termo: str, limite: int = 15) -> list[dict]:
    """Busca por substring no nome ou caminho (Ctrl+F no indice OneDrive)."""
    t = (termo or "").strip()
    if len(t) < 2:
        return []
    conn = _conectar()
    pat = f"%{t}%"
    rows = conn.execute(
        """
        SELECT * FROM arquivos
        WHERE nome_arquivo LIKE ? OR caminho_completo LIKE ? OR cliente LIKE ?
        ORDER BY data_modificacao DESC
        LIMIT ?
        """,
        (pat, pat, pat, limite),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def buscar_pasta_cliente(cliente: str, codigo: str) -> str | None:
    """Retorna caminho da pasta do cliente (pai do arquivo ou pasta nomeada)."""
    raiz = path_onedrive_trabalho()
    cod = codigo.zfill(4)[-4:]
    cli = cliente.strip().title()
    padroes = [
        f"{cli} {cod}",
        f"{cli}{cod}",
        f"{cli}_{cod}",
    ]
    for dirpath, dirnames, _ in os.walk(raiz):
        for d in dirnames:
            dl = d.lower()
            for p in padroes:
                if p.lower() in dl or dl == p.lower():
                    return str((Path(dirpath) / d).resolve())
    # fallback: pasta do primeiro arquivo no indice
    rows = buscar(cli, cod, limite=1)
    if rows:
        return str(Path(rows[0]["caminho_completo"]).parent)
    return None


def listar_clientes(limite: int = 100) -> list[dict]:
    conn = _conectar()
    rows = conn.execute(
        """
        SELECT cliente, ultimos_4_digitos, COUNT(*) as n
        FROM arquivos
        WHERE cliente IS NOT NULL AND ultimos_4_digitos IS NOT NULL
        GROUP BY cliente, ultimos_4_digitos
        ORDER BY cliente
        LIMIT ?
        """,
        (limite,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def estatisticas_index() -> dict:
    conn = _conectar()
    try:
        n = conn.execute("SELECT COUNT(*) FROM arquivos").fetchone()[0]
    except sqlite3.OperationalError:
        n = 0
    conn.close()
    return {"arquivos_indexados": n, "db": str(path_index_db())}
