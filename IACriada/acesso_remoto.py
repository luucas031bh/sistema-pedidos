"""Autenticacao e CORS para acesso remoto (GitHub Pages + tunel HTTPS)."""

from __future__ import annotations

from urllib.parse import urlparse

CORS_GITHUB = "https://luucas031bh.github.io"

ROTAS_PUBLICAS = frozenset(
    {
        "/api/ping",
        "/api/public-client",
    }
)


def cfg_acesso_remoto() -> dict:
    from config import carregar_config

    base = {
        "ativo": False,
        "api_publica_url": "",
        "api_token": "",
        "exigir_token_remoto": True,
        "cors_origins": [CORS_GITHUB],
        "tunnel_comando": "",
    }
    cfg = carregar_config()
    extra = cfg.get("acesso_remoto") or {}
    out = {**base, **extra}
    if not out.get("cors_origins"):
        out["cors_origins"] = [CORS_GITHUB]
    return out


def origens_cors_permitidas() -> frozenset:
    cfg = cfg_acesso_remoto()
    origins = set(cfg.get("cors_origins") or [])
    origins.add(CORS_GITHUB)
    url = (cfg.get("api_publica_url") or "").strip().rstrip("/")
    if url:
        p = urlparse(url)
        if p.scheme and p.netloc:
            origins.add(f"{p.scheme}://{p.netloc}")
    return frozenset(origins)


def eh_acesso_local(handler) -> bool:
    """Browser aberto direto no PC host (127.0.0.1:8765)."""
    origin = (handler.headers.get("Origin") or "").strip()
    referer = (handler.headers.get("Referer") or "").strip()
    if origin.startswith(("http://127.0.0.1", "http://localhost")):
        return True
    if referer.startswith(("http://127.0.0.1", "http://localhost")):
        return True
    host = (handler.headers.get("Host") or "").split(":")[0].lower()
    if host in ("127.0.0.1", "localhost", "::1") and not origin:
        return True
    return False


def token_recebido(handler) -> str:
    auth = (handler.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (handler.headers.get("X-Adonay-Token") or "").strip()


def rota_exige_auth(path: str) -> bool:
    if not path.startswith("/api/"):
        return False
    return path not in ROTAS_PUBLICAS


def verificar_auth(handler, path: str) -> tuple[bool, str]:
    """Retorna (ok, mensagem_erro)."""
    if not rota_exige_auth(path):
        return True, ""
    cfg = cfg_acesso_remoto()
    if not cfg.get("ativo"):
        return True, ""
    if eh_acesso_local(handler):
        return True, ""
    if not cfg.get("exigir_token_remoto", True):
        return True, ""
    esperado = (cfg.get("api_token") or "").strip()
    if not esperado:
        return False, "Token remoto nao configurado no servidor (config.json acesso_remoto.api_token)."
    recebido = token_recebido(handler)
    if recebido and recebido == esperado:
        return True, ""
    return False, "Token invalido ou ausente. Configure em Servidor remoto / Token ADNY."


def public_client_info() -> dict:
    cfg = cfg_acesso_remoto()
    url = (cfg.get("api_publica_url") or "").strip().rstrip("/")
    return {
        "ok": True,
        "ativo": bool(cfg.get("ativo")),
        "api_url": url,
        "requer_token": bool(cfg.get("exigir_token_remoto", True) and cfg.get("ativo")),
        "github_ui": "https://luucas031bh.github.io/sistema-pedidos/IACriada/static/index.html",
    }
