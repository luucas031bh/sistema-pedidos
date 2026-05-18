import { config } from "./config.js";

/** Normaliza JID/telefone para apenas digitos (ex: 5531999999999). */
export function normalizarNumero(jidOuNumero) {
  if (!jidOuNumero) return "";
  const s = String(jidOuNumero).split("@")[0].split(":")[0];
  return s.replace(/\D/g, "");
}

export function usuarioEhAdmin(jidOuNumero) {
  const n = normalizarNumero(jidOuNumero);
  if (!n) return false;
  return config.adminNumbers.some(
    (adm) => n === adm || n.endsWith(adm) || adm.endsWith(n)
  );
}
