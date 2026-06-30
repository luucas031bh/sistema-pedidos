"""Automacao da Calculadora de Malha via navegador (Playwright)."""

from __future__ import annotations

from urllib.parse import urljoin

from config import carregar_config, path_sistema_pedidos

URL_PADRAO = "https://luucas031bh.github.io/sistema-pedidos/CalculadoraMalha/"


def _cfg_calc() -> dict:
    return carregar_config().get("calculadora_malha") or {}


def url_calculadora_malha() -> str:
    cfg = _cfg_calc()
    if cfg.get("url"):
        return str(cfg["url"]).strip()
    base = carregar_config().get("rp_url_base") or "https://luucas031bh.github.io/sistema-pedidos/"
    return urljoin(base.rstrip("/") + "/", "CalculadoraMalha/")


def url_calculadora_local() -> str | None:
    local = path_sistema_pedidos() / "CalculadoraMalha" / "index.html"
    if local.is_file():
        return local.resolve().as_uri()
    return None


def browser_disponivel() -> bool:
    try:
        import playwright  # noqa: F401

        return True
    except ImportError:
        return False


def usar_browser_calculadora() -> bool:
    cfg = _cfg_calc()
    if "usar_browser" in cfg:
        return bool(cfg.get("usar_browser"))
    return True


def headless_calculadora() -> bool:
    return bool(_cfg_calc().get("headless", True))


def _fmt_largura_select(valor: float) -> str:
    return f"{float(valor):.2f}"


def _fmt_numero_campo(valor: float) -> str:
    s = f"{float(valor):.4f}".rstrip("0").rstrip(".")
    if "," not in s and "." in s:
        parte = s.split(".")
        if len(parte) == 2 and len(parte[1]) <= 2:
            return s.replace(".", ",")
    return s.replace(".", ",")


def _limpar_texto_pagina(valor: str) -> str:
    return (valor or "").replace("\xa0", " ").strip()


def formatar_resultado_web(dados: dict, pedido_resumo: str = "") -> str:
    if not dados.get("ok"):
        return f"Calculadora web: {dados.get('erro') or 'falha'}"

    linhas = [
        "**Calculadora de Malha (pagina web real)**",
        f"Fonte: {dados.get('fonte', URL_PADRAO)}",
        "",
    ]
    if pedido_resumo:
        linhas.extend([pedido_resumo, ""])
    inp = dados.get("inputs") or {}
    linhas.extend(
        [
            f"Largura: {inp.get('largura')} m · Tipo: {inp.get('tipo')}",
            f"Rendimento: {inp.get('rendimento_m_por_kg')} m/kg · Preco/kg: {inp.get('preco_por_kg')}",
            "",
        ]
    )
    kpis = dados.get("kpis") or {}
    linhas.extend(
        [
            "**Totais (KPIs da pagina):**",
            f"- Pecas: {_limpar_texto_pagina(kpis.get('pecas', '—'))}",
            f"- Metros: {_limpar_texto_pagina(kpis.get('metros', '—'))}",
            f"- Peso: {_limpar_texto_pagina(kpis.get('kg', '—'))}",
            f"- Custo: {_limpar_texto_pagina(kpis.get('custo', '—'))}",
            "",
            "**Detalhe por tamanho:**",
        ]
    )
    for r in dados.get("linhas") or []:
        if r.get("erro"):
            linhas.append(f"- {r.get('tamanho')}: {r.get('erro')}")
        else:
            linhas.append(
                f"- {r.get('tamanho')}: {r.get('quantidade')} pc → "
                f"{r.get('metros')} m · {r.get('kg')} kg · {r.get('custo')}"
            )
    msg = dados.get("mensagem")
    if msg:
        linhas.extend(["", f"Mensagem da pagina: {msg}"])
    return "\n".join(linhas)


def executar_na_calculadora_web(
    inputs: dict,
    pecas: list[dict],
    *,
    url: str | None = None,
    tentar_local: bool = True,
) -> dict:
    """
    Abre a CalculadoraMalha, preenche campos como usuario, clica Calcular e le KPIs/tabela.
    """
    if not browser_disponivel():
        return {
            "ok": False,
            "erro": "Playwright nao instalado. Execute: pip install playwright && playwright install chromium",
        }

    urls: list[str] = []
    if url:
        urls.append(url)
    else:
        urls.append(url_calculadora_malha())
        if tentar_local:
            loc = url_calculadora_local()
            if loc:
                urls.append(loc)

    erros: list[str] = []
    for alvo in urls:
        try:
            out = _executar_playwright(alvo, inputs, pecas)
            if out.get("ok"):
                return out
            erros.append(f"{alvo}: {out.get('erro')}")
        except Exception as exc:
            erros.append(f"{alvo}: {exc}")

    return {"ok": False, "erro": " | ".join(erros) or "Falha ao abrir calculadora web"}


