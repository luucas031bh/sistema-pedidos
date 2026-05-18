"""
Painel de controle Adonay — liga/desliga servicos e abre o chat.
Execute: python painel_controle.py
Ou duplo clique: ABRIR_PAINEL.bat / AdonayPainel.exe
"""

from __future__ import annotations

import os
import sys
import threading
import time

try:
    import tkinter as tk
    from tkinter import font as tkfont
    from tkinter import messagebox
except ImportError:
    print("Tkinter nao disponivel.")
    sys.exit(1)

import servicos_launcher as svc

ROOT = svc.ROOT
URL_CHAT = svc.URL_CHAT


class PainelAdonay(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Adonay — Painel de controle")
        self.geometry("440x520")
        self.resizable(False, False)
        self.configure(bg="#1a1a1a")

        self._status = {
            "ollama": False,
            "servidor": False,
            "claude": False,
            "openclaw": False,
            "whatsapp": False,
        }

        titulo = tkfont.Font(family="Segoe UI", size=14, weight="bold")
        normal = tkfont.Font(family="Segoe UI", size=10)

        tk.Label(
            self,
            text="Controle dos servidores",
            fg="#ececec",
            bg="#1a1a1a",
            font=titulo,
        ).pack(pady=(16, 8))

        self.frame_servicos = tk.Frame(self, bg="#1a1a1a")
        self.frame_servicos.pack(fill="x", padx=20)

        self.rows = {}
        for key, label in (
            ("ollama", "Ollama (motor IA)"),
            ("servidor", "Servidor web (chat)"),
            ("claude", "Claude Code (terminal)"),
            ("openclaw", "OpenClaw / CLAW (terminal)"),
            ("whatsapp", "Bot WhatsApp"),
        ):
            self.rows[key] = self._criar_linha(label, key)

        tk.Frame(self, height=12, bg="#1a1a1a").pack()

        btn_frame = tk.Frame(self, bg="#1a1a1a")
        btn_frame.pack(fill="x", padx=20)

        tk.Button(
            btn_frame,
            text="Ligar tudo (servidores + IAs)",
            command=self._ligar_tudo,
            bg="#10a37f",
            fg="white",
            activebackground="#1a7f64",
            font=normal,
            relief="flat",
            padx=12,
            pady=8,
        ).pack(fill="x", pady=4)

        tk.Button(
            btn_frame,
            text="Abrir chat (navegador)",
            command=svc.abrir_chat,
            bg="#2f2f2f",
            fg="#ececec",
            font=normal,
            relief="flat",
            padx=12,
            pady=8,
        ).pack(fill="x", pady=4)

        tk.Label(
            self,
            text="Verde = ligado · Vermelho = desligado",
            fg="#888",
            bg="#1a1a1a",
            font=normal,
        ).pack(pady=(12, 4))

        self.after(500, self._atualizar_loop)

    def _criar_linha(self, texto: str, key: str) -> dict:
        row = tk.Frame(self.frame_servicos, bg="#1a1a1a")
        row.pack(fill="x", pady=6)

        led = tk.Canvas(row, width=14, height=14, bg="#1a1a1a", highlightthickness=0)
        led.pack(side="left", padx=(0, 10))
        oval = led.create_oval(2, 2, 12, 12, fill="#c0392b", outline="")

        tk.Label(row, text=texto, fg="#ececec", bg="#1a1a1a", anchor="w").pack(
            side="left", fill="x", expand=True
        )

        def ligar():
            threading.Thread(target=self._ligar_servico, args=(key,), daemon=True).start()

        tk.Button(
            row,
            text="Ligar",
            command=ligar,
            bg="#333",
            fg="#fff",
            relief="flat",
            padx=10,
        ).pack(side="right")

        return {"led": led, "oval": oval, "key": key}

    def _set_led(self, key: str, on: bool) -> None:
        cor = "#27ae60" if on else "#c0392b"
        self.rows[key]["led"].itemconfig(self.rows[key]["oval"], fill=cor)

    def _ligar_servico(self, key: str) -> None:
        try:
            if key == "ollama":
                svc.iniciar_ollama()
            elif key == "servidor":
                if not svc.ollama_online():
                    svc.iniciar_ollama()
                    svc.aguardar(svc.ollama_online, 45)
                svc.iniciar_servidor()
                svc.aguardar(svc.servidor_online, 60)
            elif key == "claude":
                svc.iniciar_claude()
            elif key == "openclaw":
                svc.iniciar_openclaw()
            elif key == "whatsapp":
                if not svc.servidor_online():
                    self._ligar_servico("servidor")
                    svc.aguardar(svc.servidor_online, 60)
                svc.iniciar_whatsapp()
        except (OSError, FileNotFoundError, ConnectionError) as exc:
            self.after(0, lambda: messagebox.showerror("Erro", str(exc)))

    def _ligar_tudo(self) -> None:
        def sequencia():
            self._ligar_servico("ollama")
            svc.aguardar(svc.ollama_online, 60)
            self._ligar_servico("servidor")
            svc.aguardar(svc.servidor_online, 60)
            self._ligar_servico("claude")
            time.sleep(2)
            self._ligar_servico("openclaw")
            time.sleep(2)
            self._ligar_servico("whatsapp")
            if svc.servidor_online():
                import webbrowser

                webbrowser.open(URL_CHAT)

        threading.Thread(target=sequencia, daemon=True).start()

    def _atualizar_status(self) -> None:
        self._status["ollama"] = svc.ollama_online()
        self._status["servidor"] = svc.servidor_online()
        self._status["claude"] = svc.claude_rodando()
        self._status["openclaw"] = svc.openclaw_rodando()
        self._status["whatsapp"] = svc.whatsapp_rodando()
        for k, on in self._status.items():
            self._set_led(k, on)

    def _atualizar_loop(self) -> None:
        self._atualizar_status()
        self.after(2000, self._atualizar_loop)


def main():
    os.chdir(ROOT)
    if not svc.caminho_server().is_file():
        messagebox.showerror(
            "Pasta incorreta",
            f"server.py nao esta em:\n{ROOT}\n\n"
            "Coloque AdonayPainel.exe na pasta IACriada (junto com server.py).",
        )
        sys.exit(1)
    app = PainelAdonay()
    app.mainloop()


if __name__ == "__main__":
    main()
