"""Roteamento de chat para varios backends (Adonay, Ollama, Claude Code, OpenClaw)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from config import carregar_config

PASTA = Path(__file__).parent


def _caminho_executavel(nome: str) -> str:
    """Resolve claude/openclaw no Windows (npm .cmd nao roda só com o nome no subprocess)."""
    appdata = Path(os.environ.get("APPDATA", ""))
    candidatos = [
        shutil.which(nome),
        appdata / "npm" / f"{nome}.cmd",
        appdata / "npm" / f"{nome}.CMD",
        appdata / "npm" / f"{nome}",
    ]
    for c in candidatos:
        if not c:
            continue
        p = Path(str(c))
        if p.is_file():
            return str(p.resolve())
    raise FileNotFoundError(
        f"{nome} nao encontrado. Instale com npm.cmd install -g "
        + (
            "@anthropic-ai/claude-code"
            if nome == "claude"
            else "openclaw@latest"
        )
    )


def _env_com_path_npm(env: dict | None = None) -> dict:
    out = (env or os.environ).copy()
    npm = Path(os.environ.get("APPDATA", "")) / "npm"
    if npm.is_dir():
        extra = str(npm.resolve())
        if extra not in (out.get("PATH") or ""):
            out["PATH"] = extra + os.pathsep + out.get("PATH", "")
    return out


def diagnostico_provedores() -> dict:
    out = {}
    for nome in ("claude", "openclaw"):
        try:
            out[nome] = {"instalado": True, "caminho": _caminho_executavel(nome)}
        except FileNotFoundError:
            out[nome] = {"instalado": False, "caminho": None}
    return out


_PROVEDORES_PADRAO = {
    "adonay": {
        "nome": "Adonay (completo)",
        "descricao": "RP, OneDrive, ferramentas — recomendado",
        "ferramentas": True,
    },
    "ollama": {
        "nome": "Ollama (chat)",
        "descricao": "Conversa simples, sem ferramentas",
        "ferramentas": False,
    },
    "claude": {
        "nome": "Claude Code",
        "descricao": "Agente de codigo via Ollama local",
        "timeout_seg": 180,
    },
    "openclaw": {
        "nome": "OpenClaw",
        "descricao": "Assistente OpenClaw (1 turno)",
        "timeout_seg": 120,
    },
}


def listar_provedores() -> list[dict]:
    cfg = carregar_config()
    raw = cfg.get("provedores") or _PROVEDORES_PADRAO
    out = []
    for pid, info in raw.items():
        if not isinstance(info, dict):
            continue
        base = _PROVEDORES_PADRAO.get(pid, {})
        merged = {**base, **info}
        out.append(
            {
                "id": pid,
                "nome": merged.get("nome", pid),
                "descricao": merged.get("descricao", ""),
                "ferramentas": bool(merged.get("ferramentas")),
            }
        )
    ordem = ["adonay", "ollama", "claude", "openclaw"]
    out.sort(key=lambda x: ordem.index(x["id"]) if x["id"] in ordem else 99)
    return out


def _cfg_provedor(provedor: str) -> dict:
    cfg = carregar_config()
    raw = cfg.get("provedores") or _PROVEDORES_PADRAO
    base = _PROVEDORES_PADRAO.get(provedor, {})
    extra = raw.get(provedor, {}) if isinstance(raw.get(provedor), dict) else {}
    return {**base, **extra}


def _ollama_env_claude() -> dict:
    cfg = carregar_config()
    oll = cfg.get("ollama") or {}
    env = os.environ.copy()
    env["ANTHROPIC_AUTH_TOKEN"] = oll.get("anthropic_auth_token", "ollama")
    env["ANTHROPIC_BASE_URL"] = oll.get("anthropic_base_url", "http://localhost:11434")
    env["ANTHROPIC_API_KEY"] = ""
    return env


def _formatar_prompt_com_historico(mensagem: str, historico: list | None) -> str:
    linhas = []
    for m in (historico or [])[-12:]:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        rotulo = "Usuario" if role == "user" else "Assistente"
        linhas.append(f"{rotulo}: {m.get('content', '')}")
    if linhas:
        bloco = "\n".join(linhas)
        return f"Historico recente:\n{bloco}\n\nMensagem atual:\n{mensagem}"
    return mensagem


def chat_ollama_simples(mensagem: str, modelo: str, historico: list | None = None) -> dict:
    from agente import SISTEMA_SEM_TOOLS, _request_ollama, resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        raise ConnectionError("Modelo Ollama indisponivel")

    msgs = [{"role": "system", "content": SISTEMA_SEM_TOOLS}]
    for m in (historico or [])[-20:]:
        if m.get("role") in ("user", "assistant"):
            msgs.append({"role": m["role"], "content": m.get("content", "")})
    msgs.append({"role": "user", "content": mensagem})

    dados = _request_ollama(
        {"model": nome, "messages": msgs, "stream": False, "options": {"temperature": 0}}
    )
    texto = dados.get("message", {}).get("content", "").strip()
    return {
        "resposta": texto,
        "modelo": nome,
        "passos": [],
        "meta": {"provedor": "ollama", "executar": False},
    }


def chat_claude_code(
    mensagem: str, modelo: str, historico: list | None = None
) -> dict:
    from agente import resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        raise ConnectionError("Modelo Ollama indisponivel")

    cfg = _cfg_provedor("claude")
    timeout = int(cfg.get("timeout_seg", 180))
    prompt = _formatar_prompt_com_historico(mensagem, historico)
    env = _ollama_env_claude()

    claude_exe = _caminho_executavel("claude")
    cmd = [claude_exe, "-p", prompt, "--model", nome]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_env_com_path_npm(env),
            cwd=str(PASTA),
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as exc:
        raise ConnectionError(
            f"Claude Code demorou mais de {timeout}s. Tente mensagem mais curta."
        ) from exc
    except FileNotFoundError as exc:
        raise ConnectionError(str(exc)) from exc

    saida = (proc.stdout or "").strip()
    if not saida and proc.stderr:
        saida = proc.stderr.strip()
    if proc.returncode != 0 and not saida:
        raise ConnectionError(f"Claude Code falhou (codigo {proc.returncode})")

    # Remove avisos comuns no stderr misturados
    saida = re.sub(r"^Warning:.*\n", "", saida, flags=re.I | re.M).strip()
    return {
        "resposta": saida or "(sem resposta do Claude Code)",
        "modelo": nome,
        "passos": [{"provedor": "claude", "returncode": proc.returncode}],
        "meta": {"provedor": "claude", "executar": True},
    }


def _extrair_texto_openclaw_json(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    # Ultima linha JSON valida
    for linha in reversed(raw.splitlines()):
        linha = linha.strip()
        if not linha.startswith("{"):
            continue
        try:
            obj = json.loads(linha)
        except json.JSONDecodeError:
            continue
        for chave in ("text", "reply", "message", "content", "output"):
            if isinstance(obj.get(chave), str) and obj[chave].strip():
                return obj[chave].strip()
        if isinstance(obj.get("result"), dict):
            for chave in ("text", "reply", "message"):
                v = obj["result"].get(chave)
                if isinstance(v, str) and v.strip():
                    return v.strip()
    return raw[-8000:]


def chat_openclaw(
    mensagem: str, modelo: str, sessao: str, historico: list | None = None
) -> dict:
    from agente import resolver_modelo

    nome = resolver_modelo(modelo)
    if not nome:
        raise ConnectionError("Modelo Ollama indisponivel")

    cfg = _cfg_provedor("openclaw")
    timeout = int(cfg.get("timeout_seg", 120))
    session_id = f"adonay_{re.sub(r'[^a-zA-Z0-9_-]', '_', sessao)[:48]}"
    texto = _formatar_prompt_com_historico(mensagem, historico)

    openclaw_exe = _caminho_executavel("openclaw")
    cmd = [
        openclaw_exe,
        "agent",
        "--local",
        "--message",
        texto,
        "--model",
        nome,
        "--json",
        "--session-id",
        session_id,
        "--timeout",
        str(max(timeout, 60)),
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 30,
            env=_env_com_path_npm(),
            cwd=str(PASTA),
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as exc:
        raise ConnectionError(
            f"OpenClaw demorou mais de {timeout}s. "
            "Use CLAUDE ou OLLAMA no chat, ou abra o terminal pelo AdonayPainel."
        ) from exc
    except FileNotFoundError as exc:
        raise ConnectionError(str(exc)) from exc

    bruto = (proc.stdout or "") + "\n" + (proc.stderr or "")
    resposta = _extrair_texto_openclaw_json(proc.stdout or "")
    if not resposta:
        resposta = _extrair_texto_openclaw_json(bruto)
    if not resposta and proc.returncode != 0:
        raise ConnectionError(
            "OpenClaw nao respondeu. Configure com CONFIGURAR_OLLAMA_INTEGRACOES.bat "
            "ou use outro provedor."
        )

    return {
        "resposta": resposta.strip(),
        "modelo": nome,
        "passos": [{"provedor": "openclaw", "session_id": session_id}],
        "meta": {"provedor": "openclaw", "executar": True},
    }


def chat_por_provedor(
    provedor: str,
    mensagem: str,
    modelo: str | None,
    historico: list | None,
    sessao: str,
    *,
    permitir_internet: bool = False,
    ctx: dict | None = None,
) -> dict:
    """Despacha para o backend escolhido."""
    pid = (provedor or "adonay").strip().lower()
    ctx = ctx or {}

    if pid == "ollama":
        return chat_ollama_simples(mensagem, modelo, historico)

    if pid == "claude":
        return chat_claude_code(mensagem, modelo, historico)

    if pid == "openclaw":
        return chat_openclaw(mensagem, modelo, sessao, historico)

    # adonay (padrao) — hub orquestrador (web) ou fluxo legado (whatsapp)
    from config import cfg_observador

    if cfg_observador().get("usar_orquestrador_hub", True) and ctx.get("origem", "web") == "web":
        from orquestrador import rotear_pergunta_chatbox

        return rotear_pergunta_chatbox(
            mensagem,
            historico,
            sessao,
            modelo,
            permitir_internet=permitir_internet,
            ctx=ctx,
        )

    from agente import (
        _tentar_resposta_rp_direta,
        _tentar_resposta_sistema_codigo,
        chat_com_ferramentas,
        resolver_modelo,
    )
    from rp_router import tema_parece_rp

    nome = resolver_modelo(modelo)
    if not nome:
        raise ConnectionError("Modelo Ollama indisponivel")

    forcar_rp = ctx.get("origem") == "whatsapp" and tema_parece_rp(mensagem)
    out = _tentar_resposta_sistema_codigo(mensagem, nome, historico or [])
    if out is None:
        out = _tentar_resposta_rp_direta(
            mensagem,
            nome,
            historico=historico,
            sessao=sessao,
            forcar=forcar_rp,
        )
    if out is None:
        out = chat_com_ferramentas(
            historico or [{"role": "user", "content": mensagem}],
            modelo,
            permitir_internet=permitir_internet,
            sessao=sessao,
            ctx=ctx,
        )
    meta = out.get("meta") or {}
    meta["provedor"] = "adonay"
    out["meta"] = meta
    return out
