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

    function menuCompacto() {
        var slot = document.getElementById('uiNavSlot');
        var side = slot && slot.closest('.side');
        if (!side || document.getElementById('uiMobileMenuToggle')) return;
        var brand = side.querySelector('.side-brand');
        var tools = side.querySelector('.home-tools');
        var bar = document.createElement('div');
        bar.className = 'ui-mobile-menu-bar';
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'uiMobileMenuToggle';
        toggle.className = 'ui-mobile-menu-toggle';
        toggle.setAttribute('aria-controls', 'uiMobileMenuPanel');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menu de navegação');
        var icon = document.createElement('span');
        icon.className = 'ui-menu-lines';
        icon.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 3; i++) icon.appendChild(document.createElement('span'));
        var label = document.createElement('span');
        label.textContent = 'Menu';
        toggle.appendChild(icon);
        toggle.appendChild(label);
        if (brand) bar.appendChild(brand);
        bar.appendChild(toggle);
        var panel = document.createElement('div');
        panel.id = 'uiMobileMenuPanel';
        panel.className = 'ui-mobile-menu-panel';
        panel.appendChild(slot);
        if (tools) panel.appendChild(tools);
        side.appendChild(bar);
        side.appendChild(panel);
        var media = window.matchMedia('(max-width: 1024px)');
        var expanded = false;
        function show(open, restoreFocus) {
            expanded = media.matches && open;
            panel.hidden = media.matches && !expanded;
            toggle.hidden = !media.matches;
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggle.setAttribute('aria-label', expanded ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
            label.textContent = expanded ? 'Fechar' : 'Menu';
            side.classList.toggle('ui-menu-open', expanded);
            if (restoreFocus) toggle.focus();
            encaixar();
        }
        toggle.addEventListener('click', function () { show(!expanded, false); });
        panel.addEventListener('click', function (event) {
            if (event.target.closest('a') && media.matches) show(false, false);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && expanded) show(false, true);
        });
        document.addEventListener('pointerdown', function (event) {
            if (expanded && !side.contains(event.target)) show(false, false);
        });
        if (media.addEventListener) media.addEventListener('change', function () { show(false, false); });
        else media.addListener(function () { show(false, false); });
        show(false, false);
    }

    function montar() {
        if (document.getElementById("adonayNav")) {
            menuCompacto();
            return;
        }
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
        menuCompacto();
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
