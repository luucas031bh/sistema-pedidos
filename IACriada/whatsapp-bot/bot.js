/**
 * Bot WhatsApp Adonay — Observador (captura DM) + modo legado ADNY.
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
import { ehGrupo } from "./lib/heuristica.js";
import { iniciarTickRp, processarObservador } from "./lib/observador.js";

const processando = new Set();

function modoObservadorAtivo() {
  return config.whatsappModo === "observador" || config.whatsappModo === "both";
}

function modoLegacyAtivo() {
  return config.whatsappModo === "legacy" || config.whatsappModo === "both";
}

async function processarLegacy(sock, msg, textoBruto, jid) {
  if (!modoLegacyAtivo()) return;

  const isGroup = ehGrupo(jid);
  if (!mensagemEhGatilho(textoBruto, msg)) {
    if (config.whatsappModo === "legacy") {
      log.debug("Ignorada (sem gatilho)", { jid, preview: textoBruto.slice(0, 40) });
    }
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

  log.info("Gatilho detectado (legacy)", {
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
  log.info("Resposta legacy enviada", { jid, ok: ia.ok });
}

async function processarMensagem(sock, msg) {
  if (mensagemDeveIgnorar(msg)) return;

  const jid = msg.key.remoteJid;
  if (ehGrupo(jid)) return;

  const id = msg.key.id;
  const chave = `${jid}:${id}`;
  if (processando.has(chave)) return;
  processando.add(chave);
  setTimeout(() => processando.delete(chave), 60_000);

  const textoBruto = extrairTextoMensagem(msg);

  if (modoObservadorAtivo()) {
    const pushName = msg.pushName || "";
    await processarObservador(msg, pushName);
  }

  await processarLegacy(sock, msg, textoBruto, jid);
}

async function main() {
  log.info("Iniciando bot WhatsApp Adonay", {
    ia: config.localAiUrl,
    observador: config.observadorApiBase,
    modo: config.whatsappModo,
    gatilhos: config.triggers,
    admins: config.adminNumbers.length,
  });

  if (modoObservadorAtivo()) {
    iniciarTickRp();
  }

  await conectarWhatsApp(processarMensagem);
}

main().catch((err) => {
  log.error("Falha fatal", { err: String(err) });
  process.exit(1);
});
