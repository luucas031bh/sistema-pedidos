"""
Classificador de intencao — delega interpretacao natural a intencoes.py.
Padrao: conversa/pergunta sem executar ferramentas.
"""

from intencoes import (
    detectar_intencao_basica,
    deve_permitir_ferramenta,
    intencao_para_legacy,
)

# Reexportado para seguranca.py
from intencoes import normalizar_texto as _norm

COMANDOS_EXECUCAO = (
    "abrir",
    "abre",
    "abra",
    "executar",
    "executa",
    "rode",
    "run",
    "iniciar",
    "inicia",
    "buscar",
    "busca",
    "procurar",
    "procure",
    "encontrar",
    "encontre",
    "listar",
    "lista",
    "mostrar",
    "mostra",
    "me mostra",
    "me mostrar",
    "ler pdf",
    "leia pdf",
    "leia o pdf",
    "ler o pdf",
)


def classificar_intencao(
    texto: str, historico: list | None = None, sessao: str | None = None
) -> dict:
    """Retorna intencao (legacy), intencao_detalhada, executar, confianca, params."""
    basica = detectar_intencao_basica(texto, historico=historico, sessao=sessao)
    intencao_legacy = intencao_para_legacy(basica["intencao"])

    executar = bool(basica.get("executar"))
    if executar and not deve_permitir_ferramenta(texto, basica["intencao"]):
        executar = False
        intencao_legacy = "pergunta" if "?" in (texto or "") else "conversa"

    return {
        "intencao": intencao_legacy,
        "intencao_detalhada": basica["intencao"],
        "executar": executar,
        "confianca": basica.get("confianca", 0.6),
        "params": basica.get("params") or {},
        "repetiu_contexto": basica.get("repetiu_contexto", False),
    }
