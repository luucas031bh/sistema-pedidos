"""
Servidor local: API + interface HTML estilo ChatGPT.
Execute: python server.py
Abra: http://127.0.0.1:8765
"""

import json
import shutil
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from agente import (
    chat_com_ferramentas,
    diagnostico_ollama,
    mensagem_erro_ollama,
    ollama_online,
)
from historico_db import (
    carregar_mensagens,
    contar_mensagens,
    limpar_conversa,
    listar_logs,
    salvar_mensagem,
)
from indexador_onedrive import estatisticas_index, indexar_completo, listar_clientes
from indexador_sistema_pedidos import (
    estatisticas_sistema_index,
    indexar_sistema_pedidos,
)

PASTA = Path(__file__).parent
STATIC = PASTA / "static"
PORTA = 8765
UPLOAD_PDF = PASTA / "data" / "uploads"
_indexar_status = {"rodando": False, "resultado": None}
_indexar_sistema_status = {"rodando": False, "resultado": None}

CORS_ORIGINS = frozenset(
    {
        "https://luucas031bh.github.io",
    }
)


def _set_cors(handler):
    from acesso_remoto import origens_cors_permitidas

    origin = handler.headers.get("Origin", "")
    permitidas = origens_cors_permitidas()
    if origin in permitidas:
        handler.send_header("Access-Control-Allow-Origin", origin)
    elif origin.startswith(("http://127.0.0.1:", "http://localhost:")):
        handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Adonay-Token, Authorization",
    )


def _checar_auth_api(handler, path: str) -> bool:
    from acesso_remoto import verificar_auth

    ok, msg = verificar_auth(handler, path)
    if ok:
        return True
    _json_response(handler, 401, {"detail": msg, "auth": "token_required"})
    return False


def _json_response(handler, status, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    _set_cors(handler)
    handler.end_headers()
    handler.wfile.write(body)


def _ler_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw)


def _servir_arquivo(handler, caminho: Path, content_type: str):
    if not caminho.is_file():
        handler.send_error(404)
        return
    data = caminho.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    _set_cors(handler)
    handler.end_headers()
    handler.wfile.write(data)


def _redirect(handler, url: str, code: int = 302):
    handler.send_response(code)
    handler.send_header("Location", url)
    _set_cors(handler)
    handler.end_headers()


def _rodar_indexacao():
    global _indexar_status
    _indexar_status = {"rodando": True, "resultado": None}
    try:
        _indexar_status["resultado"] = indexar_completo()
    except Exception as exc:
        _indexar_status["resultado"] = {"erro": str(exc)}
    finally:
        _indexar_status["rodando"] = False


