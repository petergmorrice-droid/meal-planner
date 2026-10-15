import { ShoppingListItem, Recipe, MealPlan, DayPlan } from '../types';
import { INITIAL_GROCERY_DATABASE } from './initialGroceryDb';

export interface ConvertedIngredient {
  name: string;
  amount: number;
  unit: string;
  category?: string;
  step: number;
}

/**
 * Normalizes an ingredient name for flexible matching (lowercase, trimmed, singularized)
 */
export function normalizeIngredientName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Flexible check if an ingredient is a sauce, condiment, dressing, oil, vinegar, or seasoning.
 * Matches by common keywords, word stems, pantry categories, or typical condiment measure units (tbsp, tsp, splash).
 */
export function isSauceOrCondiment(name: string, unit: string = '', category: string = ''): boolean {
  const normName = normalizeIngredientName(name);
  const normUnit = (unit || '').toLowerCase().trim();
  const normCat = (category || '').toLowerCase().trim();

  // Any ingredient with explicit sauce/condiment words
  const explicitKeywords = [
    'sauce',
    'dressing',
    'condiment',
    'paste',
    'purée',
    'puree',
    'ketchup',
    'mayo',
    'mayonnaise',
    'mustard',
    'dijon',
    'vinegar',
    'vinaigrette',
    'oil',
    'syrup',
    'honey',
    'pesto',
    'chutney',
    'relish',
    'marinade',
    'glaze',
    'seasoning',
    'rub',
    'soy sauce',
    'tamari',
    'teriyaki',
    'worcestershire',
    'fish sauce',
    'oyster sauce',
    'sriracha',
    'tabasco',
    'hot sauce',
    'bbq',
    'barbecue',
    'sweet chilli',
    'hoisin',
    'mirin',
    'tahini',
    'harissa',
    'salsa'
  ];

  if (explicitKeywords.some(keyword => normName.includes(keyword))) {
    return true;
  }

  // Small measurement units combined with pantry/spice/condiment categories
  const smallUnits = ['tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'pinch', 'pinches', 'dash', 'splash', 'drizzle'];
  if (smallUnits.includes(normUnit)) {
    if (
      normCat.includes('pantry') || 
      normCat.includes('condiment') || 
      normCat.includes('sauce') || 
      normCat.includes('spice') || 
      normCat.includes('oil') ||
      normCat.includes('seasoning')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Flexible check for minced or ground meats (beef, pork, lamb, turkey, chicken).
 * Handles UK/Commonwealth "mince" and US/International "ground".
 */
export function isMincedMeat(name: string): boolean {
  const normName = normalizeIngredientName(name);
  return (
    normName.includes('mince') || 
    normName.includes('minced') ||
    normName.includes('ground beef') ||
    normName.includes('ground pork') ||
    normName.includes('ground turkey') ||
    normName.includes('ground chicken') ||
    normName.includes('ground lamb') ||
    normName.includes('ground meat') ||
    normName.startsWith('ground ')
  );
}

/**
 * Flexible check for canned tomatoes, passata, and canned pulses/beans/milks.
 * Matches chopped tomatoes, plum tomatoes, passata, kidney beans, chickpeas, coconut milk, etc.
 */
export function isCannedTomatoOrPulse(name: string, unit: string = '', category: string = ''): boolean {
  const normName = normalizeIngredientName(name);
  const normUnit = (unit || '').toLowerCase().trim();
  const normCat = (category || '').toLowerCase().trim();

  // Canned tomatoes & passata
  if (normName.includes('tomato') && (
    normName.includes('chopped') || 
    normName.includes('plum') || 
    normName.includes('tinned') || 
    normName.includes('canned') || 
    normName.includes('can') || 
    normName.includes('tin') ||
    normName.includes('crushed') ||
    normName.includes('diced') ||
    normName.includes('passata') ||
    normName.includes('purée') ||
    normName.includes('puree')
  )) {
    return true;
  }

  // Canned pulses, beans, milks, fish
  const cannedGoods = [
    'passata',
    'kidney bean',
    'black bean',
    'chickpea',
    'cannellini',
    'butter bean',
    'baked bean',
    'pinto bean',
    'haricot bean',
    'coconut milk',
    'coconut cream',
    'tinned tuna',
    'canned tuna',
    'canned sweetcorn',
    'tinned sweetcorn',
    'canned lentil',
    'tinned lentil'
  ];

  if (cannedGoods.some(item => normName.includes(item))) {
    return true;
  }

  // Generic can/tin indications
  if (
    normCat.includes('canned') || 
    normCat.includes('tin') || 
    normUnit.includes('can') || 
    normUnit.includes('tin') ||
    normName.endsWith('(can)') ||
    normName.endsWith('(tin)')
  ) {
    return true;
  }

  return false;
}

/**
 * Flexible check for fresh root vegetables or fresh produce typically sold in weight increments
 */
export function isBulkWeg(name: string): boolean {
  const normName = normalizeIngredientName(name);
  return (
    normName.includes('potato') ||
    normName.includes('sweet potato') ||
    normName.includes('onion') ||
    normName.includes('carrot') ||
    normName.includes('parsnip')
  );
}

/**
 * Helper to fetch the grocery database from local storage if available in the browser.
 */
function getGroceryDatabase(): any[] {
  try {
    if (typeof window !== 'undefined') {
      const stateStr = window.localStorage.getItem('mealPlannerState');
      if (stateStr) {
        const state = JSON.parse(stateStr);
        let baseDb = INITIAL_GROCERY_DATABASE;
        if (state && Array.isArray(state.groceryDatabase) && state.groceryDatabase.length > 0) {
          baseDb = state.groceryDatabase;
        }
        
        const overrides = state?.groceryOverrides || {};
        
        // Merge them
        const merged = baseDb.map(item => ({
          ...item,
          ...(overrides[item.id] || {})
        }));
        
        // Add new standalone custom items
        const baseIds = new Set(merged.map(i => i.id));
        const standalone = Object.values(overrides).filter((o: any) => o.name && o.id && !baseIds.has(o.id));
        
        return [...merged, ...standalone];
      }
    }
  } catch (e) {
    // Ignore error
  }
  return INITIAL_GROCERY_DATABASE;
}

/**
 * Flexible matching for ingredients in the grocery database (exact match, followed by substring heuristics)
 */
export function findGroceryDatabaseMatch(ingredientName: string, db: any[]): any {
  if (!ingredientName || !Array.isArray(db) || db.length === 0) return null;
  const normName = normalizeIngredientName(ingredientName);

  // 1. Exact match (name or alias)
  let matched = db.find(item => 
    normalizeIngredientName(item.name) === normName ||
    item.aliases?.some((alias: string) => normalizeIngredientName(alias) === normName)
  );
  if (matched) return matched;

  // 2. Substring match: e.g. "spinach" matches "Baby Spinach"
  const sortedDb = [...db].sort((a, b) => b.name.length - a.name.length);
  matched = sortedDb.find(item => {
    const dbNorm = normalizeIngredientName(item.name);
    if (dbNorm.length > 2 && normName.includes(dbNorm)) return true;
    return item.aliases?.some((alias: string) => {
      const aliasNorm = normalizeIngredientName(alias);
      return aliasNorm.length > 2 && normName.includes(aliasNorm);
    });
  });
  if (matched) return matched;

  // 3. Reverse substring match: e.g. "garlic cloves" matches "garlic"
  matched = sortedDb.find(item => {
    const dbNorm = normalizeIngredientName(item.name);
    if (normName.length > 2 && dbNorm.includes(normName)) return true;
    return item.aliases?.some((alias: string) => {
      const aliasNorm = normalizeIngredientName(alias);
      return normName.length > 2 && aliasNorm.includes(normName);
    });
  });
  return matched || null;
}

/**
 * Dynamically determines the sensible step increment and decrement for any shopping item
 */
export function getIngredientStep(item: { name: string; unit?: string; amount?: number; category?: string }): number {
  const db = getGroceryDatabase();
  const matchedMatch = findGroceryDatabaseMatch(item.name, db);
  if (matchedMatch) {
    return matchedMatch.increment || 1;
  }

  const name = normalizeIngredientName(item.name);
  const unit = (item.unit || '').toLowerCase().trim();

  // 1. Minced meat: 250g increments (or 0.25kg)
  if (isMincedMeat(name)) {
    if (unit === 'g') return 250;
    if (unit === 'kg') return 0.25;
  }

  // 2. Canned tomatoes and canned goods: 1 can increment (or 400g if unit is grams)
  if (unit.includes('400g can') || unit.includes('can') || unit.includes('tin')) {
    return 1;
  }
  if (unit === 'g' && isCannedTomatoOrPulse(name, unit, item.category)) {
    return 400;
  }

  // 3. Potatoes & bulk root produce: 250g increments
  if (unit === 'g' && isBulkWeg(name)) {
    return 250;
  }

  // 4. Fresh meat & poultry & fish portions in grams: 250g increments
  if (unit === 'g' && (
    name.includes('chicken') || 
    name.includes('beef') || 
    name.includes('pork') || 
    name.includes('steak') || 
    name.includes('salmon') ||
    name.includes('lamb') ||
    name.includes('turkey') ||
    name.includes('cod') ||
    name.includes('fish')
  )) {
    return 250;
  }

  // 5. Grains, pasta, rice, flour, sugar in grams: 100g increments
  if (unit === 'g' && (
    name.includes('rice') || 
    name.includes('pasta') || 
    name.includes('spaghetti') || 
    name.includes('noodle') ||
    name.includes('flour') ||
    name.includes('sugar') ||
    name.includes('oat')
  )) {
    return 100;
  }

  // 6. General grams: round to nearest multiple
  if (unit === 'g') {
    const amt = item.amount || 0;
    if (amt >= 250 && amt % 250 === 0) return 250;
    if (amt >= 100 && amt % 100 === 0) return 100;
    if (amt >= 50 && amt % 50 === 0) return 50;
    return 50;
  }

  // 7. Liquids in ml: 100ml or 50ml
  if (unit === 'ml') {
    const amt = item.amount || 0;
    if (amt >= 200) return 100;
    return 50;
  }

  // 8. Kilograms: 0.25kg or 0.5kg
  if (unit === 'kg') {
    return 0.25;
  }

  // 9. Standard individual units: cans, bottles, pieces, packs, heads, bulbs, eggs: step 1
  return 1;
}

/**
 * Converts raw recipe quantities (e.g. 6 tbsp Soy Sauce, 450g Minced Beef, 800g Chopped Tomatoes)
 * into realistic, sensible supermarket shopping quantities and units.
 */
export function convertToShoppingQuantity(
  name: string,
  rawAmount: number,
  rawUnit: string = '',
  category: string = ''
): { amount: number; unit: string; step: number; category?: string } {
  const db = getGroceryDatabase();
  const matched = findGroceryDatabaseMatch(name, db);
  if (matched) {
    const step = matched.increment || 1;
    const unit = matched.unit || '';
    const safeAmount = isNaN(rawAmount) || rawAmount <= 0 ? 1 : rawAmount;
    
    // Calculate the amount. If the standard database unit is a bulk weight or volume unit (like g or ml),
    // and the raw unit is empty or a generic count (indicating it came from an adhoc/stepper manual entry),
    // we scale the quantity directly as a multiplier of the step size (e.g., 2 x 250g minced beef = 500g).
    // Otherwise (e.g., it has a real unit from a recipe), we ceil-round it to the nearest standard step.
    const BULK_UNITS = ['g', 'ml', 'kg', 'l', 'oz', 'lb', 'grams', 'millilitres', 'milliliters'];
    const isRawUnitBulk = rawUnit && BULK_UNITS.includes(rawUnit.toLowerCase().trim());
    const isDbUnitBulk = unit && BULK_UNITS.includes(unit.toLowerCase().trim());
    
    let amount = safeAmount;
    if (step > 0) {
      if (isDbUnitBulk && !isRawUnitBulk) {
        amount = safeAmount * step;
      } else {
        amount = Math.max(step, Math.ceil(safeAmount / step) * step);
      }
    }
    
    let finalUnit = unit;
    if (unit && ['bulb', 'fillet', 'breast', 'head', 'piece', 'pack', 'slice', 'wrap', 'can', 'tin', 'pot', 'whole', 'item', 'jar', 'loaf'].includes(unit.toLowerCase().trim())) {
      if (amount !== 1) {
        if (finalUnit.toLowerCase().trim() === 'loaf') {
          finalUnit = 'loaves';
        } else {
          finalUnit = `${finalUnit}s`;
        }
      }
    }
    
    return {
      amount,
      unit: finalUnit,
      step,
      category: matched.category || category
    };
  }

  const normName = normalizeIngredientName(name);
  const normUnit = (rawUnit || '').toLowerCase().trim();
  const normCat = (category || '').toLowerCase().trim();

  // Safety check for empty or zero amounts
  const safeAmount = isNaN(rawAmount) || rawAmount <= 0 ? 1 : rawAmount;

  // 1. Sauces, Condiments, Oils, Vinegars & Dressings
  // Example: "6 tbsp Soy Sauce" -> 1 Soy Sauce (step 1)
  if (isSauceOrCondiment(normName, normUnit, normCat)) {
    // A standard retail bottle/jar contains ~15-20 tbsp or ~250ml
    const bottleCapacity = (normUnit === 'ml' || normUnit === 'g') ? 250 : 15;
    const count = Math.max(1, Math.ceil(safeAmount / bottleCapacity));
    return {
      amount: count,
      unit: '', // Clean unit display e.g. "1 Soy Sauce", "2 Olive Oil"
      step: 1
    };
  }

  // 2. Minced Meats & Ground Meats
  // Example: 450g Minced Beef -> 500g (step 250g)
  if (isMincedMeat(normName)) {
    if (normUnit === 'kg') {
      const kg = Math.max(0.25, Math.ceil((safeAmount * 1000) / 250) * 0.25);
      return { amount: Math.round(kg * 100) / 100, unit: 'kg', step: 0.25 };
    }
    // Default in grams: 250g pack increments
    const grams = Math.max(250, Math.ceil(safeAmount / 250) * 250);
    return { amount: grams, unit: 'g', step: 250 };
  }

  // 3. Chopped Tomatoes & Canned Goods (Pulses, Passata, Coconut Milk, Tuna)
  // Example: 800g Chopped Tomatoes -> 2 400g cans (step 1)
  if (isCannedTomatoOrPulse(normName, normUnit, normCat)) {
    let cans = 1;
    if (normUnit.includes('can') || normUnit.includes('tin')) {
      cans = Math.max(1, Math.ceil(safeAmount));
    } else {
      // Measured in g or ml: standard tin is 400g
      cans = Math.max(1, Math.ceil(safeAmount / 400));
    }
    return {
      amount: cans,
      unit: cans === 1 ? '400g can' : '400g cans',
      step: 1
    };
  }

  // 4. Garlic (e.g. 2-4 cloves -> 1 bulb)
  if (normName.includes('garlic') && (normUnit.includes('clove') || normUnit === '' || normUnit === 'whole')) {
    const bulbs = Math.max(1, Math.ceil(safeAmount / 10));
    return {
      amount: bulbs,
      unit: bulbs === 1 ? 'bulb' : 'bulbs',
      step: 1
    };
  }

  // 5. Fresh Herbs (e.g. 2 tbsp fresh coriander -> 1 bunch)
  if (
    (normName.includes('basil') || 
     normName.includes('coriander') || 
     normName.includes('cilantro') || 
     normName.includes('parsley') || 
     normName.includes('rosemary') || 
     normName.includes('thyme') || 
     normName.includes('mint')) && 
    (normUnit.includes('tbsp') || normUnit.includes('tsp') || normUnit.includes('sprig') || normUnit.includes('handful') || normUnit.includes('pinch'))
  ) {
    return {
      amount: 1,
      unit: 'pack',
      step: 1
    };
  }

  // 6. Dried Spices & Seasoning Powders (e.g. 1 tsp cumin -> 1 jar)
  if (
    (normCat.includes('spice') || normName.includes('powder') || normName.includes('seed')) &&
    (normUnit.includes('tsp') || normUnit.includes('tbsp') || normUnit.includes('pinch'))
  ) {
    return {
      amount: 1,
      unit: 'jar',
      step: 1
    };
  }

  // 7. Potatoes & Bulk Root Vegetables in grams: 250g increments
  if (isBulkWeg(normName) && normUnit === 'g') {
    const grams = Math.max(250, Math.ceil(safeAmount / 250) * 250);
    return { amount: grams, unit: 'g', step: 250 };
  }

  // 8. Cream & Chilled Dairy
  if (normName.includes('cream') && (normUnit === 'ml' || normUnit === 'g')) {
    const pots = Math.max(1, Math.ceil(safeAmount / 150));
    return {
      amount: pots,
      unit: pots === 1 ? 'pot (150ml)' : 'pots (150ml)',
      step: 1
    };
  }

  // 9. Cheeses (Mozzarella ball 125g, Halloumi block 200g, Cheddar 200g)
  if (normName.includes('mozzarella') && (normUnit === 'g' || normUnit === 'ball')) {
    const balls = Math.max(1, Math.ceil(safeAmount / 125));
    return {
      amount: balls,
      unit: balls === 1 ? 'ball (125g)' : 'balls (125g)',
      step: 1
    };
  }
  if (normName.includes('halloumi') && (normUnit === 'g' || normUnit === 'block')) {
    const blocks = Math.max(1, Math.ceil(safeAmount / 200));
    return {
      amount: blocks,
      unit: blocks === 1 ? 'block (200g)' : 'blocks (200g)',
      step: 1
    };
  }

  // 10. Eggs (e.g. 3 eggs -> 6 pack or count)
  if (normName === 'egg' || normName === 'eggs' || normName.includes('egg')) {
    if (safeAmount <= 6) {
      return { amount: 6, unit: 'pack', step: 6 };
    }
    const packs = Math.ceil(safeAmount / 6) * 6;
    return { amount: packs, unit: 'pack', step: 6 };
  }

  // 11. Count & Produce Units (pieces, whole, fillets, breasts, packs, slices)
  const countUnits = ['whole', 'head', 'piece', 'pieces', 'pack', 'packs', 'sheet', 'sheets', 'fillet', 'fillets', 'breast', 'breasts', 'slice', 'slices', 'wrap', 'wraps', 'bun', 'buns', 'item', 'items'];
  if (countUnits.includes(normUnit)) {
    const count = Math.max(1, Math.ceil(safeAmount));
    const baseUnit = normUnit.replace(/s$/, '');
    return {
      amount: count,
      unit: count === 1 ? baseUnit : `${baseUnit}s`,
      step: 1
    };
  }

  // 12. Grains & Dry Goods in grams (rounded to neat 50g/100g)
  if (normUnit === 'g') {
    const rounded = Math.max(50, Math.round(safeAmount / 50) * 50);
    return { amount: rounded, unit: 'g', step: rounded >= 200 ? 100 : 50 };
  }

  // 13. General Volume in ml (rounded to neat 50ml/100ml)
  if (normUnit === 'ml') {
    const rounded = Math.max(50, Math.round(safeAmount / 50) * 50);
    return { amount: rounded, unit: 'ml', step: rounded >= 200 ? 100 : 50 };
  }

  // Default fallback: clean positive rounded amount
  const finalAmount = Math.max(1, Math.round(safeAmount * 10) / 10);
  return { amount: finalAmount, unit: rawUnit, step: 1 };
}
