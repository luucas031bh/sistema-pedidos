import { shouldHandle, runCommand } from './commands.js';
import { verifyMetaSignature, sendWhatsAppText } from './whatsapp.js';
import { rateAllowed } from './rateLimit.js';

function allowChat(config, msg) {
  const groupId = msg.group_id ? String(msg.group_id) : '';
  if (!config.allowlistStrict) return true;
  if (!groupId) {
    console.log('[webhook] ignorado: allowlist ativa mas mensagem sem group_id (DM ou payload antigo).');
    return false;
  }
  return config.allowedGroupIds.has(groupId);
}

function matchPhoneNumberId(config, metadata) {
  if (!config.metaPhoneNumberId || !metadata?.phone_number_id) return true;
  return String(metadata.phone_number_id) === String(config.metaPhoneNumberId);
}

export function verifyWebhookGet(config, req, res) {
  const q = req.query || {};
  const hub = q.hub && typeof q.hub === 'object' ? q.hub : null;
  const mode = hub?.mode ?? q['hub.mode'];
  const token = hub?.verify_token ?? q['hub.verify_token'];
  const challenge = hub?.challenge ?? q['hub.challenge'];
  if (mode === 'subscribe' && token === config.metaVerifyToken && challenge) {
    return res.status(200).send(String(challenge));
  }
  console.warn('[webhook] verificação falhou:', { mode, tokenMatch: token === config.metaVerifyToken });
  return res.sendStatus(403);
}

export async function handleWebhookPost(config, req, res) {
  const raw = req.body;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw));

  if (config.metaAppSecret) {
    const sig = req.get('X-Hub-Signature-256') || '';
    if (!verifyMetaSignature(buf, sig, config.metaAppSecret)) {
      console.warn('[webhook] assinatura inválida ou ausente');
      return res.sendStatus(403);
    }
  }

  let body;
  try {
    body = JSON.parse(buf.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  if (config.logWebhookBody) {
    console.log('[webhook] body:', JSON.stringify(body).slice(0, 4000));
  }

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  res.sendStatus(200);

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value;
        if (!v || !matchPhoneNumberId(config, v.metadata)) continue;

        for (const msg of v.messages || []) {
          if (msg.type !== 'text' || !msg.text?.body) continue;
          if (!allowChat(config, msg)) continue;

          const bodyText = String(msg.text.body || '').trim();
          if (!shouldHandle(config, bodyText)) continue;

          const replyTo = msg.group_id ? String(msg.group_id) : String(msg.from || '');
          if (!replyTo) continue;

          if (!rateAllowed(replyTo, config.rateLimitMax)) {
            await sendWhatsAppText(
              config,
              replyTo,
              'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.',
            );
            continue;
          }

          let reply;
          try {
            reply = await runCommand(config, bodyText);
          } catch (err) {
            console.error('[webhook] comando:', err);
            reply = `Erro ao consultar o sistema: ${err.message || err}`;
          }
          await sendWhatsAppText(config, replyTo, reply);
        }
      }
    }
  } catch (err) {
    console.error('[webhook] processamento:', err);
  }
}
