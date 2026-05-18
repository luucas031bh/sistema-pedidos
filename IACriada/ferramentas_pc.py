"""
Ferramentas do assistente: apenas LEITURA e ABRIR (sem salvar/alterar arquivos).
Windows.
"""

import os
import re
import subprocess
import webbrowser
from pathlib import Path

import urllib.parse
import urllib.request

def _pastas_padrao():
    home = Path(os.environ.get("USERPROFILE", "C:/"))
    return [
        home / "Desktop",
        home / "Área de Trabalho",
        home,
        Path("C:/Program Files"),
        Path("C:/Program Files (x86)"),
        Path(os.environ.get("ProgramData", "C:/ProgramData")),
    ]


PASTAS_BUSCA_PADRAO = _pastas_padrao()
EXTENSOES_ABRIR = {
    ".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
    ".mp3", ".mp4", ".wav", ".zip", ".rar", ".html", ".htm", ".csv",
    ".cdr", ".psd", ".ai",
}


def _norm(p):
    return str(Path(p).expanduser().resolve())


def listar_pasta(caminho="."):
    try:
        p = Path(caminho).expanduser().resolve()
        if not p.is_dir():
            return {"erro": f"Nao e uma pasta: {p}"}
        itens = []
        for item in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))[:80]:
            tipo = "pasta" if item.is_dir() else "arquivo"
            itens.append({"nome": item.name, "tipo": tipo, "caminho": str(item)})
        return {"pasta": str(p), "itens": itens, "total": len(itens)}
    except Exception as exc:
        return {"erro": str(exc)}


def _walk_limitado(raiz, nome, limite, max_depth=6):
    encontrados = []
    raiz = Path(raiz)
    base = len(raiz.parts)
    try:
        for dirpath, dirnames, filenames in os.walk(raiz, topdown=True):
            prof = len(Path(dirpath).parts) - base
            if prof > max_depth:
                dirnames.clear()
                continue
            p = Path(dirpath)
            if nome in p.name.lower():
                encontrados.append({
                    "nome": p.name,
                    "caminho": str(p),
                    "tipo": "pasta" if p.is_dir() else "arquivo",
                })
                if len(encontrados) >= limite:
                    return encontrados
            for fn in filenames:
                if nome in fn.lower():
                    fp = p / fn
                    encontrados.append({
                        "nome": fp.name,
                        "caminho": str(fp),
                        "tipo": "arquivo",
                    })
                    if len(encontrados) >= limite:
                        return encontrados
    except (PermissionError, OSError):
        pass
    return encontrados


def buscar_arquivo(nome, pasta_raiz=None):
    """Busca arquivos/pastas pelo nome (limitado, sem varrer o disco inteiro)."""
    nome = nome.strip().lower()
    if not nome:
        return {"erro": "Informe o nome para buscar."}

    raizes = [Path(pasta_raiz).expanduser()] if pasta_raiz else PASTAS_BUSCA_PADRAO
    encontrados = []
    limite = 25

    for raiz in raizes:
        if not raiz.exists():
            continue
        encontrados.extend(_walk_limitado(raiz, nome, limite - len(encontrados)))
        if len(encontrados) >= limite:
            break

    return {"busca": nome, "resultados": encontrados[:limite]}


def _achar_executavel(nome_programa):
    """Procura .exe pelo nome do programa."""
    termos = nome_programa.lower().strip()
    termos = re.sub(r"[^a-z0-9\s]", " ", termos)
    palavras = [w for w in termos.split() if len(w) > 2]

    candidatos = []
    termo_compacto = termos.replace(" ", "")

    for raiz in PASTAS_BUSCA_PADRAO:
        if not raiz.exists():
            continue
        try:
            contagem = 0
            for exe in raiz.rglob("*.exe"):
                contagem += 1
                if contagem > 8000:
                    break
                nome_exe = exe.stem.lower()
                caminho_l = str(exe).lower()
                score = sum(1 for p in palavras if p in nome_exe or p in caminho_l)
                if score > 0 or (termo_compacto and termo_compacto in nome_exe.replace(" ", "")):
                    candidatos.append((score + len(palavras), str(exe)))
        except (PermissionError, OSError):
            continue

    # Atalhos Menu Iniciar (usuario + todos)
    for menu in (
        Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
        Path(os.environ.get("ProgramData", "")) / "Microsoft/Windows/Start Menu/Programs",
    ):
        if not menu.exists():
            continue
        try:
            for lnk in menu.rglob("*.lnk"):
                stem = lnk.stem.lower()
                if any(p in stem for p in palavras) or (
                    termo_compacto and termo_compacto in stem.replace(" ", "")
                ):
                    candidatos.append((8, str(lnk)))
        except OSError:
            pass

    if not candidatos:
        return None
    candidatos.sort(key=lambda x: x[0], reverse=True)
    return candidatos[0][1]


