(function () {
    'use strict';
    const nativeFetch = window.fetch.bind(window);
    const storageKey = 'adonay.session.v1';
    let session = '';
    let loginState = null;
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const base = new URL('.', document.currentScript.src);
    const endpoint = () => new URL(window.CONFIG.APPS_SCRIPT_URL);
    const message = text => { const el = document.getElementById('adonay-auth-status'); if (el) el.textContent = text; };
    const readSession = () => { try { return localStorage.getItem(storageKey) || ''; } catch (_) { return ''; } };
    function forgetSession() {
        session = '';
        try { localStorage.removeItem(storageKey); } catch (_) { /* Sessão apenas em memória. */ }
    }
    async function rpc(action, dados, token) {
        const response = await nativeFetch(endpoint().href, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store',
            body: JSON.stringify({ action, dados: dados || {}, authSession: token || '' })
        });
        if (!response.ok) throw new Error('Não foi possível conectar ao sistema.');
        const data = await response.json();
        if (!data || typeof data.sucesso !== 'boolean') throw new Error('O serviço de login ainda não está publicado.');
        return data;
    }
    function showLogin() {
        document.documentElement.removeAttribute('data-adonay-auth');
        let overlay = document.getElementById('adonay-auth');
        if (!overlay) {
            overlay = document.createElement('main');
            overlay.id = 'adonay-auth';
            overlay.innerHTML = '<section class="auth-card"><div class="auth-brand">ADONAY CONFECÇÃO</div>' +
                '<h1>Entrar no sistema</h1><p>Acesso exclusivo para as contas autorizadas.</p>' +
                '<button id="adonay-auth-login" type="button" disabled>Entrar com Google</button>' +
                '<span id="adonay-auth-status" class="auth-status" role="status" aria-live="polite">Verificando acesso…</span></section>';
            document.body.appendChild(overlay);
            document.getElementById('adonay-auth-login').addEventListener('click', beginLogin);
        }
        overlay.hidden = false;
        overlay.style.display = '';
    }
    function acceptSession(data, token) {
        session = token;
        try { localStorage.setItem(storageKey, token); } catch (_) { /* Funciona sem persistência. */ }
        document.getElementById('adonay-auth')?.remove();
        document.documentElement.setAttribute('data-adonay-auth', 'ready');
        let out = document.getElementById('adonay-auth-out');
        if (!out) {
            out = document.createElement('button'); out.id = 'adonay-auth-out'; out.type = 'button'; out.textContent = 'Sair';
            out.title = 'Sair de ' + data.email;
            out.addEventListener('click', async () => {
                out.disabled = true;
                try {
                    const result = await rpc('authLogout', {}, session);
                    if (!result.sucesso && result.code !== 'AUTH_REQUIRED') throw new Error(result.erro);
                    forgetSession(); location.reload();
                } catch (_) { out.disabled = false; alert('Não foi possível encerrar a sessão no servidor. Verifique sua conexão e tente novamente.'); }
            });
            document.body.appendChild(out);
        }
        resolveReady();
    }
    function randomVerifier() {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    }
    async function prepareLogin() {
        loginState = null;
        const button = document.getElementById('adonay-auth-login');
        button.disabled = true;
        const verifier = randomVerifier();
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        const challenge = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
        const start = await rpc('authStart', { challenge });
        if (!start.sucesso) throw new Error(start.erro || 'Não foi possível preparar o login.');
        await loadGoogle();
        loginState = { verifier, state: start.state, clientId: start.clientId };
        button.disabled = false;
        message('Use sua conta autorizada do Google.');
    }
    let googlePromise;
    function loadGoogle() {
        if (window.google?.accounts?.oauth2) return Promise.resolve();
        if (!googlePromise) googlePromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
            script.onload = resolve; script.onerror = () => reject(new Error('Não foi possível carregar o login Google. Recarregue a página.'));
            document.head.appendChild(script);
        });
        return googlePromise;
    }
    function beginLogin() {
        if (!loginState) return;
        const attempt = loginState;
        const button = document.getElementById('adonay-auth-login');
        button.disabled = true;
        const retry = async text => {
            message(text);
            try { await prepareLogin(); message(text); } catch (e) { message(e.message); }
        };
        const client = google.accounts.oauth2.initCodeClient({
            client_id: attempt.clientId, scope: 'openid email', ux_mode: 'popup', state: attempt.state,
            select_account: true, include_granted_scopes: false,
            callback: async result => {
                if (result.error || !result.code || result.state !== attempt.state) return retry('Login não concluído. Tente novamente.');
                message('Confirmando acesso…');
                try {
                    const data = await rpc('authExchange', { code: result.code, state: attempt.state, verifier: attempt.verifier });
                    if (!data.sucesso) return retry(data.erro || 'Acesso não autorizado.');
                    acceptSession(data, data.session);
                } catch (e) { await retry(e.message); }
            },
            error_callback: () => retry('A janela de login foi fechada ou bloqueada. Tente novamente.')
        });
        client.requestCode();
    }
    // Todas as chamadas ao serviço passam por POST autenticado; tokens nunca vão na URL.
    window.fetch = async function (input, init) {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        if (!window.CONFIG) return nativeFetch(input, init);
        const api = endpoint();
        if (url.origin !== api.origin || url.pathname !== api.pathname) return nativeFetch(input, init);
        await ready;
        const options = init || {};
        const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        let payload;
        if (method === 'GET') {
            const dados = Object.fromEntries(url.searchParams);
            payload = { action: dados.action || dados.acao || 'online', dados };
        } else {
            const body = options.body !== undefined ? options.body : await input.clone().text();
            payload = JSON.parse(body);
        }
        payload.authSession = session;
        const response = await nativeFetch(api.href, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            cache: 'no-store', signal: options.signal,
            body: JSON.stringify(payload)
        });
        let data;
        try { data = await response.clone().json(); } catch (_) { return response; }
        if (data.code === 'AUTH_REQUIRED') {
            forgetSession(); location.reload();
            throw new Error('Sua sessão expirou. Entre novamente.');
        }
        return response;
    };
    window.addEventListener('storage', event => {
        if (event.key === storageKey && event.newValue !== session) location.reload();
    });
    async function initialize() {
        showLogin();
        try {
            session = readSession();
            if (session) {
                const check = await rpc('authCheck', {}, session);
                if (check.sucesso) { acceptSession(check, session); return; }
                if (check.code !== 'AUTH_REQUIRED') throw new Error(check.erro || 'Falha ao verificar sessão.');
                forgetSession();
            }
            await prepareLogin();
        } catch (e) { message(e.message + ' Recarregue a página para tentar novamente.'); }
    }
    if (!window.CONFIG) {
        const config = document.createElement('script'); config.src = new URL('config.js', base).href;
        config.onload = initialize;
        config.onerror = () => { showLogin(); message('Não foi possível carregar o sistema. Recarregue a página.'); };
        document.head.appendChild(config);
    } else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();
