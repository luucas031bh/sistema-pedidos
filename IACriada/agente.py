import json
import os
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from ferramentas_pc import definicoes_ferramentas_filtradas, executar_ferramenta
from historico_db import registrar_log
from intencao import classificar_intencao
from seguranca import resultado_bloqueado, validar_execucao

OLLAMA_URL = "http://localhost:11434"
MODELOS_PREFERIDOS = (
    "llama3.1:8b",
    "llama3.1",
    "llama3.2",
    "qwen2.5:7b",
    "qwen2.5",
    "qwen2.5:14b",
    "mistral",
    "llama3",
)
MAX_PASSOS_FERRAMENTAS = 8

SISTEMA = """Voce e o assistente local Adonay no Windows do usuario Lucas.
Regras obrigatorias:
- Responda em portugues do Brasil.
- NEM TODA mensagem e um comando. Perguntas e conversas NAO devem usar ferramentas.
- Exemplos SEM ferramenta: "quantas horas?", "obrigado", "correta acao", "oi".
- Exemplos COM ferramenta: "abrir photoshop", "abrir corel", "abrir CDR do Victor 0032".
- So execute ferramentas quando a classificacao indicar intencao clara (abrir, buscar, listar, ler pdf, RP).
- NUNCA apague, salve, renomeie ou modifique arquivos. Apenas abrir, listar ou ler.
- Para clientes Adonay use cliente + codigo 4 digitos nas ferramentas especificas.
- Consultas ao RP (fila, status, financeiro, relatorios, detalhe de pedido): use navegar_rp
  ou ferramentas resumo_financeiro_rp / detalhe_pedido_rp. NAO abra o navegador.
- NUNCA invente pedidos, clientes, status, valores ou datas do RP.
- Para falar de pedidos, use SEMPRE ferramenta real de consulta ao RP.
- Se nao houver retorno real da ferramenta, responda:
  "Nao consegui consultar dados reais do RP agora."
- Use APENAS os dados injetados no contexto [Dados RP]. Nao invente valores nem pedidos.
- Responda de forma organica e clara em portugues; pode usar listas e totais.
- Seja objetivo sobre o que fez."""

SISTEMA_SEM_TOOLS = SISTEMA + "\n- Esta mensagem NAO e comando. Responda apenas em texto, sem acoes."

SISTEMA_CODIGO = """Voce e o assistente Adonay. O usuario pergunta sobre o CODIGO do projeto sistema-pedidos (pasta local GitHub).
Regras obrigatorias:
- Responda em portugues do Brasil.
- Use APENAS os trechos de arquivos fornecidos em [Codigo sistema-pedidos].
- Se a resposta nao estiver nos trechos, diga claramente que nao encontrou no codigo indexado.
- NUNCA invente funcoes, arquivos, URLs ou comportamentos que nao aparecam nos trechos.
- Cite o caminho do arquivo quando relevante (ex: Code.gs, home.js).
- Seja claro e didatico."""


def _request_ollama(payload, timeout=120):
    corpo = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=corpo,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def listar_modelos():
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
            return [m.get("name", "") for m in dados.get("models", [])]
    except (urllib.error.URLError, OSError, TimeoutError):
        return []


def resolver_modelo(desejado=None):
    modelos = listar_modelos()
    if not modelos:
        return None
    if desejado and desejado in modelos:
        return desejado
    for pref in MODELOS_PREFERIDOS:
        for m in modelos:
            base = m.split(":")[0]
            if m == pref or m.startswith(pref) or base == pref.replace(":7b", "").replace(":14b", ""):
                return m
    return modelos[0]


def _caminhos_ollama_exe():
    local = os.environ.get("LOCALAPPDATA", "")
    return [
        Path(local) / "Programs/Ollama/ollama.exe",
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Ollama/ollama.exe",
    ]


def ollama_instalado():
    if shutil.which("ollama"):
        return True
    return any(p.is_file() for p in _caminhos_ollama_exe())


def diagnostico_ollama():
    if not ollama_instalado():
        return {
            "estado": "nao_instalado",
            "ollama": False,
            "instalado": False,
            "mensagem": "Ollama nao esta instalado. Baixe em https://ollama.com/download",
            "passos": [
                "1. Instale o Ollama (Windows)",
                "2. Abra o app Ollama na bandeja do Windows",
                "3. No terminal: ollama pull qwen2.5:7b",
                "4. Recarregue esta pagina (F5)",
            ],
        }
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
            modelos = [m.get("name", "") for m in dados.get("models", [])]
    except (urllib.error.URLError, OSError, TimeoutError):
        return {
            "estado": "offline",
            "ollama": False,
            "instalado": True,
            "mensagem": "Ollama instalado mas parado. Abra o app Ollama",
            "passos": ["1. Abra Ollama", "2. ollama pull qwen2.5:7b"],
        }

    if not modelos:
        return {
            "estado": "sem_modelos",
            "ollama": False,
            "instalado": True,
            "mensagem": "Ollama ligado, mas nenhum modelo baixado.",
            "passos": ["No terminal: ollama pull qwen2.5:7b"],
            "modelos": [],
        }

    return {
        "estado": "ok",
        "ollama": True,
        "instalado": True,
        "mensagem": "Ollama pronto",
        "modelos": modelos,
        "modelo_padrao": resolver_modelo(),
    }


