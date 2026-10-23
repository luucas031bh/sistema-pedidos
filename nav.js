/**
 * Barra de navegação entre as telas do sistema.
 * Só cria links. Não lê nem grava pedido.
 */
(function () {
    var ITENS = [
        { id: "inicio", rotulo: "Início", arquivo: "home.html" },
        { id: "pedido", rotulo: "Pedido", arquivo: "index.html" },
        { id: "relatorio", rotulo: "Relatórios", arquivo: "relatorio.html" },
        { id: "malha", rotulo: "Malha", arquivo: "CalculadoraMalha/" },
        { id: "cores", rotulo: "Cores", arquivo: "ROANTONE/" },
        { id: "fornecedores", rotulo: "Fornecedores", arquivo: "fornecedores.html" },
        { id: "lista", rotulo: "Lista", arquivo: "ListaPreencher/lista.html" }
    ];

    function caminho() {
        return decodeURIComponent(window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
    }

    function prefixo() {
        var p = caminho();
        if (p.indexOf("/calculadoramalha/") !== -1 || p.indexOf("/roantone/") !== -1 || p.indexOf("/listapreencher/") !== -1) {
            return "../";
        }
        return "";
    }

    function secaoAtual() {
        var p = caminho();
        if (p.indexOf("/calculadoramalha") !== -1) return "malha";
        if (p.indexOf("/roantone") !== -1) return "cores";
        if (p.indexOf("/listapreencher") !== -1 || p.endsWith("lista.html")) return "lista";
        if (p.endsWith("relatorio.html")) return "relatorio";
        if (p.endsWith("fornecedores.html")) return "fornecedores";
        if (p.endsWith("index.html")) return "pedido";
        if (p.endsWith("home.html") || p.endsWith("/")) return "inicio";
        return "inicio";
    }

    function montar() {
        if (document.getElementById("adonayNav")) return;
        var atual = secaoAtual();
        var base = prefixo();
        var nomeAtual = "Início";
        var nav = document.createElement("nav");
        nav.id = "adonayNav";
        nav.setAttribute("aria-label", "Seções do sistema");

        var onde = document.createElement("p");
        onde.className = "adonay-nav-onde";

        var links = document.createElement("div");
        links.className = "adonay-nav-links";

        ITENS.forEach(function (item) {
            var a = document.createElement("a");
            a.href = base + item.arquivo;
            a.textContent = item.rotulo;
            if (item.id === atual) {
                a.setAttribute("aria-current", "page");
                nomeAtual = item.rotulo;
            }
            links.appendChild(a);
        });

        onde.innerHTML = "Você está em <strong></strong>";
        onde.querySelector("strong").textContent = nomeAtual;

        nav.appendChild(onde);
        nav.appendChild(links);
        document.body.classList.add("has-adonay-nav");
        var destino = document.getElementById("uiNavSlot") || document.body;
        destino.insertBefore(nav, destino.firstChild);
        encaixar();
        window.addEventListener("resize", encaixar);

        var marcado = links.querySelector('[aria-current="page"]');
        if (marcado && marcado.scrollIntoView) {
            marcado.scrollIntoView({ inline: "center", block: "nearest" });
        }
    }

    function encaixar() {
        var nav = document.getElementById("adonayNav");
        if (!nav) return;
        document.documentElement.style.setProperty("--adonay-nav-h", nav.offsetHeight + "px");
    }

    if (document.body) montar();
    else document.addEventListener("DOMContentLoaded", montar);
})();
