import { Recipe, MealPlan, DayPlan, ShoppingListItem, RecurringItem } from './types';

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MAX_FORWARD_WEEKS = 4;

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getMaxAllowedMonday(baseDate?: Date, maxWeeks = MAX_FORWARD_WEEKS): Date {
  const currentMonday = getMonday(baseDate || new Date());
  const maxMonday = new Date(currentMonday);
  maxMonday.setDate(currentMonday.getDate() + maxWeeks * 7);
  return maxMonday;
}

export function isPastWeek(startDateStr: string, baseDate?: Date): boolean {
  if (!startDateStr) return false;
  const currentMondayStr = formatDateISO(getMonday(baseDate || new Date()));
  return startDateStr < currentMondayStr;
}

export function isCurrentOrFutureWeek(startDateStr: string, baseDate?: Date): boolean {
  if (!startDateStr) return false;
  const currentMondayStr = formatDateISO(getMonday(baseDate || new Date()));
  return startDateStr >= currentMondayStr;
}

export function isWeekBeyondForwardLimit(startDateStr: string, maxWeeks = MAX_FORWARD_WEEKS, baseDate?: Date): boolean {
  if (!startDateStr) return false;
  const maxMonday = getMaxAllowedMonday(baseDate, maxWeeks);
  const targetDate = new Date(startDateStr + 'T00:00:00');
  return targetDate.getTime() > maxMonday.getTime();
}

export function isWeekWithinForwardLimit(startDateStr: string, baseDate?: Date, maxWeeks = MAX_FORWARD_WEEKS): boolean {
  if (!startDateStr) return false;
  const currentMondayStr = formatDateISO(getMonday(baseDate || new Date()));
  const maxMonday = getMaxAllowedMonday(baseDate, maxWeeks);
  const targetDate = new Date(startDateStr + 'T00:00:00');
  return startDateStr >= currentMondayStr && targetDate.getTime() <= maxMonday.getTime();
}

export function canPlanFollowingWeek(currentStartDateStr?: string, baseDate?: Date, maxWeeks = MAX_FORWARD_WEEKS): boolean {
  if (!currentStartDateStr) return false;
  const currentMondayStr = formatDateISO(getMonday(baseDate || new Date()));
  if (currentStartDateStr < currentMondayStr) return false;
  const current = new Date(currentStartDateStr + 'T00:00:00');
  const nextMonday = new Date(current);
  nextMonday.setDate(current.getDate() + 7);
  const maxMonday = getMaxAllowedMonday(baseDate, maxWeeks);
  return nextMonday.getTime() <= maxMonday.getTime();
}

export function getNextMonday(baseDate?: Date): Date {
  const currentMonday = getMonday(baseDate || new Date());
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);
  return nextMonday;
}

export function getCurrentMondayStr(baseDate?: Date): string {
  return formatDateISO(getMonday(baseDate || new Date()));
}

export function getNextMondayStr(baseDate?: Date): string {
  return formatDateISO(getNextMonday(baseDate));
}

export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatWeekStart(startDateStr?: string): string {
  if (!startDateStr) return '';
  const start = new Date(startDateStr + 'T00:00:00');
  if (isNaN(start.getTime())) return '';
  const day = start.getDate();
  const month = SHORT_MONTHS[start.getMonth()];
  return `${day}-${month}`;
}

export function formatWeekRange(startDateStr?: string): string {
  if (!startDateStr) return '';
  const start = new Date(startDateStr + 'T00:00:00');
  if (isNaN(start.getTime())) return '';
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  const startDay = start.getDate();
  const startMonth = SHORT_MONTHS[start.getMonth()];
  const endDay = end.getDate();
  const endMonth = SHORT_MONTHS[end.getMonth()];
  return `${startDay} ${startMonth} to ${endDay} ${endMonth}`;
}

