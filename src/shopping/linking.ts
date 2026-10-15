/**
 * Linking a recipe's ingredients to grocery-list products when it's imported.
 *
 * Order of trust:
 *  1. exact   - the app's own rules recognise the name ("chicken breasts").
 *  2. gemini  - Gemini's suggestion, only if that product really is on the list.
 *  3. partial - the app's rules find a product inside the name ("lean beef mince").
 *  4. none    - left for you to decide on the Map Ingredient screen.
 *
 * The ingredient's own wording is never changed; only `groceryId` is set.
 */
import type { Catalog, Product } from './catalog';
import { matchProductDetailed, productByName } from './catalog';

export interface LinkableIngredient {
  name: string;
  amount?: number | string;
  unit?: string;
  category?: string;
  groceryId?: string;
  [key: string]: any;
}

export type LinkSource = 'exact' | 'gemini' | 'partial';

/** Ingredient names the app can't match exactly by itself (worth asking Gemini about). */
export function namesNeedingSuggestion(ingredients: LinkableIngredient[], catalog: Catalog): string[] {
  const names: string[] = [];
  for (const ing of ingredients) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) continue;
    const m = matchProductDetailed(catalog, ing.name, { unit: ing.unit, amount: Number(ing.amount) });
    if (m?.how !== 'exact' && !names.includes(ing.name)) names.push(ing.name);
  }
  return names;
}

export function linkIngredients<T extends LinkableIngredient>(
  ingredients: T[],
  catalog: Catalog,
  suggestions: Record<string, string> = {}
): { ingredients: (T & { groceryId?: string; linkSource?: LinkSource })[]; unmapped: T[] } {
  const unmapped: T[] = [];
  const out = ingredients.map((ing) => {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) return ing;
    const m = matchProductDetailed(catalog, ing.name, { unit: ing.unit, amount: Number(ing.amount) });
    let product: Product | null = null;
    let source: LinkSource | undefined;
    if (m?.how === 'exact') {
      product = m.product; source = 'exact';
    } else {
      const suggested = suggestions[ing.name] ? productByName(catalog, suggestions[ing.name]) : null;
      if (suggested) { product = suggested; source = 'gemini'; }
      else if (m?.how === 'partial') { product = m.product; source = 'partial'; }
    }
    if (!product) {
      const { groceryId: _drop, ...rest } = ing;
      unmapped.push(rest as T);
      return rest as T;
    }
    return { ...ing, groceryId: product.id, category: product.category || ing.category, linkSource: source };
  });
  return { ingredients: out, unmapped };
}
