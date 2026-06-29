"""Historico persistente e logs de seguranca em SQLite."""

import json
import sqlite3
import time
from pathlib import Path

from config import path_historico_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessao TEXT NOT NULL,
    criado_em REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    criado_em REAL NOT NULL,
    FOREIGN KEY (conversa_id) REFERENCES conversas(id)
);
CREATE TABLE IF NOT EXISTS logs_seguranca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessao TEXT,
    intencao TEXT,
    executar INTEGER,
    ferramenta TEXT,
    status TEXT,
    motivo TEXT,
    criado_em REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS contexto_sessao (
    sessao TEXT PRIMARY KEY,
    contexto_json TEXT NOT NULL,
    atualizado_em REAL NOT NULL
);
"""


def _conn():
    p = path_historico_db()
    c = sqlite3.connect(str(p))
    c.executescript(SCHEMA)
    return c


def obter_ou_criar_conversa(sessao: str) -> int:
    conn = _conn()
    row = conn.execute(
        "SELECT id FROM conversas WHERE sessao = ? ORDER BY id DESC LIMIT 1",
        (sessao,),
    ).fetchone()
    if row:
        conn.close()
        return row[0]
    cur = conn.execute(
        "INSERT INTO conversas (sessao, criado_em) VALUES (?, ?)",
        (sessao, time.time()),
    )
    cid = cur.lastrowid
    conn.commit()
    conn.close()
    return cid


def salvar_mensagem(sessao: str, role: str, content: str):
    conn = _conn()
    cid = obter_ou_criar_conversa(sessao)
    conn.execute(
        "INSERT INTO mensagens (conversa_id, role, content, criado_em) VALUES (?, ?, ?, ?)",
        (cid, role, content, time.time()),
    )
    conn.commit()
    conn.close()


def carregar_mensagens(sessao: str, limite: int = 50) -> list[dict]:
    """Ultimas N mensagens da conversa ativa (ordem cronologica)."""
    conn = _conn()
    row = conn.execute(
        "SELECT id FROM conversas WHERE sessao = ? ORDER BY id DESC LIMIT 1",
        (sessao,),
    ).fetchone()
    if not row:
        conn.close()
        return []
    rows = conn.execute(
        """
        SELECT role, content FROM mensagens
        WHERE conversa_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (row[0], limite),
    ).fetchall()
    conn.close()
    rows = list(reversed(rows))
    return [{"role": r[0], "content": r[1]} for r in rows]


def contar_mensagens(sessao: str) -> int:
    conn = _conn()
    row = conn.execute(
        "SELECT id FROM conversas WHERE sessao = ? ORDER BY id DESC LIMIT 1",
        (sessao,),
    ).fetchone()
    if not row:
        conn.close()
        return 0
    n = conn.execute(
        "SELECT COUNT(*) FROM mensagens WHERE conversa_id = ?",
        (row[0],),
    ).fetchone()[0]
    conn.close()
    return int(n)


def _ler_contexto_sessao(sessao: str) -> dict:
    conn = _conn()
    row = conn.execute(
        "SELECT contexto_json FROM contexto_sessao WHERE sessao = ?",
        (sessao,),
    ).fetchone()
    conn.close()
    if not row:
        return {}
    try:
        data = json.loads(row[0])
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _gravar_contexto_sessao(sessao: str, ctx: dict):
    payload = json.dumps(ctx, ensure_ascii=False)
    conn = _conn()
    conn.execute(
        """
        INSERT INTO contexto_sessao (sessao, contexto_json, atualizado_em)
        VALUES (?, ?, ?)
        ON CONFLICT(sessao) DO UPDATE SET
            contexto_json = excluded.contexto_json,
            atualizado_em = excluded.atualizado_em
        """,
        (sessao, payload, time.time()),
    )
    conn.commit()
    conn.close()


def salvar_contexto_rp(sessao: str, intencao: str, params: dict):
    """Ultimo filtro/consulta RP da sessao (para 'faz o mesmo' apos reinicio)."""
    ctx = _ler_contexto_sessao(sessao)
    ctx["rp"] = {"intencao": intencao, "params": params}
    _gravar_contexto_sessao(sessao, ctx)


def carregar_contexto_rp(sessao: str) -> dict | None:
    ctx = _ler_contexto_sessao(sessao)
    if not ctx:
        return None
    if "rp" in ctx:
        return ctx["rp"]
    if "intencao" in ctx:
        return ctx
    return None


def salvar_ultimo_resultado(sessao: str, tipo: str, dados: dict):
    """Guarda resultado bruto da ultima consulta para follow-up conversacional."""
    ctx = _ler_contexto_sessao(sessao)
    ctx["ultimo_resultado"] = {
        "tipo": tipo,
        "dados": dados,
        "atualizado_em": time.time(),
    }
    _gravar_contexto_sessao(sessao, ctx)


def carregar_ultimo_resultado(sessao: str) -> dict | None:
    ctx = _ler_contexto_sessao(sessao)
    ur = ctx.get("ultimo_resultado")
    if not ur or not isinstance(ur, dict):
        return None
    return {
        "tipo": ur.get("tipo"),
        "dados": ur.get("dados") or {},
        "atualizado_em": ur.get("atualizado_em"),
    }


def limpar_conversa(sessao: str):
    conn = _conn()
    conn.execute("DELETE FROM conversas WHERE sessao = ?", (sessao,))
    conn.execute("DELETE FROM contexto_sessao WHERE sessao = ?", (sessao,))
    conn.commit()
    conn.close()


def registrar_log(
    sessao: str,
    intencao: str,
    executar: bool,
    ferramenta: str,
    status: str,
    motivo: str = "",
):
    conn = _conn()
    conn.execute(
        """
        INSERT INTO logs_seguranca
        (sessao, intencao, executar, ferramenta, status, motivo, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (sessao, intencao, int(executar), ferramenta, status, motivo, time.time()),
    )
    conn.commit()
    conn.close()


def listar_logs(sessao: str | None = None, limite: int = 50) -> list[dict]:
    conn = _conn()
    if sessao:
        rows = conn.execute(
            """
            SELECT intencao, executar, ferramenta, status, motivo, criado_em
            FROM logs_seguranca WHERE sessao = ?
            ORDER BY id DESC LIMIT ?
            """,
            (sessao, limite),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT intencao, executar, ferramenta, status, motivo, criado_em
            FROM logs_seguranca ORDER BY id DESC LIMIT ?
            """,
            (limite,),
        ).fetchall()
    conn.close()
    return [
        {
            "intencao": r[0],
            "executar": bool(r[1]),
            "ferramenta": r[2],
            "status": r[3],
            "motivo": r[4],
            "criado_em": r[5],
        }
        for r in rows
    ]