def _rodar_indexacao_sistema():
    global _indexar_sistema_status
    _indexar_sistema_status = {"rodando": True, "resultado": None}
    try:
        _indexar_sistema_status["resultado"] = indexar_sistema_pedidos()
    except Exception as exc:
        _indexar_sistema_status["resultado"] = {"erro": str(exc)}
    finally:
        _indexar_sistema_status["rodando"] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(204)
            _set_cors(self)
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)

        if path.startswith("/api/") and not _checar_auth_api(self, path):
            return

        if path in ("/", "/index.html"):
            return _servir_arquivo(self, STATIC / "index.html", "text/html; charset=utf-8")

        if path in ("/fila-rp", "/home.html"):
            from config import carregar_config

            cfg = carregar_config()
            rp = cfg.get("rp") or {}
            destino = (
                rp.get("url_home")
                or cfg.get("rp_url_home")
                or "https://luucas031bh.github.io/sistema-pedidos/home.html"
            )
            return _redirect(self, destino)

        if path == "/style.css":
            return _servir_arquivo(self, STATIC / "style.css", "text/css; charset=utf-8")

        if path == "/app.js":
            return _servir_arquivo(
                self, STATIC / "app.js", "application/javascript; charset=utf-8"
            )

        if path == "/api/ping":
            return _json_response(self, 200, {"ok": True})

        if path == "/api/public-client":
            from acesso_remoto import public_client_info

            return _json_response(self, 200, public_client_info())

        if path in ("/adny-public.json", "/static/adny-public.json"):
            return _servir_arquivo(
                self, STATIC / "adny-public.json", "application/json; charset=utf-8"
            )

        if path == "/api/diagnostico-ias":
            from provedores_llm import diagnostico_provedores

            return _json_response(
                self, 200, {"ollama": ollama_online(), "provedores": diagnostico_provedores()}
            )

        if path == "/api/status":
            from config import path_contexto_pasta, path_historico_db

            d = diagnostico_ollama()
            idx = estatisticas_index()
            idx_sp = estatisticas_sistema_index()
            from config import carregar_config

            cfg = carregar_config()
            oll = cfg.get("ollama") or {}
            integracoes = []
            for chave, info in (oll.get("integracoes") or {}).items():
                if isinstance(info, dict):
                    integracoes.append(
                        {
                            "id": chave,
                            "nome": info.get("nome")
                            or ("Claude Code" if chave == "claude" else "OpenClaw"),
                            "modelo": info.get("modelo", oll.get("modelo_integracoes")),
                            "launcher": info.get("launcher", ""),
                            "descricao": info.get(
                                "descricao",
                                "Abre no terminal com Ollama local",
                            ),
                        }
                    )
            modelos = list(dict.fromkeys(d.get("modelos") or []))
            from provedores_llm import diagnostico_provedores

            diag_ias = diagnostico_provedores()
            return _json_response(
                self,
                200,
                {
                    "contexto_pasta": str(path_contexto_pasta()),
                    "historico_db": str(path_historico_db()),
                    "ollama": d.get("ollama", False),
                    "estado": d.get("estado", "offline"),
                    "instalado": d.get("instalado", False),
                    "mensagem": d.get("mensagem", ""),
                    "passos": d.get("passos", []),
                    "modelos": modelos,
                    "modelo_padrao": d.get("modelo_padrao"),
                    "integracoes_ollama": integracoes,
                    "modelos_sugeridos": oll.get("modelos_sugeridos", []),
                    "provedores": __import__(
                        "provedores_llm", fromlist=["listar_provedores"]
                    ).listar_provedores(),
                    "diagnostico_ias": diag_ias,
                    "recomendado": "qwen2.5:7b (suporte a ferramentas)",
                    "indexador": idx,
                    "indexador_sistema": idx_sp,
                    "indexando": _indexar_status.get("rodando", False),
                    "indexando_sistema": _indexar_sistema_status.get(
                        "rodando", False
                    ),
                },
            )

        if path == "/api/clientes":
            return _json_response(
                self, 200, {"clientes": listar_clientes(200)}
            )

        if path == "/api/indexar/status":
            return _json_response(self, 200, _indexar_status)

        if path == "/api/indexar-sistema/status":
            return _json_response(self, 200, _indexar_sistema_status)

        if path == "/api/logs":
            sessao = qs.get("sessao", ["padrao"])[0]
            return _json_response(
                self, 200, {"logs": listar_logs(sessao, 80)}
            )

        if path == "/api/historico":
            sessao = qs.get("sessao", ["padrao"])[0]
            limite = int(qs.get("limite", ["200"])[0])
            limite = max(1, min(limite, 500))
            msgs = carregar_mensagens(sessao, limite=limite)
            return _json_response(
                self,
                200,
                {
                    "sessao": sessao,
                    "mensagens": msgs,
                    "total": contar_mensagens(sessao),
                },
            )

        if path == "/api/config":
            from config import carregar_config

            cfg = carregar_config()
            oll = cfg.get("ollama") or {}
            integracoes = []
            for chave, info in (oll.get("integracoes") or {}).items():
                if isinstance(info, dict):
                    integracoes.append(
                        {
                            "id": chave,
                            "nome": info.get("nome") or chave.replace("_", " ").title(),
                            "modelo": info.get("modelo", oll.get("modelo_integracoes")),
                            "launcher": info.get("launcher", ""),
                            "comando": info.get("comando", ""),
                        }
                    )
            cfg["integracoes_ollama"] = integracoes
            return _json_response(self, 200, cfg)

        if path == "/api/pedidos-snapshot":
            from observador_store import ler_snapshot

            return _json_response(self, 200, ler_snapshot())

        if path == "/api/observador/status":
            from observador import status_observador

            return _json_response(self, 200, status_observador())

        if path.startswith("/static/"):
            rel = path[len("/static/") :]
            arquivo = STATIC / rel
            if arquivo.suffix == ".css":
                return _servir_arquivo(self, arquivo, "text/css; charset=utf-8")
            if arquivo.suffix == ".js":
                return _servir_arquivo(
                    self, arquivo, "application/javascript; charset=utf-8"
                )
        self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path

        if path.startswith("/api/") and not _checar_auth_api(self, path):
            return

        if path == "/api/chat":
            try:
                req = _ler_body(self)
            except json.JSONDecodeError:
                return _json_response(self, 400, {"detail": "JSON invalido"})

            if not ollama_online():
                return _json_response(self, 503, {"detail": mensagem_erro_ollama()})

            sessao = req.get("sessao", "padrao")
            origem = req.get("origem", "web")
            whatsapp_numero = req.get("whatsapp_numero", "") or ""
            if origem == "whatsapp" and not whatsapp_numero:
                whatsapp_numero = sessao.replace("whatsapp_", "").split("_")[0]

            ctx_req = {
                "origem": origem,
                "whatsapp_numero": whatsapp_numero,
            }

            if req.get("limpar_historico"):
                limpar_conversa(sessao)

            msg_user = req.get("mensagem", "")
            salvar_mensagem(sessao, "user", msg_user)
            hist = carregar_mensagens(sessao)

            try:
                from provedores_llm import chat_por_provedor

                provedor = (req.get("provedor") or "adonay").strip().lower()
                modo = (req.get("modo") or "auto").strip().lower()
                if modo == "pergunta":
                    provedor = "ollama"
                elif modo == "acao":
                    provedor = "adonay"
                if origem == "whatsapp" and provedor not in ("adonay", "ollama"):
                    provedor = "adonay"

                out = chat_por_provedor(
                    provedor,
                    msg_user,
                    req.get("modelo"),
                    hist,
                    sessao,
                    permitir_internet=bool(req.get("permitir_internet")),
                    ctx=ctx_req,
                )
            except ConnectionError as exc:
                return _json_response(self, 503, {"detail": str(exc)})
            except FileNotFoundError as exc:
                return _json_response(self, 503, {"detail": str(exc)})
            except Exception as exc:
                return _json_response(
                    self, 500, {"detail": f"Erro no provedor {provedor}: {exc}"}
                )

            resposta = out["resposta"]
            salvar_mensagem(sessao, "assistant", resposta)
            return _json_response(
                self,
                200,
                {
                    "resposta": resposta,
                    "modelo": out["modelo"],
                    "passos": out.get("passos", []),
                    "meta": out.get("meta", {}),
                },
            )

        if path == "/api/limpar":
            qs = parse_qs(urlparse(self.path).query)
            sessao = qs.get("sessao", ["padrao"])[0]
            limpar_conversa(sessao)
            return _json_response(self, 200, {"ok": True})

        if path == "/api/indexar":
            if _indexar_status.get("rodando"):
                return _json_response(
                    self, 409, {"detail": "Indexacao ja em andamento"}
                )
            t = threading.Thread(target=_rodar_indexacao, daemon=True)
            t.start()
            return _json_response(self, 200, {"ok": True, "mensagem": "Indexacao iniciada"})

        if path == "/api/indexar-sistema":
            if _indexar_sistema_status.get("rodando"):
                return _json_response(
                    self, 409, {"detail": "Indexacao do sistema ja em andamento"}
                )
            t = threading.Thread(target=_rodar_indexacao_sistema, daemon=True)
            t.start()
            return _json_response(
                self, 200, {"ok": True, "mensagem": "Indexacao sistema-pedidos iniciada"}
            )

        if path == "/api/upload-pdf":
            return self._upload_pdf()

        if path == "/api/launch-integracao":
            return self._launch_integracao()

        if path == "/api/launch-whatsapp":
            return self._launch_whatsapp()

        if path == "/api/observador/whatsapp":
            return self._observador_whatsapp()

        if path == "/api/observador/tick":
            return self._observador_tick()

        self.send_error(404)

    def _launch_integracao(self):
        try:
            req = _ler_body(self)
        except json.JSONDecodeError:
            return _json_response(self, 400, {"detail": "JSON invalido"})

        bruto = (req.get("id") or req.get("nome") or "").strip().lower()
        nome = None
        if bruto in ("claude", "openclaw"):
            nome = bruto
        elif "claude" in bruto:
            nome = "claude"
        elif "openclaw" in bruto or bruto in ("claw", "open claw"):
            nome = "openclaw"
        if not nome:
            return _json_response(
                self, 404, {"detail": f"Integracao desconhecida: {bruto}"}
            )
        try:
            import servicos_launcher as svc

            if nome == "claude":
                svc.iniciar_claude()
            else:
                svc.iniciar_openclaw()
        except (OSError, FileNotFoundError, ConnectionError) as exc:
            return _json_response(self, 500, {"detail": str(exc)})
        return _json_response(
            self,
            200,
            {"ok": True, "mensagem": f"Abrindo {nome} em nova janela…"},
        )

    def _upload_pdf(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return _json_response(self, 400, {"detail": "Use multipart/form-data"})

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 50_000_000:
            return _json_response(self, 400, {"detail": "Arquivo invalido ou grande demais"})

        UPLOAD_PDF.mkdir(parents=True, exist_ok=True)
        raw = self.rfile.read(length)

        boundary = None
        for part in ctype.split(";"):
            part = part.strip()
            if part.startswith("boundary="):
                boundary = part.split("=", 1)[1].strip('"')
                break
        if not boundary:
            return _json_response(self, 400, {"detail": "Boundary ausente"})

        sep = ("--" + boundary).encode()
        chunks = raw.split(sep)
        for chunk in chunks:
            if b"filename=" not in chunk:
                continue
            header_end = chunk.find(b"\r\n\r\n")
            if header_end < 0:
                continue
            data = chunk[header_end + 4 :]
            if data.endswith(b"\r\n"):
                data = data[:-2]
            if data.endswith(b"--\r\n"):
                data = data[:-4]
            dest = UPLOAD_PDF / f"upload_{len(list(UPLOAD_PDF.glob('*.pdf')))}.pdf"
            dest.write_bytes(data)
            return _json_response(
                self,
                200,
                {"ok": True, "caminho": str(dest.resolve())},
            )
        return _json_response(self, 400, {"detail": "PDF nao encontrado no upload"})

    def _launch_whatsapp(self):
        try:
            import servicos_launcher as svc

            svc.iniciar_whatsapp()
        except (OSError, FileNotFoundError) as exc:
            return _json_response(self, 500, {"detail": str(exc)})
        return _json_response(
            self,
            200,
            {
                "ok": True,
                "mensagem": "Abrindo bot WhatsApp — escaneie o QR na janela Adonay WhatsApp.",
            },
        )

    def _observador_token_ok(self) -> bool:
        from config import cfg_observador_token

        esperado = cfg_observador_token()
        recebido = (self.headers.get("X-Adonay-Observador") or "").strip()
        return bool(esperado) and recebido == esperado

    def _observador_whatsapp(self):
        if not self._observador_token_ok():
            return _json_response(
                self,
                403,
                {"detail": "Token observador invalido (somente bot WhatsApp local)"},
            )
        try:
            req = _ler_body(self)
        except json.JSONDecodeError:
            return _json_response(self, 400, {"detail": "JSON invalido"})

        telefone = (req.get("telefone") or req.get("numero") or "").strip()
        texto = (req.get("texto") or req.get("mensagem") or "").strip()
        if not telefone or not texto:
            return _json_response(
                self, 400, {"detail": "Campos telefone e texto/mensagem obrigatorios"}
            )

        from observador import registrar_whatsapp_evento

        try:
            out = registrar_whatsapp_evento(
                telefone,
                texto,
                timestamp=req.get("timestamp"),
                nome=req.get("nome"),
                classificar=bool(req.get("classificar", True)),
                direcao=(req.get("direcao") or "entrada"),
            )
        except Exception as exc:
            return _json_response(self, 500, {"detail": str(exc)})
        if not out.get("ok"):
            return _json_response(self, 400, out)
        return _json_response(self, 200, out)

    def _observador_tick(self):
        if not self._observador_token_ok():
            return _json_response(
                self,
                403,
                {"detail": "Token observador invalido (somente bot WhatsApp local)"},
            )
        from observador import refresh_snapshot_rp

        try:
            out = refresh_snapshot_rp()
        except Exception as exc:
            return _json_response(self, 500, {"detail": str(exc)})
        return _json_response(self, 200, out)


def main():
    import os

    STATIC.mkdir(exist_ok=True)
    (PASTA / "data").mkdir(exist_ok=True)
    url = f"http://127.0.0.1:{PORTA}"
    print("=" * 50)
    print("  Assistente Local Adonay")
    print("=" * 50)
    print(f"  Abra no navegador: {url}")
    print("  Ollama:", "OK" if ollama_online() else "OFFLINE")
    print("  Ctrl+C para encerrar")
    print("=" * 50)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    except OSError as exc:
        print(f"  ERRO: porta {PORTA} ja esta em uso.")
        print(f"  Feche a janela antiga do servidor ou execute INICIAR_TUDO.bat de novo.")
        print(f"  Detalhe: {exc}")
        raise SystemExit(1) from exc
    if os.environ.get("ADONAY_NO_BROWSER", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    print(f"  Servidor ouvindo em {url}")
    server.serve_forever()


if __name__ == "__main__":
    main()
