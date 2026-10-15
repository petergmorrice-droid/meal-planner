import { Recipe, Ingredient, CookingMethod, GroceryItem } from '../types';
import { getCatalog } from '../utils/shoppingConversion';

/**
 * Gemini AI Integration Client-Side (BYOK Pattern)
 * Reads Gemini API key dynamically from localStorage.
 * Supports direct Google GenAI REST API requests for 100% static hosting compatibility.
 * Falls back gracefully to local rule-based parsing and generation.
 */

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite'
];

export function getGeminiApiKey(): string | null {
  try {
    return localStorage.getItem('gemini_api_key') || null;
  } catch (e) {
    console.error('Failed to read Gemini API key from localStorage', e);
    return null;
  }
}

export function saveGeminiApiKey(key: string) {
  try {
    localStorage.setItem('gemini_api_key', key.trim());
  } catch (e) {
    console.error('Failed to save Gemini API key to localStorage', e);
  }
}

export function clearGeminiApiKey() {
  try {
    localStorage.removeItem('gemini_api_key');
  } catch (e) {
    console.error('Failed to clear Gemini API key from localStorage', e);
  }
}

/**
 * Direct REST API request wrapper with retries and timeout
 */
async function callGeminiRest(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  responseSchema?: any,
  options: { temperature?: number } = {}
): Promise<any> {
  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const payload: any = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      if (responseSchema) {
        payload.generationConfig = {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        };
      }
      if (options.temperature !== undefined) {
        // Low temperature = the same answer every time; right for copying, not for creating.
        payload.generationConfig = { ...(payload.generationConfig || {}), temperature: options.temperature };
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Client': 'aistudio-build'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(id);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API error (${response.status})`);
      }

      const responseData = await response.json();
      const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini REST ${model}] failed:`, err?.message || err);
    }
  }

  throw lastError || new Error('All candidate models failed');
}

/**
 * ---------------------------------------------------------
 * HELPER UTILITIES PORTED FROM SERVER FOR CLIENT-SIDE SYNC
 * ---------------------------------------------------------
 */

function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();
  if (/chicken|beef|pork|steak|bacon|pancetta|fish|salmon|tuna|cod|prawn|shrimp|turkey|lamb|sausage|meat|duck|veal|venison|chorizo|prosciutto|scallop|mussel|clam|squid|calamari/.test(lower)) {
    return 'Meat & Seafood';
  }
  if (/(?:milk|cheese|butter|cream|yogurt|yoghurt|parmesan|cheddar|mozzarella|feta|ricotta|egg|eggs|ghee|sour cream)\b/.test(lower) && !/(?:almond|oat|soy|coconut|vegan|plant-based)\s+(?:milk|cheese|butter|yogurt)/.test(lower)) {
    return 'Dairy';
  }
  if (/onion|garlic|potato|tomato|carrot|broccoli|spinach|lettuce|cucumber|pepper|mushroom|lemon|lime|avocado|apple|herb|basil|parsley|ginger|chilli|coriander|zucchini|courgette|aubergine|eggplant|cabbage|cauliflower|celery|leek|asparagus|beans|kale|peas|scallion|spring onion|shallot/.test(lower)) {
    return 'Produce';
  }
  if (/bread|bun|bagel|tortilla|wrap|roll|brioche|croissant|pita|naan|crust|baguette/.test(lower)) {
    return 'Bakery';
  }
  if (/frozen|ice cream|frozen peas|ice/.test(lower)) {
    return 'Frozen';
  }
  return 'Pantry';
}

function normalizeIngredientAmountAndUnit(rawAmount: any, rawUnit: any, rawName: string): {
  name: string;
  amount: number;
  unit: string;
  category: string;
  suggestedAisle: string;
} {
  let name = (rawName || '').trim();
  let unit = (rawUnit || '').trim().toLowerCase();
  let amount: number = 1;

  if (typeof rawAmount === 'number') {
    amount = rawAmount;
  } else if (typeof rawAmount === 'string') {
    amount = parseFloat(rawAmount) || 1;
  }

  // Basic unicode fractions replace
  const fractionMap: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 0.33,
    '⅔': 0.67,
    '⅛': 0.125,
  };
  for (const [fracChar, fracVal] of Object.entries(fractionMap)) {
    if (name.includes(fracChar)) {
      name = name.replace(fracChar, ` ${fracVal} `).trim();
    }
  }

  // Sanitize unit
  if (unit.startsWith('clove')) unit = 'clove';
  else if (unit.startsWith('can')) unit = 'can';
  else if (unit.startsWith('slice')) unit = 'slice';
  else if (unit.startsWith('pack')) unit = 'pack';
  else if (unit.startsWith('piece')) unit = 'piece';

  const category = categorizeIngredient(name);

  return {
    name,
    amount: Math.max(0.1, Number(amount.toFixed(2))),
    unit: unit || 'piece',
    category,
    suggestedAisle: category
  };
}

function analyzeDietaryFlags(ingredients: Array<{ name: string }>): { isVegetarian: boolean; isVegan: boolean } {
  const meatKeywords = /chicken|beef|pork|steak|bacon|pancetta|fish|salmon|tuna|cod|prawn|shrimp|turkey|lamb|sausage|meat|duck|veal|venison|chorizo|prosciutto|scallop|mussel|clam|squid|calamari|broth|gelatin|lard/i;
  const animalKeywords = /milk|cheese|butter|cream|yogurt|yoghurt|parmesan|cheddar|mozzarella|feta|ricotta|egg|eggs|ghee|sour cream|honey|mayo/i;

  let hasMeat = false;
  let hasAnimal = false;

  for (const ing of ingredients) {
    const name = ing.name || '';
    if (meatKeywords.test(name)) {
      hasMeat = true;
    }
    if (animalKeywords.test(name)) {
      hasAnimal = true;
    }
  }

  return {
    isVegetarian: !hasMeat,
    isVegan: !hasMeat && !hasAnimal
  };
}

function estimateDynamicTimes(ingredients: any[], instructions: string[], targetMethod: string): { prepTime: number; cookTime: number } {
  let prepTime = 5;
  let cookTime = 5;

  ingredients.forEach(ing => {
    const name = ing.name.toLowerCase();
    if (/chicken|beef|pork|steak|lamb/.test(name)) prepTime += 5;
    if (/onion|garlic|pepper|potato|carrot|broccoli|vegetable/.test(name)) prepTime += 3;
  });

  instructions.forEach(step => {
    const lower = step.toLowerCase();
    if (lower.includes('bake') || lower.includes('roast')) cookTime += 15;
    else if (lower.includes('simmer') || lower.includes('slow cook')) cookTime += 20;
    else if (lower.includes('sauté') || lower.includes('sear') || lower.includes('fry')) cookTime += 8;
  });

  return {
    prepTime: Math.min(60, Math.max(5, prepTime)),
    cookTime: Math.min(120, Math.max(5, cookTime))
  };
}

// Words that mean an ingredient contains gluten / dairy, and the exceptions ("coconut milk", "butter beans").
const GLUTEN_WORDS = /\b(flour|bread|breadcrumbs?|panko|pasta|penne|spaghetti|fusilli|farfalle|linguine|tagliatelle|pappardelle|lasagne|lasagna|macaroni|rigatoni|conchiglie|orzo|gnocchi|noodles?|couscous|bulgur|bulgar|barley|semolina|wheat|spelt|rye|pastry|filo|phyllo|tortillas?|wraps?|pittas?|pitas?|naans?|buns?|rolls?|baguette|ciabatta|focaccia|sourdough|crackers?|biscuits?|cake|crumble|batter|dumplings?|beer|ale|soy sauce|seitan|stuffing|yorkshire|croutons?)\b/;
const NOT_GLUTEN = /\b(gluten[- ]free|rice noodles?|rice flour|cornflour|corn flour|gram flour|buckwheat|tamari)\b/;
const DAIRY_WORDS = /\b(milk|cheese|cheddar|parmesan|mozzarella|feta|halloumi|ricotta|mascarpone|paneer|brie|camembert|gruy[eè]re|pecorino|burrata|stilton|butter|ghee|cream|cr[eè]me fra[iî]che|yogh?urt|custard|quark|kefir|whey)\b/;
const NOT_DAIRY = /\b(coconut|oat|almond|soy|soya|rice|cashew|peanut|vegan|dairy[- ]free|plant[- ]based|butter ?beans?|butternut|cream of tartar)\b/;

/**
 * Recipe tags. "Gluten-Free" / "Dairy-Free" are only added when no ingredient looks like
 * gluten or dairy AND (for imported recipes) Gemini agreed - a wrong "free-from" label is
 * worse than a missing one.
 */
function generateFunctionalTags(
  ingredients: any[], isVegetarian: boolean, isVegan: boolean, method: string,
  ai?: { glutenFree?: unknown; dairyFree?: unknown }
): string[] {
  const tags: string[] = [];
  if (isVegan) tags.push('Vegan');
  else if (isVegetarian) tags.push('Vegetarian');

  let hasGluten = false;
  let hasDairy = false;

  ingredients.forEach(ing => {
    const name = String(ing?.name ?? '').toLowerCase();
    if (GLUTEN_WORDS.test(name) && !NOT_GLUTEN.test(name)) hasGluten = true;
    if (DAIRY_WORDS.test(name) && !NOT_DAIRY.test(name)) hasDairy = true;
  });
  const aiAgrees = (v: unknown) => (ai ? v === true : true);

  if (!hasGluten && aiAgrees(ai?.glutenFree)) tags.push('Gluten-Free');
  if (!hasDairy && !isVegan && aiAgrees(ai?.dairyFree)) tags.push('Dairy-Free');
  if (isVegan) tags.push('Dairy-Free');

  if (method === 'ninja') tags.push('Ninja Combi');
  else tags.push('Stovetop');

  return tags;
}

function validateAndNormalizeRecipe(data: any, selectedMethod: 'ninja' | 'oven_hob', rawText?: string): Recipe {
  const clean: any = { ...data };
  clean.id = clean.id || crypto.randomUUID();
  clean.name = clean.name || 'Custom Recipe';
  clean.description = clean.description || 'Custom home-cooked meal.';
  clean.servings = 2;

  // Normalize ingredients
  clean.ingredients = (clean.ingredients || []).map((ing: any) => {
    return normalizeIngredientAmountAndUnit(ing.amount, ing.unit, ing.name);
  });

  // Normalize instructions
  clean.instructions = Array.isArray(clean.instructions)
    ? clean.instructions.filter(Boolean)
    : (rawText ? rawText.split('\n').filter(Boolean) : []);

  // Set method instructions
  clean.methodInstructions = clean.methodInstructions || {};
  if (!clean.methodInstructions[selectedMethod] || clean.methodInstructions[selectedMethod].length === 0) {
    clean.methodInstructions[selectedMethod] = [...clean.instructions];
  }

  // Calculate times
  const estTimes = estimateDynamicTimes(clean.ingredients, clean.instructions, selectedMethod);
  clean.prepTime = clean.prepTime || estTimes.prepTime;
  clean.cookTime = clean.cookTime || estTimes.cookTime;

  clean.methodPrepTime = clean.methodPrepTime || {};
  clean.methodCookTime = clean.methodCookTime || {};
  clean.methodPrepTime[selectedMethod] = clean.methodPrepTime[selectedMethod] || clean.prepTime;
  clean.methodCookTime[selectedMethod] = clean.methodCookTime[selectedMethod] || clean.cookTime;

  // Dietary and tags: Gemini's own judgement is better than word matching ("eggplant" isn't egg).
  const flags = analyzeDietaryFlags(clean.ingredients);
  clean.isVegetarian = typeof data?.isVegetarian === 'boolean' ? data.isVegetarian : flags.isVegetarian;
  clean.isVegan = typeof data?.isVegan === 'boolean' ? data.isVegan && clean.isVegetarian : flags.isVegan;
  clean.tags = generateFunctionalTags(clean.ingredients, clean.isVegetarian, clean.isVegan, selectedMethod);
  clean.cookingMethods = [selectedMethod];

  return clean;
}

/**
 * ---------------------------------------------------------
 * LOCAL FALLBACK FUNCTIONS FOR COMPATIBILITY
 * ---------------------------------------------------------
 */

function parseRecipeLocally(text: string, targetCookingMethod?: string): Recipe {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let name = 'Custom Recipe';
  const rawIngredients: any[] = [];
  const instructions: string[] = [];
  
  let section: 'header' | 'ingredients' | 'instructions' = 'header';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    
    if (lower.startsWith('recipe:') || lower.startsWith('title:')) {
      name = line.replace(/^(recipe:|title:)\s*/i, '').trim();
      continue;
    }
    if (lower.includes('ingredient')) {
      section = 'ingredients';
      continue;
    }
    if (lower.includes('instruction') || lower.includes('method') || lower.includes('direction') || lower.includes('steps')) {
      section = 'instructions';
      continue;
    }
    
    if (section === 'header') {
      if (i === 0 && !lower.includes('ingredient')) {
        name = line.replace(/^[#\*\-]+\s*/, '').trim();
      }
    } else if (section === 'ingredients') {
      const cleaned = line.replace(/^[\*\-•\d\.\)]\s*/, '').trim();
      if (cleaned) {
        let amount = 1;
        let unit = 'item';
        let ingName = cleaned;

        const match = cleaned.match(/^([\d\/\.\s\-¼½¾⅓⅔⅛]+)\s*(tbsp|tsp|tablespoon|teaspoon|cups?|kg|g|ml|l|oz|cloves?|cans?|pinch|slices?|bunch|packs?)(?:\s+(.*)|$)/i);
        if (match) {
          amount = parseFloat(match[1]?.trim() || '1') || 1;
          unit = match[2]?.trim().toLowerCase() || 'item';
          ingName = match[3]?.trim() || cleaned;
        } else {
          const numMatch = cleaned.match(/^([\d\/\.\s\-¼½¾⅓⅔⅛]+)\s+(.*)$/);
          if (numMatch) {
            amount = parseFloat(numMatch[1].trim()) || 1;
            ingName = numMatch[2].trim() || cleaned;
          }
        }

        rawIngredients.push({
          name: ingName,
          amount,
          unit
        });
      }
    } else if (section === 'instructions') {
      const cleaned = line.replace(/^(\d+[\.\)]|\*|\-|•)\s*/, '').trim();
      if (cleaned) {
        instructions.push(cleaned);
      }
    }
  }
  
  const isNinja = targetCookingMethod === 'ninja' || (!targetCookingMethod && (text.toLowerCase().includes('airfryer') || text.toLowerCase().includes('ninja')));
  const selectedMethod: 'ninja' | 'oven_hob' = isNinja ? 'ninja' : 'oven_hob';

  return validateAndNormalizeRecipe({
    name,
    description: 'Home-cooked meal portioned for 2 adults.',
    ingredients: rawIngredients,
    instructions
  }, selectedMethod, text);
}

function generateRecipeLocally(prompt: string, targetCookingMethod?: string): Recipe {
  const isNinja = targetCookingMethod === 'ninja' || (!targetCookingMethod && (prompt.toLowerCase().includes('airfryer') || prompt.toLowerCase().includes('ninja')));
  const selectedMethod: 'ninja' | 'oven_hob' = isNinja ? 'ninja' : 'oven_hob';
  const lower = prompt.toLowerCase();

  let title = 'Chef’s Special';
  if (lower.includes('chicken')) title = 'Crispy Seasoned Chicken & Veggies';
  else if (lower.includes('salmon') || lower.includes('fish')) title = 'Pan-Seared Herb Salmon';
  else if (lower.includes('beef') || lower.includes('steak')) title = 'Garlic Butter Beef & Greens';
  else if (lower.includes('pasta') || lower.includes('bake')) title = 'Mediterranean Veggie Pasta Bake';
  else if (lower.includes('tofu') || lower.includes('vegetarian')) title = 'Golden Tofu Veggie Stir-Fry';
  else if (lower.includes('curry')) title = 'Fragrant Coconut Curry';
  else {
    const cleaned = prompt.replace(/[^\w\s]/g, '').trim();
    const words = cleaned.split(/\s+/).slice(0, 4);
    if (words.length > 0 && words[0]) {
      title = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  const isVeg = lower.includes('vegetarian') || lower.includes('vegan') || lower.includes('tofu') || lower.includes('veggie');

  const ingredients: any[] = [];
  if (isVeg) {
    ingredients.push(
      { name: 'Firm Tofu', amount: 250, unit: 'g' },
      { name: 'Broccoli Florets', amount: 150, unit: 'g' },
      { name: 'Red Bell Pepper', amount: 1, unit: 'piece' }
    );
  } else if (lower.includes('salmon') || lower.includes('fish')) {
    ingredients.push(
      { name: 'Salmon Fillets', amount: 2, unit: 'piece' },
      { name: 'Asparagus', amount: 150, unit: 'g' },
      { name: 'Lemon', amount: 1, unit: 'piece' }
    );
  } else if (lower.includes('beef') || lower.includes('steak')) {
    ingredients.push(
      { name: 'Beef Strips', amount: 250, unit: 'g' },
      { name: 'Brown Onion', amount: 1, unit: 'piece' },
      { name: 'Button Mushrooms', amount: 150, unit: 'g' }
    );
  } else {
    ingredients.push(
      { name: 'Chicken Breast', amount: 250, unit: 'g' },
      { name: 'Broccoli Florets', amount: 150, unit: 'g' },
      { name: 'Garlic', amount: 2, unit: 'clove' }
    );
  }

  ingredients.push(
    { name: 'Olive Oil', amount: 1.5, unit: 'tbsp' },
    { name: 'Soy Sauce', amount: 1.5, unit: 'tbsp' },
    { name: 'Black Pepper', amount: 0.5, unit: 'tsp' }
  );

  let instructions: string[] = [];
  if (isNinja) {
    instructions = [
      `Prep ingredients: cut the ${ingredients[0].name.toLowerCase()} into bite-sized pieces and toss with 1.5 tbsp of olive oil and 0.5 tsp of black pepper.`,
      `Place the seasoned ${ingredients[0].name.toLowerCase()} and chopped vegetables evenly in the Ninja Combi pan.`,
      `Set the Ninja Combi to 'Combi Meals' at 190°C for 14 minutes until tender and cooked through.`,
      `Drizzle with 1.5 tbsp of soy sauce, toss gently, and serve warm portioned for 2 adults.`
    ];
  } else {
    instructions = [
      `Prep ingredients: slice the ${ingredients[0].name.toLowerCase()} and chop the vegetables into bite-sized pieces.`,
      `Heat 1.5 tbsp of olive oil in a wide skillet or pan over medium-high heat.`,
      `Add the ${ingredients[0].name.toLowerCase()} and cook for 6-8 minutes until seared and golden.`,
      `Add the vegetables, garlic, and 1.5 tbsp of soy sauce; sauté for an additional 4-5 minutes until tender-crisp.`,
      `Season with 0.5 tsp of black pepper and serve warm portioned for 2 adults.`
    ];
  }

  return validateAndNormalizeRecipe({
    name: title,
    description: `A delicious homemade dish created from "${prompt}", portioned for 2 adults.`,
    ingredients,
    instructions
  }, selectedMethod, prompt);
}

function editRecipeLocally(recipe: any, instruction: string): Recipe {
  const updated = JSON.parse(JSON.stringify(recipe || {}));
  const lower = (instruction || '').toLowerCase();

  updated.ingredients = Array.isArray(updated.ingredients) ? updated.ingredients : [];
  updated.tags = Array.isArray(updated.tags) ? updated.tags : [];
  updated.instructions = Array.isArray(updated.instructions) ? updated.instructions : [];

  // Add ingredient
  const addMatch = instruction.match(/(?:add|include)\s+([\d\w\s]+)/i);
  if (addMatch && addMatch[1]) {
    const item = addMatch[1].trim();
    const normalized = normalizeIngredientAmountAndUnit(1, 'item', item);
    updated.ingredients.push(normalized);
  }

  // Remove ingredient
  const removeMatch = instruction.match(/(?:remove|omit|without|no)\s+([a-zA-Z\s]+)/i);
  if (removeMatch && removeMatch[1]) {
    const removeName = removeMatch[1].trim().toLowerCase();
    updated.ingredients = updated.ingredients.filter(
      (ing: any) => !String(ing?.name || '').toLowerCase().includes(removeName)
    );
  }

  // Add instruction note
  updated.instructions.push(`Note: ${instruction}`);

  const method = (updated.cookingMethods && updated.cookingMethods[0]) || 'oven_hob';
  const validated = validateAndNormalizeRecipe(updated, method as any);

  validated.id = recipe.id;
  validated.imageUrl = recipe.imageUrl;
  return validated;
}

function generateAlternativeInstructionsLocally(recipe: any, targetMethod: string) {
  const originalInstructions = recipe.instructions || [];
  const dynamicTimes = estimateDynamicTimes(recipe.ingredients || [], originalInstructions, targetMethod);
  let prepTime = dynamicTimes.prepTime;
  let cookTime = dynamicTimes.cookTime;

  if (targetMethod === 'ninja') {
    cookTime = Math.max(8, Math.round(cookTime * 0.75));
  }

  const prefix = targetMethod === 'ninja' ? '[Ninja Combi] ' : '[Oven/Hob] ';
  const translated = originalInstructions.map((step: string) => {
    let clean = step;
    if (targetMethod === 'ninja') {
      clean = clean
        .replace(/oven/gi, 'Ninja Combi (Combi Bake)')
        .replace(/stove|pan|pot/gi, 'Ninja Combi (Sear/Sauté)')
        .replace(/boil/gi, 'Steam');
    } else {
      clean = clean
        .replace(/ninja/gi, 'Oven')
        .replace(/combi/gi, 'Hob');
    }
    return `${prefix}${clean}`;
  });

  return {
    instructions: translated,
    prepTime,
    cookTime
  };
}

function cleanGroceryDatabaseLocally(items: any[]): any[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const actions: any[] = [];
  const absorbedIds = new Set<string>();

  const getStem = (name: string): string => {
    let s = (name || '').toLowerCase().trim().replace(/[-_]/g, ' ');
    if (s.endsWith('es')) s = s.slice(0, -2);
    else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
    return s;
  };

  const knownSynonyms: Array<[RegExp, RegExp]> = [
    [/^minced beef$/i, /^beef mince$/i],
    [/^minced pork$/i, /^pork mince$/i],
    [/^minced lamb$/i, /^lamb mince$/i],
    [/^courgette$/i, /^zucchini$/i],
    [/^aubergine$/i, /^eggplant$/i],
    [/^spring onions?$/i, /^scallions?$/i],
    [/^bell peppers?$/i, /^sweet peppers?$/i]
  ];

  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    if (absorbedIds.has(itemA.id)) continue;

    for (let j = i + 1; j < items.length; j++) {
      const itemB = items[j];
      if (absorbedIds.has(itemB.id)) continue;

      let isDuplicate = false;
      let reason = '';

      for (const [rA, rB] of knownSynonyms) {
        if ((rA.test(itemA.name) && rB.test(itemB.name)) || (rB.test(itemA.name) && rA.test(itemB.name))) {
          isDuplicate = true;
          reason = `Absorb equivalent product "${itemB.name}" into "${itemA.name}" and save as alias.`;
          break;
        }
      }

      if (!isDuplicate) {
        const stemA = getStem(itemA.name);
        const stemB = getStem(itemB.name);
        if (stemA === stemB || stemA === (itemB.name || '').toLowerCase() || stemB === (itemA.name || '').toLowerCase()) {
          isDuplicate = true;
          reason = `Merge singular/plural variations "${itemA.name}" and "${itemB.name}".`;
        }
      }

      if (isDuplicate) {
        actions.push({
          actionType: 'merge',
          primaryItemId: itemA.id,
          secondaryItemId: itemB.id,
          reason
        });
        absorbedIds.add(itemB.id);
      }
    }
  }

  for (const item of items) {
    if (absorbedIds.has(item.id)) continue;
    const name = item.name || '';
    if (name.length > 3 && name === name.toUpperCase() && /[A-Z]/.test(name)) {
      const cleanName = name.toLowerCase();
      actions.push({
        actionType: 'rename',
        primaryItemId: item.id,
        newName: cleanName,
        reason: `Standardize uppercase "${name}" to clean lowercase "${cleanName}".`
      });
    }
  }

  for (const item of items) {
    if (absorbedIds.has(item.id)) continue;
    const lowerName = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();

    if (/cream|butter|milk|cheese|yogurt|yoghurt|parmesan|cheddar|mozzarella|ricotta/i.test(lowerName) && cat === 'pantry') {
      actions.push({
        actionType: 'recategorize',
        primaryItemId: item.id,
        newAisle: 'Dairy',
        reason: `Move dairy product "${item.name}" from Pantry to Dairy.`
      });
    }
  }

  return actions;
}

/**
 * ---------------------------------------------------------
 * SCHEMAS
 * ---------------------------------------------------------
 */

const RECIPE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Recipe title" },
    description: { type: "STRING", description: "Engaging concise description of the meal portioned for 2 adults" },
    ingredients: {
      type: "ARRAY",
      description: "List of ingredients with normalized decimal quantities and standard units",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Product name in the singular, exactly as on the grocery list when it is one of those products; no quantities or preparation" },
          amount: { type: "NUMBER", description: "Standardized positive decimal number (e.g. 1.0, 0.5, 0.25, 200). Never fractions or strings." },
          unit: { type: "STRING", description: "One of: g, kg, ml, l, tsp, tbsp, cup, piece, clove, can, bunch, pack, slice, rasher, fillet, sprig, stick, pinch, handful" },
          category: { type: "STRING", description: "Produce, Meat & Seafood, Dairy, Bakery, Frozen, or Pantry" },
          suggestedAisle: { type: "STRING", description: "Produce, Meat & Seafood, Dairy, Bakery, Frozen, or Pantry" }
        },
        required: ["name", "amount", "unit", "category", "suggestedAisle"]
      }
    },
    instructions: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Step-by-step instructions with exact decimal amounts matching the ingredients list"
    },
    methodInstructions: {
      type: "OBJECT",
      properties: {
        ninja: { type: "ARRAY", items: { type: "STRING" } },
        oven_hob: { type: "ARRAY", items: { type: "STRING" } }
      }
    },
    prepTime: {
      type: "INTEGER",
      description: "Realistic preparation time in minutes calculated dynamically from chopping, peeling, and assembly complexity. Integer only."
    },
    cookTime: {
      type: "INTEGER",
      description: "Realistic cooking time in minutes calculated dynamically from cooking methods, heat, and duration. Integer only."
    },
    methodPrepTime: {
      type: "OBJECT",
      properties: {
        ninja: { type: "INTEGER" },
        oven_hob: { type: "INTEGER" }
      }
    },
    methodCookTime: {
      type: "OBJECT",
      properties: {
        ninja: { type: "INTEGER" },
        oven_hob: { type: "INTEGER" }
      }
    },
    servings: { type: "INTEGER", description: "Must be 2" },
    tags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Rich, functional tags based on ingredients and method"
    },
    cookingMethods: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Array containing the selected appliance: ['ninja'] or ['oven_hob']"
    },
    isVegetarian: { type: "BOOLEAN" },
    isVegan: { type: "BOOLEAN" }
  },
  required: [
    "name", "description", "ingredients", "instructions", "prepTime", "cookTime", "servings", "tags", "cookingMethods", "isVegetarian", "isVegan"
  ]
};

const CLEAN_DATABASE_SCHEMA = {
  type: "OBJECT",
  properties: {
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          actionType: { type: "STRING", enum: ["merge", "rename", "recategorize"] },
          primaryItemId: { type: "STRING", description: "The ID of the item to keep or update." },
          secondaryItemId: { type: "STRING", description: "For merges: duplicate item ID to absorb." },
          newName: { type: "STRING", description: "For renames: standardize name." },
          newAisle: { type: "STRING", description: "For recategorizations: corrected aisle name." },
          reason: { type: "STRING", description: "Explanation of suggested action." }
        },
        required: ["actionType", "primaryItemId", "reason"]
      }
    }
  },
  required: ["actions"]
};

/**
 * ---------------------------------------------------------
 * CORE API SERVICE FUNCTIONS
 * ---------------------------------------------------------
 */

const RECIPE_SYSTEM_INSTRUCTION = `You are an elite, highly precise, Michelin-star level culinary AI assistant and professional private home chef.
Your role is to translate or generate recipes optimized strictly for home cooking.

