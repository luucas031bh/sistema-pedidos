"""Ferramentas Adonay: OneDrive, RP, PDF."""

import os
import webbrowser
from pathlib import Path
from urllib.parse import urljoin

from config import carregar_config
from consultar_rp import buscar_pedido_rp as _buscar_pedido_rp_gas
from consultar_rp import buscar_pedidos_rp as _buscar_pedidos_rp_gas
from consultar_rp import consultar_pedidos_rp as _consultar_pedidos_rp
from consultar_rp import listar_pedidos_rp as _listar_pedidos_rp
from consultar_rp import resumo_financeiro_rp as _resumo_financeiro_rp
from rp_router import rotear_pergunta_rp
from rp_formatadores import format_intent_fallback
from ferramentas_pc import abrir_arquivo
from indexador_onedrive import buscar, buscar_pasta_cliente, listar_clientes


def _norm_cod(codigo: str) -> str:
    return str(codigo).zfill(4)[-4:]


def _norm_cli(cliente: str) -> str:
    return cliente.strip().title()


def _abrir_primeiro(tipo: str, cliente: str, codigo: str) -> dict:
    rows = buscar(_norm_cli(cliente), _norm_cod(codigo), tipo, limite=5)
    if not rows:
        return {
            "erro": f"Nenhum {tipo} encontrado para {cliente} {_norm_cod(codigo)}",
            "dica": "Execute a indexacao do OneDrive primeiro",
        }
    if len(rows) > 1:
        return {
            "aviso": "Varios arquivos encontrados; abrindo o mais recente",
            "candidatos": [
                {"nome": r["nome_arquivo"], "caminho": r["caminho_completo"]}
                for r in rows[:5]
            ],
            **abrir_arquivo(rows[0]["caminho_completo"]),
        }
    return abrir_arquivo(rows[0]["caminho_completo"])


def abrir_pasta_cliente(cliente: str, codigo: str) -> dict:
    pasta = buscar_pasta_cliente(cliente, codigo)
    if not pasta:
        return {"erro": f"Pasta nao encontrada: {cliente} {codigo}"}
    return abrir_arquivo(pasta)


def abrir_cdr_cliente(cliente: str, codigo: str) -> dict:
    return _abrir_primeiro(".cdr", cliente, codigo)


def abrir_psd_cliente(cliente: str, codigo: str) -> dict:
    return _abrir_primeiro(".psd", cliente, codigo)


def abrir_pdf_cliente(cliente: str, codigo: str) -> dict:
    return _abrir_primeiro(".pdf", cliente, codigo)


def abrir_arquivo_cliente(cliente: str, codigo: str, tipo: str | None = None) -> dict:
    t = (tipo or "").lower().strip()
    if t in ("cdr", ".cdr"):
        return abrir_cdr_cliente(cliente, codigo)
    if t in ("psd", ".psd"):
        return abrir_psd_cliente(cliente, codigo)
    if t in ("pdf", ".pdf"):
        return abrir_pdf_cliente(cliente, codigo)
    rows = buscar(_norm_cli(cliente), _norm_cod(codigo), limite=1)
    if rows:
        return abrir_arquivo(rows[0]["caminho_completo"])
    return abrir_pasta_cliente(cliente, codigo)


def listar_arquivos_cliente(cliente: str, codigo: str, tipo: str | None = None) -> dict:
    ext = None
    if tipo:
        ext = tipo if tipo.startswith(".") else f".{tipo}"
    rows = buscar(_norm_cli(cliente), _norm_cod(codigo), ext, limite=25)
    return {
        "cliente": cliente,
        "codigo": _norm_cod(codigo),
        "arquivos": [
            {
                "nome": r["nome_arquivo"],
                "tipo": r["tipo_arquivo"],
                "caminho": r["caminho_completo"],
            }
            for r in rows
        ],
        "total": len(rows),
    }


