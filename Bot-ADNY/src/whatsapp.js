import crypto from 'crypto';

const CHUNK = 4000;

export function verifyMetaSignature(rawBodyBuffer, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBodyBuffer) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBodyBuffer).digest('hex');
  try {
    const a = Buffer.from(signatureHeader, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function chunkText(text) {
  const s = String(text || '');
  if (s.length <= CHUNK) return [s];
  const parts = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + CHUNK, s.length);
    if (end < s.length) {
      const cut = s.lastIndexOf('\n', end);
      if (cut > i + CHUNK * 0.5) end = cut + 1;
    }
    parts.push(s.slice(i, end));
    i = end;
  }
  return parts;
}

export async function sendWhatsAppText(config, to, body) {
  if (!config.metaPhoneNumberId || !config.metaAccessToken) {
    console.warn('[whatsapp] META_PHONE_NUMBER_ID ou META_ACCESS_TOKEN ausente — não enviando.');
    return;
  }
  const url = `https://graph.facebook.com/${config.metaApiVersion}/${config.metaPhoneNumberId}/messages`;
  const chunks = chunkText(body);
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: chunk },
      }),
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error('[whatsapp] erro Graph API:', res.status, txt.slice(0, 500));
    }
  }
}
