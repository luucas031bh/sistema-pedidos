const MAX_CHUNK = 3800;

async function sendText(sock, chatId, text, options = {}) {
  if (!sock) throw new Error('Socket não inicializado');
  if (!chatId) throw new Error('chatId obrigatório');
  if (!text) return;

  const s = String(text);
  if (s.length <= MAX_CHUNK) {
    return sock.sendMessage(chatId, { text: s }, options);
  }
  for (let i = 0; i < s.length; i += MAX_CHUNK) {
    const part = s.slice(i, i + MAX_CHUNK);
    const header = i > 0 ? `_(continuação ${Math.floor(i / MAX_CHUNK) + 1})_\n` : '';
    await sock.sendMessage(chatId, { text: header + part }, options);
  }
}

/**
 * Envia PDF no chat (ex.: OS/GP gerado no Apps Script).
 */
async function sendPdfDocument(sock, chatId, buffer, fileName, options = {}) {
  if (!sock) throw new Error('Socket não inicializado');
  if (!chatId) throw new Error('chatId obrigatório');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return;
  const name = String(fileName || 'documento.pdf').slice(0, 200);
  return sock.sendMessage(
    chatId,
    {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: name,
    },
    options,
  );
}

module.exports = { sendText, sendPdfDocument, MAX_CHUNK };
