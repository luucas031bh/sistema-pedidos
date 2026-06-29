import fs from "fs";
import path from "path";
import { config } from "./config.js";

const STATS_PATH = path.join(config.root, "observador_stats.json");

function lerStats() {
  try {
    if (fs.existsSync(STATS_PATH)) {
      return JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return {
    dms_recebidas: 0,
    dms_ignoradas: 0,
    dms_encaminhadas: 0,
    ultima_dm_em: null,
    ultima_encaminhada_em: null,
  };
}

export function registrarAtividade(tipo) {
  const stats = lerStats();
  if (tipo === "recebida") stats.dms_recebidas = (stats.dms_recebidas || 0) + 1;
  if (tipo === "ignorada") stats.dms_ignoradas = (stats.dms_ignoradas || 0) + 1;
  if (tipo === "encaminhada") {
    stats.dms_encaminhadas = (stats.dms_encaminhadas || 0) + 1;
    stats.ultima_encaminhada_em = new Date().toISOString();
  }
  stats.ultima_dm_em = new Date().toISOString();
  stats.atualizado_em = new Date().toISOString();
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), "utf8");
  return stats;
}
