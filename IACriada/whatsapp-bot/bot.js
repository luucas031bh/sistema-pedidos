/**
 * Bot WhatsApp Adonay — ponte para IA local (sem API Meta).
 * Requer: assistente Python em http://127.0.0.1:8765
 */
import { config } from "./lib/config.js";
import { conectarWhatsApp } from "./lib/connection.js";
import {
  extrairTextoMensagem,
  limparGatilho,
  mensagemDeveIgnorar,
  mensagemEhGatilho,
} from "./lib/filters.js";
import { enviarParaIA } from "./lib/ai.js";
import { responderComDigitacao } from "./lib/responder.js";
import { log } from "./lib/logger.js";
import { normalizarNumero, usuarioEhAdmin } from "./lib/permissions.js";

const processando = new Set();

async function processarMensagem(sock, msg) {
  if (mensagemDeveIgnorar(msg)) return;

  const jid = msg.key.remoteJid;
  const id = msg.key.id;
  const chave = `${jid}:${id}`;
  if (processando.has(chave)) return;
  processando.add(chave);
  setTimeout(() => processando.delete(chave), 60_000);

  const textoBruto = extrairTextoMensagem(msg);
  const isGroup = jid.endsWith("@g.us");

  if (!mensagemEhGatilho(textoBruto, msg)) {
    log.debug("Ignorada (sem gatilho)", { jid, preview: textoBruto.slice(0, 40) });
    return;
  }

  const numero = normalizarNumero(msg.key.participant || msg.key.remoteJid);
  const admin = usuarioEhAdmin(numero);
  const comando = limparGatilho(textoBruto);

  if (!comando) {
    await responderComDigitacao(
      sock,
      jid,
      "Oi! Use ADNY, @IA, Agente ou IA seguido da sua pergunta.\nEx: ADNY quais pedidos estao em insumo?"
    );
    return;
  }

  log.info("Gatilho detectado", {
    jid,
    grupo: isGroup,
    numero,
    admin,
    comando: comando.slice(0, 80),
  });

  await responderComDigitacao(sock, jid, "⏳ Consultando…");

  const ia = await enviarParaIA(comando, {
    numero,
    chatId: jid,
    isGroup,
    sessao: isGroup ? `whatsapp_g_${jid}_${numero}` : `whatsapp_${numero}`,
  });

  await responderComDigitacao(sock, jid, ia.resposta);
  log.info("Resposta enviada", { jid, ok: ia.ok });
}

async function main() {
  log.info("Iniciando bot WhatsApp Adonay", {
    ia: config.localAiUrl,
    gatilhos: config.triggers,
    admins: config.adminNumbers.length,
  });

  await conectarWhatsApp(processarMensagem);
}

main().catch((err) => {
  log.error("Falha fatal", { err: String(err) });
  process.exit(1);
});
