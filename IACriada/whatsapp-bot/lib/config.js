import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ROOT_PROJETO = path.join(ROOT, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

function resolveQrPngPath() {
  const rel = process.env.QR_PNG_PATH || "../whatsapp-qr.png";
  const candidato = path.isAbsolute(rel)
    ? path.resolve(rel)
    : path.resolve(ROOT, rel);
  return candidato;
}

function parseList(raw, sep = ",") {
  return (raw || "")
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  root: ROOT,
  rootProjeto: ROOT_PROJETO,
  authDir: path.join(ROOT, "auth_info"),
  logsDir: path.join(ROOT, "logs"),
  qrPngPath: resolveQrPngPath(),
  qrAutoOpen: String(process.env.QR_AUTO_OPEN || "true").toLowerCase() === "true",
  localAiUrl: process.env.LOCAL_AI_URL || "http://127.0.0.1:8765/api/chat",
  triggers: parseList(process.env.BOT_TRIGGERS || "ADNY,@IA,Agente,IA"),
  adminNumbers: parseList(process.env.ALLOWED_ADMIN_NUMBERS || "").map((n) =>
    n.replace(/\D/g, "")
  ),
  debug: String(process.env.DEBUG || "false").toLowerCase() === "true",
  reconnectDelayMs: Number(process.env.RECONNECT_DELAY_MS || 5000),
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH || 4000),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
};