CRITICAL FORMATTING INVARIANT:
- ALWAYS return a structured JSON response matching the requested schema.
- Exclude all per-recipe per-serving macros, health scores, and cost estimates.`;

/**
 * A clear error when Gemini can't do the job. We no longer fall back to the
 * built-in parser for recipes: it guesses quantities badly (100 g -> 1 g) and
 * those guesses went straight into the shopping list without anyone noticing.
 */
function geminiFailure(err: any, task: string): Error {
  const raw = String(err?.message || err || '');
  let reason = 'it may be busy or unreachable';
  if (/quota|exhaust|rate|429/i.test(raw)) reason = "today's free Gemini limit may have been reached";
  else if (/api key|permission|401|403/i.test(raw)) reason = 'the Gemini API key was not accepted (check Settings → connections)';
  else if (/abort|timeout|network|fetch/i.test(raw)) reason = 'there was no connection, or it took too long';
  else if (/json|unexpected token/i.test(raw)) reason = 'its answer could not be read';
  return new Error(`Gemini couldn't ${task}: ${reason}. Nothing has been saved, so please try again in a minute.`);
}

/** Allowed ingredient units, so every recipe uses the same vocabulary. */
const STANDARD_UNITS = 'g, kg, ml, l, tsp, tbsp, cup, piece, clove, can, bunch, pack, slice, rasher, fillet, sprig, stick, pinch, handful';