def abrir_programa(nome_ou_caminho):
    """Abre um programa pelo nome ou caminho do .exe."""
    try:
        alvo = nome_ou_caminho.strip().strip('"')
        p = Path(alvo).expanduser()

        if p.is_file() and p.suffix.lower() in (".exe", ".lnk", ".bat"):
            caminho = str(p.resolve())
        elif p.is_file():
            return abrir_arquivo(str(p))
        else:
            achado = _achar_executavel(alvo)
            if not achado:
                return {
                    "erro": f"Programa nao encontrado: {nome_ou_caminho}",
                    "dica": "Tente o nome exato ou o caminho do .exe",
                }
            caminho = achado

        if caminho.lower().endswith(".lnk"):
            os.startfile(caminho)
        else:
            subprocess.Popen([caminho], shell=False, cwd=str(Path(caminho).parent))

        return {"ok": True, "acao": "programa_aberto", "caminho": caminho}
    except Exception as exc:
        return {"erro": str(exc)}


def abrir_arquivo(caminho):
    """Abre arquivo com o programa padrao do Windows (nao altera o arquivo)."""
    try:
        p = Path(caminho).expanduser().resolve()
        if not p.exists():
            return {"erro": f"Arquivo nao existe: {p}"}
        if p.is_dir():
            os.startfile(str(p))
            return {"ok": True, "acao": "pasta_aberta", "caminho": str(p)}
        os.startfile(str(p))
        return {"ok": True, "acao": "arquivo_aberto", "caminho": str(p)}
    except Exception as exc:
        return {"erro": str(exc)}


def buscar_internet(consulta):
    """Abre busca no navegador (nao altera arquivos do PC)."""
    try:
        url = "https://duckduckgo.com/?q=" + urllib.parse.quote(consulta)
        webbrowser.open(url)
        return {"ok": True, "acao": "busca_web", "url": url, "consulta": consulta}
    except Exception as exc:
        return {"erro": str(exc)}


def executar_ferramenta(nome, argumentos):
    from ferramentas_adonay import executar_adonay

    adonay = {
        "abrir_pasta_cliente",
        "abrir_cdr_cliente",
        "abrir_psd_cliente",
        "abrir_pdf_cliente",
        "abrir_arquivo_cliente",
        "listar_arquivos_cliente",
        "buscar_cliente",
        "abrir_sistema_rp",
        "abrir_fila_rp",
        "abrir_pedido_rp",
        "buscar_pedido_rp",
        "listar_pedidos_rp",
        "consultar_pedidos_rp",
        "navegar_rp",
        "resumo_financeiro_rp",
        "detalhe_pedido_rp",
        "buscar_pedidos_rp",
        "ler_pdf",
    }
    if nome in adonay:
        return executar_adonay(nome, argumentos or {})

    mapa = {
        "listar_pasta": lambda a: listar_pasta(a.get("caminho", ".")),
        "buscar_arquivo": lambda a: buscar_arquivo(a.get("nome", ""), a.get("pasta_raiz")),
        "abrir_programa": lambda a: abrir_programa(a.get("nome_ou_caminho", "")),
        "abrir_arquivo": lambda a: abrir_arquivo(a.get("caminho", "")),
        "buscar_internet": lambda a: buscar_internet(a.get("consulta", "")),
    }
    if nome not in mapa:
        return {"erro": f"Ferramenta desconhecida: {nome}"}
    return mapa[nome](argumentos or {})


def todas_definicoes_ferramentas(permitir_internet=False):
    from ferramentas_adonay import definicoes_ferramentas_adonay

    return definicoes_ferramentas(permitir_internet) + definicoes_ferramentas_adonay()


def definicoes_ferramentas_filtradas(intencao: str, permitir_internet=False):
    from seguranca import ferramentas_permitidas

    permitidas = set(ferramentas_permitidas(intencao, permitir_internet))
    return [
        t
        for t in todas_definicoes_ferramentas(permitir_internet)
        if t.get("function", {}).get("name") in permitidas
    ]


def definicoes_ferramentas(permitir_internet=False):
    tools = [
        {
            "type": "function",
            "function": {
                "name": "listar_pasta",
                "description": "Lista arquivos e pastas em um diretorio do PC.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "caminho": {
                            "type": "string",
                            "description": "Caminho da pasta, ex: C:/Users ou .",
                        }
                    },
                    "required": ["caminho"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "buscar_arquivo",
                "description": "Busca arquivos ou pastas pelo nome no computador.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nome": {"type": "string", "description": "Parte do nome"},
                        "pasta_raiz": {
                            "type": "string",
                            "description": "Pasta opcional para limitar busca",
                        },
                    },
                    "required": ["nome"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_programa",
                "description": (
                    "Abre/executa um programa. Ex: CorelDRAW, Chrome, Word. "
                    "Nao instala nem altera nada, apenas inicia."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nome_ou_caminho": {
                            "type": "string",
                            "description": "Nome do app ou caminho do .exe",
                        }
                    },
                    "required": ["nome_ou_caminho"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abrir_arquivo",
                "description": (
                    "Abre um arquivo ou pasta com o programa padrao. "
                    "Nao salva nem modifica o arquivo."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "caminho": {"type": "string", "description": "Caminho completo"}
                    },
                    "required": ["caminho"],
                },
            },
        },
    ]
    if permitir_internet:
        tools.append({
            "type": "function",
            "function": {
                "name": "buscar_internet",
                "description": (
                    "Abre uma busca na internet no navegador. "
                    "Use quando o usuario permitir internet."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "consulta": {"type": "string", "description": "Texto da busca"}
                    },
                    "required": ["consulta"],
                },
            },
        })
    return tools
