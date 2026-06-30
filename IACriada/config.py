"""Carrega config.json do projeto."""

import json
from pathlib import Path

PASTA = Path(__file__).parent
CONFIG_PATH = PASTA / "config.json"
__all__ = [
    "PASTA",
    "carregar_config",
    "path_index_db",
    "path_historico_db",
    "path_contexto_pasta",
    "path_pedidos_json",
    "path_historico_interacoes",
    "path_clientes_memoria",
    "path_onedrive_trabalho",
    "path_sistema_pedidos",
    "path_sistema_pedidos_db",
    "cfg_observador",
    "cfg_whatsapp_modo",
    "cfg_observador_token",
    "cfg_acesso_remoto",
]

_DEFAULT = {
    "onedrive_trabalho": str(
        Path.home() / "OneDrive - Adonay Confecções" / "TRABALHO"
    ),
    "sqlite_index": "data/adonay_index.db",
    "contexto_pasta": r"D:\TOD CONTEXTO DA I.A. LOCAL",
    "sqlite_historico": "historico.db",
    "sqlite_sistema_pedidos": "data/sistema_pedidos_index.db",
    "sistema_pedidos_path": str(
        Path.home() / "Documents" / "GitHub" / "sistema-pedidos"
    ),
    "rp_url_home": "https://luucas031bh.github.io/sistema-pedidos/home.html",
    "rp_url_base": "https://luucas031bh.github.io/sistema-pedidos/",
    "whatsapp": {
        "admins": [],
        "modo": "observador",
    },
    "observador": {
        "tick_rp_seg": 60,
        "classificar_llm": True,
        "usar_orquestrador_hub": True,
        "token": "adonay-bot-local",
    },
    "rp": {
        "base_url": "https://luucas031bh.github.io/sistema-pedidos/",
        "url_home": "https://luucas031bh.github.io/sistema-pedidos/home.html",
        "rotas": {
            "sistema": "index.html",
            "fila": "home.html",
            "pedido": "home.html",
            "pedido_id": "index.html?id={codigo}",
        },
    },
    "ollama": {
        "modelo_padrao": "qwen2.5:7b",
        "modelo_integracoes": "qwen2.5:7b",
        "anthropic_base_url": "http://localhost:11434",
        "anthropic_auth_token": "ollama",
    },
    "calculadora_malha": {
        "url": "https://luucas031bh.github.io/sistema-pedidos/CalculadoraMalha/",
        "usar_browser": True,
        "headless": True,
    },
    "acesso_remoto": {
        "ativo": False,
        "api_publica_url": "",
        "api_token": "",
        "exigir_token_remoto": True,
        "cors_origins": ["https://luucas031bh.github.io"],
        "tunnel_comando": "cloudflared tunnel --url http://127.0.0.1:8765",
    },
}


def carregar_config() -> dict:
    if CONFIG_PATH.is_file():
        with open(CONFIG_PATH, encoding="utf-8") as f:
            dados = json.load(f)
        cfg = {**_DEFAULT, **dados}
        if "rp" in dados:
            cfg["rp"] = {**_DEFAULT["rp"], **dados["rp"]}
            if "rotas" in dados.get("rp", {}):
                cfg["rp"]["rotas"] = {**_DEFAULT["rp"]["rotas"], **dados["rp"]["rotas"]}
        if dados.get("rp_url_home"):
            cfg["rp_url_home"] = dados["rp_url_home"]
            cfg["rp"]["url_home"] = dados["rp_url_home"]
        if dados.get("rp_url_base"):
            cfg["rp_url_base"] = dados["rp_url_base"]
            cfg["rp"]["base_url"] = dados["rp_url_base"].rstrip("/") + "/"
        if "ollama" in dados:
            cfg["ollama"] = {**_DEFAULT.get("ollama", {}), **dados["ollama"]}
        if "whatsapp" in dados:
            cfg["whatsapp"] = {**_DEFAULT.get("whatsapp", {}), **dados["whatsapp"]}
        if "observador" in dados:
            cfg["observador"] = {**_DEFAULT.get("observador", {}), **dados["observador"]}
        if "acesso_remoto" in dados:
            cfg["acesso_remoto"] = {**_DEFAULT.get("acesso_remoto", {}), **dados["acesso_remoto"]}
        if "calculadora_malha" in dados:
            cfg["calculadora_malha"] = {**_DEFAULT.get("calculadora_malha", {}), **dados["calculadora_malha"]}
        return cfg
    return dict(_DEFAULT)


def path_index_db() -> Path:
    cfg = carregar_config()
    p = PASTA / cfg["sqlite_index"]
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def path_contexto_pasta() -> Path:
    """Pasta onde ficam historico de chat e contexto da IA local."""
    cfg = carregar_config()
    pasta = cfg.get("contexto_pasta") or str(PASTA / "data")
    p = Path(pasta)
    p.mkdir(parents=True, exist_ok=True)
    return p


def path_historico_db() -> Path:
    cfg = carregar_config()
    nome = cfg.get("sqlite_historico", "historico.db")
    candidato = Path(nome)
    if candidato.is_absolute():
        p = candidato
    elif cfg.get("contexto_pasta"):
        p = path_contexto_pasta() / candidato.name
    else:
        p = PASTA / nome
    p.parent.mkdir(parents=True, exist_ok=True)
    _migrar_historico_antigo_se_necessario(p)
    return p


def _migrar_historico_antigo_se_necessario(destino: Path):
    """Copia data/historico.db do projeto se o novo caminho ainda nao existir."""
    if destino.is_file():
        return
    legado = PASTA / "data" / "historico.db"
    if legado.is_file():
        import shutil

        shutil.copy2(legado, destino)


def path_onedrive_trabalho() -> Path:
    return Path(carregar_config()["onedrive_trabalho"])


def path_sistema_pedidos() -> Path:
    return Path(carregar_config()["sistema_pedidos_path"])


def path_sistema_pedidos_db() -> Path:
    cfg = carregar_config()
    p = PASTA / cfg["sqlite_sistema_pedidos"]
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def path_pedidos_json() -> Path:
    return path_contexto_pasta() / "pedidos.json"


def path_historico_interacoes() -> Path:
    return path_contexto_pasta() / "historico_interacoes.jsonl"


def path_clientes_memoria() -> Path:
    p = path_contexto_pasta() / "clientes"
    p.mkdir(parents=True, exist_ok=True)
    return p


def cfg_observador() -> dict:
    cfg = carregar_config()
    base = _DEFAULT.get("observador", {})
    extra = cfg.get("observador") or {}
    return {**base, **extra}


def cfg_whatsapp_modo() -> str:
    cfg = carregar_config()
    modo = (cfg.get("whatsapp") or {}).get("modo", "observador")
    if modo not in ("observador", "legacy", "both"):
        return "observador"
    return modo


def cfg_observador_token() -> str:
    return str(cfg_observador().get("token") or "adonay-bot-local")


def cfg_acesso_remoto() -> dict:
    from acesso_remoto import cfg_acesso_remoto as _cfg

    return _cfg()