def ollama_online():
    return diagnostico_ollama().get("estado") == "ok"


def mensagem_erro_ollama():
    d = diagnostico_ollama()
    if d.get("passos"):
        return d["mensagem"] + " | " + " ".join(d["passos"])
    return d.get("mensagem", "Ollama indisponivel")


def _ultima_mensagem_user(mensagens: list) -> str:
    for m in reversed(mensagens):
        if m.get("role") == "user":
            return m.get("content", "")
    return ""


def _executar_tool_call(
    call, clf: dict, texto_user: str, sessao: str, ctx: dict | None = None
):
    fn = call.get("function", {})
    nome = fn.get("name", "")
    args_raw = fn.get("arguments", "{}")
    try:
        args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
    except json.JSONDecodeError:
        args = {}

    ctx = ctx or {}
    ok, motivo = validar_execucao(
        clf["intencao"],
        clf["executar"],
        texto_user,
        nome,
        origem=ctx.get("origem", "web"),
        whatsapp_numero=ctx.get("whatsapp_numero", ""),
    )
    if not ok:
        registrar_log(sessao, clf["intencao"], clf["executar"], nome, "bloqueado", motivo)
        return nome, args, resultado_bloqueado(motivo)

    resultado = executar_ferramenta(nome, args)
    registrar_log(sessao, clf["intencao"], clf["executar"], nome, "executado", "")
    return nome, args, resultado


def _tentar_resposta_sistema_codigo(
    texto_user: str, modelo: str, mensagens: list
) -> dict | None:
    """Busca no indice local sistema-pedidos e responde com Ollama (somente trechos reais)."""
    from consultar_sistema_pedidos import buscar_contexto, tema_sistema_pedidos

    if not tema_sistema_pedidos(texto_user):
        return None

    ctx = buscar_contexto(texto_user)
    if not ctx.get("ok"):
        return {
            "resposta": ctx.get("erro") or "Nao foi possivel ler o projeto sistema-pedidos.",
            "modelo": modelo,
            "passos": [{"sistema_codigo": True, "erro": True}],
            "meta": {
                "intencao": "consultar_sistema",
                "executar": True,
                "sistema_codigo": True,
            },
        }

    from config import path_sistema_pedidos

    hint = (
        f"\n[Codigo sistema-pedidos — trechos indexados de {path_sistema_pedidos()}]\n"
        f"Arquivos usados: {', '.join(ctx.get('arquivos', [])[:8])}\n\n"
        f"{ctx.get('contexto', '')}\n[/Codigo sistema-pedidos]"
    )
    msgs = [
        {"role": "system", "content": SISTEMA_CODIGO + hint},
        {"role": "user", "content": texto_user},
    ]
    try:
        dados = _request_ollama(
            {
                "model": modelo,
                "messages": msgs,
                "stream": False,
                "options": {"temperature": 0},
            }
        )
    except urllib.error.URLError as exc:
        raise ConnectionError(f"Erro ao falar com Ollama: {exc}") from exc

    return {
        "resposta": dados.get("message", {}).get("content", "").strip(),
        "modelo": modelo,
        "passos": [
            {
                "sistema_codigo": True,
                "arquivos": ctx.get("arquivos", [])[:10],
                "termos": ctx.get("termos", []),
            }
        ],
        "meta": {
            "intencao": "consultar_sistema",
            "executar": True,
            "sistema_codigo": True,
            "arquivos": ctx.get("arquivos", []),
        },
    }


def _sanitizar_resposta_whatsapp(texto: str) -> str:
    """Remove vazamento de classificacao/ferramentas internas no texto."""
    if not texto:
        return texto
    bloqueios = (
        "navegar_rp",
        "resumo_financeiro_rp",
        "executar ferramenta",
        "classificacao:",
        "[classificacao",
        "navegar rp",
    )
    baixo = texto.lower()
    if any(b in baixo for b in bloqueios):
        return (
            "Nao consegui montar a resposta para o WhatsApp. "
            "Tente de novo, por exemplo: ADNY resumo financeiro dos pedidos em aberto."
        )
    return texto


