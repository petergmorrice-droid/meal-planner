/**
 * The recipe requests: read a recipe from a web page, a photo or pasted text; write one; change
 * one; write the other appliance's steps; answer a question while cooking.
 */
import { Recipe, Ingredient, CookingMethod, CookWith } from '../../types';
import {
  GeminiReply,
  NoGeminiKeyError,
  UrlRead,
  askGemini,
  askGeminiText,
  geminiFailure,
  getGeminiApiKey,
  readJsonAnswer,
} from './client';
import {
  COPY_OUT_RULES,
  COPY_RECIPE_SCHEMA,
  COPY_SYSTEM_INSTRUCTION,
  EDIT_RECIPE_SCHEMA,
  NO_RECIPE,
  RECIPE_RESPONSE_SCHEMA,
  recipeSystemInstruction,
} from './prompts';
import { GeminiRecipe, applyGeminiEdit, normalizeParsedRecipe, validateAndNormalizeRecipe } from './recipeRules';

/** Thrown when Gemini can't open a recipe page or read a photo, so the screen can say what to do instead. */
export class RecipeSourceError extends Error {
  constructor(
    public kind: 'page' | 'photo',
    message: string,
  ) {
    super(message);
  }
}
/** Did the page-reading tool actually open the page? (Gemini may otherwise guess from the address.) */
function pageWasRead(response: GeminiReply): boolean {
  const meta = response?.candidates?.[0]?.urlContextMetadata || response?.candidates?.[0]?.url_context_metadata;
  const entries: UrlRead[] = meta?.urlMetadata || meta?.url_metadata || [];
  return entries.some((e) => /SUCCESS/i.test(String(e?.urlRetrievalStatus || e?.url_retrieval_status || '')));
}

/**
 * Link import, step 1: Gemini opens the recipe page (its URL context tool) and copies the recipe
 * out as text. Step 2 is the usual exact-copy into fields (parseRecipeApi).
 */
export async function readRecipePageApi(url: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');
  let result: { text: string; response: GeminiReply };
  try {
    // Opening the page takes Gemini a while on some sites, so this one gets longer.
    result = await askGemini(
      apiKey,
      [{ text: `Open this web page and find the recipe on it.\n${COPY_OUT_RULES}\n\nPage: ${url}` }],
      { tools: [{ url_context: {} }], thinking: 'low', light: true, waitSeconds: 90 },
    );
  } catch (err) {
    console.error('Gemini readRecipePageApi failed:', err);
    throw geminiFailure(err, 'open that page');
  }
  if (!pageWasRead(result.response) || result.text.includes(NO_RECIPE) || result.text.length < 40) {
    throw new RecipeSourceError(
      'page',
      "Gemini couldn't read a recipe from that page (some sites block it, or the recipe is behind a login). Open the page, copy the recipe and paste it here instead.",
    );
  }
  return result.text;
}

/** Photo import, step 1: Gemini copies the recipe text from a photo of a cookbook page or a screen. */
export async function readRecipePhotoApi(base64: string, mimeType: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');
  let result: { text: string; response: GeminiReply };
  try {
    result = await askGemini(
      apiKey,
      [
        { inlineData: { mimeType, data: base64 } },
        { text: `This is a photo of a recipe (a cookbook page, a card or a screen).\n${COPY_OUT_RULES}` },
      ],
      { thinking: 'low', light: true, waitSeconds: 60 },
    );
  } catch (err) {
    console.error('Gemini readRecipePhotoApi failed:', err);
    throw geminiFailure(err, 'read the photo');
  }
  if (result.text.includes(NO_RECIPE) || result.text.length < 40) {
    throw new RecipeSourceError(
      'photo',
      "Gemini couldn't find a recipe in that photo. Try a sharper photo with the whole recipe in view, flat and in good light.",
    );
  }
  return result.text;
}
/** Step 1: Gemini copies the pasted recipe into fields. */
export async function parseRecipeApi(text: string, cookingMethod: 'ninja' | 'oven_hob'): Promise<Recipe> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  const selectedMethod = cookingMethod === 'ninja' ? 'ninja' : 'oven_hob';
  const prompt = `Copy this recipe into the JSON fields exactly as written.\n\nRecipe text:\n${text}`;

  let data: GeminiRecipe;
  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction: COPY_SYSTEM_INSTRUCTION,
      responseSchema: COPY_RECIPE_SCHEMA,
      thinking: 'low',
      light: true,
      waitSeconds: 60,
    });
    data = readJsonAnswer(rawText);
  } catch (err) {
    console.error('Gemini parseRecipeApi failed:', err);
    throw geminiFailure(err, 'read this recipe');
  }
  const recipe = normalizeParsedRecipe(data, selectedMethod);
  if (recipe.ingredients.length === 0) {
    throw new Error(
      "Gemini couldn't find any ingredients in that text. Check the whole recipe was pasted, including the ingredients list, and try again.",
    );
  }
  return recipe;
}

