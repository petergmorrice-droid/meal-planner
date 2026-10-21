/**
 * The Shop's aisles: one set used everywhere (the Shop, the Products page, new products).
 * A product's `category` holds its aisle's name ("Fresh Produce"), so older copies of the
 * app, which read categories by keyword, still put it in the right place.
 */
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
    colorClass: 'bg-violet-50 text-violet-700 border-violet-200/80',
  },
  pantry_spices: {
    id: 'pantry_spices',
    name: 'Pantry, Oils & Spices',
    order: 7,
    description: 'Oils, seasonings, condiments & flour',
    colorClass: 'bg-yellow-50 text-yellow-800 border-yellow-200/80',
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
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200/80',
  },
};

/** The aisles in your own walking order: aisles you've arranged first, any others after in the usual order. */
export function orderedAisles(order?: readonly string[] | null): FoodAisle[] {
  const usual = (Object.keys(GROCERY_AISLES) as FoodAisle[]).sort(
    (a, b) => GROCERY_AISLES[a].order - GROCERY_AISLES[b].order,
  );
  const out: FoodAisle[] = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (
      typeof id === 'string' &&
      Object.prototype.hasOwnProperty.call(GROCERY_AISLES, id) &&
      !out.includes(id as FoodAisle)
    ) {
      out.push(id as FoodAisle);
    }
  }
  for (const id of usual) if (!out.includes(id)) out.push(id);
  return out;
}

/** Position of each aisle (1 = first) in your walking order. */
export function aislePositions(order?: readonly string[] | null): Record<FoodAisle, number> {
  const positions = {} as Record<FoodAisle, number>;
  orderedAisles(order).forEach((id, i) => {
    positions[id] = i + 1;
  });
  return positions;
}

