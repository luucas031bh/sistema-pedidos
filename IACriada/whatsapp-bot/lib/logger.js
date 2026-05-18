import fs from "fs";
import path from "path";
import { config } from "./config.js";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function arquivoLog() {
  return path.join(config.logsDir, `bot-${hoje()}.log`);
}

function linha(nivel, msg, extra) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${nivel}] ${msg}`;
  const txt = extra ? `${base} ${JSON.stringify(extra)}` : base;
  console.log(txt);
  try {
    fs.mkdirSync(config.logsDir, { recursive: true });
    fs.appendFileSync(arquivoLog(), txt + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

export const log = {
  info: (msg, extra) => linha("INFO", msg, extra),
  warn: (msg, extra) => linha("WARN", msg, extra),
  error: (msg, extra) => linha("ERROR", msg, extra),
  debug: (msg, extra) => {
    if (config.debug) linha("DEBUG", msg, extra);
  },
};