export function isPlanAllowedInCook(plan: MealPlan, baseDate?: Date): boolean {
  if (!plan || !plan.startDate) return false;
  return isWeekWithinForwardLimit(plan.startDate, baseDate);
}

export function createEmptyPlan(mondayDate: Date): MealPlan {
  const currentMonday = formatDateISO(getMonday(new Date()));
  const planMonday = formatDateISO(mondayDate);
  const days: Record<string, DayPlan> = {};
  DAYS_OF_WEEK.forEach((d, i) => {
    const date = new Date(mondayDate);
    date.setDate(mondayDate.getDate() + i);
    days[d] = { date: formatDateISO(date), meals: [] };
  });

  return {
    id: `plan-${planMonday}`,
    startDate: planMonday,
    days,
    status: 'not_started',
    isCurrent: planMonday === currentMonday,
  };
}

import { getCatalog } from './utils/shoppingConversion';
import { buildShoppingLines, matchKey, type IngredientInput, type Catalog } from './shopping';

export * from './utils/shoppingConversion';

/**
 * The shopping list for one week's plan: every recipe ingredient and side,
 * scaled to the number of people, combined per product and rounded up to what
 * you actually buy.
 */
export function generateShoppingListForPlan(plan: MealPlan, recipes: Recipe[], catalog?: Catalog): ShoppingListItem[] {
  if (!plan || !plan.days) return [];
  const weekLabel = `Week of ${formatWeekRange(plan.startDate)}`;
  const inputs: IngredientInput[] = [];

  (Object.values(plan.days) as DayPlan[]).forEach(day => {
    if (!day || !day.meals) return;
    day.meals.forEach(meal => {
      if ((meal.type === 'recipe' || meal.type === 'leftover') && meal.recipeId) {
        const recipe = recipes.find(r => r.id === meal.recipeId);
        if (recipe && Array.isArray(recipe.ingredients)) {
          const mealServings = meal.servings ?? 2;
          const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
          const scale = mealServings / baseServings;
          recipe.ingredients.forEach(ing => {
            if (!ing || !ing.name) return;
            const amount = typeof ing.amount === 'number' ? ing.amount : parseFloat(String(ing.amount));
            inputs.push({
              name: ing.name,
              amount: isFinite(amount) ? amount * scale : ing.amount,
              unit: ing.unit,
              category: ing.category,
              groceryId: ing.groceryId,
              source: recipe.name,
            });
          });
        }
      }

      if (meal.sides && Array.isArray(meal.sides)) {
        meal.sides.forEach(side => {
          if (!side || !side.name) return;
          inputs.push({ name: side.name, amount: side.amount, unit: side.unit, category: side.category, source: `${meal.name} (Side)` });
        });
      }
    });
  });

  const lines = buildShoppingLines(inputs, catalog ?? getCatalog());
  return lines.map(line => {
    const cleanKey = (matchKey(line.name) || line.key).replace(/[^a-z0-9_-]/g, '_');
    const item: ShoppingListItem = {
      id: `plan-${plan.id}-${cleanKey}`,
      name: line.name,
      amount: line.amount,
      unit: line.unit,
      category: line.category,
      checked: false,
      isAdhoc: false,
      planId: plan.id,
      weekLabel,
      recipeNames: line.sources,
    };
    if (line.productId) item.groceryId = line.productId;
    if (line.cupboard) item.checkCupboard = true;
    if (line.needsCheck) item.needsCheck = true;
    if (line.note) item.quantityNote = line.note;
    return item;
  });
}

export type FoodAisle = 
  | 'produce'
  | 'bakery'
  | 'meat_seafood'
  | 'dairy_eggs'
  | 'grains_pasta'
  | 'canned_jars'
  | 'pantry_spices'
  | 'frozen'
  | 'household_other';

export interface AisleInfo {
  id: FoodAisle;
  name: string;
  order: number;
  description: string;
  colorClass: string;
}

