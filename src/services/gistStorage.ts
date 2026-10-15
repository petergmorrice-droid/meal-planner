import { AppState, Recipe, MealPlan, BatchItem, ShoppingListItem, GroceryItem, UserPreferences } from '../types';

const GIST_FILENAME = 'family-meal-planner.json';

export interface GistConfig {
  pat: string;
  gistId: string;
}

export function getGistConfig(): GistConfig | null {
  try {
    const pat = localStorage.getItem('github_pat') || '';
    const gistId = localStorage.getItem('github_gist_id') || '';
    if (pat && gistId) {
      return { pat, gistId };
    }
  } catch (e) {
    console.error('Failed to read Gist config from localStorage', e);
  }
  return null;
}

export function saveGistConfig(pat: string, gistId: string) {
  try {
    localStorage.setItem('github_pat', pat.trim());
    localStorage.setItem('github_gist_id', gistId.trim());
  } catch (e) {
    console.error('Failed to save Gist config to localStorage', e);
  }
}

export function clearGistConfig() {
  try {
    localStorage.removeItem('github_pat');
    localStorage.removeItem('github_gist_id');
  } catch (e) {
    console.error('Failed to clear Gist config from localStorage', e);
  }
}

export async function createPrivateGist(pat: string, initialState: AppState): Promise<string> {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'Family Meal Planner App Data',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(initialState, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create Gist: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function fetchFromGist(config: GistConfig): Promise<AppState | null> {
  const response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.pat}`,
      'Accept': 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Gist not found. Please check your Gist ID.');
    }
    if (response.status === 401) {
      throw new Error('Unauthorized. Please check your GitHub Personal Access Token.');
    }
    throw new Error(`Failed to fetch Gist: ${response.statusText}`);
  }

  const data = await response.json();
  const file = data.files[GIST_FILENAME];
  if (!file) {
    return null;
  }

  try {
    return JSON.parse(file.content) as AppState;
  } catch (err) {
    throw new Error('Gist content is not valid JSON.');
  }
}

export async function saveToGist(config: GistConfig, state: AppState): Promise<void> {
  const response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${config.pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'Family Meal Planner App Data',
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(state, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update Gist: ${response.status}`);
  }
}

export function mergeAppStates(local: AppState, remote: AppState): AppState {
  // Merge recipes
  const recipeMap = new Map<string, Recipe>();
  (remote.recipes || []).forEach(r => recipeMap.set(r.id, r));
  (local.recipes || []).forEach(r => {
    const existing = recipeMap.get(r.id);
    if (!existing || (r.lastModifiedAt || 0) > (existing.lastModifiedAt || 0)) {
      recipeMap.set(r.id, r);
    }
  });

  // Merge mealPlans
  const planMap = new Map<string, MealPlan>();
  (remote.mealPlans || []).forEach(p => planMap.set(p.startDate, p));
  (local.mealPlans || []).forEach(p => {
    const existing = planMap.get(p.startDate);
    if (!existing || (p.lastModifiedAt || 0) > (existing.lastModifiedAt || 0)) {
      planMap.set(p.startDate, p);
    }
  });

  // Merge batches
  const batchMap = new Map<string, BatchItem>();
  (remote.batches || []).forEach(b => batchMap.set(b.id, b));
  (local.batches || []).forEach(b => batchMap.set(b.id, b));

  // Merge shoppingList
  const shoppingMap = new Map<string, ShoppingListItem>();
  (remote.shoppingList || []).forEach(i => shoppingMap.set(i.id, i));
  (local.shoppingList || []).forEach(i => {
    const existing = shoppingMap.get(i.id);
    if (!existing || (i.lastModifiedAt || 0) > (existing.lastModifiedAt || 0)) {
      shoppingMap.set(i.id, i);
    }
  });

  // Merge preferences
  const preferences = {
    ...(remote.preferences || {}),
    ...(local.preferences || {})
  } as UserPreferences;

  // Merge groceryDatabase
  const groceryMap = new Map<string, GroceryItem>();
  (remote.groceryDatabase || []).forEach(g => groceryMap.set(g.id, g));
  (local.groceryDatabase || []).forEach(g => groceryMap.set(g.id, g));

  const groceryOverrides = {
    ...(remote.groceryOverrides || {}),
    ...(local.groceryOverrides || {})
  };

  return {
    recipes: Array.from(recipeMap.values()),
    mealPlans: Array.from(planMap.values()),
    batches: Array.from(batchMap.values()),
    shoppingList: Array.from(shoppingMap.values()),
    preferences,
    groceryDatabase: Array.from(groceryMap.values()),
    groceryOverrides
  };
}
