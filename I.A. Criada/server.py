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


def _json_response(handler, status, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
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
    handler.end_headers()
    handler.wfile.write(data)


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

    def do_GET(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)

        if path in ("/", "/index.html"):
            return _servir_arquivo(self, STATIC / "index.html", "text/html; charset=utf-8")

        if path == "/api/status":
            from config import path_contexto_pasta, path_historico_db

            d = diagnostico_ollama()
            idx = estatisticas_index()
            idx_sp = estatisticas_sistema_index()
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
                    "modelos": d.get("modelos", []),
                    "modelo_padrao": d.get("modelo_padrao"),
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

            return _json_response(self, 200, carregar_config())

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
                from agente import (
                    _tentar_resposta_rp_direta,
                    _tentar_resposta_sistema_codigo,
                    chat_com_ferramentas,
                    resolver_modelo,
                )

                modelo = resolver_modelo(req.get("modelo"))
                if not modelo:
                    raise ConnectionError(mensagem_erro_ollama())

                from rp_router import tema_parece_rp

                forcar_rp = origem == "whatsapp" and tema_parece_rp(msg_user)
                out = _tentar_resposta_sistema_codigo(msg_user, modelo, hist)
                if out is None:
                    out = _tentar_resposta_rp_direta(
                        msg_user,
                        modelo,
                        historico=hist,
                        sessao=sessao,
                        forcar=forcar_rp,
                    )
                if out is None:
                    out = chat_com_ferramentas(
                        hist,
                        req.get("modelo"),
                        permitir_internet=bool(req.get("permitir_internet")),
                        sessao=sessao,
                        ctx=ctx_req,
                    )
            except ConnectionError as exc:
                return _json_response(self, 503, {"detail": str(exc)})

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

        self.send_error(404)

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


def main():
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
    webbrowser.open(url)
    server = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