/**
 * Instructions for every recipe request: the usual rules plus the household's
 * grocery-list names, so ingredients come back already standardised.
 */
function recipeSystemInstruction(): string {
  let names: string[] = [];
  try {
    names = getCatalog().products.filter(p => !p.sameAs).map(p => p.name);
  } catch {
    names = [];
  }
  return `${RECIPE_SYSTEM_INSTRUCTION}

INGREDIENT NAMING AND UNITS (used to build an accurate shopping list):
- "name" is the product you would buy, in the SINGULAR, with no quantities, sizes or preparation (put "finely chopped" etc. in the method, not the name).
- If the ingredient is one of these grocery-list products, use exactly that product's name: ${names.join(', ')}.
- Otherwise use a short, plain UK supermarket name (e.g. "Chorizo", "Gochujang").
- "unit" must be one of: ${STANDARD_UNITS}. Use "piece" for whole items (1 onion = 1 piece), "clove" for garlic cloves, "can" for tins (and put the weight in grams instead only if no can is used).
- Prefer grams/ml for meat, fish, cheese, pasta, rice, flour and liquids; prefer pieces for fruit and veg bought individually.`;
}

// ---------------------------------------------------------------------------
// Reading a pasted recipe: Gemini only COPIES it into fields. It does not scale,
// convert, rewrite or adapt anything; the app does all the maths itself.
// ---------------------------------------------------------------------------

