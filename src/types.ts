export interface Ingredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
  suggestedAisle?: string;
  /** The grocery-list product this ingredient was linked to when the recipe was saved. */
  groceryId?: string;
  /** Preparation from the recipe's ingredient line, e.g. "finely chopped". */
  note?: string;
}

export type CookingMethod = 'ninja' | 'oven_hob';

export interface RecipeCostBreakdown {
  totalCost: number;
  costPerServing: number;
  notes?: string;
  items: { ingredient: string; cost: number; notes?: string }[];
}

export interface RecipeHealthBreakdown {
  score: number;
  summary?: string;
  points: { factor: string; description: string; impact: 'positive' | 'negative' | 'neutral' }[];
  macros: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string;
  };
}

export interface Recipe {
  addedBy?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: number;
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  methodInstructions?: Partial<Record<CookingMethod, string[]>>;
  prepTime: number; // minutes
  cookTime: number; // minutes
  methodPrepTime?: Partial<Record<CookingMethod, number>>;
  methodCookTime?: Partial<Record<CookingMethod, number>>;
  servings: number;
  imageUrl?: string;
  /** The web page it was copied from, if any. */
  sourceUrl?: string;
  /** Your own notes on it ("we use half the chilli"), separate from the recipe's intro. */
  notes?: string;
  /** Who last wrote the notes ('P' or 'R'). */
  notesBy?: string;
  /** What you said after cooking it: have it again, or not for us. */
  verdict?: 'again' | 'not_for_us';
  /** Starred in the Cookbook. */
  favourite?: boolean;
  tags: string[];
  cookingMethods?: CookingMethod[];
  isVegetarian?: boolean;
  isVegan?: boolean;
  costBreakdown?: RecipeCostBreakdown;
  healthBreakdown?: RecipeHealthBreakdown;
  costEstimate?: number;
  healthScore?: number;
}

export type MealType = 'recipe' | 'takeout' | 'eating_out' | 'batch' | 'leftover' | 'no_meal';

export interface PlannedMealSide {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
}

export interface PlannedMeal {
  id: string;
  type: MealType;
  recipeId?: string; // If type is recipe or leftover
  batchId?: string; // If type is batch
  name: string; // Used for takeout/eating_out or overrides
  servings?: number; // Number of people cooking for (default 2)
  note?: string; // Optional note for takeout, eating out, or no meal needed
  /** Who wrote the note ('P' or 'R'). */
  noteBy?: string;
  cooked?: boolean; // Flag when meal has been marked as cooked
  sides?: PlannedMealSide[];
  /** Portions put in the freezer when this was cooked (so unticking can take them back out). */
  froze?: { batchId: string; portions: number };
  /** Portions taken out of the freezer when this was eaten (so unticking can put them back). */
  tookFromFreezer?: { batchId: string; portions: number; batch?: BatchItem };
}

export interface DayPlan {
  date: string; // ISO date string (YYYY-MM-DD)
  meals: PlannedMeal[];
  /** Who last changed this day's meal ('P' or 'R'). */
  updatedBy?: string;
}

export interface MealPlan {
  lastModifiedBy?: string;
  lastModifiedAt?: number;
  id: string;
  startDate: string; // ISO date string for Monday of the week
  days: Record<string, DayPlan>; // Key is ISO date
  status: 'not_started' | 'draft' | 'finalized';
  isCurrent: boolean;
  lastFinalizedSnapshot?: string; // Serialized state of days when finalized
  /** When each day was last changed, so two phones editing different days both keep their changes. */
  dayModifiedAt?: Record<string, number>;
  /** When the week's own details (status, sent to the list) last changed. */
  headModifiedAt?: number;
}

export interface BatchItem {
  id: string;
  name?: string;
  recipeId?: string;
  /** One person's helping each (a meal for 2 takes 2). */
  portions: number;
  /** When it went in the freezer. */
  dateAdded: string;
  /** "Garage freezer, blue tub". */
  note?: string;
  lastModifiedAt?: number;
  /** Who put it in the freezer, who last changed it, who wrote the note ('P' or 'R'). */
  addedBy?: string;
  lastModifiedBy?: string;
  noteBy?: string;
}

export interface ShoppingListItem {
  addedBy?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: number;
  requiredFor?: string[];
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
  checked: boolean;
  isAdhoc: boolean;
  isBatch?: boolean;
  isRecurring?: boolean;
  batchRecipeName?: string;
  planId?: string; // Associated MealPlan id, if generated from a week plan
  weekLabel?: string; // e.g. "Week of 1 Sep – 7 Sep"
  recipeNames?: string[];
  userAdjusted?: boolean;
  /** Grocery-list product this line is for. */
  groceryId?: string;
  /** Store-cupboard staple: check you have it before buying. */
  checkCupboard?: boolean;
  /** What the recipes actually use, when it's less than you buy: "100 g" of a 300 g pack. */
  neededText?: string;
  /** Part of the amount couldn't be worked out from the recipe; see quantityNote. */
  needsCheck?: boolean;
  quantityNote?: string;
  /** Answer from the cupboard check: 'have' = already in the cupboard, not buying; 'need' = buy it. */
  cupboard?: 'have' | 'need';
  /** Your own note for the shop: "semi-skimmed", "big tub", "if on offer". */
  note?: string;
  /** Not in the shop this time (doesn't count against the % done). */
  outOfStock?: boolean;
  /** Who ticked it ('P' or 'R'), so the other phone can see. */
  checkedBy?: string;
  /** Who added it or last changed its amount, name or note ('P' or 'R'); ticking doesn't count. */
  editedBy?: string;
  /** Who wrote the note ('P' or 'R'). */
  noteBy?: string;
}

export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
}

