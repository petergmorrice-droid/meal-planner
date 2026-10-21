/**
 * Turning Gemini's answers into recipes: what it copied is kept as written (only gaps are
 * filled), a recipe it wrote is made ready to save, and an edit is applied onto the recipe as it was.
 */
import { Recipe, Ingredient, CookingMethod } from '../../types';

/**
 * A recipe as Gemini sends it back: what the schema asks for, but any field may be missing or odd,
 * so each is checked before use. Anything else it sends is kept.
 */
export interface GeminiRecipe {
  [field: string]: unknown;
  id?: string;
  name?: unknown;
  description?: unknown;
  servings?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  ingredients?: (GeminiIngredient | null)[];
  instructions?: unknown[];
  methodInstructions?: Partial<Record<CookingMethod, string[]>>;
  methodPrepTime?: Partial<Record<CookingMethod, number>>;
  methodCookTime?: Partial<Record<CookingMethod, number>>;
  isVegetarian?: unknown;
  isVegan?: unknown;
  isGlutenFree?: unknown;
  isDairyFree?: unknown;
}
interface GeminiIngredient {
  name?: unknown;
  amount?: unknown;
  unit?: unknown;
  note?: unknown;
}
function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();
  if (
    /chicken|beef|pork|steak|bacon|pancetta|fish|salmon|tuna|cod|prawn|shrimp|turkey|lamb|sausage|meat|duck|veal|venison|chorizo|prosciutto|scallop|mussel|clam|squid|calamari/.test(
      lower,
    )
  ) {
    return 'Meat & Seafood';
  }
  if (
    /(?:milk|cheese|butter|cream|yogurt|yoghurt|parmesan|cheddar|mozzarella|feta|ricotta|egg|eggs|ghee|sour cream)\b/.test(
      lower,
    ) &&
    !/(?:almond|oat|soy|coconut|vegan|plant-based)\s+(?:milk|cheese|butter|yogurt)/.test(lower)
  ) {
    return 'Dairy';
  }
  if (
    /onion|garlic|potato|tomato|carrot|broccoli|spinach|lettuce|cucumber|pepper|mushroom|lemon|lime|avocado|apple|herb|basil|parsley|ginger|chilli|coriander|zucchini|courgette|aubergine|eggplant|cabbage|cauliflower|celery|leek|asparagus|beans|kale|peas|scallion|spring onion|shallot/.test(
      lower,
    )
  ) {
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

function normalizeIngredientAmountAndUnit(
  rawAmount: unknown,
  rawUnit: unknown,
  rawName: string,
): {
  name: string;
  amount: number;
  unit: string;
  category: string;
  suggestedAisle: string;
} {
  let name = (rawName || '').trim();
  let unit = ((rawUnit || '') as string).trim().toLowerCase();
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
    suggestedAisle: category,
  };
}

function analyzeDietaryFlags(ingredients: Array<{ name: string }>): { isVegetarian: boolean; isVegan: boolean } {
  const meatKeywords =
    /chicken|beef|pork|steak|bacon|pancetta|fish|salmon|tuna|cod|prawn|shrimp|turkey|lamb|sausage|meat|duck|veal|venison|chorizo|prosciutto|scallop|mussel|clam|squid|calamari|broth|gelatin|lard/i;
  const animalKeywords =
    /milk|cheese|butter|cream|yogurt|yoghurt|parmesan|cheddar|mozzarella|feta|ricotta|egg|eggs|ghee|sour cream|honey|mayo/i;

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
    isVegan: !hasMeat && !hasAnimal,
  };
}

function estimateDynamicTimes(
  ingredients: { name: string }[],
  instructions: string[],
  _targetMethod: string,
): { prepTime: number; cookTime: number } {
  let prepTime = 5;
  let cookTime = 5;

  ingredients.forEach((ing) => {
    const name = ing.name.toLowerCase();
    if (/chicken|beef|pork|steak|lamb/.test(name)) prepTime += 5;
    if (/onion|garlic|pepper|potato|carrot|broccoli|vegetable/.test(name)) prepTime += 3;
  });

  instructions.forEach((step) => {
    const lower = step.toLowerCase();
    if (lower.includes('bake') || lower.includes('roast')) cookTime += 15;
    else if (lower.includes('simmer') || lower.includes('slow cook')) cookTime += 20;
    else if (lower.includes('sauté') || lower.includes('sear') || lower.includes('fry')) cookTime += 8;
  });

  return {
    prepTime: Math.min(60, Math.max(5, prepTime)),
    cookTime: Math.min(120, Math.max(5, cookTime)),
  };
}