const COPY_SYSTEM_INSTRUCTION = `You copy recipes exactly into structured data.
Rules:
- Never change, scale, round or convert any quantity. Copy numbers as written (write fractions like ½ as 0.5; for a range like 2-3 use the larger number).
- Never invent ingredients, quantities or steps. If something isn't in the text, leave it empty (0 or "").
- Copy the method steps word for word. You may remove step numbers and headings only.
- Return JSON matching the schema.`;

const COPY_RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Recipe title as written" },
    description: { type: "STRING", description: "The recipe's own introduction sentence if it has one, otherwise a plain one-sentence summary" },
    servings: { type: "INTEGER", description: "Number of servings as stated in the recipe; 0 if not stated" },
    prepTime: { type: "INTEGER", description: "Preparation time in minutes as stated; 0 if not stated" },
    cookTime: { type: "INTEGER", description: "Cooking time in minutes as stated; 0 if not stated" },
    ingredients: {
      type: "ARRAY",
      description: "Every ingredient line, in order, copied as written",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "The ingredient as written, without the quantity, unit or preparation (e.g. 'skinless chicken breasts')" },
          amount: { type: "NUMBER", description: "The quantity exactly as written; 0 if none (e.g. 'salt to taste')" },
          unit: { type: "STRING", description: "The unit exactly as written (e.g. 'g', 'tbsp', 'tins', 'cloves'); empty if none" },
          note: { type: "STRING", description: "Preparation or extra detail from the line (e.g. 'finely chopped', 'cut into chunks', 'drained'); empty if none" }
        },
        required: ["name", "amount", "unit", "note"]
      }
    },
    instructions: { type: "ARRAY", items: { type: "STRING" }, description: "Method steps copied word for word" },
    isVegetarian: { type: "BOOLEAN", description: "True only if there is no meat, poultry, fish, seafood, animal stock or gelatine (including hidden ones such as anchovies in Worcestershire sauce)" },
    isVegan: { type: "BOOLEAN", description: "True only if there are no animal products at all" },
    isGlutenFree: { type: "BOOLEAN", description: "True only if no ingredient contains gluten (wheat, barley, rye, most pasta, bread, soy sauce, stock cubes that contain wheat...)" },
    isDairyFree: { type: "BOOLEAN", description: "True only if no ingredient contains milk or milk products (butter, cheese, cream, yogurt...)" }
  },
  required: ["name", "servings", "ingredients", "instructions", "isVegetarian", "isVegan"]
};

