"""Gera manifesto estruturado do sistema-pedidos (Code.gs + ADNY + consultar_rp)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from config import PASTA, path_sistema_pedidos

MANIFESTO_PATH = PASTA / "data" / "sistema_manifest.json"

MAPA_PYTHON_GAS = [
    {"funcao": "listar_pedidos_rp", "gas": "listarPedidos", "descricao": "Lista pedidos da planilha RP"},
    {"funcao": "estatisticas_rp", "gas": "getStats", "descricao": "Estatisticas compactas (totais, etapas)"},
    {"funcao": "contar_etapa_producao_rp", "gas": "contarPorEtapaProducao", "descricao": "Contagem por etapa de producao"},
    {"funcao": "entregas_periodo_rp", "gas": "listarPedidosEntregaPeriodo", "descricao": "Pedidos com entrega no periodo"},
    {"funcao": "relatorio_periodo_rp", "gas": "relatorioPedidos", "descricao": "Relatorio financeiro por periodo"},
    {"funcao": "agregar_pecas_abertos_rp", "gas": "agregarPecasAbertos", "descricao": "Pecas em aberto agregadas"},
    {"funcao": "buscar_pedido_rp", "gas": "buscarPedido", "descricao": "Busca pedido por ID ou nome"},
    {"funcao": "buscar_pedidos_rp", "gas": "buscarPedidos", "descricao": "Busca lista de pedidos por termo"},
    {"funcao": "obter_dados_rp", "gas": "obterDados", "descricao": "Snapshot bruto obterDados"},
    {"funcao": "resumo_financeiro_rp", "gas": None, "descricao": "Resumo financeiro local (Python agrega listarPedidos)"},
]


def _extrair_acoes_gas(code_gs: str) -> list[str]:
    acoes: set[str] = set()
    for m in re.finditer(r"acao\s*===\s*['\"]([^'\"]+)['\"]", code_gs):
        acoes.add(m.group(1))
    for m in re.finditer(r"['\"]([a-zA-Z][a-zA-Z0-9]+)['\"]\s*:\s*function", code_gs):
        pass
    return sorted(acoes)


def _carregar_etapas() -> list[str]:
    try:
        from consultar_rp import ETAPAS_PRODUCAO

        return list(ETAPAS_PRODUCAO)
    except ImportError:
        return []


def _carregar_rotas_adny() -> dict:
    rules_path = PASTA / "routing_rules.json"
    if not rules_path.is_file():
        return {}
    try:
        return json.loads(rules_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def gerar_manifesto_sistema(*, salvar: bool = True) -> dict:
    raiz = path_sistema_pedidos()
    code_path = raiz / "Code.gs"
    gas_actions: list[str] = []
    if code_path.is_file():
        try:
            gas_actions = _extrair_acoes_gas(code_path.read_text(encoding="utf-8"))
        except OSError:
            pass

    rotas = _carregar_rotas_adny()
    routing = rotas.get("routing_rules") or {}
    rotas_validas = rotas.get("rotas_validas") or []

    paginas = []
    for nome in ("home.html", "index.html", "relatorio.html", "editar-pedido.html"):
        p = raiz / nome
        if p.is_file():
            paginas.append(nome)

    manifesto = {
        "gerado_em": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "repositorio": str(raiz),
        "github": "https://github.com/luucas031bh/sistema-pedidos",
        "gas_actions": gas_actions,
        "mapa_python_gas": MAPA_PYTHON_GAS,
        "etapas_producao": _carregar_etapas(),
        "status_operacionais": [
            "Novo pedido",
            "Pendente",
            "Orçamento",
            "Em produção",
            "Atrasado",
            "Cancelado",
            "Travado",
            "Finalizado",
        ],
        "rotas_adny": {
            rota: {
                "agente": (info or {}).get("agente"),
                "descricao": (info or {}).get("descricao"),
            }
            for rota, info in routing.items()
        },
        "rotas_validas": rotas_validas,
        "paginas_web": paginas,
        "fontes_dados_vivos": {
            "rp": "Google Apps Script via consultar_rp.gas_get()",
            "whatsapp": "observador_store.whatsapp_mensagens.jsonl",
            "snapshot_local": "observador_store.pedidos.json",
        },
        "nota": "Dados vivos NAO estao no HTML estatico do GitHub Pages — use Apps Script ou logs locais.",
    }

    if salvar:
        MANIFESTO_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFESTO_PATH.write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding="utf-8")

    return manifesto


def carregar_manifesto() -> dict | None:
    if not MANIFESTO_PATH.is_file():
        return None
    try:
        return json.loads(MANIFESTO_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def path_manifesto() -> Path:
    return MANIFESTO_PATH


if __name__ == "__main__":
    m = gerar_manifesto_sistema()
    print(f"Manifesto salvo: {MANIFESTO_PATH}")
    print(f"  GAS actions: {len(m.get('gas_actions') or [])}")
    print(f"  Rotas ADNY: {len(m.get('rotas_adny') or {})}")
    print(f"  Etapas: {len(m.get('etapas_producao') or [])}")
