import { useEffect, useMemo, useRef, useState } from 'react';
import { AisleIcon } from '../AisleLook';
import { Search, X, Plus, ChevronRight, Sparkles } from 'lucide-react';
import { UserPreferences, GroceryItem } from '../../types';
import { GROCERY_AISLES, orderedAisles } from '../../utils';
import {
  catalogForState,
  productUsage,
  likelyDuplicates,
  hasNoAisle,
  isUnused,
  usageText,
  alsoCalled,
  isBuiltInProduct,
  mergeSummary,
  productMatchesSearch,
  type Product,
} from '../../shopping';
import { useLatest } from '../../hooks/useLatest';
import { ProductSheet } from './ProductSheet';
import { SameAsPicker } from './SameAsPicker';
import { AISLES_IN_ORDER, SubHeader, card, row, sectionTitle } from './parts';
import { Confirm, SettingsTabProps } from './types';

const PAGE = 60;
type ProductView = 'all' | 'duplicates' | 'no-aisle' | 'unused';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const listText = (names: string[], max = 3) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;

/**
 * Every product the Shop knows how to buy (built-in ones and yours), how each is sold, which
 * aisle it's in and what uses it, with checks for tidying up.
 */
export function ProductsPage({
  store,
  onBack,
  onClean,
  say,
  setConfirm,
}: {
  store: SettingsTabProps['store'];
  onBack: () => void;
  onClean: () => void;
  say: (t: string, undo?: () => void) => void;
  setConfirm: (c: Confirm) => void;
}) {
  // The newest store, for Undo tapped after other changes.
  const storeRef = useLatest(store);
  const prefs = (store.state.preferences || {}) as UserPreferences;
  const catalog = catalogForState(store.state);
  // Worked out again only when something that can use a product changes (not on every edit).
  const { recipes, shoppingList } = store.state;
  const staples = prefs.recurringItems;
  const favourites = prefs.favouriteItems;
  const usage = useMemo(
    () =>
      productUsage(
        { recipes, shoppingList, preferences: { recurringItems: staples, favouriteItems: favourites } },
        catalog,
      ),
    [catalog, recipes, shoppingList, staples, favourites],
  );
  const recipeNames = useMemo(
    () => new Map((store.state.recipes || []).map((r) => [r.id, r.name])),
    [store.state.recipes],
  );
  const dups = useMemo(() => {
    const used = (p: Product) => (usage.get(p.id)?.recipes.length || 0) * 10 + (isUnused(usage.get(p.id)) ? 0 : 1);
    // The one used more first (that's the one you'd usually keep).
    return likelyDuplicates(catalog).map(([a, b]) => (used(b) > used(a) ? [b, a] : [a, b]) as [Product, Product]);
  }, [catalog, usage]);
  const noAisle = useMemo(() => catalog.products.filter(hasNoAisle), [catalog]);
  const unused = useMemo(() => catalog.products.filter((p) => isUnused(usage.get(p.id))), [catalog, usage]);
  const yoursUnused = unused.filter((p) => !isBuiltInProduct(p.id)).length;

  const [view, setView] = useState<ProductView>('all');
  const [q, setQ] = useState('');
  const [aisle, setAisle] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [sameAsFor, setSameAsFor] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLimit(PAGE), [q, aisle, view]);
  const openView = (v: ProductView) => {
    setView(v);
    setAisle('all');
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const shown = useMemo(() => {
    const base = view === 'no-aisle' ? noAisle : view === 'unused' ? unused : catalog.products;
    const yours = (p: Product) => (isBuiltInProduct(p.id) ? 1 : 0);
    const aisleOf = (p: Product) => (hasNoAisle(p) ? null : p.aisle);
    return base
      .filter((p) => (aisle === 'all' || aisleOf(p) === aisle) && productMatchesSearch(p, q))
      .sort((a, b) => (view === 'unused' ? yours(a) - yours(b) : 0) || a.name.localeCompare(b.name));
  }, [catalog, noAisle, unused, view, aisle, q]);

  const save = (item: GroceryItem, isNew: boolean) => {
    if (store.saveProduct) store.saveProduct(item);
    else store.updateGroceryOverride?.(item.id, item);
    setEditing(null);
    say(isNew ? `Added ${item.name}` : `Saved ${item.name}`);
  };

  const usedText = (p: Product) => {
    const u = usage.get(p.id);
    const bits: string[] = [];
    if (u?.recipes.length)
      bits.push(
        `used in ${plural(u.recipes.length, 'recipe')} (${listText(u.recipes.map((id) => recipeNames.get(id) || 'a recipe'))})`,
      );
    if (u?.staples) bits.push('on your staples');
    if (u?.favourites) bits.push('a favourite');
    if (u?.list) bits.push('on the shopping list');
    return bits;
  };

  const askRemove = (p: Product) => {
    const u = usage.get(p.id);
    const bits = usedText(p);
    const body = [
      bits.length ? `It's ${bits.join(', ')}.` : 'Nothing uses it.',
      u?.recipes.length ? 'Those recipes will be matched by name instead, which may find another product or none.' : '',
      'It stays off on both phones. You can undo straight after.',
    ]
      .filter(Boolean)
      .join('\n');
    setConfirm({
      title: `Remove ${p.name}?`,
      body,
      action: 'Remove',
      danger: true,
      run: () => {
        const undo = store.removeProduct ? store.removeProduct(p.id) : null;
        setEditing(null);
        say(`Removed ${p.name}`, undo ? () => storeRef.current.restoreProduct?.(undo) : undefined);
      },
    });
  };

  const askMerge = (keep: Product, gone: Product) => {
    const m = mergeSummary(store.state, catalog, gone.id);
    const moves: string[] = [];
    if (m.recipes) moves.push(plural(m.recipes, 'recipe'));
    if (m.staples) moves.push(plural(m.staples, 'staple'));
    if (m.favourites) moves.push(plural(m.favourites, 'favourite'));
    if (m.list) moves.push(plural(m.list, 'shopping-list line'));
    const body = [
      `${gone.name} becomes another name for ${keep.name}${alsoCalled(gone.item).length ? `, along with the names it goes by` : ''}.`,
      moves.length ? `${listText(moves, 4)} will use ${keep.name}.` : `Nothing uses ${gone.name} yet.`,
      `${keep.name} keeps its own aisle and the way it's sold.`,
    ].join('\n');
    setConfirm({
      title: `Merge ${gone.name} into ${keep.name}?`,
      body,
      action: 'Merge',
      run: () => {
        store.mergeProducts?.(keep.id, gone.id);
        setEditing(null);
        setSameAsFor(null);
        say(`${gone.name} is now part of ${keep.name}`);
      },
    });
  };

  const setAisleFor = (p: Product, name: string) => {
    store.saveProduct?.({ ...p.item, category: name });
    say(`${p.name}: ${name}`);
  };

  const checks: { id: ProductView; count: number; text: string; sub: string }[] = [
    {
      id: 'duplicates',
      count: dups.length,
      text: `${plural(dups.length, 'pair')} that look like the same thing`,
      sub: 'Merge them, or say they’re different',
    },
    {
      id: 'no-aisle',
      count: noAisle.length,
      text: `${plural(noAisle.length, 'product')} with no aisle`,
      sub: 'The Shop puts these with the store cupboard',
    },
    {
      id: 'unused',
      count: unused.length,
      text: `${plural(unused.length, 'product')} not used yet`,
      sub: yoursUnused
        ? `${yoursUnused} of them added by you`
        : 'No recipe, staple or list uses them (that’s fine for built-in ones)',
    },
  ];
  const viewTitle =
    view === 'duplicates'
      ? 'Look like the same thing'
      : view === 'no-aisle'
        ? 'No aisle'
        : view === 'unused'
          ? 'Not used yet'
          : '';

  const row2 = (p: Product) => {
    const u = usage.get(p.id);
    const aisleText = hasNoAisle(p) ? 'No aisle' : p.item.category;
    return (
      <div key={p.id} className="flex items-center">
        <button
          type="button"
          onClick={() => setEditing(p)}
          className={`${row} cursor-pointer hover:bg-zinc-50 flex-1 min-w-0`}
          data-product={p.name}
        >
          {!hasNoAisle(p) && p.aisle && <AisleIcon aisle={p.aisle} size="md" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
            <span className="block text-[13px] text-zinc-500 truncate">
              {aisleText} · sold in {p.item.increment} {p.item.unit || 'item'}
            </span>
            <span
              className={`block text-[12px] truncate ${isUnused(u) ? 'text-zinc-400' : 'text-emerald-700'}`}
              data-product-usage
            >
              {usageText(u)}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </button>
        {view === 'no-aisle' && (
          <select
            aria-label={`Aisle for ${p.name}`}
            value=""
            onChange={(e) => e.target.value && setAisleFor(p, e.target.value)}
            className="mr-3 h-9 max-w-[42%] rounded-lg border border-zinc-300 bg-white px-1.5 text-sm"
            data-product-set-aisle={p.name}
          >
            <option value="">Choose aisle…</option>
            {AISLES_IN_ORDER.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  return (
    <>
      <SubHeader
        title="Products"
        onBack={view === 'all' ? onBack : () => openView('all')}
        right={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1 cursor-pointer"
            data-product-add
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        }
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto" data-products-page data-products-view={view}>
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24">
          {view === 'all' ? (
            <>
              <p className="text-sm text-zinc-600 px-1">
                Everything the Shop knows how to buy, the same on both phones: how each is sold (in steps of 250 g, by
                the bunch), which aisle it's in, and what uses it.
              </p>
              <section className="mt-3" data-products-checks>
                <h3 className={sectionTitle}>Tidy up</h3>
                <div className={card}>
                  {checks.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openView(c.id)}
                      disabled={c.count === 0}
                      className={`${row} cursor-pointer hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-white`}
                      data-check={c.id}
                      data-check-count={c.count}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.count === 0 ? 'bg-emerald-500' : c.id === 'unused' ? 'bg-zinc-300' : 'bg-amber-400'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[15px] font-semibold ${c.count ? 'text-zinc-900' : 'text-zinc-500'}`}
                        >
                          {c.count === 0
                            ? c.id === 'duplicates'
                              ? 'No likely duplicates'
                              : c.id === 'no-aisle'
                                ? 'Every product has an aisle'
                                : 'Every product is used'
                            : c.text}
                        </span>
                        {c.count > 0 && <span className="block text-[13px] text-zinc-500">{c.sub}</span>}
                      </span>
                      {c.count > 0 && <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={onClean}
                    className={`${row} cursor-pointer hover:bg-zinc-50`}
                    data-products-tidy
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="flex-1 text-[15px] font-semibold text-zinc-900">Ask Gemini to tidy</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="px-1 flex items-center justify-between gap-2" data-products-view-title>
              <h3 className="text-[17px] font-bold text-zinc-900">{viewTitle}</h3>
              <button
                type="button"
                onClick={() => openView('all')}
                className="h-9 px-3 rounded-xl border border-zinc-300 bg-white text-sm font-semibold cursor-pointer"
                data-products-show-all
              >
                All products
              </button>
            </div>
          )}

          {view === 'duplicates' ? (
            <div className="mt-3 space-y-2" data-dup-list>
              {dups.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing left to check.</p>
              )}
              {dups.map(([a, b]) => (
                <div
                  key={`${a.id}|${b.id}`}
                  className="bg-white rounded-2xl border border-zinc-200 p-3"
                  data-dup-pair={`${a.name}|${b.name}`}
                >
                  {[a, b].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setEditing(p)}
                      className="w-full flex items-baseline justify-between gap-2 py-1 text-left cursor-pointer"
                    >
                      <span className="text-[15px] font-semibold text-zinc-900 truncate">{p.name}</span>
                      <span
                        className={`text-[12px] shrink-0 ${isUnused(usage.get(p.id)) ? 'text-zinc-400' : 'text-emerald-700'}`}
                      >
                        {usageText(usage.get(p.id))}
                      </span>
                    </button>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => askMerge(a, b)}
                      className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
                      data-dup-keep={a.name}
                    >
                      Same: keep {a.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => askMerge(b, a)}
                      className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
                      data-dup-keep={b.name}
                    >
                      Keep {b.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        store.markProductsDifferent?.(a.id, b.id);
                        say(`${a.name} and ${b.name} kept apart`);
                      }}
                      className="h-9 px-3 rounded-xl text-sm font-semibold text-zinc-600 cursor-pointer"
                      data-dup-different
                    >
                      Not the same
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 app-page pt-3 pb-2 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search ${view === 'all' ? catalog.products.length : shown.length} products`}
                    className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-9 text-base outline-none focus:border-emerald-500"
                    data-products-search
                    aria-label="Search products"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 cursor-pointer"
                      aria-label="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {view === 'all' && (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-3 px-3" data-products-aisles>
                    {['all', ...orderedAisles(prefs.aisleOrder)].map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAisle(id)}
                        aria-pressed={aisle === id}
                        className={`h-8 px-3 rounded-full text-sm font-semibold whitespace-nowrap border cursor-pointer ${aisle === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200'}`}
                        data-aisle-chip={id}
                      >
                        {id === 'all' ? 'All aisles' : GROCERY_AISLES[id as keyof typeof GROCERY_AISLES].name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={card} data-products-list>
                {shown.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">
                    {view === 'all' ? 'Nothing matches.' : 'Nothing left here.'}
                  </p>
                )}
                {shown.slice(0, limit).map(row2)}
              </div>
              {shown.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit(shown.length)}
                  className="mt-2 w-full h-11 rounded-xl border border-zinc-300 bg-white text-sm font-semibold cursor-pointer"
                  data-products-more
                >
                  Show all {shown.length}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {editing && (
        <ProductSheet
          product={editing === 'new' ? null : editing}
          used={editing === 'new' ? [] : usedText(editing)}
          onSave={save}
          onRemove={askRemove}
          onSameAs={(p) => {
            setEditing(null);
            setSameAsFor(p);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {sameAsFor && (
        <SameAsPicker
          product={sameAsFor}
          products={catalog.products}
          usageOf={(p) => usageText(usage.get(p.id))}
          onPick={(keep) => askMerge(keep, sameAsFor)}
          onClose={() => setSameAsFor(null)}
        />
      )}
    </>
  );
}