def buscar_cliente(termo: str) -> dict:
    termo = termo.strip()
    cod = None
    cli = termo
    import re

    m = re.search(r"\b(\d{4})\b", termo)
    if m:
        cod = m.group(1)
        cli = termo.replace(cod, "").strip()
    rows = buscar(cli if cli else None, cod, limite=25)
    if not rows and len(termo) >= 2:
        rows = buscar(termo, None, limite=25)
    return {"busca": termo, "resultados": rows, "total": len(rows)}


def _url_rp(rota: str, codigo: str | None = None) -> str:
    cfg_full = carregar_config()
    rp = cfg_full.get("rp", {})

    if rota == "fila":
        return rp.get("url_home") or cfg_full.get("rp_url_home", "")

    if rota == "sistema":
        base = (rp.get("base_url") or cfg_full.get("rp_url_base", "")).rstrip("/") + "/"
        path = rp.get("rotas", {}).get("sistema", "index.html")
        return urljoin(base, path.lstrip("/"))

    base = (rp.get("base_url") or cfg_full.get("rp_url_base", "")).rstrip("/") + "/"
    rotas = rp.get("rotas", {})
    if rota == "pedido" and codigo:
        path_id = rotas.get("pedido_id", "index.html?id={codigo}")
        if "{codigo}" in path_id:
            return urljoin(base, path_id.replace("{codigo}", _norm_cod(codigo)).lstrip("/"))
    path = rotas.get(rota, "")
    if codigo and "{codigo}" in path:
        path = path.replace("{codigo}", _norm_cod(codigo))
    return urljoin(base, path.lstrip("/"))


def abrir_sistema_rp() -> dict:
    url = _url_rp("sistema")
    webbrowser.open(url)
    return {"ok": True, "acao": "abrir_rp", "url": url}


def abrir_fila_rp() -> dict:
    url = _url_rp("fila")
    webbrowser.open(url)
    return {"ok": True, "acao": "abrir_fila_rp", "url": url}


def abrir_pedido_rp(codigo: str) -> dict:
    cod = _norm_cod(codigo)
    url = _url_rp("pedido", cod)
    webbrowser.open(url)
    return {
        "ok": True,
        "acao": "abrir_pedido_rp",
        "url": url,
        "codigo": cod,
        "dica": "Na fila (home), use Buscar pedido com os 4 digitos do telefone se for busca por telefone.",
    }


def buscar_pedido_rp(codigo: str) -> dict:
    """Abre pedido no navegador (comando explicito)."""
    return abrir_pedido_rp(codigo)


def detalhe_pedido_rp(termo: str) -> dict:
    data = _buscar_pedido_rp_gas(termo)
    return {
        "ok": data.get("sucesso", False),
        "texto_formatado": format_intent_fallback("detalhe_pedido", data),
        "dados": data,
    }


def buscar_pedidos_rp(termo: str) -> dict:
    data = _buscar_pedidos_rp_gas(termo)
    return {
        "ok": data.get("sucesso", False),
        "texto_formatado": format_intent_fallback("busca_pedidos", data),
        "dados": data,
    }


def resumo_financeiro_rp(incluir_historico: bool = False) -> dict:
    return _resumo_financeiro_rp(incluir_historico=incluir_historico)


def navegar_rp(consulta: str = "") -> dict:
    """Roteia pergunta em linguagem natural para a acao correta do RP."""
    return rotear_pergunta_rp(consulta or "")


def listar_pedidos_rp(
    etapa_producao: str | None = None,
    status_operacional: str | None = None,
    apenas_abertos: bool = True,
    cliente: str | None = None,
    limite: int = 0,
) -> dict:
    return _listar_pedidos_rp(
        etapa_producao=etapa_producao or None,
        status_operacional=status_operacional or None,
        apenas_abertos=apenas_abertos,
        cliente=cliente or None,
        limite=limite,
    )


def consultar_pedidos_rp_tool(
    consulta: str = "",
    etapa_producao: str | None = None,
    status_operacional: str | None = None,
    apenas_abertos: bool = True,
) -> dict:
    return _consultar_pedidos_rp(
        consulta=consulta,
        etapa_producao=etapa_producao,
        status_operacional=status_operacional,
        apenas_abertos=apenas_abertos,
    )