export const GROCERY_AISLES: Record<FoodAisle, AisleInfo> = {
  produce: {
    id: 'produce',
    name: 'Fresh Produce',
    order: 1,
    description: 'Fruit, vegetables & fresh herbs',
    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  },
  bakery: {
    id: 'bakery',
    name: 'Bakery & Bread',
    order: 2,
    description: 'Bread, rolls, wraps & pastries',
    colorClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  meat_seafood: {
    id: 'meat_seafood',
    name: 'Meat & Seafood',
    order: 3,
    description: 'Fresh beef, poultry, pork & fish',
    colorClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
  },
  dairy_eggs: {
    id: 'dairy_eggs',
    name: 'Dairy, Chilled & Eggs',
    order: 4,
    description: 'Milk, cheese, butter, yogurt & eggs',
    colorClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
  },
  grains_pasta: {
    id: 'grains_pasta',
    name: 'Pasta, Rice & Grains',
    order: 5,
    description: 'Dry pasta, rice, noodles & grains',
    colorClass: 'bg-orange-50 text-orange-700 border-orange-200/80',
  },
  canned_jars: {
    id: 'canned_jars',
    name: 'Canned & Jarred Goods',
    order: 6,
    description: 'Tomatoes, beans, pulses & sauces',
    colorClass: 'bg-yellow-50 text-yellow-800 border-yellow-200/80',
  },
  pantry_spices: {
    id: 'pantry_spices',
    name: 'Pantry, Oils & Spices',
    order: 7,
    description: 'Oils, seasonings, condiments & flour',
    colorClass: 'bg-stone-100 text-stone-700 border-stone-200/80',
  },
  frozen: {
    id: 'frozen',
    name: 'Frozen Foods',
    order: 8,
    description: 'Frozen vegetables, meats & desserts',
    colorClass: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
  },
  household_other: {
    id: 'household_other',
    name: 'Household & Other',
    order: 9,
    description: 'Cleaning, paper goods & miscellaneous',
    colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200/80',
  },
};

export function getGroceryAisle(item: { name: string; category?: string }): FoodAisle {
  const cat = (item.category || '').toLowerCase().trim();
  const name = (item.name || '').toLowerCase().trim();

  // 1. Explicit Category Match
  if (cat.includes('produce') || cat.includes('vegetable') || cat.includes('fruit')) return 'produce';
  if (cat.includes('meat') || cat.includes('poultry') || cat.includes('fish') || cat.includes('seafood')) return 'meat_seafood';
  if (cat.includes('dairy') || cat.includes('egg') || cat.includes('cheese')) return 'dairy_eggs';
  if (cat.includes('pasta') || cat.includes('grain') || cat.includes('rice') || cat.includes('noodle')) return 'grains_pasta';
  if (cat.includes('canned') || cat.includes('tin') || cat.includes('jar')) return 'canned_jars';
  if (cat.includes('bakery') || cat.includes('bread')) return 'bakery';
  if (cat.includes('frozen')) return 'frozen';
  if (cat.includes('pantry') || cat.includes('spice') || cat.includes('seasoning') || cat.includes('oil')) return 'pantry_spices';
  if (cat.includes('household') || cat.includes('clean')) return 'household_other';

  // 2. Keyword matching on ingredient name
  if (/\b(apple|apples|banana|bananas|berry|berries|broccoli|carrot|carrots|onion|onions|garlic|potato|potatoes|tomato|tomatoes|spinach|lettuce|salad|pepper|peppers|courgette|zucchini|mushroom|mushrooms|ginger|lemon|lemons|lime|limes|avocado|avocados|cucumber|cabbage|celery|chili|chilli|chillies|herb|herbs|basil|coriander|cilantro|parsley|rosemary|thyme|leek|leeks|kale|cauliflower|pea|peas|asparagus|corn|sweetcorn|beetroot|orange|oranges|grape|grapes|fruit|veg|vegetable|shallot|shallots|scallion|scallions)\b/i.test(name)) {
    return 'produce';
  }

  if (/\b(bread|bagel|bagels|pitta|pita|wrap|wraps|tortilla|tortillas|naan|roll|rolls|bun|buns|baguette|sourdough|loaf|brioche|croissant|crumpet|toast|flatbread|muffin|muffins)\b/i.test(name)) {
    return 'bakery';
  }

  if (/\b(beef|chicken|pork|lamb|bacon|sausage|sausages|steak|steaks|mince|minced|turkey|duck|salmon|cod|prawn|prawns|shrimp|fish|fillet|fillets|tuna|ham|prosciutto|chorizo|meat|seafood|ribs|gammon)\b/i.test(name)) {
    return 'meat_seafood';
  }

  if (/\b(milk|oat milk|almond milk|cheese|cheddar|mozzarella|parmesan|halloumi|feta|brie|butter|cream|double cream|single cream|sour cream|yogurt|yoghurt|egg|eggs|creme fraiche|paneer|ricotta|mascarpone|custard|dairy)\b/i.test(name)) {
    return 'dairy_eggs';
  }

  if (/\b(pasta|spaghetti|noodle|noodles|penne|fusilli|macaroni|lasagne|lasagna|rice|basmati|jasmine|couscous|quinoa|oats|oatmeal|barley|bulgur|orzo|cereal|grain|grains)\b/i.test(name)) {
    return 'grains_pasta';
  }

  if (/\b(canned|can|tin|tinned|tomato paste|passata|baked beans|black beans|kidney beans|chickpeas|coconut milk|lentils|olives|pesto|pickles|salsa|jam|marmite)\b/i.test(name)) {
    return 'canned_jars';
  }

  if (/\b(frozen|ice cream|ice|gelato|sorbet)\b/i.test(name)) {
    return 'frozen';
  }

  if (/\b(oil|olive oil|vegetable oil|sesame oil|sunflower oil|soy sauce|vinegar|balsamic|flour|sugar|salt|pepper|black pepper|cumin|paprika|oregano|curry|curry powder|turmeric|cinnamon|stock|stock cube|stock cubes|broth|honey|mustard|mayo|mayonnaise|ketchup|sauce|spice|spices|powder|baking powder|yeast|nuts|almonds|walnuts|seeds|peanut butter|tea|coffee)\b/i.test(name)) {
    return 'pantry_spices';
  }

  if (/\b(foil|kitchen roll|toilet roll|soap|detergent|wash|tissue|tissues|sponge|sponges|cleaner|bag|bags|batteries|napkin|napkins)\b/i.test(name)) {
    return 'household_other';
  }

  return 'pantry_spices';
}

export function createSamplePastWeeks(): import('./types').MealPlan[] {
  return [];
}

export function cleanDays(days: Record<string, import('./types').DayPlan>): Record<string, import('./types').DayPlan> {
  const cleaned: Record<string, import('./types').DayPlan> = {};
  for (const dayName in days) {
    if (days[dayName].meals && days[dayName].meals.length > 0) {
      cleaned[dayName] = days[dayName];
    } else {
      cleaned[dayName] = { date: days[dayName].date, meals: [] };
    }
  }
  return cleaned;
}

export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore) as unknown as T;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result;
}

