// Bundled by `npm test` for tests/gemini.test.mjs (talking to Gemini, with a stand-in for Google).
export {
  askGemini,
  geminiFailure,
  geminiDetail,
  testGeminiKeyApi,
  nextAllowanceReset,
  setBusyRetryWait,
  saveGeminiApiKey,
} from '../src/services/gemini/client';
export { suggestMealIdeasApi } from '../src/services/gemini/recipes';