def _executar_playwright(url: str, inputs: dict, pecas: list[dict]) -> dict:
    from playwright.sync_api import sync_playwright

    largura = _fmt_largura_select(float(inputs["largura"]))
    tipo = str(inputs["tipo"]).strip().lower()
    rendimento = _fmt_numero_campo(float(inputs["rendimento_m_por_kg"]))
    preco = _fmt_numero_campo(float(inputs["preco_por_kg"]))
    pecas_js = [{"tamanho": p["tamanho"], "quantidade": int(p["quantidade"])} for p in pecas if p.get("quantidade")]

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless_calculadora())
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_selector("#formMalha", timeout=30000)

            page.select_option("#largura", value=largura)
            page.evaluate(
                """(tipo) => {
                    const el = document.querySelector('input[name="tipo"][value="' + tipo + '"]');
                    if (!el) throw new Error('Tipo nao encontrado: ' + tipo);
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                tipo,
            )
            page.fill("#rendimento", rendimento)
            page.fill("#precoKg", preco)

            page.evaluate(
                """(lista) => {
                    const tbody = document.getElementById('tbodyPecas');
                    if (!tbody) throw new Error('tbodyPecas nao encontrado');
                    tbody.innerHTML = '';
                    for (const p of lista) {
                        const chave = String(p.tamanho || '').trim().toUpperCase();
                        const qtd = Number(p.quantidade) || 0;
                        if (!chave || qtd <= 0) continue;
                        const tr = document.createElement('tr');
                        tr.innerHTML =
                            '<td>' + chave + '</td>' +
                            '<td><input type="number" min="0" step="1" value="' + qtd +
                            '" data-tamanho="' + chave + '" class="input-quantidade"></td>' +
                            '<td class="td-action"></td>';
                        tbody.appendChild(tr);
                    }
                }""",
                pecas_js,
            )

            page.click("#btnCalcular")

            page.wait_for_function(
                """() => {
                    const m = document.getElementById('kpiMetros');
                    const msg = document.getElementById('mensagemResultado');
                    if (msg && msg.classList.contains('error') && msg.style.display !== 'none') return true;
                    return m && m.textContent && m.textContent.trim() !== '—';
                }""",
                timeout=15000,
            )

            msg_el = page.query_selector("#mensagemResultado")
            mensagem = ""
            if msg_el and msg_el.is_visible():
                mensagem = (msg_el.inner_text() or "").strip()
                if "error" in (msg_el.get_attribute("class") or ""):
                    browser.close()
                    return {"ok": False, "erro": mensagem or "Erro de validacao na pagina", "fonte": url}

            kpis = {
                "pecas": _limpar_texto_pagina(page.inner_text("#kpiPecas")),
                "metros": _limpar_texto_pagina(page.inner_text("#kpiMetros")),
                "kg": _limpar_texto_pagina(page.inner_text("#kpiKg")),
                "custo": _limpar_texto_pagina(page.inner_text("#kpiCusto")),
            }

            linhas = page.evaluate(
                """() => {
                    const out = [];
                    document.querySelectorAll('#tbodyResultados tr').forEach(tr => {
                        const c = tr.querySelectorAll('td');
                        if (c.length >= 7) {
                            out.push({
                                tamanho: c[0].innerText.trim(),
                                quantidade: c[1].innerText.trim(),
                                pecas_por_metro: c[2].innerText.trim(),
                                metros: c[3].innerText.trim(),
                                kg: c[4].innerText.trim(),
                                custo: c[5].innerText.trim(),
                                custo_peca: c[6].innerText.trim(),
                            });
                        } else if (c.length >= 2 && c[0] && c[1]) {
                            out.push({
                                tamanho: c[0].innerText.trim(),
                                quantidade: c[1].innerText.trim(),
                                erro: c[2] ? c[2].innerText.trim() : 'Erro',
                            });
                        }
                    });
                    return out;
                }"""
            )

            browser.close()
            return {
                "ok": True,
                "fonte": url,
                "inputs": inputs,
                "pecas": pecas_js,
                "kpis": kpis,
                "linhas": linhas or [],
                "mensagem": mensagem,
            }
        except Exception:
            browser.close()
            raise
