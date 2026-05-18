import { areJidsSameUser } from "@whiskeysockets/baileys";

/** Identidade do bot (JID telefone + LID para menções em grupos). */
const identity = {
  jid: null,
  lid: null,
  phoneUser: null,
  lidUser: null,
};

function extrairUser(jid) {
  if (!jid) return null;
  return String(jid).split("@")[0].split(":")[0];
}

export function setBotIdentity(sock) {
  const jid = sock?.user?.id || sock?.authState?.creds?.me?.id || null;
  const lid = sock?.authState?.creds?.me?.lid || null;
  identity.jid = jid;
  identity.lid = lid;
  identity.phoneUser = extrairUser(jid);
  identity.lidUser = extrairUser(lid);
}

export function getBotIdentity() {
  return { ...identity };
}

/** Grupos usam LID nas menções (@21611...); comparar JID e LID. */
export function botFoiMencionado(msg, texto = "") {
  const mencoes = obterMencoesInterno(msg);
  for (const m of mencoes) {
    if (identity.jid && areJidsSameUser(m, identity.jid)) return true;
    if (identity.lid && areJidsSameUser(m, identity.lid)) return true;
    const mUser = extrairUser(m);
    if (mUser && identity.lidUser && mUser === identity.lidUser) return true;
    if (mUser && identity.phoneUser && mUser === identity.phoneUser) return true;
  }

  const t = texto || "";
  if (identity.lidUser && t.includes(`@${identity.lidUser}`)) return true;
  if (identity.phoneUser && t.includes(`@${identity.phoneUser}`)) return true;
  return false;
}

function obterMencoesInterno(msg) {
  const ctx =
    msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo;
  return ctx?.mentionedJid || [];
}