/**
 * Step 2 (only for ingredients the app couldn't match exactly): ask Gemini which
 * grocery-list product each one is. Returns ingredient name -> product name ('' = none).
 * Failure is harmless: those ingredients just go to the Map Ingredient step.
 */
export async function suggestGroceryProductsApi(
  ingredientNames: string[],
  productNames: string[],
): Promise<Record<string, string>> {
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
    type: 'OBJECT',
    properties: {
      matches: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            ingredient: { type: 'STRING', description: 'The recipe ingredient exactly as given' },
            product: { type: 'STRING', description: 'Grocery-list product name exactly as listed, or empty' },
          },
          required: ['ingredient', 'product'],
        },
      },
    },
    required: ['matches'],
  };
  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction: 'You match recipe ingredients to a fixed grocery list. Never invent product names.',
      responseSchema: schema,
      thinking: 'low',
      light: true,
      waitSeconds: 30,
    });
    const data: { matches?: ({ ingredient?: unknown; product?: unknown } | null)[] } = readJsonAnswer(rawText);
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

/**
 * Write a new recipe. It's for as many people as the request says ("macaroni cheese for 4"),
 * otherwise for how many you usually cook for (Settings → Household).
 */
export async function generateRecipeApi(
  promptText: string,
  cookingMethod: CookWith,
  usualServings = 2,
): Promise<Recipe> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  // A slow-cooker recipe is saved as an oven/hob one (anything browned first is done on the hob), marked slow cook.
  const slow = cookingMethod === 'slow_cook';
  const selectedMethod = cookingMethod === 'ninja' ? 'ninja' : 'oven_hob';
  const methodNameLabel = slow
    ? 'Slow cooker (anything browned first is done on the hob; give the slow cooker setting and hours)'
    : selectedMethod === 'ninja'
      ? 'Ninja Combi Multi-cooker / Air Fryer'
      : 'Stove / Oven (Traditional Hob / Oven)';

  const prompt = `Create an original, delicious, complete recipe from scratch based on the following idea:
"${promptText.trim()}"

Target Cooking Appliance: ${methodNameLabel} ("${slow ? 'slow_cook' : selectedMethod}").

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

5. Servings: if the idea says how many people it is for, write it for exactly that many; otherwise write it for ${usualServings}. Set servings to that number, and make every amount (in the ingredients and the steps) right for that many people.
- Exclude all macros, health scores, and cost estimates.`;

  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction: recipeSystemInstruction(),
      responseSchema: RECIPE_RESPONSE_SCHEMA,
      waitSeconds: 90,
    });
    const data: GeminiRecipe = readJsonAnswer(rawText);
    const recipe = validateAndNormalizeRecipe(data, selectedMethod, promptText, usualServings);
    return slow ? { ...recipe, slowCook: true } : recipe;
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

  const methods: CookingMethod[] = recipe.cookingMethods?.length ? recipe.cookingMethods : ['oven_hob'];
  const serves = recipe.servings || 2;
  // Just the recipe itself (not the app's bookkeeping), so Gemini changes only that.
  const shown = {
    name: recipe.name,
    description: recipe.description,
    servings: serves,
    ingredients: recipe.ingredients.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, note: i.note || '' })),
    methodInstructions: Object.fromEntries(
      methods.map((m) => [m, recipe.methodInstructions?.[m] || (m === methods[0] ? recipe.instructions : [])]),
    ),
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
  };

  const prompt = `Change this recipe as asked: "${instruction}"

The recipe (it serves ${serves}, and the amounts are for ${serves} people):
${JSON.stringify(shown, null, 2)}

Rules:
- Change only what the request asks for. Keep everything else exactly as it is: ingredient names, amounts and notes, and the wording of the steps.
- servings: keep ${serves}, unless the request is to change how many it serves. Then set the new number and scale every amount, including amounts in the steps.
- Give the steps for each appliance the recipe has, in methodInstructions: ${methods.join(', ')} ("oven_hob" is the hob and oven, "ninja" the Ninja Combi). Put the ${methods[0]} steps in instructions too.
- Recalculate prepTime, cookTime, isVegetarian and isVegan for the changed recipe.
- Amounts are positive decimals with standard units. No macros, health scores or costs.`;

  let data: GeminiRecipe;
  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction: recipeSystemInstruction(),
      responseSchema: EDIT_RECIPE_SCHEMA,
      waitSeconds: 90,
    });
    data = readJsonAnswer(rawText);
  } catch (err) {
    console.error('Gemini editRecipeApi failed:', err);
    throw geminiFailure(err, 'change this recipe');
  }
  return applyGeminiEdit(recipe, data);
}