export interface UserPreferences {
  showPrepTime: boolean;
  showCookTime: boolean;
  showTotalTime: boolean;
  showHealth?: boolean;
  showCost?: boolean;
  showMethod: boolean;
  showVegetarian: boolean;
  showVegan: boolean;
  showEmojis?: boolean;
  /** Recipe cards: "Last had 3 weeks ago" / "Planned Thu". */
  showLastHad?: boolean;
  /** Recipe cards: portions in the freezer. */
  showFreezer?: boolean;
  mealRowsLayout?: 1 | 2;
  // Additional configurable variables for the app:
  defaultServings?: number; // default number of people cooking for (e.g. 2)
  adultCount?: number; // number of adults (e.g. 2)
  childCount?: number; // number of children (e.g. 0)
  currencySymbol?: string; // e.g. '£', '$', '€'
  maxForwardWeeks?: number; // planning forward horizon (2-8 weeks, default 4)
  firstDayOfWeek?: 'Monday' | 'Sunday';
  preferredCookingMethod?: 'all' | 'ninja' | 'oven_hob';
  ninjaModel?: string; // appliance model e.g. "Ninja Combi 12-in-1"
  prepTimeAlertThreshold?: number; // threshold for quick recipes (mins)
  dietaryPreference?: 'none' | 'vegetarian' | 'vegan' | 'pescatarian' | 'high_protein' | 'low_carb';
  allergiesNotes?: string; // custom dietary restriction notes
  compactPlanningCards?: boolean;
  recurringItems?: RecurringItem[];
  favouriteItems?: { name: string; category?: string }[];
  weeklyBudgetLimit?: number;
  defaultTakeoutCost?: number;
  defaultEatingOutCost?: number;
  targetHealthScore?: number;
  /** Which version of the built-in product list has been added to the grocery list. */
  catalogVersion?: number;
  /** Aisle ids in the order you walk your supermarket (missing ones follow in the usual order). */
  aisleOrder?: string[];
  /** The order you usually pick things up, learned from your shops (0 = first, 1 = last). */
  shopRoute?: ShopRoute;
  /** Your last shops: how many items, how long. Newest first. */
  shopHistory?: ShopRecord[];
  /** When you usually eat dinner ("18:00"; 6pm if not set), for "start by" times on the Cook tab. Settings → Household. */
  eatAt?: string;
  /** A different time just for one evening, set on the Cook tab. */
  eatAtTonight?: { date: string; time: string };
  /** Things added to the list that you said aren't products (lower case): the Shop stops offering to save them. */
  notProducts?: string[];
}

export interface ShopRoute {
  /** Product key -> usual position in the shop (0..1). */
  items: Record<string, number>;
  /** Aisle id -> usual position of its first pick-up (0..1). */
  aisles: Record<string, number>;
  /** How many shops it was learned from. */
  shops: number;
}

export interface ShopRecord {
  id: string;
  /** When the shop finished (ISO date-time). */
  date: string;
  /** The week it was for (its Monday). */
  weekStart: string;
  bought: number;
  total: number;
  /** How long it took, if timed. */
  minutes: number | null;
  /** Who shopped ('P' or 'R'). */
  by?: string;
}

/**
 * A product: one thing you buy. Everything the Shop knows about products is in the one shared
 * list (AppState.groceryDatabase), built-in products included.
 */
export interface GroceryItem {
  id: string;
  name: string;
  /** The unit you buy it in ('g', 'can', 'bunch'...). */
  unit: string;
  /** The step it's sold in (250 g packs: 250). */
  increment: number;
  /** Its aisle's name ("Fresh Produce"), or '' if it hasn't got one. */
  category: string;
  /** Other names you've added. */
  aliases?: string[];
  /** Built-in other names you've taken off. */
  hiddenAliases?: string[];
  cost?: number;
  /** Taken off the list. Kept (rather than deleted) so it stays off on both phones. */
  removed?: boolean;
  /** Merged into this product ("Same as…"): anything still linked here leads there. */
  mergedInto?: string;
  /** Products you've said aren't the same as this one (so the tidy-up check stops asking). */
  notSameAs?: string[];
  lastModifiedAt?: number;
}

export type CleanActionType = 'merge' | 'rename' | 'recategorize';

export interface DatabaseCleanAction {
  actionType: CleanActionType;
  primaryItemId: string;
  secondaryItemId?: string;
  newName?: string;
  newAisle?: string;
  reason: string;
}

export interface CleanDatabaseResponse {
  actions: DatabaseCleanAction[];
}

/**
 * Bookkeeping that lets two phones merge their changes safely.
 * - tombstones: "<collection>:<key>" -> time it was deleted, so deletions
 *   aren't undone by the other phone's older copy.
 * - preferencesModifiedAt / overridesModifiedAt: when those were last changed,
 *   so the newest change wins.
 */
export interface SyncMeta {
  tombstones: Record<string, number>;
  /** Time the settings as a whole were last saved (older data), or -1 for a new phone's defaults. */
  preferencesModifiedAt?: number;
  /** Time each individual setting was last changed. */
  preferencesFieldModifiedAt?: Record<string, number>;
  overridesModifiedAt?: Record<string, number>;
  /** Time each staple, favourite and past shop was last changed ("recurringItems:<id>"). */
  prefItemModifiedAt?: Record<string, number>;
}

export interface AppState {
  recipes: Recipe[];
  mealPlans: MealPlan[];
  batches: BatchItem[];
  shoppingList: ShoppingListItem[];
  preferences?: UserPreferences;
  groceryDatabase?: GroceryItem[];
  groceryOverrides?: Record<string, Partial<GroceryItem>>;
  syncMeta?: SyncMeta;
}