export function parseQtyAndUnit(text: string, defaultUnit: string = 'item'): { amount: number; unit: string } {
  const trimmed = text.trim();
  if (!trimmed) return { amount: 1, unit: defaultUnit };
  
  // Match a decimal/fraction/integer number optionally followed by unit text
  const match = trimmed.match(/^([\d.]+)\s*(.*)$/);
  if (!match) {
    return { amount: 1, unit: trimmed };
  }
  
  const amount = parseFloat(match[1]) || 1;
  const unit = match[2].trim() || defaultUnit;
  return { amount, unit };
}

export function parseNumberValue(valStr: string): number {
  if (valStr.includes('/')) {
    const parts = valStr.split('/');
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den !== 0) {
      return num / den;
    }
  }
  return parseFloat(valStr);
}

export function formatScaledNumber(num: number): string {
  if (Math.abs(num - Math.round(num)) < 0.05) {
    return Math.round(num).toString();
  }
  const dec = num % 1;
  const whole = Math.floor(num);
  const wholeStr = whole > 0 ? `${whole} ` : '';
  
  if (Math.abs(dec - 0.25) < 0.05) return `${wholeStr}1/4`;
  if (Math.abs(dec - 0.5) < 0.05) return `${wholeStr}1/2`;
  if (Math.abs(dec - 0.75) < 0.05) return `${wholeStr}3/4`;
  if (Math.abs(dec - 0.333) < 0.05 || Math.abs(dec - 0.33) < 0.05) return `${wholeStr}1/3`;
  if (Math.abs(dec - 0.666) < 0.05 || Math.abs(dec - 0.66) < 0.05) return `${wholeStr}2/3`;

  return Number(num.toFixed(num % 1 === 0 ? 0 : num % 0.1 === 0 ? 1 : 2)).toString();
}