export async function generateAlternativeInstructionsApi(
  name: string,
  ingredients: Ingredient[],
  targetMethod: CookingMethod,
  existingInstructions: string[],
  existingMethods?: string[],
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
    type: 'OBJECT',
    properties: {
      instructions: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Step-by-step instructions specifically formatted for target appliance',
      },
      prepTime: {
        type: 'INTEGER',
        description: 'Realistic preparation time in minutes for target appliance. Integer only.',
      },
      cookTime: {
        type: 'INTEGER',
        description: 'Realistic cooking time in minutes for target appliance. Integer only.',
      },
    },
    required: ['instructions', 'prepTime', 'cookTime'],
  };

  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction: 'You are an expert appliance chef. Translate recipes to specific appliances.',
      responseSchema,
      waitSeconds: 90,
    });
    return readJsonAnswer(rawText);
  } catch (err) {
    console.error('Gemini generateAlternativeInstructionsApi failed:', err);
    throw geminiFailure(err, `write the ${targetMethod === 'ninja' ? 'Ninja Combi' : 'hob/oven'} version`);
  }
}
/**
 * A question asked while cooking ("Can I use crème fraîche instead?", "How do I know it's done?").
 * Gemini answers from the recipe as you're cooking it (your amounts, your appliance, the step
 * you're on) in a couple of short spoken-style sentences.
 */