def _tentar_resposta_rp_direta(
    texto_user: str,
    modelo: str,
    historico: list | None = None,
    sessao: str = "padrao",
    forcar: bool = False,
) -> dict | None:
    """Consulta o RP e devolve texto factual sem passar pelo LLM (evita alucinacao)."""
    from consultar_sistema_pedidos import tema_sistema_pedidos
    from intencoes import INTENCOES_RP_DADOS
    from rp_router import montar_resposta_rp_direta, rotear_pergunta_rp, tema_parece_rp

    if tema_sistema_pedidos(texto_user):
        return None
    if not forcar and not tema_parece_rp(texto_user):
        return None

    clf = classificar_intencao(texto_user, historico=historico, sessao=sessao)
    if not forcar:
        if clf["intencao_detalhada"] not in INTENCOES_RP_DADOS and clf["intencao"] not in (
            "navegar_rp",
            "consultar_rp",
        ):
            if not clf.get("executar"):
                return None

    from rp_entidades import extrair_entidades_rp
    from rp_router import rotear_tamanhos_pedido_especifico
    from rp_sintese import deve_sintetizar_rp, sintetizar_resposta_rp, validar_escopo_resposta

    params = clf.get("params") or {}
    dados_rp = rotear_pergunta_rp(texto_user, params)

    escopo_erro = validar_escopo_resposta(texto_user, dados_rp)
    if escopo_erro and dados_rp.get("action") == "agregarPecasAbertos":
        ent = extrair_entidades_rp(texto_user)
        if ent.get("quer_tamanhos") and (ent.get("cliente") or ent.get("codigo") or ent.get("termo_busca")):
            retry = rotear_tamanhos_pedido_especifico(texto_user, params)
            if retry and retry.get("ok"):
                dados_rp = retry

    resposta = montar_resposta_rp_direta(dados_rp)
    if not resposta:
        resposta = (
            "Nao consegui consultar dados reais do RP agora. "
            f"{dados_rp.get('erro') or 'Verifique a internet e tente de novo.'}"
        )
    if dados_rp.get("ok"):
        from historico_db import salvar_contexto_rp, salvar_pedido_ativo

        det = clf.get("intencao_detalhada") or clf.get("intencao", "buscar_pedidos_status")
        salvar_contexto_rp(sessao, det, params)
        if dados_rp.get("action") == "buscarPedido":
            facts = dados_rp.get("facts") or {}
            pedido = facts.get("pedido") if isinstance(facts, dict) else None
            if pedido:
                ent = extrair_entidades_rp(texto_user)
                termo = ent.get("codigo") or ent.get("cliente") or ent.get("termo_busca") or ""
                salvar_pedido_ativo(sessao, pedido, str(termo))

    if resposta and dados_rp.get("ok") and deve_sintetizar_rp(texto_user, dados_rp):
        from agentes.interpretador import organizar_resposta

        kind = dados_rp.get("kind") or ""
        ctx = (
            "lista_tamanhos"
            if kind == "lista_tamanhos_pedido"
            else "resumo_pedido"
            if kind == "resumo_completo_pedido"
            else "rp_pedido"
        )
        sintese = organizar_resposta(
            texto_user,
            resposta,
            dados_rp.get("facts"),
            modelo,
            contexto=ctx,
            forcar_llm=True,
        )
        if sintese:
            resposta = sintese
        else:
            sintese_legacy = sintetizar_resposta_rp(texto_user, resposta, dados_rp, modelo)
            if sintese_legacy:
                resposta = sintese_legacy

    return {
        "resposta": resposta,
        "modelo": modelo,
        "passos": [
            {
                "rp_direto": True,
                "action": dados_rp.get("action"),
                "ok": dados_rp.get("ok"),
            }
        ],
        "meta": {
            "intencao": clf.get("intencao", "navegar_rp"),
            "intencao_detalhada": clf.get("intencao_detalhada"),
            "executar": True,
            "rp_direto": True,
            "action": dados_rp.get("action"),
            "params": params,
            "status_rp": params.get("status_rp"),
            "bloqueados": [],
        },
    }