/**
 * Turn what Gemini copied into a Recipe without changing it: names, amounts,
 * units, notes and method steps are kept exactly as read. Only gaps are filled
 * (missing times are estimated, missing servings default to 2).
 */
export function normalizeParsedRecipe(data: any, selectedMethod: 'ninja' | 'oven_hob'): Recipe {
  const toNumber = (v: any): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isFinite(n) && n > 0 ? n : 0;
  };
  const ingredients: Ingredient[] = (Array.isArray(data?.ingredients) ? data.ingredients : [])
    .filter((ing: any) => ing && typeof ing.name === 'string' && ing.name.trim())
    .map((ing: any) => {
      const name = ing.name.trim();
      const out: Ingredient = {
        id: crypto.randomUUID(),
        name,
        amount: toNumber(ing.amount),
        unit: typeof ing.unit === 'string' ? ing.unit.trim() : '',
        category: categorizeIngredient(name),
      };
      out.suggestedAisle = out.category;
      const note = typeof ing.note === 'string' ? ing.note.trim() : '';
      if (note) out.note = note;
      return out;
    });

  const instructions: string[] = (Array.isArray(data?.instructions) ? data.instructions : [])
    .map((step: any) => String(step ?? '').trim())
    .filter(Boolean);

  const stated = { prep: toNumber(data?.prepTime), cook: toNumber(data?.cookTime) };
  const estimate = estimateDynamicTimes(ingredients, instructions, selectedMethod);
  const prepTime = Math.round(stated.prep || estimate.prepTime);
  const cookTime = Math.round(stated.cook || estimate.cookTime);

  const flags = analyzeDietaryFlags(ingredients);
  const isVegetarian = typeof data?.isVegetarian === 'boolean' ? data.isVegetarian : flags.isVegetarian;
  const isVegan = typeof data?.isVegan === 'boolean' ? data.isVegan && isVegetarian : flags.isVegan;

  return {
    id: crypto.randomUUID(),
    name: (typeof data?.name === 'string' && data.name.trim()) || 'Untitled recipe',
    description: (typeof data?.description === 'string' && data.description.trim()) || '',
    servings: Math.round(toNumber(data?.servings)) || 2,
    ingredients,
    instructions,
    methodInstructions: { [selectedMethod]: [...instructions] },
    prepTime,
    cookTime,
    methodPrepTime: { [selectedMethod]: prepTime },
    methodCookTime: { [selectedMethod]: cookTime },
    tags: generateFunctionalTags(ingredients, isVegetarian, isVegan, selectedMethod, { glutenFree: data?.isGlutenFree, dairyFree: data?.isDairyFree }),
    cookingMethods: [selectedMethod],
    isVegetarian,
    isVegan,
  };
}

