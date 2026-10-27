import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  X,
  ClipboardPaste,
  Camera,
  CookingPot,
  Flame,
  Zap,
  Link2,
  Sparkles,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react';
import { Recipe, CookingMethod, CookWith, TabName, Ingredient } from '../types';
import { buildCatalog, namesNeedingSuggestion, linkIngredients } from '../shopping';
import {
  parseRecipeApi,
  suggestGroceryProductsApi,
  generateRecipeApi,
  editRecipeApi,
  generateAlternativeInstructionsApi,
  readRecipePageApi,
  readRecipePhotoApi,
  suggestMealIdeasApi,
  NoGeminiKeyError,
  geminiDetail,
  type MealIdea,
} from '../services/geminiService';
import { RecipeEditor } from './RecipeEditor';
import { MealIdeaCard, useIdeasInView } from './MealIdeaCard';
import { IngredientChips } from './IngredientChips';
import { firstUrl, isJustAUrl, findDuplicate, siteName, recipeMethods, METHOD_LABEL, todayISO } from '../recipeInfo';
import { weekLeftovers, leftoverAmountText, type Leftover } from '../leftovers';
import { averagesById } from '../ratings';
import { getCatalog, getCurrentMondayStr } from '../utils';
import type { AppStore } from '../store';
import { messageOf } from '../errors';

type Busy = null | 'page' | 'photo' | 'copy' | 'match' | 'write';

const APPLIANCE_KEY = 'add_recipe_appliance';
const readAppliance = (): CookWith => {
  try {
    const saved = localStorage.getItem(APPLIANCE_KEY);
    return saved === 'ninja' || saved === 'slow_cook' ? saved : 'oven_hob';
  } catch {
    return 'oven_hob';
  }
};

/** "Cooking with" on Add a recipe: a slow-cooker recipe is an oven/hob one, marked slow cook. */
const APPLIANCES: { id: CookWith; label: string }[] = [
  { id: 'oven_hob', label: METHOD_LABEL.oven_hob },
  { id: 'ninja', label: METHOD_LABEL.ninja },
  { id: 'slow_cook', label: 'Slow cooker' },
];
const APPLIANCE_ICON = { oven_hob: Flame, ninja: Zap, slow_cook: CookingPot };

const BUSY_TEXT: Record<Exclude<Busy, null>, string> = {
  page: 'Reading the page…',
  photo: 'Reading the photo…',
  copy: 'Copying the recipe…',
  match: 'Matching ingredients to your grocery list…',
  write: 'Writing the recipe…',
};