export function scaleRecipeStepQuantities(step: string, ingredients: any[], scale: number): string {
  const ingredientWords = new Set<string>(['water', 'oil', 'salt', 'pepper']);
  const ingredientUnits = new Set<string>([
    'g', 'ml', 'kg', 'l', 'tbsp', 'tsp', 'cup', 'cups', 'clove', 'cloves', 
    'can', 'cans', 'pack', 'packs', 'slice', 'slices', 'fillet', 'fillets', 
    'breast', 'breasts', 'bunch', 'bunches', 'piece', 'pieces', 'pinch', 'pinches',
    'sprig', 'sprigs', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'tin', 'tins'
  ]);

  ingredients.forEach(ing => {
    const nameWords = ing.name.toLowerCase().split(/[^a-z0-9]+/i);
    nameWords.forEach((w: string) => {
      if (w.length > 2) {
        ingredientWords.add(w);
      }
    });
    if (ing.unit) {
      const u = ing.unit.toLowerCase().trim();
      if (u) {
        ingredientUnits.add(u);
        if (u.endsWith('s')) {
          ingredientUnits.add(u.slice(0, -1));
        } else {
          ingredientUnits.add(u + 's');
        }
      }
    }
  });

  const exclusionKeywords = new Set<string>([
    'minute', 'minutes', 'min', 'mins', 'second', 'seconds', 'sec', 'secs',
    'hour', 'hours', 'hr', 'hrs', 'c', 'f', 'degrees', 'degree', '°c', '°f', '°',
    'percent', 'percentage', '%', 'step', 'steps', 'cm', 'inch', 'inches',
    'tin', 'tins', 'pan', 'pans', 'tray', 'trays', 'serves', 'servings', 'portions', 'portion'
  ]);

  const numberRegex = /(\d+\/\d+|\d+(?:\.\d+)?)/g;

  let result = '';
  let lastIndex = 0;
  let match;

  numberRegex.lastIndex = 0;

  while ((match = numberRegex.exec(step)) !== null) {
    const matchStr = match[1];
    const matchIndex = match.index;

    result += step.slice(lastIndex, matchIndex);
    lastIndex = numberRegex.lastIndex;

    const lookaheadContext = step.slice(lastIndex, lastIndex + 35);
    const lookaheadWords = lookaheadContext.toLowerCase().split(/[^a-z0-9°%]+/i).filter(Boolean);

    const nextThreeWords = lookaheadWords.slice(0, 3);

    const hasExclusion = nextThreeWords.some(w => exclusionKeywords.has(w));
    const hasIngredientOrUnit = nextThreeWords.some(w => ingredientWords.has(w) || ingredientUnits.has(w));

    if (!hasExclusion && hasIngredientOrUnit) {
      const originalValue = parseNumberValue(matchStr);
      const scaledValue = originalValue * scale;
      const formattedValue = formatScaledNumber(scaledValue);
      result += formattedValue;
    } else {
      result += matchStr;
    }
  }

  result += step.slice(lastIndex);
  return result;
}

