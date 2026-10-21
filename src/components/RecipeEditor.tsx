import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { X, Plus, Flame, Zap, Leaf, Sparkles, Trash2, ShoppingCart, ChevronRight, Search, Check } from 'lucide-react';
import { Recipe, CookingMethod, Ingredient, GroceryItem } from '../types';
import { catalogForState } from '../shopping';
import { GROCERY_AISLES, getGroceryAisle, type FoodAisle } from '../utils';
import { recipeMethods, METHOD_LABEL, METHOD_ORDER } from '../recipeInfo';
import type { AppStore } from '../store';

const sectionTitle = 'text-[13px] font-bold uppercase tracking-wide text-zinc-500';
const AISLES = (Object.keys(GROCERY_AISLES) as FoodAisle[]).sort(
  (a, b) => GROCERY_AISLES[a].order - GROCERY_AISLES[b].order,
);
const titleCase = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** The steps being edited for a method, and how to write changes back to the recipe. */
export function methodSteps(recipe: Recipe, method: CookingMethod) {
  const methods = recipeMethods(recipe);
  const steps: string[] = recipe.methodInstructions?.[method] || recipe.instructions || [];
  const writeSteps = (next: string[]): Recipe =>
    recipe.methodInstructions?.[method] || !recipe.instructions?.length || methods.length > 0
      ? { ...recipe, methodInstructions: { ...(recipe.methodInstructions || {}), [method]: next } }
      : { ...recipe, instructions: next };
  return { methods, steps, writeSteps };
}

/**
 * Editing a recipe: the same screen when checking a new import and when changing a saved recipe.
 * With `store`, each ingredient shows what it's bought as on the shopping list ("Shop as").
 */