def ler_pdf(caminho: str = "", cliente: str = "", codigo: str = "") -> dict:
    path = caminho.strip()
    if not path and cliente and codigo:
        rows = buscar(_norm_cli(cliente), _norm_cod(codigo), ".pdf", limite=1)
        if rows:
            path = rows[0]["caminho_completo"]
    if not path:
        return {"erro": "Informe caminho ou cliente+codigo do PDF"}
    p = Path(path).expanduser()
    if not p.is_file():
        return {"erro": f"Arquivo nao existe: {p}"}
    if p.suffix.lower() != ".pdf":
        return {"erro": "Arquivo nao e PDF"}

    try:
        import fitz
    except ImportError:
        return {"erro": "Instale pymupdf: pip install pymupdf"}

    try:
        doc = fitz.open(str(p))
        partes = []
        limite_chars = 14000
        for i, page in enumerate(doc):
            partes.append(page.get_text())
            if sum(len(x) for x in partes) >= limite_chars:
                break
        doc.close()
        texto = "\n".join(partes)[:limite_chars]
        return {
            "ok": True,
            "caminho": str(p.resolve()),
            "paginas": len(partes),
            "texto": texto,
            "truncado": len(texto) >= limite_chars,
        }
    except Exception as exc:
        return {"erro": str(exc)}


def executar_adonay(nome: str, args: dict) -> dict:
    mapa = {
        "abrir_pasta_cliente": lambda a: abrir_pasta_cliente(
            a.get("cliente", ""), a.get("codigo", "")
        ),
        "abrir_cdr_cliente": lambda a: abrir_cdr_cliente(
            a.get("cliente", ""), a.get("codigo", "")
        ),
        "abrir_psd_cliente": lambda a: abrir_psd_cliente(
            a.get("cliente", ""), a.get("codigo", "")
        ),
        "abrir_pdf_cliente": lambda a: abrir_pdf_cliente(
            a.get("cliente", ""), a.get("codigo", "")
        ),
        "abrir_arquivo_cliente": lambda a: abrir_arquivo_cliente(
            a.get("cliente", ""),
            a.get("codigo", ""),
            a.get("tipo"),
        ),
        "listar_arquivos_cliente": lambda a: listar_arquivos_cliente(
            a.get("cliente", ""), a.get("codigo", ""), a.get("tipo")
        ),
        "buscar_cliente": lambda a: buscar_cliente(a.get("termo", "")),
        "abrir_sistema_rp": lambda a: abrir_sistema_rp(),
        "abrir_fila_rp": lambda a: abrir_fila_rp(),
        "abrir_pedido_rp": lambda a: abrir_pedido_rp(a.get("codigo", "")),
        "buscar_pedido_rp": lambda a: buscar_pedido_rp(a.get("codigo", "")),
        "listar_pedidos_rp": lambda a: listar_pedidos_rp(
            a.get("etapa_producao"),
            a.get("status_operacional"),
            a.get("apenas_abertos", True),
            a.get("cliente"),
            int(a.get("limite") or 0),
        ),
        "consultar_pedidos_rp": lambda a: consultar_pedidos_rp_tool(
            a.get("consulta", ""),
            a.get("etapa_producao"),
            a.get("status_operacional"),
            a.get("apenas_abertos", True),
        ),
        "navegar_rp": lambda a: navegar_rp(a.get("consulta", "")),
        "detalhe_pedido_rp": lambda a: detalhe_pedido_rp(a.get("termo", "")),
        "buscar_pedidos_rp": lambda a: buscar_pedidos_rp(a.get("termo", "")),
        "resumo_financeiro_rp": lambda a: resumo_financeiro_rp(
            a.get("incluir_historico", False)
        ),
        "ler_pdf": lambda a: ler_pdf(
            a.get("caminho", ""),
            a.get("cliente", ""),
            a.get("codigo", ""),
        ),
    }
    if nome not in mapa:
        return {"erro": f"Ferramenta Adonay desconhecida: {nome}"}
    return mapa[nome](args or {})