export function getRecipeEmojis(recipe: Recipe): string[] {
  if (!recipe) return [];
  const emojis = new Set<string>();

  const nameLower = (recipe.name || '').toLowerCase();
  const descLower = (recipe.description || '').toLowerCase();
  
  // Combine all names of ingredients and tags
  const ingredientsLower = (recipe.ingredients || []).map(i => (i.name || '').toLowerCase()).join(' ');
  const tagsLower = (recipe.tags || []).map(t => t.toLowerCase()).join(' ');

  const searchStr = `${nameLower} ${descLower} ${ingredientsLower} ${tagsLower}`;

  // 1. Pizza
  if (searchStr.includes('pizza')) {
    emojis.add('🍕');
  }

  // 2. Pasta / Spaghetti / Penne / Lasagne / Lasagna
  if (
    searchStr.includes('pasta') || 
    searchStr.includes('spaghetti') || 
    searchStr.includes('penne') || 
    searchStr.includes('lasagne') || 
    searchStr.includes('lasagna') || 
    searchStr.includes('bolognese') || 
    searchStr.includes('macaroni') || 
    searchStr.includes('linguine') || 
    searchStr.includes('fettuccine') || 
    searchStr.includes('tagliatelle') ||
    searchStr.includes('carbonara') ||
    searchStr.includes('cannelloni') ||
    searchStr.includes('tortellini') ||
    searchStr.includes('ravioli') ||
    searchStr.includes('noodle')
  ) {
    emojis.add('🍝');
  }

  // 3. Chicken / Poultry / Turkey / Duck
  if (
    searchStr.includes('chicken') || 
    searchStr.includes('turkey') || 
    searchStr.includes('poultry') || 
    searchStr.includes('thigh') || 
    searchStr.includes('breast') || 
    searchStr.includes('drumstick') ||
    searchStr.includes('duck')
  ) {
    emojis.add('🍗');
  }

  // 4. Beef / Steak / Meatballs / Pork / Porkchop / Bacon / Sausage / Ham / Lamb / Mince
  if (
    searchStr.includes('beef') || 
    searchStr.includes('steak') || 
    searchStr.includes('pork') || 
    searchStr.includes('bacon') || 
    searchStr.includes('sausage') || 
    searchStr.includes('ham') || 
    searchStr.includes('lamb') || 
    searchStr.includes('mince') || 
    searchStr.includes('meatball') || 
    searchStr.includes('chorizo') || 
    searchStr.includes('gammon') ||
    searchStr.includes('pepperoni') ||
    searchStr.includes('ribs') ||
    searchStr.includes('burger')
  ) {
    emojis.add('🥩');
  }

  // 5. Fish / Seafood / Salmon / Tuna / Prawn / Shrimp / Seafood / Cod / Haddock
  if (
    searchStr.includes('fish') || 
    searchStr.includes('salmon') || 
    searchStr.includes('tuna') || 
    searchStr.includes('prawn') || 
    searchStr.includes('shrimp') || 
    searchStr.includes('seafood') || 
    searchStr.includes('cod') || 
    searchStr.includes('haddock') || 
    searchStr.includes('sea bass') || 
    searchStr.includes('trout') ||
    searchStr.includes('sea-bass') ||
    searchStr.includes('mackerel') ||
    searchStr.includes('squid') ||
    searchStr.includes('crab')
  ) {
    emojis.add('🐟');
  }

  // 6. Rice / Basmati / Risotto / Paella / Pilau
  if (
    searchStr.includes('rice') || 
    searchStr.includes('basmati') || 
    searchStr.includes('risotto') || 
    searchStr.includes('paella') || 
    searchStr.includes('pilau') || 
    searchStr.includes('pulao') ||
    searchStr.includes('biryani') ||
    searchStr.includes('fried-rice') ||
    searchStr.includes('jasmine rice')
  ) {
    emojis.add('🍚');
  }

  // 7. Potatoes / Chips / Mash / Sweet Potato
  if (
    searchStr.includes('potato') || 
    searchStr.includes('potatoes') || 
    searchStr.includes('sweet potato') || 
    searchStr.includes('chips') || 
    searchStr.includes('gnochi') || 
    searchStr.includes('gnocchi') ||
    searchStr.includes('hash brown') ||
    searchStr.includes('wedges') ||
    searchStr.includes('fries')
  ) {
    emojis.add('🥔');
  }

  // 8. Curry / Chili / Chilli / Spicy / Jalapeno
  if (
    searchStr.includes('curry') || 
    searchStr.includes('chili') || 
    searchStr.includes('chilli') || 
    searchStr.includes('spicy') || 
    searchStr.includes('jalapeno') || 
    searchStr.includes('korma') || 
    searchStr.includes('tikka') || 
    searchStr.includes('madras') || 
    searchStr.includes('jalfrezi') ||
    searchStr.includes('balti') ||
    searchStr.includes('bhuna') ||
    searchStr.includes('vindaloo')
  ) {
    emojis.add('🌶️');
  }

  // 9. Cheese / Mozzarella / Cheddar / Parmesan / Feta
  if (
    searchStr.includes('cheese') || 
    searchStr.includes('mozzarella') || 
    searchStr.includes('cheddar') || 
    searchStr.includes('parmesan') || 
    searchStr.includes('feta') || 
    searchStr.includes('halloumi') || 
    searchStr.includes('ricotta') ||
    searchStr.includes('mascarpone') ||
    searchStr.includes('pecorino') ||
    searchStr.includes('paneer')
  ) {
    emojis.add('🧀');
  }

  // 10. Eggs / Omelette / Frittata
  if (
    searchStr.includes('egg ') || 
    searchStr.includes('eggs') || 
    searchStr.includes('omelette') || 
    searchStr.includes('frittata') || 
    searchStr.includes('egg-') ||
    searchStr.includes('quiche')
  ) {
    emojis.add('🥚');
  }

  // 11. Soup / Broth / Stew
  if (
    searchStr.includes('soup') || 
    searchStr.includes('broth') || 
    searchStr.includes('stew') || 
    searchStr.includes('chowder') ||
    searchStr.includes('ramen')
  ) {
    emojis.add('🥣');
  }

  // 12. Salad / Lettuce / Cucumber
  if (
    searchStr.includes('salad') || 
    searchStr.includes('lettuce') || 
    searchStr.includes('cucumber') ||
    searchStr.includes('coleslaw')
  ) {
    emojis.add('🥗');
  }

  // 13. Bread / Toast / Bagel / Sourdough / Naan
  if (
    searchStr.includes('bread') || 
    searchStr.includes('toast') || 
    searchStr.includes('bagel') || 
    searchStr.includes('sourdough') || 
    searchStr.includes('naan') || 
    searchStr.includes('baguette') || 
    searchStr.includes('flatbread') || 
    searchStr.includes('bun') || 
    searchStr.includes('tortilla') || 
    searchStr.includes('taco') ||
    searchStr.includes('focaccia') ||
    searchStr.includes('pita') ||
    searchStr.includes('pitta') ||
    searchStr.includes('ciabatta')
  ) {
    emojis.add('🍞');
  }

  // 14. Vegetarian / Vegan
  const isVeg = recipe.isVegetarian || recipe.tags?.some(t => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()));
  const isVgn = recipe.isVegan || recipe.tags?.some(t => ['vegan'].includes(t.toLowerCase()));
  if (isVgn || isVeg) {
    emojis.add('🌱');
  }

  return Array.from(emojis);
}

