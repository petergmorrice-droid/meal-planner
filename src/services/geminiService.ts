/**
 * Gemini, the AI the app uses to read, write and change recipes and to tidy the product list. Each
 * phone uses its own key (kept on that phone). The rest of the app imports from here; the code is
 * in ./gemini/:
 *  - client.ts       the key, the request (a second model, time limits) and plain-English errors
 *  - recipes.ts      the recipe requests (from a page, a photo or text; write; change; ask)
 *  - recipeRules.ts  turning Gemini's answers into recipes
 *  - prompts.ts      what Gemini is told, and the shape its answers must have
 *  - products.ts     tidying the product list
 */
export {
  getGeminiApiKey,
  saveGeminiApiKey,
  clearGeminiApiKey,
  NoGeminiKeyError,
  testGeminiKeyApi,
  geminiDetail,
} from './gemini/client';
export {
  RecipeSourceError,
  readRecipePageApi,
  readRecipePhotoApi,
  parseRecipeApi,
  suggestGroceryProductsApi,
  generateRecipeApi,
  editRecipeApi,
  generateAlternativeInstructionsApi,
  askAboutRecipeApi,
} from './gemini/recipes';
export { validateAndNormalizeRecipe, normalizeParsedRecipe, applyGeminiEdit } from './gemini/recipeRules';
export { cleanGroceryDatabaseApi } from './gemini/products';