/** A photo, shrunk to a sensible size for Gemini (phone photos are often 4–8 MB). */
async function photoForGemini(file: File, maxSide = 1600): Promise<{ data: string; mimeType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be opened as a photo.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Adding a recipe: paste it (or a link to it, or a photo of it), or ask Gemini to write one.
 * Then check it on the same editor as the recipe page, and save. Nothing is saved before that.
 * Auto populate opens it on "Ask Gemini to write one" with an idea filled in, already writing.
 */
export function AddRecipe({
  store,
  onClose,
  onSaved,
  onNavigateTab,
  initialText,
  initialMode = 'paste',
  autoStart = false,
  initialAppliance,
}: {
  store: AppStore;
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
  onNavigateTab?: (tab: TabName) => void;
  initialText?: string;
  initialMode?: 'paste' | 'generate';
  /** Start straight away with `initialText` (once). */
  autoStart?: boolean;
  /** Cooking with this (just this time: not remembered for next time). */
  initialAppliance?: CookWith;
}) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [mode, setMode] = useState<'paste' | 'generate'>(initialMode);
  const [text, setText] = useState(initialText || '');
  const [appliance, setApplianceState] = useState<CookWith>(() => initialAppliance ?? readAppliance());
  /** The method a recipe copied or written now is for (a slow-cooker one is oven/hob, marked slow cook). */
  const asMethod: CookingMethod = appliance === 'ninja' ? 'ninja' : 'oven_hob';
  const [busy, setBusy] = useState<Busy>(null);
  // What went wrong, and the small print (what happened on each Gemini model) when there is some.
  const [error, setErrorState] = useState({ text: '', detail: '' });
  const setError = (text: string, detail = '') => setErrorState({ text, detail });
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [method, setMethod] = useState<CookingMethod>('oven_hob');
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [refineBusy, setRefineBusy] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [writing, setWriting] = useState<CookingMethod | null>(null);
  const [dupOf, setDupOf] = useState<Recipe | null>(null);

  // "Not sure? Let Gemini suggest some": new ideas (using up this week's leftovers, if you like),
  // then the one you pick is written like any other.
  const [leftovers] = useState<Leftover[]>(() => {
    const st = store.state;
    return weekLeftovers({
      plan: st.mealPlans.find((p) => p.startDate === getCurrentMondayStr()),
      recipes: st.recipes,
      shoppingList: st.shoppingList,
      catalog: getCatalog(),
      today: todayISO(),
      staples: st.preferences?.recurringItems,
    });
  });
  const [wish, setWish] = useState({ leftovers: leftovers.length > 0, quick: false, veggie: false });
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<{ list: MealIdea[]; leftovers: boolean } | null>(null);
  const ideasRef = useIdeasInView(ideas);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState({ text: '', detail: '' });
  const wishes = () =>
    [wish.quick ? 'quick: 30 minutes or less in all' : '', wish.veggie ? 'vegetarian' : '', text.trim()].filter(
      Boolean,
    );
  const askIdeas = async () => {
    setIdeasBusy(true);
    setIdeasError({ text: '', detail: '' });
    try {
      const recipes = store.state.recipes;
      const stars = averagesById(store.state.preferences?.ratings);
      const useLeftovers = wish.leftovers && leftovers.length > 0;
      const list = await suggestMealIdeasApi(
        useLeftovers ? leftovers.map((l) => `${leftoverAmountText(l, getCatalog())} ${l.name.toLowerCase()}`) : [],
        {
          people: store.state.preferences?.defaultServings || 2,
          cooking: [appliance],
          ingredients,
          liked: recipes
            .filter((r) => r.favourite || r.verdict === 'again' || (stars.get(r.id) ?? 0) >= 4)
            .map((r) => r.name),
          disliked: recipes.filter((r) => r.verdict === 'not_for_us').map((r) => r.name),
          have: recipes.map((r) => r.name),
          wishes: wishes(),
        },
      );
      setIdeas({ list, leftovers: useLeftovers });
      if (!list.length) setIdeasError({ text: 'Gemini had no ideas this time. Try again.', detail: '' });
    } catch (err) {
      setIdeasError(
        err instanceof NoGeminiKeyError
          ? { text: 'Gemini needs its key first: add it in Settings → Phone.', detail: '' }
          : { text: explain(err), detail: geminiDetail(err) },
      );
    } finally {
      setIdeasBusy(false);
    }
  };
  const writeIdea = (idea: MealIdea) => {
    // The ingredients you'd like to use that this idea mentions.
    const about = [idea.name, idea.description, ...idea.uses].join(' ').toLowerCase();
    const withThese = ingredients.filter((i) => about.includes(i.toLowerCase()));
    const parts = [
      `${idea.name}.`,
      idea.description,
      ideas?.leftovers && idea.uses.length ? `Use up ${idea.uses.join(', ')}.` : '',
      withThese.length ? `With ${withThese.join(', ')}.` : '',
      wish.quick ? 'Quick: 30 minutes or less in all.' : '',
      wish.veggie ? 'Vegetarian.' : '',
    ];
    const t = parts.filter(Boolean).join(' ');
    setText(t);
    void handleGo(t);
  };
  const photoRef = useRef<HTMLInputElement>(null);
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const linkOnly = mode === 'paste' && isJustAUrl(text);

  const setAppliance = (m: CookWith) => {
    setApplianceState(m);
    try {
      localStorage.setItem(APPLIANCE_KEY, m);
    } catch {
      /* per-phone convenience only */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step === 'input' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, busy, onClose]);

  const explain = (err: unknown): string => {
    if (messageOf(err) === 'GEMINI_API_KEY_MISSING') return 'Gemini needs its key first: add it in Settings.';
    return messageOf(err) || 'Something went wrong. Please try again.';
  };

  // Link each ingredient to a grocery-list product without changing its wording (exact matches,
  // then Gemini's suggestions for the rest). Anything left shows "Shop as" on the check screen.
  const toDraft = async (data: Recipe, sourceUrl?: string): Promise<Recipe> => {
    setBusy('match');
    const catalog = buildCatalog(store.state.groceryDatabase, store.state.groceryOverrides);
    const allItems = catalog.products.filter((p) => !p.sameAs).map((p) => p.item);
    const ingredientsIn: Ingredient[] = Array.isArray(data?.ingredients) ? data.ingredients : [];
    const pending = namesNeedingSuggestion(ingredientsIn, catalog);
    const suggestions =
      pending.length > 0
        ? await suggestGroceryProductsApi(
            pending,
            allItems.map((i) => i.name),
          )
        : {};
    const linked = linkIngredients(ingredientsIn, catalog, suggestions);
    return {
      ...data,
      id: data.id || crypto.randomUUID(),
      servings: data.servings || 2,
      sourceUrl: sourceUrl || data.sourceUrl,
      ...(appliance === 'slow_cook' ? { slowCook: true } : {}),
      ingredients: linked.ingredients.map((i) => ({
        ...i,
        id: i?.id || crypto.randomUUID(),
        name: i?.name || 'Unknown ingredient',
      })),
    };
  };

  const toReview = (recipe: Recipe) => {
    setDraft(recipe);
    setMethod(recipeMethods(recipe)[0] || asMethod);
    setStep('review');
  };

  const copyRecipe = async (recipeText: string, sourceUrl?: string) => {
    setBusy('copy');
    const data = await parseRecipeApi(recipeText, asMethod);
    toReview(await toDraft(data, sourceUrl || firstUrl(recipeText)));
  };

  /** Copy, read or write: from the box, or from `override` (an idea you picked to write). */
  const handleGo = async (override?: string) => {
    setError('');
    const t = (override ?? text).trim();
    if (!t) {
      setError(
        mode === 'generate' ? 'Say what you would like Gemini to write.' : 'Paste a recipe, or a link to one, first.',
      );
      return;
    }
    try {
      if (mode === 'generate') {
        setBusy('write');
        const data = await generateRecipeApi(t, appliance, store.state.preferences?.defaultServings || 2);
        toReview(await toDraft(data));
      } else if (linkOnly) {
        setBusy('page');
        const pageText = await readRecipePageApi(t);
        await copyRecipe(pageText, t);
      } else {
        await copyRecipe(t);
      }
    } catch (err) {
      setError(explain(err), geminiDetail(err));
    } finally {
      setBusy(null);
    }
  };

  // Asked to start straight away: once, even when React runs effects twice while developing.
  const started = useRef(false);
  const startNow = useEffectEvent(() => {
    if (started.current) return;
    started.current = true;
    void handleGo();
  });
  useEffect(() => {
    if (autoStart && initialText?.trim()) startNow();
  }, [autoStart, initialText]);

  const handlePhoto = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setMode('paste');
    try {
      setBusy('photo');
      const photo = await photoForGemini(file);
      const photoText = await readRecipePhotoApi(photo.data, photo.mimeType);
      setText(photoText); // if the next step fails, the words are here to fix and try again
      await copyRecipe(photoText);
    } catch (err) {
      setError(explain(err), geminiDetail(err));
    } finally {
      setBusy(null);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const handlePaste = async () => {
    setError('');
    try {
      const t = await navigator.clipboard.readText();
      if (t && t.trim()) setText(t);
      else setError('There was nothing to paste. Copy the recipe (or its link) first.');
    } catch {
      setError("Your phone didn't allow pasting from here. Press and hold in the box and choose Paste.");
    }
  };

  const handleRefine = async () => {
    if (!draft || !refineText.trim()) return;
    setRefineBusy(true);
    setRefineError('');
    try {
      const updated = await editRecipeApi(draft, refineText);
      setDraft({ ...updated, id: draft.id, sourceUrl: draft.sourceUrl, notes: draft.notes });
      setRefineText('');
      setShowRefine(false);
    } catch (err) {
      setRefineError(explain(err));
    } finally {
      setRefineBusy(false);
    }
  };

  const handleWriteMethod = async (target: CookingMethod) => {
    if (!draft) return;
    setWriting(target);
    try {
      const methods = recipeMethods(draft);
      const from = methods[0] || 'oven_hob';
      const existing = draft.methodInstructions?.[from] || draft.instructions || [];
      const data = await generateAlternativeInstructionsApi(draft.name, draft.ingredients, target, existing, methods);
      setDraft({
        ...draft,
        cookingMethods: Array.from(new Set([...(draft.cookingMethods || methods), target])) as CookingMethod[],
        methodInstructions: { ...(draft.methodInstructions || {}), [target]: data.instructions || [] },
        methodPrepTime: { ...(draft.methodPrepTime || {}), [target]: data.prepTime || draft.prepTime },
        methodCookTime: { ...(draft.methodCookTime || {}), [target]: data.cookTime || draft.cookTime },
      });
      setMethod(target);
    } catch (err) {
      setRefineError(explain(err));
    } finally {
      setWriting(null);
    }
  };

  const cleaned = (): Recipe | null =>
    draft && {
      ...draft,
      name: draft.name.trim() || 'Untitled recipe',
      sourceUrl: draft.sourceUrl?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      ingredients: draft.ingredients.filter((i) => i.name.trim() !== ''),
    };

  const save = (how: 'check' | 'both' | 'replace') => {
    const recipe = cleaned();
    if (!recipe) return;
    const dup = findDuplicate(store.state.recipes || [], recipe);
    if (how === 'check' && dup) {
      setDupOf(dup);
      return;
    }
    if (how === 'replace' && dup) {
      const replaced: Recipe = {
        ...recipe,
        id: dup.id,
        addedBy: dup.addedBy,
        favourite: dup.favourite,
        notes: recipe.notes || dup.notes,
        sourceUrl: recipe.sourceUrl || dup.sourceUrl,
      };
      store.updateRecipe(replaced);
      onSaved(replaced);
      return;
    }
    store.addRecipe(recipe);
    onSaved(recipe);
  };

  const dupNow = draft ? findDuplicate(store.state.recipes || [], draft) : undefined;

  // What it's cooked with: above Gemini's ideas when writing one (they're for it too), last when pasting.
  const cookingWith = (
    <div>
      <span className="text-sm font-semibold text-zinc-800 block mb-1.5">Cooking with</span>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cooking with">
        {APPLIANCES.map(({ id: m, label }) => {
          const Icon = APPLIANCE_ICON[m];
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={appliance === m}
              onClick={() => setAppliance(m)}
              disabled={!!busy}
              data-appliance={m}
              className={`h-14 px-1 rounded-xl border text-sm font-semibold leading-tight inline-flex flex-col items-center justify-center gap-1 cursor-pointer ${
                appliance === m
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-zinc-700 border-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && step === 'input' && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step === 'input' ? 'Add a recipe' : 'Check the recipe'}
        data-add-recipe={step}
        className={`bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden ${step === 'review' ? 'h-[94dvh] sm:h-[90vh]' : 'max-h-[94dvh]'}`}
      >
        {step === 'input' ? (
          <>
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 shrink-0">
              <h2 className="text-xl font-bold text-zinc-900">Add a recipe</h2>
              <button
                type="button"
                onClick={onClose}
                disabled={!!busy}
                className="w-11 h-11 rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl" role="tablist">
                {(
                  [
                    ['paste', 'Paste a recipe'],
                    ['generate', 'Ask Gemini to write one'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError('');
                    }}
                    disabled={!!busy}
                    className={`h-10 rounded-lg text-sm font-semibold cursor-pointer ${mode === m ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'paste' ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-zinc-800 block mb-1.5">
                      The recipe, or a link to it
                    </span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={linkOnly ? 3 : 7}
                      disabled={!!busy}
                      placeholder="Paste the whole recipe here (ingredients and method), or just the link to the recipe page."
                      aria-label="Recipe text or link"
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-base sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {canPaste && (
                      <button
                        type="button"
                        onClick={handlePaste}
                        disabled={!!busy}
                        className="h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <ClipboardPaste className="w-4 h-4" />
                        Paste
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => photoRef.current?.click()}
                      disabled={!!busy}
                      data-photo-button
                      className="h-10 px-3 rounded-xl border border-zinc-300 bg-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      Photo of a recipe
                    </button>
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      data-photo-input
                      onChange={(e) => handlePhoto(e.target.files?.[0])}
                    />
                  </div>
                  {linkOnly && (
                    <p
                      className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 inline-flex items-start gap-2"
                      data-link-hint
                    >
                      <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-zinc-500" />
                      Gemini will open {siteName(text.trim())} and copy the recipe from it.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="text-sm font-semibold text-zinc-800 block mb-1.5">What would you like?</span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={4}
                      disabled={!!busy}
                      placeholder="e.g. a quick veggie curry for 4, no mushrooms"
                      aria-label="What should Gemini write?"
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-base sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </label>
                  {cookingWith}
                  {!autoStart && (
                    <section
                      className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2"
                      data-recipe-ideas
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-violet-950">Not sure? Let Gemini suggest some</h3>
                        <p className="text-xs text-violet-900/80 mt-0.5">
                          New ideas that aren't in your cookbook yet
                          {text.trim() ? ', going by what you typed above' : ''}. Pick one and Gemini writes it.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ...(leftovers.length ? [['leftovers', "Use up what's left"] as const] : []),
                            ['quick', 'Quick (30 min)'],
                            ['veggie', 'Vegetarian'],
                          ] as const
                        ).map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={wish[k]}
                            onClick={() => setWish((w) => ({ ...w, [k]: !w[k] }))}
                            disabled={ideasBusy || !!busy}
                            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                              wish[k]
                                ? 'bg-violet-600 border-violet-600 text-white'
                                : 'bg-white border-violet-200 text-violet-900'
                            }`}
                            data-wish={k}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-violet-950 block mb-1">
                          Ingredients you'd like to use
                        </span>
                        <IngredientChips value={ingredients} onChange={setIngredients} disabled={ideasBusy || !!busy} />
                      </div>
                      {wish.leftovers && leftovers.length > 0 && (
                        <p className="text-xs text-violet-900/80" data-wish-leftovers>
                          Left this week:{' '}
                          {leftovers
                            .slice(0, 5)
                            .map((l) => l.name.toLowerCase())
                            .join(', ')}
                          {leftovers.length > 5 ? ` and ${leftovers.length - 5} more` : ''}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={askIdeas}
                        disabled={ideasBusy || !!busy}
                        className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                        data-suggest-ideas
                      >
                        <Sparkles className="w-4 h-4" />
                        {ideasBusy ? 'Thinking…' : ideas ? 'Other ideas' : 'Suggest some ideas'}
                      </button>
                      {ideasError.text && (
                        <div className="text-sm text-rose-800" role="alert">
                          {ideasError.text}
                          {ideasError.detail && (
                            <span className="block text-[11px] text-rose-700/80 mt-0.5">{ideasError.detail}</span>
                          )}
                        </div>
                      )}
                      {ideas && ideas.list.length > 0 && (
                        <ul className="space-y-1.5 scroll-mt-2" data-ideas ref={ideasRef}>
                          {ideas.list.map((idea) => (
                            <MealIdeaCard key={idea.name} idea={idea} usesLabel={ideas.leftovers ? 'Uses' : 'With'}>
                              <button
                                type="button"
                                onClick={() => writeIdea(idea)}
                                disabled={!!busy}
                                className="mt-2 h-8 px-2.5 rounded-lg border border-violet-300 text-violet-800 text-xs font-semibold hover:bg-violet-50 disabled:opacity-50 cursor-pointer"
                                data-write-idea
                              >
                                Write it
                              </button>
                            </MealIdeaCard>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}
                </>
              )}

              {mode === 'paste' && cookingWith}
            </div>
            <div
              className="px-4 py-3 border-t border-zinc-200 shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              {error.text && (
                <div
                  className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-2"
                  role="alert"
                  data-add-error
                >
                  {error.text}{' '}
                  {/Settings/.test(error.text) && onNavigateTab && (
                    <button
                      type="button"
                      className="underline font-semibold cursor-pointer"
                      onClick={() => {
                        onClose();
                        onNavigateTab('settings');
                      }}
                    >
                      Open Settings
                    </button>
                  )}
                  {error.detail && (
                    <span className="block mt-1 text-xs text-rose-700/80 break-words" data-add-error-detail>
                      Details: {error.detail}
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleGo()}
                disabled={!!busy}
                data-add-go
                className="w-full h-12 rounded-xl bg-emerald-700 text-white text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-80 cursor-pointer"
              >
                {busy ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {BUSY_TEXT[busy]}
                  </>
                ) : mode === 'generate' ? (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Write the recipe
                  </>
                ) : linkOnly ? (
                  'Get the recipe from this page'
                ) : (
                  'Copy this recipe'
                )}
              </button>
            </div>
          </>
        ) : (
          draft && (
            <>
              <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2 shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-zinc-900">Check the recipe</h2>
                  <p className="text-sm text-zinc-600">Nothing is saved until you tap Save.</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-11 h-11 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Close without saving"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain bg-zinc-50/60">
                <div className="px-4 py-4 space-y-4">
                  {dupNow && (
                    <p
                      className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
                      data-dup-note
                    >
                      You already have “{dupNow.name}”. When you save, you can keep both or replace it.
                    </p>
                  )}
                  <RecipeEditor
                    recipe={draft}
                    onChange={setDraft}
                    method={method}
                    onMethod={setMethod}
                    store={store}
                    showName
                    onWriteMethod={handleWriteMethod}
                    writing={writing}
                  />
                  <section className="bg-white rounded-2xl border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => setShowRefine(!showRefine)}
                      aria-expanded={showRefine}
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        Ask Gemini to change it
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-500 transition-transform ${showRefine ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showRefine && (
                      <div className="px-4 pb-4 space-y-2">
                        <p className="text-sm text-zinc-600">For example “make it dairy-free” or “add garlic bread”.</p>
                        <div className="flex gap-2">
                          <input
                            value={refineText}
                            onChange={(e) => setRefineText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRefine();
                            }}
                            disabled={refineBusy}
                            aria-label="What should Gemini change?"
                            className="flex-1 min-w-0 h-11 rounded-xl border border-zinc-300 px-3 text-base sm:text-sm"
                          />
                          <button
                            type="button"
                            onClick={handleRefine}
                            disabled={!refineText.trim() || refineBusy}
                            className="h-11 px-4 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer shrink-0"
                          >
                            {refineBusy ? 'Changing…' : 'Change'}
                          </button>
                        </div>
                      </div>
                    )}
                    {refineError && <p className="px-4 pb-3 text-sm text-rose-700">{refineError}</p>}
                  </section>
                </div>
              </div>
              <div
                className="px-4 py-3 border-t border-zinc-200 bg-white flex gap-2 shrink-0"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              >
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="h-12 px-4 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-base font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => save('check')}
                  data-save-recipe
                  className="flex-1 h-12 rounded-xl bg-emerald-700 text-white text-base font-semibold cursor-pointer"
                >
                  Save to cookbook
                </button>
              </div>
            </>
          )
        )}

        {dupOf && (
          <div
            className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
            onClick={() => setDupOf(null)}
          >
            <div
              role="alertdialog"
              aria-label="Already in your cookbook"
              className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
              data-dup-dialog
            >
              <div>
                <h4 className="text-base font-bold text-zinc-900">You already have “{dupOf.name}”</h4>
                <p className="text-sm text-zinc-600 mt-1">
                  Replace it with this one (your notes, star and plans stay), or keep both?
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setDupOf(null);
                    save('replace');
                  }}
                  className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
                >
                  Replace it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDupOf(null);
                    save('both');
                  }}
                  className="w-full h-11 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
                >
                  Keep both
                </button>
                <button
                  type="button"
                  onClick={() => setDupOf(null)}
                  className="w-full h-11 rounded-xl text-sm font-semibold text-zinc-600 cursor-pointer"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