def chat_com_ferramentas(
    mensagens,
    modelo,
    permitir_internet=False,
    sessao="padrao",
    ctx: dict | None = None,
):
    nome = resolver_modelo(modelo)
    if not nome:
        raise ConnectionError(mensagem_erro_ollama())

    ctx = ctx or {}
    texto_user = _ultima_mensagem_user(mensagens)
    passos = []
    bloqueados = []

    if ctx.get("origem") == "whatsapp":
        from seguranca import INTENCOES_PC, whatsapp_eh_admin

        clf_prev = classificar_intencao(
            texto_user, historico=mensagens, sessao=sessao
        )
        if (
            clf_prev.get("executar")
            and clf_prev.get("intencao") in INTENCOES_PC
            and not whatsapp_eh_admin(ctx.get("whatsapp_numero", ""))
        ):
            return {
                "resposta": (
                    "No WhatsApp, acoes no Windows (abrir programa, pasta ou arquivo) "
                    "so podem ser feitas por administradores autorizados. "
                    "Voce pode consultar pedidos, status e informacoes do RP."
                ),
                "modelo": nome,
                "passos": [],
                "meta": {
                    "intencao": clf_prev.get("intencao"),
                    "executar": False,
                    "whatsapp_bloqueado": True,
                },
            }

    sistema = _tentar_resposta_sistema_codigo(texto_user, nome, mensagens)
    if sistema is not None:
        return sistema

    from rp_router import tema_parece_rp

    forcar_rp = ctx.get("origem") == "whatsapp" and tema_parece_rp(texto_user)
    direto = _tentar_resposta_rp_direta(
        texto_user, nome, historico=mensagens, sessao=sessao, forcar=forcar_rp
    )
    if direto is not None:
        if ctx.get("origem") == "whatsapp":
            direto["resposta"] = _sanitizar_resposta_whatsapp(direto.get("resposta", ""))
        return direto

    clf = classificar_intencao(texto_user, historico=mensagens, sessao=sessao)

    if not clf["executar"]:
        payload = {
            "model": nome,
            "messages": [{"role": "system", "content": SISTEMA_SEM_TOOLS}] + list(mensagens),
            "stream": False,
            "options": {"temperature": 0},
        }
        try:
            dados = _request_ollama(payload)
        except urllib.error.URLError as exc:
            raise ConnectionError(f"Erro ao falar com Ollama: {exc}") from exc
        msg = dados.get("message", {})
        return {
            "resposta": msg.get("content", "").strip(),
            "modelo": nome,
            "passos": passos,
            "meta": {
                "intencao": clf["intencao"],
                "executar": False,
                "confianca": clf["confianca"],
                "params": clf.get("params", {}),
                "bloqueados": bloqueados,
            },
        }

    tools = definicoes_ferramentas_filtradas(clf["intencao"], permitir_internet)
    if ctx.get("origem") == "whatsapp":
        sistema_base = SISTEMA + (
            "\n- WhatsApp: NUNCA diga nomes de ferramentas, classificacao ou 'navegar_rp'. "
            "Responda só o resultado em linguagem natural ou use a ferramenta de verdade."
        )
        hint = ""
    else:
        sistema_base = SISTEMA
        det = clf.get("intencao_detalhada") or clf["intencao"]
        hint = (
            f"\n[Classificacao: {det} -> {clf['intencao']}. "
            f"Params: {json.dumps(clf.get('params', {}), ensure_ascii=False)}]"
        )

    msgs = [{"role": "system", "content": sistema_base + hint}] + list(mensagens)

    for _ in range(MAX_PASSOS_FERRAMENTAS):
        payload = {
            "model": nome,
            "messages": msgs,
            "tools": tools if tools else None,
            "stream": False,
            "options": {"temperature": 0},
        }
        if not tools:
            del payload["tools"]

        try:
            dados = _request_ollama(payload)
        except urllib.error.URLError as exc:
            raise ConnectionError(f"Erro ao falar com Ollama: {exc}") from exc

        msg = dados.get("message", {})
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            resposta = msg.get("content", "").strip()
            if ctx.get("origem") == "whatsapp":
                resposta = _sanitizar_resposta_whatsapp(resposta)
            return {
                "resposta": resposta,
                "modelo": nome,
                "passos": passos,
                "meta": {
                    "intencao": clf["intencao"],
                    "executar": True,
                    "params": clf.get("params", {}),
                    "bloqueados": bloqueados,
                },
            }

        msgs.append(msg)
        for call in tool_calls:
            nome_f, args, resultado = _executar_tool_call(
                call, clf, texto_user, sessao, ctx=ctx
            )
            if resultado.get("bloqueado"):
                bloqueados.append({"ferramenta": nome_f, "motivo": resultado.get("motivo")})
            passos.append({"ferramenta": nome_f, "args": args, "resultado": resultado})
            msgs.append({
                "role": "tool",
                "tool_name": nome_f,
                "content": json.dumps(resultado, ensure_ascii=False),
            })

    return {
        "resposta": "Limite de acoes atingido. Tente um pedido mais simples.",
        "modelo": nome,
        "passos": passos,
        "meta": {
            "intencao": clf["intencao"],
            "executar": True,
            "bloqueados": bloqueados,
        },
    }