/** Step 1: Gemini copies the pasted recipe into fields. */
export async function parseRecipeApi(text: string, cookingMethod: 'ninja' | 'oven_hob'): Promise<Recipe> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  const selectedMethod = cookingMethod === 'ninja' ? 'ninja' : 'oven_hob';
  const prompt = `Copy this recipe into the JSON fields exactly as written.\n\nRecipe text:\n${text}`;

  let data: any;
  try {
    const rawText = await callGeminiRest(apiKey, prompt, COPY_SYSTEM_INSTRUCTION, COPY_RECIPE_SCHEMA, { temperature: 0 });
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    data = JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini parseRecipeApi failed:', err);
    throw geminiFailure(err, 'read this recipe');
  }
  const recipe = normalizeParsedRecipe(data, selectedMethod);
  if (recipe.ingredients.length === 0) {
    throw new Error("Gemini couldn't find any ingredients in that text. Check the whole recipe was pasted, including the ingredients list, and try again.");
  }
  return recipe;
}

/**
 * Step 2 (only for ingredients the app couldn't match exactly): ask Gemini which
 * grocery-list product each one is. Returns ingredient name -> product name ('' = none).
 * Failure is harmless: those ingredients just go to the Map Ingredient step.
 */
export async function suggestGroceryProductsApi(ingredientNames: string[], productNames: string[]): Promise<Record<string, string>> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || ingredientNames.length === 0 || productNames.length === 0) return {};
  const prompt = `For each recipe ingredient below, give the grocery-list product it is, using the product's name EXACTLY as listed.
Only choose a product if it is clearly the same thing you would buy (e.g. "polpa" -> "Chopped Tomatoes", "San Marzano tomatoes" -> "Plum Tomatoes"). If none is clearly right, answer "".
Do not choose a similar but different product (smoked paprika is not paprika; red wine vinegar is not white wine vinegar).

Recipe ingredients:
${ingredientNames.map((n) => `- ${n}`).join('\n')}

Grocery-list products:
${productNames.join('; ')}`;
  const schema = {
    type: "OBJECT",
    properties: {
      matches: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            ingredient: { type: "STRING", description: "The recipe ingredient exactly as given" },
            product: { type: "STRING", description: "Grocery-list product name exactly as listed, or empty" }
          },
          required: ["ingredient", "product"]
        }
      }
    },
    required: ["matches"]
  };
  try {
    const rawText = await callGeminiRest(apiKey, prompt, 'You match recipe ingredients to a fixed grocery list. Never invent product names.', schema, { temperature: 0 });
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const data = JSON.parse(cleanText);
    const out: Record<string, string> = {};
    for (const m of Array.isArray(data?.matches) ? data.matches : []) {
      if (m && typeof m.ingredient === 'string' && typeof m.product === 'string') out[m.ingredient] = m.product;
    }
    return out;
  } catch (err) {
    console.warn('Gemini product suggestions failed (ingredients will be mapped by hand):', err);
    return {};
  }
}

