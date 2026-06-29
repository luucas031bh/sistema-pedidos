import fs from "fs";
import path from "path";
import { config } from "./config.js";

const STATUS_PATH = path.join(config.root, "connection_status.json");

export function gravarStatus(partial) {
  let atual = {};
  try {
    if (fs.existsSync(STATUS_PATH)) {
      atual = JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
    }
  } catch {
    atual = {};
  }
  const payload = {
    ...atual,
    ...partial,
    atualizado_em: new Date().toISOString(),
  };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