// Words that mean an ingredient contains gluten / dairy, and the exceptions ("coconut milk", "butter beans").
const GLUTEN_WORDS =
  /\b(flour|bread|breadcrumbs?|panko|pasta|penne|spaghetti|fusilli|farfalle|linguine|tagliatelle|pappardelle|lasagne|lasagna|macaroni|rigatoni|conchiglie|orzo|gnocchi|noodles?|couscous|bulgur|bulgar|barley|semolina|wheat|spelt|rye|pastry|filo|phyllo|tortillas?|wraps?|pittas?|pitas?|naans?|buns?|rolls?|baguette|ciabatta|focaccia|sourdough|crackers?|biscuits?|cake|crumble|batter|dumplings?|beer|ale|soy sauce|seitan|stuffing|yorkshire|croutons?)\b/;
const NOT_GLUTEN = /\b(gluten[- ]free|rice noodles?|rice flour|cornflour|corn flour|gram flour|buckwheat|tamari)\b/;
const DAIRY_WORDS =
  /\b(milk|cheese|cheddar|parmesan|mozzarella|feta|halloumi|ricotta|mascarpone|paneer|brie|camembert|gruy[eè]re|pecorino|burrata|stilton|butter|ghee|cream|cr[eè]me fra[iî]che|yogh?urt|custard|quark|kefir|whey)\b/;
const NOT_DAIRY =
  /\b(coconut|oat|almond|soy|soya|rice|cashew|peanut|vegan|dairy[- ]free|plant[- ]based|butter ?beans?|butternut|cream of tartar)\b/;

/**
 * Recipe tags. "Gluten-Free" / "Dairy-Free" are only added when no ingredient looks like
 * gluten or dairy AND (for imported recipes) Gemini agreed - a wrong "free-from" label is
 * worse than a missing one.
 */