/** The aisle something belongs in, or null if neither its category nor its name says. */
export function guessAisle(item: { name: string; category?: string }): FoodAisle | null {
  const cat = (item.category || '').toLowerCase().trim();
  const name = (item.name || '').toLowerCase().trim();

  // 1. Explicit Category Match
  if (cat.includes('produce') || cat.includes('vegetable') || /\bveg\b/.test(cat) || cat.includes('fruit'))
    return 'produce';
  if (cat.includes('meat') || cat.includes('poultry') || cat.includes('fish') || cat.includes('seafood'))
    return 'meat_seafood';
  if (cat.includes('dairy') || cat.includes('egg') || cat.includes('cheese')) return 'dairy_eggs';
  if (cat.includes('pasta') || cat.includes('grain') || cat.includes('rice') || cat.includes('noodle'))
    return 'grains_pasta';
  if (cat.includes('canned') || cat.includes('tin') || cat.includes('jar')) return 'canned_jars';
  if (cat.includes('bakery') || cat.includes('bread')) return 'bakery';
  if (cat.includes('frozen')) return 'frozen';
  if (cat.includes('pantry') || cat.includes('spice') || cat.includes('seasoning') || cat.includes('oil'))
    return 'pantry_spices';
  if (cat.includes('household') || cat.includes('clean') || cat.includes('hygiene') || cat.includes('toiletr'))
    return 'household_other';
  // Older built-in groups that aren't aisles of their own.
  if (cat.includes('beverage') || cat.includes('drink'))
    return /\bjuice|smoothie\b/.test(name) ? 'dairy_eggs' : 'pantry_spices';
  if (cat.includes('snack')) return 'pantry_spices';

  // 2. Keyword matching on ingredient name
  if (
    /\b(apple|apples|banana|bananas|berry|berries|broccoli|carrot|carrots|onion|onions|garlic|potato|potatoes|tomato|tomatoes|spinach|lettuce|salad|pepper|peppers|courgette|zucchini|mushroom|mushrooms|ginger|lemon|lemons|lime|limes|avocado|avocados|cucumber|cabbage|celery|chili|chilli|chillies|herb|herbs|basil|coriander|cilantro|parsley|rosemary|thyme|leek|leeks|kale|cauliflower|pea|peas|asparagus|corn|sweetcorn|beetroot|orange|oranges|grape|grapes|fruit|veg|vegetable|shallot|shallots|scallion|scallions)\b/i.test(
      name,
    )
  ) {
    return 'produce';
  }

  if (
    /\b(bread|bagel|bagels|pitta|pita|wrap|wraps|tortilla|tortillas|naan|roll|rolls|bun|buns|baguette|sourdough|loaf|brioche|croissant|crumpet|toast|flatbread|muffin|muffins)\b/i.test(
      name,
    )
  ) {
    return 'bakery';
  }

  if (
    /\b(beef|chicken|pork|lamb|bacon|sausage|sausages|steak|steaks|mince|minced|turkey|duck|salmon|cod|prawn|prawns|shrimp|fish|fillet|fillets|tuna|ham|prosciutto|chorizo|meat|seafood|ribs|gammon)\b/i.test(
      name,
    )
  ) {
    return 'meat_seafood';
  }

  if (
    /\b(milk|oat milk|almond milk|cheese|cheddar|mozzarella|parmesan|halloumi|feta|brie|butter|cream|double cream|single cream|sour cream|yogurt|yoghurt|egg|eggs|creme fraiche|paneer|ricotta|mascarpone|custard|dairy)\b/i.test(
      name,
    )
  ) {
    return 'dairy_eggs';
  }

  if (
    /\b(pasta|spaghetti|noodle|noodles|penne|fusilli|macaroni|lasagne|lasagna|rice|basmati|jasmine|couscous|quinoa|oats|oatmeal|barley|bulgur|orzo|cereal|grain|grains)\b/i.test(
      name,
    )
  ) {
    return 'grains_pasta';
  }

  if (
    /\b(canned|can|tin|tinned|tomato paste|passata|baked beans|black beans|kidney beans|chickpeas|coconut milk|lentils|olives|pesto|pickles|salsa|jam|marmite)\b/i.test(
      name,
    )
  ) {
    return 'canned_jars';
  }

  if (/\b(frozen|ice cream|ice|gelato|sorbet)\b/i.test(name)) {
    return 'frozen';
  }

  if (
    /\b(oil|olive oil|vegetable oil|sesame oil|sunflower oil|soy sauce|vinegar|balsamic|flour|sugar|salt|pepper|black pepper|cumin|paprika|oregano|curry|curry powder|turmeric|cinnamon|stock|stock cube|stock cubes|broth|honey|mustard|mayo|mayonnaise|ketchup|sauce|spice|spices|powder|baking powder|yeast|nuts|almonds|walnuts|seeds|peanut butter|tea|coffee)\b/i.test(
      name,
    )
  ) {
    return 'pantry_spices';
  }

  if (
    /\b(foil|kitchen roll|toilet roll|soap|detergent|wash|tissue|tissues|sponge|sponges|cleaner|bag|bags|batteries|napkin|napkins)\b/i.test(
      name,
    )
  ) {
    return 'household_other';
  }

  return null;
}

/** Where the Shop puts something: its aisle, or the store cupboard if nothing says. */
export function getGroceryAisle(item: { name: string; category?: string }): FoodAisle {
  return guessAisle(item) ?? 'pantry_spices';
}

const NAMES = new Map((Object.values(GROCERY_AISLES) as AisleInfo[]).map((a) => [a.name.toLowerCase(), a.id]));

/** "Fresh Produce" for 'produce'. */
export function aisleName(id: FoodAisle): string {
  return GROCERY_AISLES[id]?.name ?? '';
}

/** True when a category is exactly one of the aisles' names. */
export function isAisleName(category: string | undefined | null): boolean {
  return NAMES.has(
    String(category ?? '')
      .trim()
      .toLowerCase(),
  );
}

/**
 * The category to store for a product: its aisle's name, worked out from the category it has
 * ("Produce", "Fish", "Canned"...) or its name, or '' when nothing says (shown as "no aisle").
 */
export function aisleCategory(item: { name: string; category?: string }): string {
  const own = NAMES.get(
    String(item.category ?? '')
      .trim()
      .toLowerCase(),
  );
  if (own) return GROCERY_AISLES[own].name;
  const a = guessAisle(item);
  return a ? GROCERY_AISLES[a].name : '';
}
