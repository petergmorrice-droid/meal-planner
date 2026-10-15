export interface Ingredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
  suggestedAisle?: string;
  /** The grocery-list product this ingredient was linked to when the recipe was saved. */
  groceryId?: string;
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
  cooked?: boolean; // Flag when meal has been marked as cooked
  sides?: PlannedMealSide[];
}

export interface DayPlan {
  date: string; // ISO date string (YYYY-MM-DD)
  meals: PlannedMeal[];
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
}

export interface BatchItem {
  id: string;
  name?: string;
  recipeId?: string;
  portions: number;
  dateAdded: string;
  lastModifiedAt?: number;
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
  /** Part of the amount couldn't be worked out from the recipe; see quantityNote. */
  needsCheck?: boolean;
  quantityNote?: string;
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
}

export interface GroceryItem {
  id: string;
  name: string;
  unit: string;
  increment: number;
  category: string;
  aliases?: string[];
  cost?: number;
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