export async function askAboutRecipeApi(
  recipe: Recipe,
  question: string,
  context: { method: string; servings: number; step: number; steps: string[]; ingredients: string[] },
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new NoGeminiKeyError();
  const where =
    context.step === 0
      ? 'They are getting the ingredients out, before step 1.'
      : `They are on step ${context.step} of ${context.steps.length}: "${context.steps[context.step - 1] || ''}"`;
  const prompt = [
    `Recipe: ${recipe.name}`,
    `Cooking for ${context.servings} people, using the ${context.method === 'ninja' ? 'Ninja multi-cooker' : 'oven and hob'}.`,
    'Ingredients (for these people):',
    ...context.ingredients.map((x) => `- ${x}`),
    'Method:',
    ...context.steps.map((x, i) => `${i + 1}. ${x}`),
    recipe.notes ? `Their own notes on this recipe: ${recipe.notes}` : '',
    where,
    '',
    `Question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n');
  const system = [
    'You are a calm, practical cooking helper in a UK family kitchen. Someone is cooking this recipe right now and asked a question, often by voice.',
    'Answer in one to three short sentences of plain text that read well aloud: no lists, no markdown, no headings.',
    'Use British English and metric units (and gas marks only if asked). Give amounts for the number of people they are cooking for.',
    'Answer from the recipe when it says; otherwise give sensible, safe general cooking advice and say briefly that it is not in the recipe.',
    'Be accurate about food safety (cooking meat through, reheating, allergens). If you are not sure, say so.',
  ].join(' ');
  const text = await askGeminiText(apiKey, prompt, {
    systemInstruction: system,
    thinking: 'low',
    light: true,
    waitSeconds: 30,
  });
  return String(text || '')
    .replace(/[*#_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COOK_WITH_TEXT: Record<CookWith, string> = {
  oven_hob: 'an oven and hob',
  ninja: 'a Ninja Combi multi-cooker',
  slow_cook: 'a slow cooker',
};

/** A meal idea for using up what's left (Auto populate): a card, not yet a recipe. */
export interface MealIdea {
  name: string;
  /** One sentence about it. */
  description: string;
  /** The leftovers it uses, worded as they were given. */
  uses: string[];
  /** About how long it takes in all, if Gemini said. */
  minutes: number | null;
}

/**
 * Ideas for dinners: four short cards, using up what's left when `leftovers` lists anything,
 * otherwise new ideas for the cookbook. Writing one out is the usual "Ask Gemini to write one"
 * (generateRecipeApi), so only the one you pick costs a full request.
 */
export async function suggestMealIdeasApi(
  leftovers: string[],
  context: {
    people: number;
    /** What it's cooked with (none: any of them). */
    cooking: CookWith[];
    /** Ingredients you'd like to use ("salmon", "chickpeas"). */
    ingredients?: string[];
    /** Meals you like (favourites, high stars), for a sense of taste. */
    liked: string[];
    /** Meals you said are "Not for us". */
    disliked: string[];
    /** Meals already in the cookbook (not suggested again). */
    have: string[];
    /** What else you'd like: "quick: 30 minutes or less in all", "vegetarian", or your own words. */
    wishes?: string[];
  },
): Promise<MealIdea[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new NoGeminiKeyError();
  const ways = (context.cooking.length ? context.cooking : (['oven_hob', 'ninja', 'slow_cook'] as const)).map(
    (c) => COOK_WITH_TEXT[c],
  );
  const cooking = ways.length > 1 ? `${ways.slice(0, -1).join(', ')} or ${ways[ways.length - 1]}` : ways[0];
  const ingredients = (context.ingredients || []).map((i) => i.trim()).filter(Boolean);
  const taste = [
    context.liked.length ? `Meals we like: ${context.liked.slice(0, 12).join('; ')}.` : '',
    context.disliked.length ? `Not for us: ${context.disliked.slice(0, 12).join('; ')}.` : '',
    context.have.length
      ? `Already in our cookbook (suggest something else): ${context.have.slice(0, 60).join('; ')}.`
      : '',
  ].filter(Boolean);
  const people = Math.max(1, context.people);
  const wishes = (context.wishes || []).map((w) => w.trim()).filter(Boolean);
  const prompt = [
    ...(leftovers.length
      ? [
          `Suggest 4 different dinners for ${people} people that use up these leftovers before they go off. Each should use as many of them as makes sense:`,
          ...leftovers.map((x) => `- ${x}`),
        ]
      : [`Suggest 4 different dinners for ${people} people: new ideas for our cookbook.`]),
    '',
    `Everyday home cooking from UK supermarket ingredients, made with ${cooking}.`,
    ...(ingredients.length
      ? [`Ingredients we'd like to use (each idea should use at least one): ${ingredients.join(', ')}.`]
      : []),
    ...(wishes.length ? [`What we'd like: ${wishes.join('; ')}.`] : []),
    ...taste,
    '',
    leftovers.length
      ? 'For each: a short plain name, one sentence about it, which of the leftovers above it uses (worded exactly as listed), and roughly how many minutes it takes in all.'
      : 'For each: a short plain name, one sentence about it, its two or three main ingredients, and roughly how many minutes it takes in all.',
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: {
      ideas: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Short plain name, e.g. "Chicken and coriander noodles"' },
            description: { type: 'STRING', description: 'One sentence about it' },
            uses: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'The leftovers it uses, exactly as listed (or its main ingredients when there are none)',
            },
            minutes: { type: 'INTEGER', description: 'Roughly how long it takes in all, in minutes' },
          },
          required: ['name', 'description', 'uses'],
        },
      },
    },
    required: ['ideas'],
  };
  try {
    const rawText = await askGeminiText(apiKey, prompt, {
      systemInstruction:
        'You suggest practical family dinners in British English. Never suggest anything unsafe to eat; leftovers are raw ingredients still in date.',
      responseSchema: schema,
      thinking: 'low',
      waitSeconds: 45,
    });
    const data: { ideas?: ({ name?: unknown; description?: unknown; uses?: unknown; minutes?: unknown } | null)[] } =
      readJsonAnswer(rawText);
    const out: MealIdea[] = [];
    for (const idea of Array.isArray(data?.ideas) ? data.ideas : []) {
      const name = typeof idea?.name === 'string' ? idea.name.trim() : '';
      if (!name || out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue;
      const minutes = Number(idea?.minutes);
      out.push({
        name,
        description: typeof idea?.description === 'string' ? idea.description.trim() : '',
        uses: Array.isArray(idea?.uses)
          ? idea.uses.filter((u): u is string => typeof u === 'string' && !!u.trim())
          : [],
        minutes: isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
      });
    }
    return out.slice(0, 4);
  } catch (err) {
    console.error('Gemini suggestMealIdeasApi failed:', err);
    throw geminiFailure(err, "suggest meals for what's left");
  }
}
