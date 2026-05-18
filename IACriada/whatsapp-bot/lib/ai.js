import { config } from "./config.js";
import { log } from "./logger.js";
import { normalizarNumero } from "./permissions.js";

export async function enviarParaIA(texto, meta = {}) {
  const numero = normalizarNumero(meta.numero || "");
  const sessao =
    meta.sessao || `whatsapp_${numero || meta.chatId || "desconhecido"}`;

  const body = {
    mensagem: texto,
    sessao,
    modelo: null,
    permitir_internet: false,
    origem: "whatsapp",
    whatsapp_numero: numero,
    whatsapp_chat_id: meta.chatId || "",
    whatsapp_grupo: Boolean(meta.isGroup),
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.aiTimeoutMs);

  try {
    const res = await fetch(config.localAiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.detail || data.erro || `HTTP ${res.status}`;
      log.error("IA retornou erro", { status: res.status, err });
      return {
        ok: false,
        resposta: `Nao consegui consultar a IA agora: ${err}`,
      };
    }

    log.info("Resposta IA recebida", {
      modelo: data.modelo,
      len: (data.resposta || "").length,
    });

    return {
      ok: true,
      resposta: data.resposta || "(sem resposta)",
      passos: data.passos || [],
      meta: data.meta || {},
    };
  } catch (err) {
    clearTimeout(timer);
    log.error("Falha ao chamar IA local", { err: String(err) });
    return {
      ok: false,
      resposta:
        "Assistente local offline. Verifique se INICIAR.bat esta rodando na porta 8765.",
    };
  }
}