export async function generateRecipeApi(promptText: string, cookingMethod: 'ninja' | 'oven_hob'): Promise<Recipe> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const selectedMethod = cookingMethod === 'ninja' ? 'ninja' : 'oven_hob';
  const methodNameLabel = selectedMethod === 'ninja' ? 'Ninja Combi Multi-cooker / Air Fryer' : 'Stove / Oven (Traditional Hob / Oven)';

  const prompt = `Create an original, delicious, complete recipe from scratch based on the following idea:
"${promptText.trim()}"

Target Cooking Appliance: ${methodNameLabel} ("${selectedMethod}").

CRITICAL INSTRUCTIONS:
1. Dynamic Prep & Cook Times:
- Realistically calculate prepTime and cookTime in minutes as integers based on chopping complexity and thermal cooking steps.
- NEVER use static or default 15 or 30 minute values.

2. Dynamic Dietary Flags:
- Evaluate "isVegetarian" as true ONLY if ingredients contain zero meat, poultry, fish, seafood, animal broths, or gelatins.
- Evaluate "isVegan" as true ONLY if ingredients contain zero animal products whatsoever.

3. Rich Functional Tags:
- Generate rich tags (e.g. "Gluten-Free", "Dairy-Free", "High-Protein", "Low-Carb", "One-Pan", "Quick", "Freezer-Friendly", "${selectedMethod === 'ninja' ? 'Ninja Combi' : 'Stovetop'}").

4. Vague Quantity Normalization:
- Convert any vague phrasing to exact decimal amounts and standard units.
- Quantities in instructions must match decimal amounts in ingredients list.

5. Strict portion scaling for 2 adults (servings: 2).
- Exclude all macros, health scores, and cost estimates.`;

  try {
    const rawText = await callGeminiRest(apiKey, prompt, recipeSystemInstruction(), RECIPE_RESPONSE_SCHEMA);
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const data = JSON.parse(cleanText);
    return validateAndNormalizeRecipe(data, selectedMethod, promptText);
  } catch (err) {
    console.error('Gemini generateRecipeApi failed:', err);
    throw geminiFailure(err, 'create this recipe');
  }
}