function generateFunctionalTags(
  ingredients: { name?: string }[],
  isVegetarian: boolean,
  isVegan: boolean,
  method: string,
  ai?: { glutenFree?: unknown; dairyFree?: unknown },
): string[] {
  const tags: string[] = [];
  if (isVegan) tags.push('Vegan');
  else if (isVegetarian) tags.push('Vegetarian');

  let hasGluten = false;
  let hasDairy = false;

  ingredients.forEach((ing) => {
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

/** A recipe Gemini wrote or changed, made ready to save: gaps filled, its own extras kept. */
export function validateAndNormalizeRecipe(
  data: GeminiRecipe,
  selectedMethod: 'ninja' | 'oven_hob',
  rawText?: string,
): Recipe {
  // Ingredients, each with its own id like every other recipe's.
  const ingredients: Ingredient[] = (data.ingredients || []).map((ing) => ({
    id: crypto.randomUUID(),
    ...normalizeIngredientAmountAndUnit(ing!.amount, ing!.unit, ing!.name as string),
  }));

  const instructions = (
    Array.isArray(data.instructions)
      ? data.instructions.filter(Boolean)
      : rawText
        ? rawText.split('\n').filter(Boolean)
        : []
  ) as string[];

  // Set method instructions
  const methodInstructions = data.methodInstructions || {};
  if (!methodInstructions[selectedMethod] || methodInstructions[selectedMethod].length === 0) {
    methodInstructions[selectedMethod] = [...instructions];
  }

  // Calculate times
  const estTimes = estimateDynamicTimes(ingredients, instructions, selectedMethod);
  const prepTime = (data.prepTime as number) || estTimes.prepTime;
  const cookTime = (data.cookTime as number) || estTimes.cookTime;

  const methodPrepTime = data.methodPrepTime || {};
  const methodCookTime = data.methodCookTime || {};
  methodPrepTime[selectedMethod] = methodPrepTime[selectedMethod] || prepTime;
  methodCookTime[selectedMethod] = methodCookTime[selectedMethod] || cookTime;

  // Dietary and tags: Gemini's own judgement is better than word matching ("eggplant" isn't egg).
  const flags = analyzeDietaryFlags(ingredients);
  const isVegetarian = typeof data?.isVegetarian === 'boolean' ? data.isVegetarian : flags.isVegetarian;
  const isVegan = typeof data?.isVegan === 'boolean' ? data.isVegan && isVegetarian : flags.isVegan;

  return {
    ...(data as Partial<Recipe>), // anything else Gemini sent back is kept
    id: data.id || crypto.randomUUID(),
    name: (data.name as string) || 'Custom Recipe',
    description: (data.description as string) || 'Custom home-cooked meal.',
    servings: 2,
    ingredients,
    instructions,
    methodInstructions,
    prepTime,
    cookTime,
    methodPrepTime,
    methodCookTime,
    isVegetarian,
    isVegan,
    tags: generateFunctionalTags(ingredients, isVegetarian, isVegan, selectedMethod),
    cookingMethods: [selectedMethod],
  };
}
/**
 * Turn what Gemini copied into a Recipe without changing it: names, amounts,
 * units, notes and method steps are kept exactly as read. Only gaps are filled
 * (missing times are estimated, missing servings default to 2).
 */
export function normalizeParsedRecipe(
  data: GeminiRecipe | null | undefined,
  selectedMethod: 'ninja' | 'oven_hob',
): Recipe {
  const toNumber = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isFinite(n) && n > 0 ? n : 0;
  };
  const ingredients: Ingredient[] = (Array.isArray(data?.ingredients) ? data.ingredients : [])
    .filter(
      (ing): ing is GeminiIngredient & { name: string } => !!ing && typeof ing.name === 'string' && !!ing.name.trim(),
    )
    .map((ing) => {
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
    .map((step) => String(step ?? '').trim())
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
    tags: generateFunctionalTags(ingredients, isVegetarian, isVegan, selectedMethod, {
      glutenFree: data?.isGlutenFree,
      dairyFree: data?.isDairyFree,
    }),
    cookingMethods: [selectedMethod],
    isVegetarian,
    isVegan,
  };
}
/** Tags that follow from the ingredients (worked out again after an edit); any others are yours and kept. */
const DIET_TAGS = new Set(['Vegan', 'Vegetarian', 'Gluten-Free', 'Dairy-Free']);

/**
 * Gemini's changed version of a recipe, applied onto the recipe as it was: what the edit changed is
 * taken from the reply, and everything else stays (favourite, notes and who wrote them, how many it
 * serves, both appliances' steps, your tags, and each unchanged ingredient's link to its product).
 */
export function applyGeminiEdit(original: Recipe, reply: GeminiRecipe): Recipe {
  const methods: CookingMethod[] = original.cookingMethods?.length ? original.cookingMethods : ['oven_hob'];
  const main = methods[0];
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const positive = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined);
  const steps = (v: unknown) => {
    const list = Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
    return list.length ? list : undefined;
  };

  // Ingredients: an unchanged name keeps its id, product link, aisle and note (unless a new note came back).
  const before = new Map(original.ingredients.map((i) => [i.name.trim().toLowerCase(), i]));
  const ingredients: Ingredient[] = (reply.ingredients || [])
    .filter((ing): ing is GeminiIngredient & { name: string } => !!ing && !!text(ing.name))
    .map((ing) => {
      const fresh = normalizeIngredientAmountAndUnit(ing.amount, ing.unit, ing.name);
      const old = before.get(fresh.name.toLowerCase());
      const note = text(ing.note) ?? old?.note;
      return {
        ...fresh,
        id: old?.id || crypto.randomUUID(),
        ...(old
          ? { category: old.category ?? fresh.category, suggestedAisle: old.suggestedAisle ?? fresh.suggestedAisle }
          : {}),
        ...(old?.groceryId ? { groceryId: old.groceryId } : {}),
        ...(note ? { note } : {}),
      };
    });
  if (ingredients.length === 0) {
    throw new Error("Gemini's changed recipe came back without its ingredients, so nothing was changed. Try again.");
  }

  // Steps for each appliance the recipe has; one Gemini left out keeps its old steps.
  const methodInstructions = { ...(original.methodInstructions || {}) };
  for (const m of methods) {
    const fromReply = steps(reply.methodInstructions?.[m]) ?? (m === main ? steps(reply.instructions) : undefined);
    if (fromReply) methodInstructions[m] = fromReply;
  }
  const instructions = methodInstructions[main] || original.instructions;

  const prepTime = positive(reply.prepTime) ?? original.prepTime;
  const cookTime = positive(reply.cookTime) ?? original.cookTime;
  const flags = analyzeDietaryFlags(ingredients);
  const isVegetarian = typeof reply.isVegetarian === 'boolean' ? reply.isVegetarian : flags.isVegetarian;
  const isVegan = typeof reply.isVegan === 'boolean' ? reply.isVegan && isVegetarian : flags.isVegan;
  const dietTags = generateFunctionalTags(ingredients, isVegetarian, isVegan, main).filter((t) => DIET_TAGS.has(t));
  const servings = positive(reply.servings);

  return {
    ...original,
    name: text(reply.name) ?? original.name,
    description: text(reply.description) ?? original.description,
    servings: servings ? Math.round(servings) : original.servings || 2,
    ingredients,
    instructions,
    methodInstructions,
    prepTime,
    cookTime,
    methodPrepTime: { ...(original.methodPrepTime || {}), [main]: prepTime },
    methodCookTime: { ...(original.methodCookTime || {}), [main]: cookTime },
    isVegetarian,
    isVegan,
    tags: [...new Set([...(original.tags || []).filter((t) => !DIET_TAGS.has(t)), ...dietTags])],
  };
}