def definicoes_ferramentas_adonay() -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": "abrir_pasta_cliente",
                "description": "Abre a pasta do cliente no OneDrive Adonay. Requer cliente e codigo 4 digitos.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string", "description": "4 digitos, ex: 0032"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_cdr_cliente",
                "description": "Abre arquivo CorelDRAW (.cdr) do cliente no indice OneDrive.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_psd_cliente",
                "description": "Abre arquivo Photoshop (.psd) do cliente.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_pdf_cliente",
                "description": "Abre PDF do cliente.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_arquivo_cliente",
                "description": "Abre arquivo do cliente (tipo opcional: cdr, psd, pdf).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                        "tipo": {"type": "string"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "listar_arquivos_cliente",
                "description": "Lista arquivos do cliente no indice SQLite.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                        "tipo": {"type": "string"},
                    },
                    "required": ["cliente", "codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "buscar_cliente",
                "description": "Busca cliente ou codigo no indice OneDrive.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "termo": {"type": "string"},
                    },
                    "required": ["termo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_sistema_rp",
                "description": "Abre o sistema RP (pedidos) no navegador.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_fila_rp",
                "description": "Abre a fila de producao do RP no navegador.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_pedido_rp",
                "description": "Abre pedido especifico no RP pelo codigo 4 digitos.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "codigo": {"type": "string"},
                    },
                    "required": ["codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "buscar_pedido_rp",
                "description": "Busca e abre pedido no RP pelo codigo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "codigo": {"type": "string"},
                    },
                    "required": ["codigo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "listar_pedidos_rp",
                "description": "Lista pedidos do RP no chat (sem abrir navegador). Filtros: etapa_producao (Arte, Corte...), status_operacional, apenas_abertos.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "etapa_producao": {
                            "type": "string",
                            "description": "Ex: Arte, Insumos, Corte, Estampa, Costura",
                        },
                        "status_operacional": {
                            "type": "string",
                            "description": "Ex: Em produção, Novo pedido, Pendente",
                        },
                        "apenas_abertos": {
                            "type": "boolean",
                            "description": "True = exclui finalizados/cancelados",
                        },
                        "cliente": {"type": "string"},
                        "limite": {"type": "integer"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "consultar_pedidos_rp",
                "description": "Consulta pedidos do RP pela frase do usuario (ex: pedidos em ARTE). Retorna lista CLIENTE 1234. Nao abre navegador.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "consulta": {
                            "type": "string",
                            "description": "Texto da pergunta, ex: pedidos em status ARTE",
                        },
                        "etapa_producao": {"type": "string"},
                        "status_operacional": {"type": "string"},
                        "apenas_abertos": {"type": "boolean"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "navegar_rp",
                "description": "Consulta organica ao RP: listas, relatorios, financeiro, status, entregas, detalhe. Preferir esta tool para perguntas sobre pedidos. Nao abre navegador.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "consulta": {
                            "type": "string",
                            "description": "Pergunta completa do usuario sobre o RP",
                        },
                    },
                    "required": ["consulta"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "resumo_financeiro_rp",
                "description": "Resumo financeiro dos pedidos em aberto (total, recebido, a receber).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "incluir_historico": {"type": "boolean"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "detalhe_pedido_rp",
                "description": "Detalhes completos de um pedido (nome, 4 digitos, telefone ou ID). Somente leitura.",
                "parameters": {
                    "type": "object",
                    "properties": {"termo": {"type": "string"}},
                    "required": ["termo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "buscar_pedidos_rp",
                "description": "Busca varios pedidos por nome, telefone ou termo. Somente leitura.",
                "parameters": {
                    "type": "object",
                    "properties": {"termo": {"type": "string"}},
                    "required": ["termo"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "ler_pdf",
                "description": "Le texto de um PDF (caminho ou cliente+codigo). Nao altera o arquivo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "caminho": {"type": "string"},
                        "cliente": {"type": "string"},
                        "codigo": {"type": "string"},
                    },
                },
            },
        },
    ]
