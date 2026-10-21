/** What Gemini is told, and the shape its answers must have. */
import { getCatalog } from '../../utils/shoppingConversion';

export const NO_RECIPE = 'NO_RECIPE';
export const COPY_OUT_RULES = `Copy the recipe out exactly as written, as plain text:
- the recipe title on the first line
- servings and prep/cook times if given
- every ingredient line, one per line, with its quantity exactly as written
- every method step, in order
Do not add, change, scale, convert or invent anything. Leave out adverts, stories, comments, nutrition panels and other recipes.
If there is no recipe, or you cannot read it, reply with exactly ${NO_RECIPE}`;
export const RECIPE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Recipe title' },
    description: { type: 'STRING', description: 'Engaging concise description of the meal portioned for 2 adults' },
    ingredients: {
      type: 'ARRAY',
      description: 'List of ingredients with normalized decimal quantities and standard units',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            description:
              'Product name in the singular, exactly as on the grocery list when it is one of those products; no quantities or preparation',
          },
          amount: {
            type: 'NUMBER',
            description: 'Standardized positive decimal number (e.g. 1.0, 0.5, 0.25, 200). Never fractions or strings.',
          },
          unit: {
            type: 'STRING',
            description:
              'One of: g, kg, ml, l, tsp, tbsp, cup, piece, clove, can, bunch, pack, slice, rasher, fillet, sprig, stick, pinch, handful',
          },
          category: { type: 'STRING', description: 'Produce, Meat & Seafood, Dairy, Bakery, Frozen, or Pantry' },
          suggestedAisle: { type: 'STRING', description: 'Produce, Meat & Seafood, Dairy, Bakery, Frozen, or Pantry' },
        },
        required: ['name', 'amount', 'unit', 'category', 'suggestedAisle'],
      },
    },
    instructions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Step-by-step instructions with exact decimal amounts matching the ingredients list',
    },
    methodInstructions: {
      type: 'OBJECT',
      properties: {
        ninja: { type: 'ARRAY', items: { type: 'STRING' } },
        oven_hob: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    },
    prepTime: {
      type: 'INTEGER',
      description:
        'Realistic preparation time in minutes calculated dynamically from chopping, peeling, and assembly complexity. Integer only.',
    },
    cookTime: {
      type: 'INTEGER',
      description:
        'Realistic cooking time in minutes calculated dynamically from cooking methods, heat, and duration. Integer only.',
    },
    methodPrepTime: {
      type: 'OBJECT',
      properties: {
        ninja: { type: 'INTEGER' },
        oven_hob: { type: 'INTEGER' },
      },
    },
    methodCookTime: {
      type: 'OBJECT',
      properties: {
        ninja: { type: 'INTEGER' },
        oven_hob: { type: 'INTEGER' },
      },
    },
    servings: { type: 'INTEGER', description: 'Must be 2' },
    tags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Rich, functional tags based on ingredients and method',
    },
    cookingMethods: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: "Array containing the selected appliance: ['ninja'] or ['oven_hob']",
    },
    isVegetarian: { type: 'BOOLEAN' },
    isVegan: { type: 'BOOLEAN' },
  },
  required: [
    'name',
    'description',
    'ingredients',
    'instructions',
    'prepTime',
    'cookTime',
    'servings',
    'tags',
    'cookingMethods',
    'isVegetarian',
    'isVegan',
  ],
};
const RECIPE_SYSTEM_INSTRUCTION = `You are an elite, highly precise, Michelin-star level culinary AI assistant and professional private home chef.
Your role is to translate or generate recipes optimized strictly for home cooking.

CRITICAL FORMATTING INVARIANT:
- ALWAYS return a structured JSON response matching the requested schema.
- Exclude all per-recipe per-serving macros, health scores, and cost estimates.`;
/** Allowed ingredient units, so every recipe uses the same vocabulary. */
const STANDARD_UNITS =
  'g, kg, ml, l, tsp, tbsp, cup, piece, clove, can, bunch, pack, slice, rasher, fillet, sprig, stick, pinch, handful';

