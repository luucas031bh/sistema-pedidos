"""
Validacao de ferramentas antes da execucao.
"""

import re

from intencao import COMANDOS_EXECUCAO, _norm

# Ferramentas que alteram o PC — bloqueadas no WhatsApp para nao-admins
FERRAMENTAS_PC_WHATSAPP = frozenset(
    {
        "abrir_programa",
        "abrir_pasta_cliente",
        "abrir_cdr_cliente",
        "abrir_psd_cliente",
        "abrir_pdf_cliente",
        "abrir_arquivo_cliente",
        "abrir_arquivo",
        "buscar_arquivo",
        "listar_pasta",
        "ler_pdf",
        "abrir_sistema_rp",
        "abrir_fila_rp",
        "abrir_pedido_rp",
        "buscar_internet",
    }
)

INTENCOES_PC = frozenset(
    {
        "abrir_programa",
        "abrir_pasta_cliente",
        "abrir_arquivo_cliente",
        "buscar_arquivo",
        "ler_pdf",
        "abrir_pedido_rp",
    }
)

# Ferramentas permitidas por intencao
TOOLS_POR_INTENCAO: dict[str, list[str]] = {
    "conversa": [],
    "pergunta": [],
    "abrir_programa": ["abrir_programa"],
    "abrir_pasta_cliente": ["abrir_pasta_cliente", "listar_arquivos_cliente"],
    "abrir_arquivo_cliente": [
        "abrir_cdr_cliente",
        "abrir_psd_cliente",
        "abrir_pdf_cliente",
        "abrir_arquivo_cliente",
        "abrir_arquivo",
        "listar_arquivos_cliente",
        "buscar_cliente",
    ],
    "buscar_arquivo": ["buscar_arquivo", "buscar_cliente", "listar_pasta", "listar_arquivos_cliente"],
    "ler_pdf": ["ler_pdf", "abrir_pdf_cliente"],
    "abrir_pedido_rp": [
        "abrir_sistema_rp",
        "abrir_fila_rp",
        "abrir_pedido_rp",
        "buscar_pedido_rp",
    ],
    "consultar_rp": [
        "navegar_rp",
        "listar_pedidos_rp",
        "consultar_pedidos_rp",
        "resumo_financeiro_rp",
        "detalhe_pedido_rp",
        "buscar_pedidos_rp",
    ],
    "navegar_rp": [
        "navegar_rp",
        "listar_pedidos_rp",
        "consultar_pedidos_rp",
        "resumo_financeiro_rp",
        "detalhe_pedido_rp",
        "buscar_pedidos_rp",
        "relatorio_pedidos_rp",
        "contar_etapa_rp",
    ],
    "consultar_sistema": [
        "consultar_sistema_pedidos",
    ],
}


def ferramentas_permitidas(intencao: str, permitir_internet: bool = False) -> list[str]:
    tools = list(TOOLS_POR_INTENCAO.get(intencao, []))
    if permitir_internet and intencao not in ("conversa", "pergunta"):
        tools.append("buscar_internet")
    return tools


def whatsapp_eh_admin(numero: str) -> bool:
    """Valida admin pelo config.json (nao confia no cliente)."""
    from config import carregar_config

    n = re.sub(r"\D", "", numero or "")
    if not n:
        return False
    admins = (carregar_config().get("whatsapp") or {}).get("admins") or []
    norm = [re.sub(r"\D", "", str(a)) for a in admins]
    return any(n == a or n.endswith(a) or a.endswith(n) for a in norm if a)


def validar_execucao(
    intencao: str,
    executar: bool,
    texto_usuario: str,
    nome_ferramenta: str,
    origem: str = "web",
    whatsapp_numero: str = "",
) -> tuple[bool, str]:
    """Retorna (permitido, motivo)."""
    if not executar:
        return False, "Intencao nao e comando executavel"

    if origem == "whatsapp":
        if intencao in INTENCOES_PC and not whatsapp_eh_admin(whatsapp_numero):
            return (
                False,
                "Acao no Windows restrita a administradores. "
                "Voce pode consultar pedidos e status do RP.",
            )
        if nome_ferramenta in FERRAMENTAS_PC_WHATSAPP and not whatsapp_eh_admin(
            whatsapp_numero
        ):
            return (
                False,
                "Ferramenta restrita a administradores no WhatsApp.",
            )

    permitidas = ferramentas_permitidas(intencao)
    if nome_ferramenta not in permitidas:
        return False, f"Ferramenta '{nome_ferramenta}' nao permitida para intencao '{intencao}'"

    n = _norm(texto_usuario)
    if intencao in ("consultar_rp", "navegar_rp", "consultar_sistema"):
        return True, ""

    if intencao in ("abrir_programa", "abrir_pasta_cliente", "abrir_arquivo_cliente", "buscar_arquivo", "ler_pdf", "abrir_pedido_rp"):
        if not any(v in n for v in COMANDOS_EXECUCAO) and intencao != "abrir_pedido_rp":
            if not ("fila" in n or "pedido" in n):
                return False, "Mensagem sem verbo de comando explicito"

    return True, ""


def resultado_bloqueado(motivo: str) -> dict:
    return {"bloqueado": True, "motivo": motivo}
