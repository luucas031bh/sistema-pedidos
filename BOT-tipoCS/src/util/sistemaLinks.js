/**
 * URL para abrir um pedido no sistema web (index.html?id=...).
 * @param {object} config
 * @param {string|number} idPedido
 */
function buildPedidoUrl(config, idPedido) {
  const base = String(config.sistemaBaseUrl || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const id = encodeURIComponent(String(idPedido || '').trim());
  if (!id) return '';
  return `${base}/index.html?id=${id}`;
}

module.exports = { buildPedidoUrl };