/**
 * Instructions for every recipe request: the usual rules plus the household's
 * grocery-list names, so ingredients come back already standardised.
 */
export function recipeSystemInstruction(): string {
  let names: string[] = [];
  try {
    names = getCatalog()
      .products.filter((p) => !p.sameAs)
      .map((p) => p.name);
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

export const COPY_SYSTEM_INSTRUCTION = `You copy recipes exactly into structured data.
Rules:
- Never change, scale, round or convert any quantity. Copy numbers as written (write fractions like ½ as 0.5; for a range like 2-3 use the larger number).
- Never invent ingredients, quantities or steps. If something isn't in the text, leave it empty (0 or "").
- Copy the method steps word for word. You may remove step numbers and headings only.
- Return JSON matching the schema.`;

export const COPY_RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Recipe title as written' },
    description: {
      type: 'STRING',
      description: "The recipe's own introduction sentence if it has one, otherwise a plain one-sentence summary",
    },
    servings: { type: 'INTEGER', description: 'Number of servings as stated in the recipe; 0 if not stated' },
    prepTime: { type: 'INTEGER', description: 'Preparation time in minutes as stated; 0 if not stated' },
    cookTime: { type: 'INTEGER', description: 'Cooking time in minutes as stated; 0 if not stated' },
    ingredients: {
      type: 'ARRAY',
      description: 'Every ingredient line, in order, copied as written',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            description:
              "The ingredient as written, without the quantity, unit or preparation (e.g. 'skinless chicken breasts')",
          },
          amount: { type: 'NUMBER', description: "The quantity exactly as written; 0 if none (e.g. 'salt to taste')" },
          unit: {
            type: 'STRING',
            description: "The unit exactly as written (e.g. 'g', 'tbsp', 'tins', 'cloves'); empty if none",
          },
          note: {
            type: 'STRING',
            description:
              "Preparation or extra detail from the line (e.g. 'finely chopped', 'cut into chunks', 'drained'); empty if none",
          },
        },
        required: ['name', 'amount', 'unit', 'note'],
      },
    },
    instructions: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Method steps copied word for word' },
    isVegetarian: {
      type: 'BOOLEAN',
      description:
        'True only if there is no meat, poultry, fish, seafood, animal stock or gelatine (including hidden ones such as anchovies in Worcestershire sauce)',
    },
    isVegan: { type: 'BOOLEAN', description: 'True only if there are no animal products at all' },
    isGlutenFree: {
      type: 'BOOLEAN',
      description:
        'True only if no ingredient contains gluten (wheat, barley, rye, most pasta, bread, soy sauce, stock cubes that contain wheat...)',
    },
    isDairyFree: {
      type: 'BOOLEAN',
      description: 'True only if no ingredient contains milk or milk products (butter, cheese, cream, yogurt...)',
    },
  },
  required: ['name', 'servings', 'ingredients', 'instructions', 'isVegetarian', 'isVegan'],
};
/** The reply's shape for an edit: a recipe, plus how many it serves and each ingredient's note. */
export const EDIT_RECIPE_SCHEMA = {
  ...RECIPE_RESPONSE_SCHEMA,
  properties: {
    ...RECIPE_RESPONSE_SCHEMA.properties,
    description: { type: 'STRING', description: 'One short sentence about the meal' },
    servings: { type: 'INTEGER', description: 'How many people the amounts are for' },
    ingredients: {
      ...RECIPE_RESPONSE_SCHEMA.properties.ingredients,
      items: {
        ...RECIPE_RESPONSE_SCHEMA.properties.ingredients.items,
        properties: {
          ...RECIPE_RESPONSE_SCHEMA.properties.ingredients.items.properties,
          note: { type: 'STRING', description: 'Preparation, e.g. "finely chopped" (empty if none)' },
        },
      },
    },
  },
};
