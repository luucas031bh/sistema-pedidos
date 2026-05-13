const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_CHARS = 18000;

/**
 * Caminho padrão: raiz do monorepo (pai de BOT-tipoCS) / Code.gs
 * Este arquivo fica em BOT-tipoCS/src/ai/
 */
function defaultCodeGsPath() {
  return path.join(__dirname, '..', '..', '..', 'Code.gs');
}

/**
 * Carrega trecho do Apps Script (Code.gs) para contexto do Gemini.
 * Não substitui dados da planilha; só alinha regras e nomes de ações.
 * @param {object} env - normalmente process.env
 * @returns {{ snippet: string, sourceLabel: string }}
 */
function loadProjectContextSnippet(env = process.env) {
  const override = String(env.PROJECT_CONTEXT_PATH || '').trim();
  const filePath = override || defaultCodeGsPath();
  const maxChars = Math.max(
    2000,
    Math.min(50000, Number(env.PROJECT_CONTEXT_MAX_CHARS) || DEFAULT_MAX_CHARS),
  );
  const label = override ? path.basename(override) : 'Code.gs';

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) {
      return { snippet: '', sourceLabel: label };
    }
    if (raw.length <= maxChars) {
      return { snippet: raw.trimEnd(), sourceLabel: label };
    }
    const head = raw.slice(0, maxChars).trimEnd();
    return {
      snippet: `${head}\n\n/* ... trecho truncado (${raw.length} caracteres; ajuste PROJECT_CONTEXT_MAX_CHARS) ... */`,
      sourceLabel: label,
    };
  } catch (e) {
    console.warn(`[projectContext] Não foi possível ler "${filePath}": ${e.message || e}`);
    return { snippet: '', sourceLabel: label };
  }
}

function buildRouterContextBlock(config) {
  const s = config && config.projectContextSnippet;
  if (!s || !String(s).trim()) return '';
  const label = config.projectContextSourceLabel || 'Code.gs';
  return `

--- Referencia do backend (Google Apps Script, arquivo ${label}) ---
Use APENAS para alinhar intencoes, nomes de acoes e semantica de campos.
NAO use este trecho como fonte de contagens, valores ou lista de pedidos: esses dados vêm só da resposta JSON do Web App após executar a acao.
---
${s}
--- fim referencia ---`;
}

function buildOrganicContextBlock(config) {
  const s = config && config.projectContextSnippet;
  if (!s || !String(s).trim()) return '';
  const label = config.projectContextSourceLabel || 'Code.gs';
  return `

--- Referencia de regras (${label}, Apps Script) ---
Ajuda a interpretar nomes de campos e regras de negocio. Todos os numeros, totais, IDs e status na resposta ao usuario DEVEM vir exclusivamente do JSON "dados_do_sistema" abaixo, nunca do trecho de codigo.
---
${s}
--- fim referencia ---`;
}

module.exports = {
  loadProjectContextSnippet,
  buildRouterContextBlock,
  buildOrganicContextBlock,
  defaultCodeGsPath,
};
