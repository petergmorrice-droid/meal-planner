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

export function canPlanFollowingWeek(
  currentStartDateStr?: string,
  baseDate?: Date,
  maxWeeks = MAX_FORWARD_WEEKS,
): boolean {
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
import { buildShoppingLines, matchKey, formatCookingAmount, type IngredientInput, type Catalog } from './shopping';

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

  (Object.values(plan.days) as DayPlan[]).forEach((day) => {
    if (!day || !day.meals) return;
    day.meals.forEach((meal) => {
      if ((meal.type === 'recipe' || meal.type === 'leftover') && meal.recipeId) {
        const recipe = recipes.find((r) => r.id === meal.recipeId);
        if (recipe && Array.isArray(recipe.ingredients)) {
          const mealServings = meal.servings ?? 2;
          const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
          const scale = mealServings / baseServings;
          recipe.ingredients.forEach((ing) => {
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
        meal.sides.forEach((side) => {
          if (!side || !side.name) return;
          inputs.push({
            name: side.name,
            amount: side.amount,
            unit: side.unit,
            category: side.category,
            source: `${meal.name} (Side)`,
          });
        });
      }
    });
  });

  const lines = buildShoppingLines(inputs, catalog ?? getCatalog());
  return lines.map((line) => {
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
    if (line.needed) item.neededText = line.needed;
    return item;
  });
}

export {
  GROCERY_AISLES,
  getGroceryAisle,
  guessAisle,
  orderedAisles,
  aislePositions,
  aisleName,
  isAisleName,
  aisleCategory,
} from './shopping/aisles';
export type { FoodAisle, AisleInfo } from './shopping/aisles';

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
  const mixed = valStr.trim().match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed && parseFloat(mixed[3]) !== 0) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
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
  // Kitchen-friendly: "½", "1½", "250" (see formatCookingAmount)
  return formatCookingAmount(num) || '0';
}

export function scaleRecipeStepQuantities(
  step: string,
  ingredients: { name: string; amount?: number | string; unit?: string }[],
  scale: number,
): string {
  const ingredientWords = new Set<string>(['water', 'oil', 'salt', 'pepper']);
  const ingredientUnits = new Set<string>([
    'g',
    'ml',
    'kg',
    'l',
    'tbsp',
    'tsp',
    'cup',
    'cups',
    'clove',
    'cloves',
    'can',
    'cans',
    'pack',
    'packs',
    'slice',
    'slices',
    'fillet',
    'fillets',
    'breast',
    'breasts',
    'bunch',
    'bunches',
    'piece',
    'pieces',
    'pinch',
    'pinches',
    'sprig',
    'sprigs',
    'tablespoon',
    'tablespoons',
    'teaspoon',
    'teaspoons',
    'tin',
    'tins',
  ]);

  ingredients.forEach((ing) => {
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
    'minute',
    'minutes',
    'min',
    'mins',
    'second',
    'seconds',
    'sec',
    'secs',
    'hour',
    'hours',
    'hr',
    'hrs',
    'c',
    'f',
    'degrees',
    'degree',
    '°c',
    '°f',
    '°',
    'percent',
    'percentage',
    '%',
    'step',
    'steps',
    'cm',
    'inch',
    'inches',
    'tin',
    'tins',
    'pan',
    'pans',
    'tray',
    'trays',
    'serves',
    'servings',
    'portions',
    'portion',
  ]);

  const numberRegex = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/g; // "1 1/2", "1/2", "1.5"

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
    const lookaheadWords = lookaheadContext
      .toLowerCase()
      .split(/[^a-z0-9°%]+/i)
      .filter(Boolean);

    const nextThreeWords = lookaheadWords.slice(0, 3);

    const hasExclusion = nextThreeWords.some((w) => exclusionKeywords.has(w));
    const hasIngredientOrUnit = nextThreeWords.some((w) => ingredientWords.has(w) || ingredientUnits.has(w));

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
  const ingredientsLower = (recipe.ingredients || []).map((i) => (i.name || '').toLowerCase()).join(' ');
  const tagsLower = (recipe.tags || []).map((t) => t.toLowerCase()).join(' ');

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
  const isVeg =
    recipe.isVegetarian || recipe.tags?.some((t) => ['vegetarian', 'vegi', 'veggie'].includes(t.toLowerCase()));
  const isVgn = recipe.isVegan || recipe.tags?.some((t) => ['vegan'].includes(t.toLowerCase()));
  if (isVgn || isVeg) {
    emojis.add('🌱');
  }

  return Array.from(emojis);
}

export function getEmojiLabel(emoji: string): string {
  switch (emoji) {
    case '🍕':
      return 'Pizza';
    case '🍝':
      return 'Pasta / Noodles';
    case '🍗':
      return 'Chicken / Poultry';
    case '🥩':
      return 'Beef / Pork / Meat';
    case '🐟':
      return 'Fish / Seafood';
    case '🍚':
      return 'Rice / Grains';
    case '🥔':
      return 'Potatoes';
    case '🌶️':
      return 'Spicy / Curry';
    case '🧀':
      return 'Cheese / Dairy';
    case '🥚':
      return 'Eggs';
    case '🥣':
      return 'Soup / Stew';
    case '🥗':
      return 'Salad / Greens';
    case '🍞':
      return 'Bread / Carbs';
    case '🌱':
      return 'Vegetarian / Vegan';
    default:
      return '';
  }
}

export function syncRecurringStaplesForPlan(
  plan: MealPlan,
  shoppingList: ShoppingListItem[],
  recurringItems: RecurringItem[],
  dismissedItemIds: string[] = [],
): ShoppingListItem[] {
  if (!plan || !plan.id) return shoppingList;

  const currentMondayStr = formatDateISO(getMonday(new Date()));
  const nextMondayDate = getNextMonday(new Date()); // calendar days, so clock changes can't shift it
  const nextMondayStr = formatDateISO(nextMondayDate);

  const weekLabel = `Week of ${
    plan.startDate === currentMondayStr
      ? 'This Week'
      : plan.startDate === nextMondayStr
        ? 'Next Week'
        : formatWeekRange(plan.startDate)
  }`;

  const currentList = [...(shoppingList || [])];
  const otherItems = currentList.filter((i) => i.planId !== plan.id);
  const planItems = currentList.filter((i) => i.planId === plan.id);

  const nonRecurringItems = planItems.filter((i) => !i.isRecurring);
  const existingRecurring = planItems.filter((i) => i.isRecurring);

  const syncedRecurring: ShoppingListItem[] = [];

  (recurringItems || []).forEach((rec) => {
    const itemId = `recurring-${plan.id}-${rec.id}`;
    if (dismissedItemIds.includes(itemId)) return;

    const existing = existingRecurring.find(
      (i) => i.id === itemId || (i.name.toLowerCase().trim() === rec.name.toLowerCase().trim() && i.isRecurring),
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
        weekLabel,
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
          weekLabel,
        });
      } else {
        syncedRecurring.push(existing);
      }
    }
  });

  // Preserve userAdjusted recurring items even if removed from preferences
  existingRecurring.forEach((existing) => {
    if (existing.userAdjusted && !syncedRecurring.some((s) => s.id === existing.id)) {
      syncedRecurring.push(existing);
    }
  });

  return [...otherItems, ...nonRecurringItems, ...syncedRecurring];
}

export function syncRecurringStaplesForAllPlans(
  plans: MealPlan[],
  shoppingList: ShoppingListItem[],
  recurringItems: RecurringItem[],
  dismissedItemIds: string[] = [],
): ShoppingListItem[] {
  let updatedList = [...(shoppingList || [])];
  (plans || []).forEach((plan) => {
    if (plan && plan.startDate && !isPastWeek(plan.startDate)) {
      updatedList = syncRecurringStaplesForPlan(plan, updatedList, recurringItems, dismissedItemIds);
    }
  });
  return updatedList;
}
