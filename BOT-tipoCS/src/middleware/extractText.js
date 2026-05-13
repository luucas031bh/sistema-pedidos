const { extractMessageContent } = require('@whiskeysockets/baileys');

/**
 * Texto visível da mensagem (inclui unwrap de ephemeral, viewOnce, editedMessage, etc.).
 * Sem isso, o corpo pode ficar vazio e o bot ignora a mensagem antes mesmo do log.
 */
function extractMessageText(message) {
  if (!message?.message) return '';

  const m = extractMessageContent(message.message);
  if (!m) return '';

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

module.exports = { extractMessageText };
