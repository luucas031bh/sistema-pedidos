# -*- coding: utf-8 -*-
from pathlib import Path
from fpdf import FPDF

SAIDA = Path(__file__).parent / "Documentacao_Assistente_Local.pdf"
FONT_REG = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")


class DocPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_margins(20, 20, 20)
        self.set_auto_page_break(auto=True, margin=20)
        self._font = "Helvetica"
        if FONT_REG.is_file():
            self.add_font("Arial", "", str(FONT_REG))
            self.add_font("Arial", "B", str(FONT_BOLD))
            self._font = "Arial"

    def _set(self, style="", size=11):
        self.set_font(self._font, style, size)

    def titulo(self, texto, nivel=1):
        self._set("B", {1: 18, 2: 14, 3: 12}[nivel])
        self.multi_cell(self.epw, 8, texto)
        self.ln(2)

    def paragrafo(self, texto):
        self._set("", 11)
        self.multi_cell(self.epw, 6, texto)
        self.ln(2)

    def item(self, texto):
        self._set("", 11)
        self.multi_cell(self.epw, 6, f"  - {texto}")

    def codigo(self, texto):
        self._set("", 10)
        self.set_fill_color(240, 240, 240)
        self.multi_cell(self.epw, 5, texto, fill=True)
        self.ln(2)


def gerar():
    pdf = DocPDF()
    pdf.add_page()
    pdf.titulo("Assistente Local", 1)
    pdf.paragrafo(
        "Documentação do sistema: chat no navegador com IA local (Ollama), "
        "capaz de listar pastas, buscar arquivos e abrir programas no Windows, "
        "sem enviar dados para a nuvem."
    )
    pdf.paragrafo(f"Pasta do projeto: {Path(__file__).parent}")
    pdf.ln(3)

    secoes = [
        ("1. Visão geral", [
            "O Assistente Local roda inteiramente no seu computador. A interface lembra o ChatGPT (tema escuro). O cérebro da IA é o Ollama, que executa modelos como llama3.1 na GPU.",
            "Objetivo: ajudar a navegar no PC — encontrar aplicativos e arquivos e abri-los. O sistema NÃO salva, apaga, renomeia nem modifica arquivos.",
        ]),
        ("2. Requisitos", [
            "Windows 10 ou superior",
            "Python 3.10 ou superior",
            "Ollama instalado e em execução",
            "Modelo: ollama pull llama3.1",
            "Navegador web",
        ]),
        ("3. Estrutura de arquivos", []),
    ]
    for tit, blocos in secoes:
        pdf.titulo(tit, 2)
        for b in blocos:
            if tit.startswith("2."):
                pdf.item(b)
            else:
                pdf.paragrafo(b)

    pdf.codigo(
        "INICIAR.bat, server.py, agente.py, ferramentas_pc.py\n"
        "static/index.html, style.css, app.js"
    )
    pdf.paragrafo("Não são necessários pacotes pip. Apenas biblioteca padrão do Python.")

    pdf.add_page()
    pdf.titulo("4. Arquitetura", 2)
    pdf.codigo(
        "Navegador -> server.py:8765 -> agente.py -> Ollama:11434\n"
        "                          \\-> ferramentas_pc.py -> Windows"
    )

    pdf.titulo("5. Como iniciar", 2)
    for i in [
        "Abra o app Ollama",
        "Duplo clique em INICIAR.bat",
        "Acesse http://127.0.0.1:8765",
        "Painel: Ollama OK · llama3.1",
    ]:
        pdf.item(i)

    pdf.titulo("6. API (server.py)", 2)
    for r in [
        "GET / — página do chat",
        "GET /api/status — estado do Ollama",
        "POST /api/chat — enviar mensagem",
        "POST /api/limpar — nova conversa",
    ]:
        pdf.item(r)
    pdf.paragrafo("Histórico em memória RAM; perdido ao fechar o servidor.")

    pdf.add_page()
    pdf.titulo("7. Agente (agente.py)", 2)
    pdf.paragrafo(
        "Conecta ao Ollama com tool calling. Prompt em português. Modelos preferidos: "
        "llama3.1, llama3.2, qwen2.5, mistral. Máximo 8 ações por mensagem."
    )

    pdf.titulo("8. Ferramentas (ferramentas_pc.py)", 2)
    tools = [
        "listar_pasta — lista até 80 itens",
        "buscar_arquivo — busca por nome (25 resultados)",
        "abrir_programa — executa .exe ou atalho",
        "abrir_arquivo — abre com app padrão",
        "buscar_internet — DuckDuckGo (se permitir internet)",
    ]
    for t in tools:
        pdf.item(t)

    pdf.titulo("9. Interface web", 2)
    pdf.paragrafo(
        "Sidebar: status, internet, modelo, nova conversa. Chips de atalho. "
        "Log de ferramentas abaixo das respostas da IA."
    )

    pdf.titulo("10. Segurança", 2)
    pdf.paragrafo(
        "Dados locais. Servidor só em 127.0.0.1. Internet opcional (só abre busca)."
    )

    pdf.titulo("11. Limitações", 2)
    for x in [
        "Histórico não persiste em disco",
        "Busca de .exe pode ser lenta",
        "Internet não lê páginas",
    ]:
        pdf.item(x)

    pdf.titulo("12. Problemas comuns", 2)
    for x in [
        "Ollama offline: abrir app na bandeja",
        "Sem modelo: ollama pull llama3.1",
        "Servidor offline: INICIAR.bat",
    ]:
        pdf.item(x)

    pdf.ln(8)
    pdf._set("", 9)
    pdf.cell(0, 6, "Fim da documentação", align="C")
    pdf.output(str(SAIDA))
    return SAIDA


if __name__ == "__main__":
    p = gerar()
    print(f"PDF: {p} ({p.stat().st_size} bytes)")