export async function editRecipeApi(recipe: Recipe, instruction: string): Promise<Recipe> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const selectedMethod: 'ninja' | 'oven_hob' = (recipe.cookingMethods && recipe.cookingMethods[0] === 'ninja') ? 'ninja' : 'oven_hob';

  const prompt = `You are a culinary AI assistant. Modify the following recipe according to the user instruction:
"${instruction}"

Original Recipe JSON:
${JSON.stringify(recipe, null, 2)}

CRITICAL INSTRUCTIONS:
- Realistically recalculate prepTime, cookTime, isVegetarian, isVegan, and tags dynamically based on the modifications.
- Ensure all ingredient amounts are positive decimals with standard units.
- Never use static placeholders or defaults.
- Do NOT include macros, health scores, or cost estimates.
- Servings MUST remain 2.`;

  try {
    const rawText = await callGeminiRest(apiKey, prompt, recipeSystemInstruction(), RECIPE_RESPONSE_SCHEMA);
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const data = JSON.parse(cleanText);
    const validated = validateAndNormalizeRecipe(data, selectedMethod);
    validated.id = recipe.id;
    validated.imageUrl = recipe.imageUrl;
    return validated;
  } catch (err) {
    console.error('Gemini editRecipeApi failed:', err);
    throw geminiFailure(err, 'change this recipe');
  }
}

export async function generateAlternativeInstructionsApi(
  name: string,
  ingredients: Ingredient[],
  targetMethod: CookingMethod,
  existingInstructions: string[],
  existingMethods?: string[]
): Promise<{ instructions: string[]; prepTime: number; cookTime: number }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const prompt = `Translate the cooking instructions for "${name}" into steps optimized specifically for the "${targetMethod}" appliance.

Appliance Context:
- "oven_hob" is traditional stovetop cooking, boiling, pan-searing, and conventional oven baking.
- "ninja" is the Ninja Combi Multi-cooker / Airfryer, utilizing Combi Meals, Combi Bake, Air Fry, Slow Cook, or Steam modes.

Ingredients:
${JSON.stringify(ingredients, null, 2)}

Existing Instructions (${existingMethods?.join(', ') || 'original'}):
${JSON.stringify(existingInstructions, null, 2)}

Provide specific times, temperatures in °C, and settings relevant to the target appliance.
Dynamically calculate prepTime and cookTime in minutes (as integers) for this target appliance. Never use hardcoded defaults.
Do not include macros or cost estimates.`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      instructions: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Step-by-step instructions specifically formatted for target appliance"
      },
      prepTime: {
        type: "INTEGER",
        description: "Realistic preparation time in minutes for target appliance. Integer only."
      },
      cookTime: {
        type: "INTEGER",
        description: "Realistic cooking time in minutes for target appliance. Integer only."
      }
    },
    required: ["instructions", "prepTime", "cookTime"]
  };

  try {
    const rawText = await callGeminiRest(apiKey, prompt, 'You are an expert appliance chef. Translate recipes to specific appliances.', responseSchema);
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini generateAlternativeInstructionsApi failed:', err);
    throw geminiFailure(err, `write the ${targetMethod === 'ninja' ? 'Ninja Combi' : 'hob/oven'} version`);
  }
}

export async function cleanGroceryDatabaseApi(items: GroceryItem[]): Promise<any[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const prompt = `Review the following household grocery database items and identify duplicates, naming inconsistencies, and miscategorized aisles.

Item Catalog:
${JSON.stringify(items.map((i: any) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  unit: i.unit,
  aliases: i.aliases || []
})), null, 2)}

Return a structured JSON object with the "actions" array detailing any recommended merges, renames, and recategorizations. If clean, return {"actions": []}.`;

  try {
    const rawText = await callGeminiRest(apiKey, prompt, 'You are a database normalization specialist.', CLEAN_DATABASE_SCHEMA);
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const data = JSON.parse(cleanText);
    return data?.actions || [];
  } catch (err) {
    console.error('Gemini cleanGroceryDatabaseApi failed, falling back locally:', err);
    return cleanGroceryDatabaseLocally(items);
  }
}