export function getEmojiLabel(emoji: string): string {
  switch (emoji) {
    case '🍕': return 'Pizza';
    case '🍝': return 'Pasta / Noodles';
    case '🍗': return 'Chicken / Poultry';
    case '🥩': return 'Beef / Pork / Meat';
    case '🐟': return 'Fish / Seafood';
    case '🍚': return 'Rice / Grains';
    case '🥔': return 'Potatoes';
    case '🌶️': return 'Spicy / Curry';
    case '🧀': return 'Cheese / Dairy';
    case '🥚': return 'Eggs';
    case '🥣': return 'Soup / Stew';
    case '🥗': return 'Salad / Greens';
    case '🍞': return 'Bread / Carbs';
    case '🌱': return 'Vegetarian / Vegan';
    default: return '';
  }
}

export function syncRecurringStaplesForPlan(
  plan: MealPlan,
  shoppingList: ShoppingListItem[],
  recurringItems: RecurringItem[],
  dismissedItemIds: string[] = []
): ShoppingListItem[] {
  if (!plan || !plan.id) return shoppingList;

  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayDate = new Date(getMonday(new Date()).getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextMondayStr = formatDateISO(nextMondayDate);

  const weekLabel = `Week of ${
    plan.startDate === currentMondayStr
      ? 'This Week'
      : plan.startDate === nextMondayStr
      ? 'Next Week'
      : formatWeekRange(plan.startDate)
  }`;

  const currentList = [...(shoppingList || [])];
  const otherItems = currentList.filter(i => i.planId !== plan.id);
  const planItems = currentList.filter(i => i.planId === plan.id);

  const nonRecurringItems = planItems.filter(i => !i.isRecurring);
  const existingRecurring = planItems.filter(i => i.isRecurring);

  const syncedRecurring: ShoppingListItem[] = [];

  (recurringItems || []).forEach(rec => {
    const itemId = `recurring-${plan.id}-${rec.id}`;
    if (dismissedItemIds.includes(itemId)) return;

    const existing = existingRecurring.find(
      i => i.id === itemId || (i.name.toLowerCase().trim() === rec.name.toLowerCase().trim() && i.isRecurring)
    );

    if (!existing) {
      syncedRecurring.push({
        id: itemId,
        name: rec.name,
        amount: rec.amount,
        unit: rec.unit,
        category: rec.category || 'Pantry & Spices',
        checked: false,
        isAdhoc: false,
        isRecurring: true,
        planId: plan.id,
        weekLabel
      });
    } else {
      if (!existing.userAdjusted) {
        syncedRecurring.push({
          ...existing,
          id: existing.id || itemId,
          name: rec.name,
          amount: rec.amount,
          unit: rec.unit,
          category: rec.category || existing.category || 'Pantry & Spices',
          isRecurring: true,
          planId: plan.id,
          weekLabel
        });
      } else {
        syncedRecurring.push(existing);
      }
    }
  });

  // Preserve userAdjusted recurring items even if removed from preferences
  existingRecurring.forEach(existing => {
    if (existing.userAdjusted && !syncedRecurring.some(s => s.id === existing.id)) {
      syncedRecurring.push(existing);
    }
  });

  return [...otherItems, ...nonRecurringItems, ...syncedRecurring];
}

export function syncRecurringStaplesForAllPlans(
  plans: MealPlan[],
  shoppingList: ShoppingListItem[],
  recurringItems: RecurringItem[],
  dismissedItemIds: string[] = []
): ShoppingListItem[] {
  let updatedList = [...(shoppingList || [])];
  (plans || []).forEach(plan => {
    if (plan && plan.startDate && !isPastWeek(plan.startDate)) {
      updatedList = syncRecurringStaplesForPlan(plan, updatedList, recurringItems, dismissedItemIds);
    }
  });
  return updatedList;
}

