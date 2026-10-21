import { useEffect, useRef, useState } from 'react';
import { X, ClipboardPaste, Camera, Flame, Zap, Link2, Sparkles, ChevronDown, ArrowLeft } from 'lucide-react';
import { Recipe, CookingMethod, TabName } from '../types';
import { buildCatalog, namesNeedingSuggestion, linkIngredients } from '../shopping';
import {
  parseRecipeApi,
  suggestGroceryProductsApi,
  generateRecipeApi,
  editRecipeApi,
  generateAlternativeInstructionsApi,
  readRecipePageApi,
  readRecipePhotoApi,
} from '../services/geminiService';
import { RecipeEditor } from './RecipeEditor';
import { firstUrl, isJustAUrl, findDuplicate, siteName, recipeMethods, METHOD_LABEL } from '../recipeInfo';
import type { AppStore } from '../store';

type Busy = null | 'page' | 'photo' | 'copy' | 'match' | 'write';

const APPLIANCE_KEY = 'add_recipe_appliance';
const readAppliance = (): CookingMethod => {
  try {
    return localStorage.getItem(APPLIANCE_KEY) === 'ninja' ? 'ninja' : 'oven_hob';
  } catch {
    return 'oven_hob';
  }
};

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
 */
export function AddRecipe({
  store,
  onClose,
  onSaved,
  onNavigateTab,
  initialText,
}: {
  store: AppStore;
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
  onNavigateTab?: (tab: TabName) => void;
  initialText?: string;
}) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [mode, setMode] = useState<'paste' | 'generate'>('paste');
  const [text, setText] = useState(initialText || '');
  const [appliance, setApplianceState] = useState<CookingMethod>(readAppliance);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [method, setMethod] = useState<CookingMethod>('oven_hob');
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [refineBusy, setRefineBusy] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [writing, setWriting] = useState<CookingMethod | null>(null);
  const [dupOf, setDupOf] = useState<Recipe | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const linkOnly = mode === 'paste' && isJustAUrl(text);

  const setAppliance = (m: CookingMethod) => {
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

  const explain = (err: any): string => {
    if (err?.message === 'GEMINI_API_KEY_MISSING') return 'Gemini needs its key first: add it in Settings.';
    return err?.message || 'Something went wrong. Please try again.';
  };

  // Link each ingredient to a grocery-list product without changing its wording (exact matches,
  // then Gemini's suggestions for the rest). Anything left shows "Shop as" on the check screen.
  const toDraft = async (data: any, sourceUrl?: string): Promise<Recipe> => {
    setBusy('match');
    const catalog = buildCatalog(store.state.groceryDatabase, store.state.groceryOverrides);
    const allItems = catalog.products.filter((p) => !p.sameAs).map((p) => p.item);
    const ingredientsIn: any[] = Array.isArray(data?.ingredients) ? data.ingredients : [];
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
      ingredients: linked.ingredients.map((i: any) => ({
        ...i,
        id: i?.id || crypto.randomUUID(),
        name: i?.name || 'Unknown ingredient',
      })),
    };
  };

  const toReview = (recipe: Recipe) => {
    setDraft(recipe);
    setMethod(recipeMethods(recipe)[0] || appliance);
    setStep('review');
  };

  const copyRecipe = async (recipeText: string, sourceUrl?: string) => {
    setBusy('copy');
    const data = await parseRecipeApi(recipeText, appliance);
    toReview(await toDraft(data, sourceUrl || firstUrl(recipeText)));
  };

  const handleGo = async () => {
    setError('');
    const t = text.trim();
    if (!t) {
      setError(
        mode === 'generate' ? 'Say what you would like Gemini to write.' : 'Paste a recipe, or a link to one, first.',
      );
      return;
    }
    try {
      if (mode === 'generate') {
        setBusy('write');
        const data = await generateRecipeApi(t, appliance);
        toReview(await toDraft(data));
      } else if (linkOnly) {
        setBusy('page');
        const pageText = await readRecipePageApi(t);
        await copyRecipe(pageText, t);
      } else {
        await copyRecipe(t);
      }
    } catch (err: any) {
      setError(explain(err));
    } finally {
      setBusy(null);
    }
  };

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
    } catch (err: any) {
      setError(explain(err));
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
    } catch (err: any) {
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
    } catch (err: any) {
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
              )}

              <div>
                <span className="text-sm font-semibold text-zinc-800 block mb-1.5">Cooking with</span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cooking with">
                  {(['oven_hob', 'ninja'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={appliance === m}
                      onClick={() => setAppliance(m)}
                      disabled={!!busy}
                      data-appliance={m}
                      className={`h-12 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${
                        appliance === m
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-zinc-700 border-zinc-300'
                      }`}
                    >
                      {m === 'ninja' ? <Zap className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="px-4 py-3 border-t border-zinc-200 shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              {error && (
                <div
                  className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-2"
                  role="alert"
                  data-add-error
                >
                  {error}{' '}
                  {/Settings/.test(error) && onNavigateTab && (
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
                </div>
              )}
              <button
                type="button"
                onClick={handleGo}
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
