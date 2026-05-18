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
    "path_onedrive_trabalho",
    "path_sistema_pedidos",
    "path_sistema_pedidos_db",
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
