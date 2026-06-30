"""Configura acesso remoto: token + URL publica + adny-public.json."""

from __future__ import annotations

import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
PUBLIC_PATH = ROOT / "static" / "adny-public.json"


def _carregar() -> dict:
    if CONFIG_PATH.is_file():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def _salvar(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _salvar_public(api_url: str) -> None:
    dados = {
        "api_url": api_url.rstrip("/"),
        "requer_token": True,
        "github_ui": "https://luucas031bh.github.io/sistema-pedidos/IACriada/static/index.html",
    }
    PUBLIC_PATH.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    print("=" * 60)
    print("  ADNY — Configurar acesso remoto (GitHub + tunel HTTPS)")
    print("=" * 60)
    print()
    print("Passo 1: Ligue o servidor (INICIAR_TUDO.bat)")
    print("Passo 2: Em OUTRA janela, rode INICIAR_TUNEL.bat e copie a URL https://...")
    print()

    cfg = _carregar()
    remoto = dict(cfg.get("acesso_remoto") or {})
    token_atual = (remoto.get("api_token") or "").strip()

    if token_atual:
        print(f"Token atual: {token_atual[:8]}… (mantido)")
        token = token_atual
    else:
        token = secrets.token_urlsafe(24)
        print(f"Novo token gerado: {token}")

    url = input("\nCole a URL HTTPS do tunel (ex.: https://xxx.trycloudflare.com): ").strip()
    if not url.startswith("https://"):
        print("URL invalida — deve comecar com https://")
        return 1

    remoto.update(
        {
            "ativo": True,
            "api_publica_url": url.rstrip("/"),
            "api_token": token,
            "exigir_token_remoto": True,
            "cors_origins": ["https://luucas031bh.github.io"],
        }
    )
    cfg["acesso_remoto"] = remoto
    _salvar(cfg)
    _salvar_public(url)

    print()
    print("Salvo em config.json e static/adny-public.json")
    print()
    print("PROXIMOS PASSOS:")
    print("  1. Commit + push static/adny-public.json no GitHub (repo sistema-pedidos)")
    print("  2. Mantenha INICIAR_TUNEL.bat rodando junto com o servidor")
    print("  3. Em cada celular/PC: abra o link GitHub e cole o TOKEN uma vez:")
    print(f"     {token}")
    print()
    print("Link UI:", remoto.get("cors_origins", [""])[0], ".../IACriada/static/index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
