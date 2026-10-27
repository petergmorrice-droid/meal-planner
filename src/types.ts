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
  /** Made with a slow cooker or the slow-cook setting. Not set: worked out from the recipe's steps. */
  slowCook?: boolean;
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
  /**
   * What you said you'd already got when the week was auto-populated (last week's leftovers):
   * it comes off this week's shopping.
   */
  onHand?: OnHandItem[];
}

/** Something already in the fridge or cupboard (Auto populate's "Still got these?"). */
export interface OnHandItem {
  id: string;
  name: string;
  amount: number;
  /** The amount's unit ('g', 'ml', '' for a count, or a recipe unit). */
  unit: string;
  /** The product it is, when it's on the product list. */
  groceryId?: string;
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
  /** What you've already got of it (the week's on-hand leftovers), taken off what you buy: "200 g". */
  haveText?: string;
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
  /** Settings → Reminders: time to start dinner, by notification or calendar alert (on unless switched off). */
  reminderCook?: boolean;
  /** Minutes before the start time the start-dinner reminder goes off (0 = at the start time). */
  reminderCookBefore?: number;
  /** Settings → Reminders: evening-before reminders for freezer meals and get-ahead steps (on unless switched off). */
  reminderPrep?: boolean;
  /** When the evening-before reminder goes off ("20:00"; 8pm if not set; 3pm to 9:45pm). */
  reminderPrepAt?: string;
  /** Settings → Reminders: "Plan next week" when it isn't planned or on the list yet (on unless switched off). */
  reminderPlan?: boolean;
  /** The day it goes off, at the morning time ("Friday" if not set). */
  reminderPlanDay?: string;
  /** Settings → Calendar: keep calendar feeds of the plan (and of the reminders) in the sync Gist. */
  calendarSync?: boolean;
  /**
   * Notes written on Shop items, remembered by product (see productKey), so the note comes back
   * whenever that product goes on the list again: "Regular size", "semi-skimmed".
   */
  itemNotes?: Record<string, { note: string; by?: string }>;
  /** Settings → Notifications: the household's key with the notification sender (both phones share it). */
  pushHousehold?: string;
  /** Settings → Reminders: each morning, tonight's dinner and anything to do tonight (on unless switched off). */
  notifyDinner?: boolean;
  /** No longer used: what to do tonight is now in the morning heads-up and the night-before reminder. */
  notifyPrep?: boolean;
  /** When the morning heads-up goes off ("09:00"; 9am if not set; 6am to 11:45am). */
  notifyMorningAt?: string;
  /** A different time just for one evening, set on the Cook tab. */
  eatAtTonight?: { date: string; time: string };
  /** Things added to the list that you said aren't products (lower case): the Shop stops offering to save them. */
  notProducts?: string[];
  /** Each person's star rating of each recipe (synced one rating at a time, so you can both rate at once). */
  ratings?: RecipeRating[];
  /** Things you said aren't weekly staples (lower case): the Shop stops suggesting them. */
  notStaples?: string[];
  /** Auto populate: the days you're usually short of time (quick meals or the freezer only). */
  autoPlanBusyDays?: string[];
  /** Auto populate: favourites only, a mix, or something new. */
  autoPlanMood?: AutoPlanMood;
  /** Auto populate: put freezer meals on busy nights (on unless switched off). */
  autoPlanFreezer?: boolean;
}

export type AutoPlanMood = 'favourites' | 'mix' | 'new';

/** One person's rating of one recipe: 1 to 5 stars. */
export interface RecipeRating {
  /** `${recipeId}:${who}` */
  id: string;
  recipeId: string;
  /** 'P' (Peter) or 'R' (Rachel) */
  who: string;
  stars: number;
  /** When it was rated (ISO date). */
  at?: string;
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

/** The app's tabs ('this_week' is the Cook tab). */
export type TabName = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';
