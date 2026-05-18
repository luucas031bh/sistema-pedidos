import fs from "fs";
import path from "path";
import { exec } from "child_process";
import QRCode from "qrcode";
import { config } from "./config.js";
import { log } from "./logger.js";

let ultimoCaminho = null;

export function caminhoQrPng() {
  return config.qrPngPath;
}

export async function salvarQrPng(qrString) {
  const destino = path.resolve(caminhoQrPng());
  ultimoCaminho = destino;

  await fs.promises.mkdir(path.dirname(destino), { recursive: true });
  await QRCode.toFile(destino, qrString, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  log.info("QR Code salvo (abra e escaneie com o celular)", { arquivo: destino });
  console.log("\n========================================");
  console.log("  WHATSAPP — ESCANEAR QR CODE");
  console.log("========================================");
  console.log(`  Arquivo: ${destino}`);
  console.log("  No celular:");
  console.log("  WhatsApp → Aparelhos conectados");
  console.log("  → Conectar um aparelho → Escanear QR");
  console.log("========================================\n");

  if (config.qrAutoOpen) {
    abrirQrNoWindows(destino);
  }

  return destino;
}

export function limparQrPng() {
  const destino = ultimoCaminho || path.resolve(caminhoQrPng());
  try {
    if (fs.existsSync(destino)) {
      fs.unlinkSync(destino);
      log.info("QR Code removido (ja conectado)", { arquivo: destino });
    }
  } catch (err) {
    log.warn("Nao foi possivel remover QR PNG", { err: String(err) });
  }
  ultimoCaminho = null;
}

export function abrirQrNoWindows(arquivo) {
  const fp = path.resolve(arquivo);
  if (process.platform !== "win32") return;
  if (!fs.existsSync(fp)) return;
  const cmd = `cmd /c start "" "${fp.replace(/"/g, '\\"')}"`;
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) log.warn("Nao foi possivel abrir o PNG automaticamente", { err: String(err) });
  });
}
