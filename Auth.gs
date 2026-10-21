// Configurar AUTH_GOOGLE_CLIENT_ID e AUTH_GOOGLE_CLIENT_SECRET nas propriedades
// do script. Nunca colocar o segredo em config.js ou no repositório.
// A lista privada fica nas propriedades do servidor; nunca é confiada ao navegador.
var AUTH_ALLOWED_EMAILS = (function () {
  try {
    var list = JSON.parse(PropertiesService.getScriptProperties().getProperty('AUTH_ALLOWED_EMAILS') || '[]');
    return Array.isArray(list) ? list.filter(function(email) { return typeof email === 'string'; }) : [];
  } catch (e) { return []; }
})();
var AUTH_SITE_ORIGIN = 'https://luucas031bh.github.io';
var AUTH_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function authFail_(code, message) {
  return { sucesso: false, code: code, erro: message };
}
function authHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function authRandom_() { return Utilities.getUuid() + Utilities.getUuid(); }
function authConfig_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('AUTH_GOOGLE_CLIENT_ID');
  var secret = props.getProperty('AUTH_GOOGLE_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Login Google ainda não configurado.');
  return { id: id, secret: secret };
}
function authStart_(data) {
  var conf = authConfig_();
  if (!/^[a-f0-9]{64}$/.test(String(data.challenge || ''))) {
    return authFail_('AUTH_INVALID', 'Não foi possível iniciar o login.');
  }
  var state = authRandom_();
  CacheService.getScriptCache().put('login:' + authHash_(state), data.challenge, 600);
  return { sucesso: true, clientId: conf.id, state: state };
}
function authExchange_(data) {
  var conf = authConfig_();
  var state = String(data.state || '');
  var verifier = String(data.verifier || '');
  var code = String(data.code || '');
  if (state.length > 200 || verifier.length < 32 || verifier.length > 200 || !code || code.length > 4096) {
    return authFail_('AUTH_INVALID', 'Login inválido. Tente novamente.');
  }
  var cache = CacheService.getScriptCache();
  var key = 'login:' + authHash_(state);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var challenge = cache.get(key);
    if (!challenge || challenge !== authHash_(verifier)) {
      return authFail_('AUTH_INVALID', 'Login expirado. Tente novamente.');
    }
    cache.remove(key);
  } finally { lock.releaseLock(); }
  // O código é trocado diretamente com o Google usando o segredo do servidor.
  // No GIS popup, redirect_uri é a origem da página que abriu o login.
  var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { code: code, client_id: conf.id, client_secret: conf.secret,
      redirect_uri: AUTH_SITE_ORIGIN, grant_type: 'authorization_code' }
  });
  if (tokenResponse.getResponseCode() !== 200) {
    return authFail_('AUTH_INVALID', 'O Google não confirmou o login. Tente novamente.');
  }
  var tokens = JSON.parse(tokenResponse.getContentText());
  if (!tokens.access_token) return authFail_('AUTH_INVALID', 'Login inválido.');
  var infoResponse = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + tokens.access_token }, muteHttpExceptions: true
  });
  if (infoResponse.getResponseCode() !== 200) return authFail_('AUTH_INVALID', 'Login inválido.');
  var user = JSON.parse(infoResponse.getContentText());
  var email = String(user.email || '').toLowerCase();
  if (user.email_verified !== true || !user.sub || AUTH_ALLOWED_EMAILS.indexOf(email) === -1) {
    return authFail_('AUTH_DENIED', 'Esta conta não está autorizada a acessar o sistema.');
  }
  var token = authRandom_();
  var session = { email: email, sub: user.sub, expiresAt: Date.now() + AUTH_SESSION_MS };
  PropertiesService.getScriptProperties().setProperty('session:' + authHash_(token), JSON.stringify(session));
  return { sucesso: true, session: token, email: email, expiresAt: session.expiresAt };
}
function authSession_(token) {
  if (typeof token !== 'string' || token.length < 64 || token.length > 200) return null;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
  var props = PropertiesService.getScriptProperties();
  var key = 'session:' + authHash_(token);
  var raw = props.getProperty(key);
  if (!raw) return null;
  var session;
  try { session = JSON.parse(raw); } catch (e) { return null; }
  if (!session.sub || AUTH_ALLOWED_EMAILS.indexOf(session.email) === -1 || !(session.expiresAt > Date.now())) {
    props.deleteProperty(key);
    return null;
  }
  // Renova no máximo uma vez ao dia para reduzir gravações nas propriedades.
  if (session.expiresAt - Date.now() < AUTH_SESSION_MS - 86400000) {
    session.expiresAt = Date.now() + AUTH_SESSION_MS;
    props.setProperty(key, JSON.stringify(session));
  }
  return session;
  } finally { lock.releaseLock(); }
}
function authLogout_(token) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
  PropertiesService.getScriptProperties().deleteProperty('session:' + authHash_(token));
  return { sucesso: true };
  } finally { lock.releaseLock(); }
}
// Executar apenas no editor se for necessário desconectar todos os aparelhos.
function revogarTodasSessoesAdonay() {
  var props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function(key) {
    if (key.indexOf('session:') === 0) props.deleteProperty(key);
  });
}
// Executar no editor uma vez para autorizar a conexão HTTPS necessária ao login.
// Não consulta pedidos, não altera dados e não usa credenciais de usuários.
function verificarConexaoLoginGoogle() {
  var response = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', { muteHttpExceptions: true });
  if (response.getResponseCode() !== 401) throw new Error('Não foi possível verificar a conexão com o Google.');
  return 'Conexão Google disponível. Nenhum dado de pedido foi alterado.';
}
