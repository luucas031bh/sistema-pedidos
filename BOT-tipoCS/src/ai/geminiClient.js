const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODEL_FALLBACKS = ['gemini-2.5-flash-lite', 'gemini-flash-latest'];

function isGeminiModelNotFound(err) {
  const msg = String(err && err.message ? err.message : err);
  return /404|not found|is not found|not supported for generateContent/i.test(msg);
}

/**
 * @param {import('@google/generative-ai').GoogleGenerativeAI} genAI
 * @param {string} primaryModelId
 * @param {{ systemInstruction: string, generationConfig?: object }} modelOpts
 * @param {string} userText
 */
async function generateWithModelFallback(genAI, primaryModelId, modelOpts, userText) {
  const tried = new Set();
  const order = [primaryModelId, ...GEMINI_MODEL_FALLBACKS].filter((id) => {
    if (!id || tried.has(id)) return false;
    tried.add(id);
    return true;
  });

  let lastErr;
  for (const modelId of order) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: modelOpts.systemInstruction,
        generationConfig: modelOpts.generationConfig || {},
      });
      const result = await model.generateContent(userText);
      return { result, modelUsed: modelId };
    } catch (e) {
      lastErr = e;
      if (isGeminiModelNotFound(e)) {
        console.warn(`Gemini modelo indisponivel (${modelId}), tentando proximo...`);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

module.exports = {
  generateWithModelFallback,
  GEMINI_MODEL_FALLBACKS,
  isGeminiModelNotFound,
};
