"""Inicializacao de Ollama, servidor web, WhatsApp, Claude e OpenClaw."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PORTA_WEB = 8765
URL_CHAT = f"http://127.0.0.1:{PORTA_WEB}"
OLLAMA_URL = "http://127.0.0.1:11434/api/tags"


def app_root() -> Path:
    env = os.environ.get("ADONAY_ROOT")
    if env:
        return Path(env).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ROOT = app_root()


def npm_cmd() -> str:
    """npm via .cmd no Windows (evita bloqueio do npm.ps1 no PowerShell)."""
    if sys.platform == "win32":
        for candidato in (
            Path(os.environ.get("ProgramFiles", "")) / "nodejs" / "npm.cmd",
            shutil.which("npm.cmd"),
            shutil.which("npm"),
        ):
            if candidato and Path(str(candidato)).is_file():
                return str(candidato)
    return shutil.which("npm") or "npm"


def _python_argv() -> list[str]:
    if not getattr(sys, "frozen", False):
        return [sys.executable]
    for nome in ("python", "python3"):
        encontrado = shutil.which(nome)
        if encontrado:
            return [encontrado]
    py_launcher = shutil.which("py")
    if py_launcher:
        return [py_launcher, "-3"]
    return ["python"]


def _abrir_em_nova_janela(
    argv: list[str], cwd: Path, env_extra: dict | None = None
) -> None:
    flags = subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
    env = os.environ.copy()
    env["ADONAY_NO_BROWSER"] = "1"
    if env_extra:
        env.update(env_extra)
    subprocess.Popen(argv, cwd=str(cwd), creationflags=flags, env=env)


def _carregar_config() -> dict:
    cfg_path = ROOT / "config.json"
    if not cfg_path.is_file():
        return {}
    try:
        return json.loads(cfg_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _env_claude() -> dict:
    oll = _carregar_config().get("ollama") or {}
    return {
        "ANTHROPIC_AUTH_TOKEN": oll.get("anthropic_auth_token", "ollama"),
        "ANTHROPIC_BASE_URL": oll.get("anthropic_base_url", "http://localhost:11434"),
        "ANTHROPIC_API_KEY": "",
    }


def _processo_na_cmdline(*termos: str) -> bool:
    try:
        out = subprocess.run(
            ["wmic", "process", "get", "CommandLine"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        low = (out.stdout or "").lower()
        return any(t.lower() in low for t in termos)
    except (OSError, subprocess.TimeoutExpired):
        return False


def claude_rodando() -> bool:
    return _processo_na_cmdline("claude.exe", " claude ", "\\claude\"")


def openclaw_rodando() -> bool:
    return _processo_na_cmdline("openclaw", "openclaw.cmd")


def aguardar(condicao, segundos: int = 45, intervalo: float = 1.0) -> bool:
    for _ in range(max(1, int(segundos / intervalo))):
        if condicao():
            return True
        time.sleep(intervalo)
    return False


def liberar_porta(porta: int) -> None:
    if sys.platform != "win32":
        return
    try:
        out = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for linha in (out.stdout or "").splitlines():
            if f":{porta} " not in linha or "LISTENING" not in linha:
                continue
            partes = linha.split()
            if partes and partes[-1].isdigit():
                subprocess.run(
                    ["taskkill", "/PID", partes[-1], "/F"],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
    except (OSError, subprocess.TimeoutExpired):
        pass


def caminho_server() -> Path:
    return ROOT / "server.py"


def _http_ok(url: str, timeout: float = 2.0) -> bool:
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def ollama_online() -> bool:
    return _http_ok(OLLAMA_URL)


def servidor_online() -> bool:
    return _http_ok(f"{URL_CHAT}/api/ping")


def whatsapp_rodando() -> bool:
    try:
        out = subprocess.run(
            ["wmic", "process", "where", "name='node.exe'", "get", "CommandLine"],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        low = (out.stdout or "").lower()
        return "whatsapp-bot" in low or "bot.js" in low
    except (OSError, subprocess.TimeoutExpired):
        return False


def iniciar_ollama() -> None:
    if ollama_online():
        return
    app = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Ollama/ollama app.exe"
    if app.is_file():
        subprocess.Popen([str(app)], cwd=str(app.parent), shell=False)
    else:
        subprocess.Popen(
            ["ollama", "serve"],
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )


def iniciar_servidor() -> None:
    if servidor_online():
        return
    server_py = caminho_server()
    if not server_py.is_file():
        raise FileNotFoundError(
            f"server.py nao encontrado em:\n{ROOT}\n\n"
            "Mantenha AdonayPainel.exe na pasta IACriada."
        )
    liberar_porta(PORTA_WEB)
    time.sleep(1)
    _abrir_em_nova_janela(_python_argv() + [str(server_py)], ROOT)


def iniciar_claude() -> None:
    if claude_rodando():
        return
    if not ollama_online():
        iniciar_ollama()
        if not aguardar(ollama_online, 60):
            raise ConnectionError("Ollama nao respondeu. Necessario para Claude.")
    claude = shutil.which("claude")
    if claude:
        _abrir_em_nova_janela([claude], ROOT, _env_claude())
        return
    ollama = shutil.which("ollama")
    if ollama:
        _abrir_em_nova_janela([ollama, "launch", "claude"], ROOT, _env_claude())
        return
    raise FileNotFoundError(
        "Claude Code nao encontrado.\n"
        "Execute: INSTALAR_CLAUDE_E_CLAW.bat\n"
        "Ou no CMD: npm.cmd install -g @anthropic-ai/claude-code"
    )


def iniciar_openclaw() -> None:
    if openclaw_rodando():
        return
    if not ollama_online():
        iniciar_ollama()
        if not aguardar(ollama_online, 60):
            raise ConnectionError("Ollama nao respondeu. Necessario para OpenClaw.")
    openclaw = shutil.which("openclaw")
    if openclaw:
        _abrir_em_nova_janela([openclaw], ROOT)
        return
    ollama = shutil.which("ollama")
    if ollama:
        _abrir_em_nova_janela([ollama, "launch", "openclaw"], ROOT)
        return
    raise FileNotFoundError(
        "OpenClaw nao encontrado.\n"
        "Execute: INSTALAR_CLAUDE_E_CLAW.bat\n"
        "Ou no CMD: npm.cmd install -g openclaw@latest"
    )


def iniciar_whatsapp() -> None:
    from config import cfg_observador, cfg_whatsapp_modo

    bot = ROOT / "whatsapp-bot"
    if not (bot / "node_modules").is_dir():
        subprocess.run(
            [npm_cmd(), "install"],
            cwd=str(bot),
            shell=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    if not (bot / ".env").is_file() and (bot / ".env.example").is_file():
        shutil.copy(bot / ".env.example", bot / ".env")
    node = shutil.which("node")
    if not node:
        raise FileNotFoundError("Node.js nao encontrado. Instale Node.js LTS.")
    bot_js = bot / "bot.js"
    if not bot_js.is_file():
        raise FileNotFoundError(f"bot.js nao encontrado em {bot}")
    obs = cfg_observador()
    tick_ms = int(obs.get("tick_rp_seg", 60)) * 1000
    env_extra = {
        "WHATSAPP_MODO": cfg_whatsapp_modo(),
        "OBSERVADOR_API_BASE": URL_CHAT,
        "OBSERVADOR_TICK_MS": str(tick_ms),
        "OBSERVADOR_TOKEN": str(obs.get("token") or "adonay-bot-local"),
    }
    _abrir_em_nova_janela([node, str(bot_js)], bot, env_extra)


def abrir_chat() -> None:
    if not servidor_online():
        iniciar_ollama()
        aguardar(ollama_online, 30)
        iniciar_servidor()
        aguardar(servidor_online, 45)
    import webbrowser

    webbrowser.open(URL_CHAT)
