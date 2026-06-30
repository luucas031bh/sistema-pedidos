"""Reinicia Ollama, servidor web ADNY e bot WhatsApp."""
from __future__ import annotations

import subprocess
import sys
import time

import servicos_launcher as s


def _parar_whatsapp() -> None:
    if sys.platform != "win32":
        return
    try:
        out = subprocess.run(
            ["wmic", "process", "where", "name='node.exe'", "get", "ProcessId,CommandLine"],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for linha in (out.stdout or "").splitlines():
            low = linha.lower()
            if "whatsapp-bot" not in low and "bot.js" not in low:
                continue
            partes = linha.strip().split()
            if partes and partes[-1].isdigit():
                subprocess.run(
                    ["taskkill", "/PID", partes[-1], "/F"],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"aviso whatsapp: {exc}")


def main() -> int:
    print("Parando servidor web (porta 8765)...")
    s.liberar_porta(s.PORTA_WEB)
    time.sleep(1)

    print("Parando bot WhatsApp...")
    _parar_whatsapp()
    time.sleep(1)

    print("Iniciando Ollama...")
    s.iniciar_ollama()
    if not s.aguardar(s.ollama_online, 60):
        print("AVISO: Ollama nao respondeu em 60s.")
    else:
        print("Ollama: online")

    print("Iniciando servidor web...")
    s.iniciar_servidor()
    if not s.aguardar(s.servidor_online, 45):
        print("ERRO: servidor nao subiu em 45s.")
        return 1
    print(f"Servidor: online — {s.URL_CHAT}")

    print("Iniciando WhatsApp bot...")
    s.iniciar_whatsapp()
    time.sleep(3)
    print(f"WhatsApp bot: {'rodando' if s.whatsapp_rodando() else 'iniciando (aguarde QR/conexao)'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
