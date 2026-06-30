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
CREATE TABLE IF NOT EXISTS memoria_verificada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_id TEXT UNIQUE NOT NULL,
    pergunta TEXT NOT NULL,
    resposta_esperada TEXT NOT NULL,
    resposta_obtida TEXT,
    fonte TEXT,
    criado_em REAL NOT NULL,
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


def salvar_pedido_ativo(sessao: str, pedido: dict, termo: str = "") -> None:
    """Guarda ultimo pedido consultado para follow-up (tamanhos, malha)."""
    from consultar_rp import id_busca_pedido, nome_cliente

    ctx = _ler_contexto_sessao(sessao)
    ctx["pedido_ativo"] = {
        "termo": termo,
        "id": pedido.get("id"),
        "id_busca": id_busca_pedido(pedido),
        "cliente": nome_cliente(pedido),
        "pedido": pedido,
        "atualizado_em": time.time(),
    }
    _gravar_contexto_sessao(sessao, ctx)


def carregar_pedido_ativo(sessao: str) -> dict | None:
    ctx = _ler_contexto_sessao(sessao)
    pa = ctx.get("pedido_ativo")
    if not pa or not isinstance(pa, dict):
        return None
    if pa.get("atualizado_em") and (time.time() - float(pa["atualizado_em"])) > 86400 * 7:
        return None
    return pa


def salvar_wizard_malha(sessao: str, estado: dict) -> None:
    ctx = _ler_contexto_sessao(sessao)
    ctx["wizard_malha"] = {**estado, "atualizado_em": time.time()}
    _gravar_contexto_sessao(sessao, ctx)


def carregar_wizard_malha(sessao: str) -> dict | None:
    ctx = _ler_contexto_sessao(sessao)
    w = ctx.get("wizard_malha")
    if not w or not isinstance(w, dict):
        return None
    if w.get("atualizado_em") and (time.time() - float(w["atualizado_em"])) > 86400:
        return None
    return w


def limpar_wizard_malha(sessao: str) -> None:
    ctx = _ler_contexto_sessao(sessao)
    ctx.pop("wizard_malha", None)
    _gravar_contexto_sessao(sessao, ctx)


def salvar_memoria_verificada(
    benchmark_id: str,
    pergunta: str,
    resposta_esperada: str,
    resposta_obtida: str = "",
    fonte: str = "",
):
    agora = time.time()
    conn = _conn()
    conn.execute(
        """
        INSERT INTO memoria_verificada
        (benchmark_id, pergunta, resposta_esperada, resposta_obtida, fonte, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(benchmark_id) DO UPDATE SET
            pergunta = excluded.pergunta,
            resposta_esperada = excluded.resposta_esperada,
            resposta_obtida = excluded.resposta_obtida,
            fonte = excluded.fonte,
            atualizado_em = excluded.atualizado_em
        """,
        (benchmark_id, pergunta, resposta_esperada, resposta_obtida, fonte, agora, agora),
    )
    conn.commit()
    conn.close()


def listar_memoria_verificada(limite: int = 200) -> list[dict]:
    conn = _conn()
    rows = conn.execute(
        """
        SELECT benchmark_id, pergunta, resposta_esperada, resposta_obtida, fonte, atualizado_em
        FROM memoria_verificada
        ORDER BY atualizado_em DESC
        LIMIT ?
        """,
        (limite,),
    ).fetchall()
    conn.close()
    return [
        {
            "benchmark_id": r[0],
            "pergunta": r[1],
            "resposta_esperada": r[2],
            "resposta_obtida": r[3],
            "fonte": r[4],
            "atualizado_em": r[5],
        }
        for r in rows
    ]


def _similaridade_perguntas(a: str, b: str) -> float:
    import unicodedata

    def norm(t: str) -> set[str]:
        x = (t or "").strip().lower()
        x = unicodedata.normalize("NFD", x)
        x = "".join(c for c in x if unicodedata.category(c) != "Mn")
        return set(x.split())

    ta, tb = norm(a), norm(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def buscar_memoria_similar(pergunta: str, limiar: float = 0.72) -> dict | None:
    melhor = None
    melhor_score = 0.0
    for item in listar_memoria_verificada(200):
        p = item.get("pergunta") or ""
        score = _similaridade_perguntas(pergunta, p)
        if score >= limiar and score > melhor_score:
            melhor_score = score
            melhor = {**item, "similaridade": round(score, 3)}
    return melhor


def buscar_memoria_por_benchmark(benchmark_id: str) -> dict | None:
    conn = _conn()
    row = conn.execute(
        """
        SELECT benchmark_id, pergunta, resposta_esperada, resposta_obtida, fonte
        FROM memoria_verificada WHERE benchmark_id = ?
        """,
        (benchmark_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "benchmark_id": row[0],
        "pergunta": row[1],
        "resposta_esperada": row[2],
        "resposta_obtida": row[3],
        "fonte": row[4],
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