export function RecipeEditor({
  recipe,
  onChange,
  method,
  onMethod,
  store,
  showName = false,
  onDelete,
  onWriteMethod,
  writing,
}: {
  recipe: Recipe;
  onChange: (next: Recipe) => void;
  method: CookingMethod;
  onMethod: (m: CookingMethod) => void;
  store?: AppStore;
  showName?: boolean;
  onDelete?: () => void;
  /** Ask Gemini for the other appliance's steps (shown when the recipe has exactly one). */
  onWriteMethod?: (m: CookingMethod) => void;
  writing?: CookingMethod | null;
}) {
  const { methods, steps, writeSteps } = methodSteps(recipe, method);
  const missingMethod = methods.length === 1 ? METHOD_ORDER.find((m) => !methods.includes(m)) : undefined;
  const [shopFor, setShopFor] = useState<number | null>(null);

  // The products as they are now (the same object until a product changes, so the list below
  // is only rebuilt then).
  const catalog = store?.state ? catalogForState(store.state) : null;
  const products: GroceryItem[] = useMemo(
    () => (catalog ? catalog.products.filter((p) => !p.sameAs).map((p) => p.item as GroceryItem) : []),
    [catalog],
  );
  const productName = (id?: string) => {
    if (!id || !catalog) return null;
    const p = catalog.products.find((x) => x.item.id === id);
    return p ? (p.item as GroceryItem).name : null;
  };

  const updateIngredient = (idx: number, patch: Partial<Ingredient>) =>
    onChange({ ...recipe, ingredients: recipe.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)) });
  const unlinkedCount = store ? recipe.ingredients.filter((i) => i.name.trim() && !productName(i.groceryId)).length : 0;

  const chooseShopAs = (idx: number, choice: ShopChoice) => {
    const ing = recipe.ingredients[idx];
    if (choice.kind === 'product') {
      if (choice.remember && store?.updateGroceryOverride) {
        const existing = store.state.groceryOverrides?.[choice.item.id] || {};
        const aliases = Array.from(
          new Set([...(existing.aliases || choice.item.aliases || []), ing.name.trim()].filter(Boolean)),
        );
        store.updateGroceryOverride(choice.item.id, { ...existing, aliases });
      }
      updateIngredient(idx, { groceryId: choice.item.id });
    } else if (choice.kind === 'new') {
      const id = `gdb-custom-${crypto.randomUUID()}`;
      const name = titleCase(ing.name);
      store?.updateGroceryOverride?.(id, {
        id,
        name,
        category: GROCERY_AISLES[choice.aisle].name,
        unit: ing.unit || 'unit',
        increment: 1,
        cost: 0,
        aliases: Array.from(new Set([ing.name.trim(), name])),
      });
      updateIngredient(idx, { groceryId: id });
    } else {
      // Not linked to a product: just which aisle it's in.
      const unlinked: Ingredient = { ...ing, category: GROCERY_AISLES[choice.aisle].name };
      delete unlinked.groceryId;
      onChange({ ...recipe, ingredients: recipe.ingredients.map((x, i) => (i === idx ? unlinked : x)) });
    }
    setShopFor(null);
  };

  return (
    <div className="space-y-6" data-recipe-editor>
      <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-4" data-edit-details>
        {showName && (
          <label className="block">
            <span className="text-xs font-semibold text-zinc-600 block mb-1">Name</span>
            <input
              value={recipe.name}
              onChange={(e) => onChange({ ...recipe, name: e.target.value })}
              aria-label="Recipe name"
              className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        )}
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['Prep (min)', 'prepTime'],
              ['Cook (min)', 'cookTime'],
              ['Serves', 'servings'],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold text-zinc-600 block mb-1">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={key === 'servings' ? 1 : 0}
                value={recipe[key] || ''}
                placeholder={key === 'servings' ? '2' : '–'}
                onChange={(e) =>
                  onChange({
                    ...recipe,
                    [key]: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                aria-label={label}
                className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {METHOD_ORDER.map((m) => {
            const on = (recipe.cookingMethods || methods).includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const cur = recipe.cookingMethods || methods;
                  onChange({
                    ...recipe,
                    cookingMethods: (on ? cur.filter((x) => x !== m) : [...cur, m]) as CookingMethod[],
                  });
                }}
                aria-pressed={on}
                className={`h-10 px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-300'}`}
              >
                {m === 'ninja' ? <Zap className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                {METHOD_LABEL[m]}
              </button>
            );
          })}
          {(
            [
              ['Vegetarian', 'isVegetarian'],
              ['Vegan', 'isVegan'],
            ] as const
          ).map(([label, key]) => {
            const on = !!recipe[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({ ...recipe, [key]: !on, ...(key === 'isVegan' && !on ? { isVegetarian: true } : {}) })
                }
                aria-pressed={on}
                className={`h-10 px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-zinc-700 border-zinc-300'}`}
              >
                <Leaf className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Ingredients */}
      <section data-recipe-ingredients>
        <h3 className={`${sectionTitle} mb-2`}>
          Ingredients <span className="normal-case font-medium tracking-normal">({recipe.ingredients.length})</span>
        </h3>
        {unlinkedCount > 0 && (
          <p
            className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2"
            data-unlinked-note
          >
            {unlinkedCount === 1 ? "1 ingredient isn't" : `${unlinkedCount} ingredients aren't`} on your grocery list
            yet. Tap <strong>Shop as</strong> to pick what you buy, so it lands in the right aisle. Or leave it: it goes
            on the list as written.
          </p>
        )}
        <div className="space-y-2">
          {recipe.ingredients.map((ing, idx) => {
            const linked = productName(ing.groceryId);
            return (
              <div
                key={ing.id || idx}
                className="bg-white rounded-xl border border-zinc-200 p-2 space-y-1.5"
                data-edit-ingredient={ing.name}
              >
                <div className="flex gap-1.5">
                  <input
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                    placeholder="Ingredient"
                    aria-label="Ingredient"
                    className="flex-1 min-w-0 h-10 rounded-lg border border-zinc-300 px-2 text-base sm:text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...recipe, ingredients: recipe.ingredients.filter((_, i) => i !== idx) })}
                    className="w-10 h-10 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                    aria-label={`Remove ${ing.name || 'ingredient'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={ing.amount || ''}
                    onChange={(e) => updateIngredient(idx, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="Qty"
                    aria-label="Amount"
                    className="w-20 h-10 rounded-lg border border-zinc-300 px-2 text-base sm:text-sm text-center tabular-nums"
                  />
                  <input
                    value={ing.unit || ''}
                    onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                    placeholder="Unit, e.g. g or tbsp"
                    aria-label="Unit"
                    className="flex-1 min-w-0 h-10 rounded-lg border border-zinc-300 px-2 text-base sm:text-sm"
                  />
                </div>
                <input
                  value={ing.note || ''}
                  onChange={(e) => updateIngredient(idx, { note: e.target.value || undefined })}
                  placeholder="Note, e.g. finely chopped"
                  aria-label="Note"
                  className="w-full h-9 rounded-lg border border-zinc-200 px-2 text-base sm:text-sm text-zinc-700"
                />
                {store && ing.name.trim() && (
                  <button
                    type="button"
                    onClick={() => setShopFor(idx)}
                    data-shop-as={ing.name}
                    className={`w-full h-10 rounded-lg px-2 text-sm flex items-center gap-2 cursor-pointer border ${
                      linked
                        ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 flex-1 text-left truncate">
                      Shop as: <strong>{linked || `“${ing.name.trim()}” (not on your list)`}</strong>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...recipe,
                ingredients: [
                  ...recipe.ingredients,
                  { id: crypto.randomUUID(), name: '', amount: 0, unit: '', category: 'Pantry' },
                ],
              })
            }
            className="w-full h-11 rounded-xl border border-dashed border-emerald-300 text-emerald-800 bg-emerald-50/60 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add ingredient
          </button>
        </div>
      </section>

      {/* Method */}
      <section data-recipe-method>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h3 className={sectionTitle}>Method</h3>
          {methods.length > 1 && (
            <div className="inline-flex bg-zinc-200/70 rounded-xl p-1" role="tablist" aria-label="Steps for">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={method === m}
                  onClick={() => onMethod(m)}
                  className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${method === m ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                >
                  {m === 'ninja' ? (
                    <Zap className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Flame className="w-4 h-4 text-rose-500" />
                  )}
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-700 text-sm font-bold flex items-center justify-center shrink-0 mt-1">
                {idx + 1}
              </span>
              <textarea
                value={step}
                onChange={(e) => onChange(writeSteps(steps.map((s, i) => (i === idx ? e.target.value : s))))}
                aria-label={`Step ${idx + 1}`}
                rows={3}
                className="flex-1 min-w-0 rounded-xl border border-zinc-300 px-3 py-2 text-base sm:text-sm leading-relaxed resize-y bg-white"
              />
              <button
                type="button"
                onClick={() => onChange(writeSteps(steps.filter((_, i) => i !== idx)))}
                className="w-10 h-10 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                aria-label={`Remove step ${idx + 1}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange(writeSteps([...steps, '']))}
            className="w-full h-11 rounded-xl border border-dashed border-emerald-300 text-emerald-800 bg-emerald-50/60 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add step
          </button>
          {onWriteMethod && missingMethod && recipe.ingredients.length > 0 && (
            <button
              type="button"
              onClick={() => onWriteMethod(missingMethod)}
              disabled={!!writing}
              data-write-method={missingMethod}
              className="w-full h-11 rounded-xl border border-dashed border-zinc-300 bg-white text-zinc-800 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {writing ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
                  Writing {METHOD_LABEL[missingMethod]} steps…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Write {METHOD_LABEL[missingMethod]} instructions with Gemini
                </>
              )}
            </button>
          )}
        </div>
      </section>

      <section>
        <h3 className={`${sectionTitle} mb-2`}>Our notes</h3>
        <textarea
          value={recipe.notes || ''}
          onChange={(e) => onChange({ ...recipe, notes: e.target.value })}
          placeholder="e.g. we use half the chilli"
          aria-label="Our notes"
          rows={3}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-base sm:text-sm leading-relaxed bg-white"
        />
      </section>

      <section>
        <h3 className={`${sectionTitle} mb-2`}>Intro</h3>
        <textarea
          value={recipe.description || ''}
          onChange={(e) => onChange({ ...recipe, description: e.target.value })}
          placeholder="A line about the dish (from the recipe)"
          aria-label="Intro"
          rows={2}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-base sm:text-sm leading-relaxed bg-white"
        />
      </section>

      <section>
        <h3 className={`${sectionTitle} mb-2`}>Website</h3>
        <input
          type="url"
          inputMode="url"
          value={recipe.sourceUrl || ''}
          onChange={(e) => onChange({ ...recipe, sourceUrl: e.target.value })}
          placeholder="https://… (where the recipe came from)"
          aria-label="Website"
          className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base sm:text-sm bg-white"
        />
      </section>

      {onDelete && (
        <section className="pt-2 border-t border-zinc-200">
          <button
            type="button"
            onClick={onDelete}
            className="h-11 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Delete this recipe
          </button>
        </section>
      )}

      {shopFor !== null && recipe.ingredients[shopFor] && (
        <ShopAsSheet
          ingredient={recipe.ingredients[shopFor]}
          products={products}
          currentId={recipe.ingredients[shopFor].groceryId}
          onChoose={(c) => chooseShopAs(shopFor, c)}
          onClose={() => setShopFor(null)}
        />
      )}
    </div>
  );
}

export type ShopChoice =
  | { kind: 'product'; item: GroceryItem; remember: boolean }
  | { kind: 'new'; aisle: FoodAisle }
  | { kind: 'keep'; aisle: FoodAisle };

/** What an ingredient is bought as: a grocery-list product, a new one, or just as written. */
export function ShopAsSheet({
  ingredient,
  products,
  currentId,
  onChoose,
  onClose,
}: {
  ingredient: Ingredient;
  products: GroceryItem[];
  currentId?: string;
  onChoose: (choice: ShopChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [remember, setRemember] = useState(true);
  const [aisle, setAisle] = useState<FoodAisle>(() =>
    getGroceryAisle({ name: ingredient.name, category: ingredient.category }),
  );
  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: [
          { name: 'name', weight: 0.7 },
          { name: 'aliases', weight: 0.5 },
        ],
        threshold: 0.38,
        ignoreLocation: true,
      }),
    [products],
  );
  const results = useMemo(() => {
    const q = (query.trim() || ingredient.name.trim()).toLowerCase();
    if (!q) return [];
    const exact = query.trim()
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.aliases || []).some((a) => a.toLowerCase().includes(q)),
        )
      : [];
    const fuzzy = fuse.search(q).map((r) => r.item);
    const seen = new Set<string>();
    return [...exact, ...fuzzy]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, query.trim() ? 12 : 5);
  }, [query, ingredient.name, products, fuse]);
  const amount = [ingredient.amount || '', ingredient.unit || ''].filter(Boolean).join(' ');

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Shop as: ${ingredient.name}`}
        data-shop-as-sheet
        className="bg-white w-full sm:max-w-md max-h-[88dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-zinc-900">What do you buy for this?</h3>
            <p className="text-sm text-zinc-600 break-words">
              {amount ? `${amount} ` : ''}
              {ingredient.name}
              {ingredient.note ? `, ${ingredient.note}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your grocery list"
              aria-label="Search your grocery list"
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-zinc-300 text-base sm:text-sm"
            />
          </div>
          <div>
            <span className="text-xs font-semibold text-zinc-500 block mb-1.5">
              {query.trim() ? 'On your grocery list' : 'Closest on your grocery list'}
            </span>
            {results.length > 0 ? (
              <>
                <ul className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onChoose({ kind: 'product', item: p, remember })}
                        data-product={p.name}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-zinc-50"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-medium text-zinc-900 truncate">{p.name}</span>
                          <span className="block text-xs text-zinc-500">{GROCERY_AISLES[getGroceryAisle(p)].name}</span>
                        </span>
                        {currentId === p.id && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 mt-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  Remember for next time (“{ingredient.name.trim()}” will match it)
                </label>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Nothing close. Search for it, or add it below.</p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 p-3 space-y-2.5">
            <span className="text-xs font-semibold text-zinc-500 block">Not on your list?</span>
            <label className="block">
              <span className="text-sm text-zinc-700 block mb-1">Aisle</span>
              <select
                value={aisle}
                onChange={(e) => setAisle(e.target.value as FoodAisle)}
                aria-label="Aisle"
                className="w-full h-11 rounded-xl border border-zinc-300 px-2 text-base sm:text-sm bg-white"
              >
                {AISLES.map((a) => (
                  <option key={a} value={a}>
                    {GROCERY_AISLES[a].name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onChoose({ kind: 'new', aisle })}
              data-add-new-product
              className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add “{titleCase(ingredient.name)}” to my grocery list
            </button>
            <button
              type="button"
              onClick={() => onChoose({ kind: 'keep', aisle })}
              data-keep-as-written
              className="w-full h-11 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-sm font-semibold cursor-pointer"
            >
              Just put “{ingredient.name.trim()}” on the list
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
