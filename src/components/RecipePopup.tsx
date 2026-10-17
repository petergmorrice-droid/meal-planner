import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Pencil, Sparkles, Minus, Plus, Check, Clock, Users, Flame, Zap, Leaf, Snowflake, CalendarCheck,
  CalendarPlus, ChefHat, ExternalLink, History, Star, Share2,
} from 'lucide-react';
import { Recipe, CookingMethod } from '../types';
import { RecipeEditor, methodSteps } from './RecipeEditor';
import { formatCookingAmount } from '../shopping';
import { scaleRecipeStepQuantities } from '../utils';
import { editRecipeApi, generateAlternativeInstructionsApi } from '../services/geminiService';
import {
  recipeMethods, totalMinutes, formatMinutes, isVegetarianRecipe, isVeganRecipe, recipeHistories,
  freezerPortions, formatAgo, formatPlannedDay, formatShortDate, todayISO, siteName, recipeIntro, recipeShareText,
  METHOD_LABEL, METHOD_ORDER,
} from '../recipeInfo';

type TabName = 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings';

const sectionTitle = 'text-[13px] font-bold uppercase tracking-wide text-zinc-500';

/**
 * A recipe, on one page: what it is, how many you're cooking for, the ingredients and the
 * method. The pencil edits it in place; Gemini can change it or write the other appliance's steps.
 */
export function RecipeModal({
  store,
  recipe,
  onClose,
  initialServings,
  bannerMessage,
  onStartCook,
  onAddToDay,
  onNavigateTab,
}: {
  store?: any;
  recipe: Recipe;
  onClose: () => void;
  initialServings?: number;
  bannerMessage?: React.ReactNode;
  onStartCook?: (servings?: number) => void;
  /** Shown as "Add to a day…": plan this recipe on a day of a week. */
  onAddToDay?: (recipe: Recipe) => void;
  onNavigateTab?: (tab: TabName) => void;
}) {
  const basePortions = recipe.servings || 2;
  const [portions, setPortions] = useState<number>(initialServings ?? basePortions);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState<Recipe>(recipe);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [writing, setWriting] = useState<CookingMethod | null>(null);
  const [writeError, setWriteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Pick up changes synced from the other phone, but never throw away an edit in progress.
  useEffect(() => { if (!isEditing) setEdited(recipe); }, [recipe]); // eslint-disable-line react-hooks/exhaustive-deps

  const methods = recipeMethods(edited);
  const [method, setMethod] = useState<CookingMethod>(methods[0] || 'oven_hob');
  useEffect(() => {
    if (methods.length > 0 && !methods.includes(method)) setMethod(methods[0]);
  }, [methods.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDoneSteps({}); }, [method]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isEditing && !showDeleteConfirm) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isEditing, showDeleteConfirm]);

  const scale = portions / (edited.servings || basePortions);
  const { steps } = methodSteps(edited, method);
  // Offer the other appliance only when the recipe is written for exactly one.
  const missingMethod = methods.length === 1 ? METHOD_ORDER.find((m) => !methods.includes(m)) : undefined;

  // Where this recipe stands in your plans and freezer.
  const today = todayISO();
  const history = useMemo(
    () => (store?.state?.mealPlans ? recipeHistories(store.state.mealPlans, today).get(recipe.id) : undefined),
    [store?.state?.mealPlans, recipe.id, today],
  );
  const frozen = store?.state?.batches ? freezerPortions(edited, store.state.batches) : 0;

  const mins = totalMinutes(edited);
  const veg = isVeganRecipe(edited) ? 'Vegan' : isVegetarianRecipe(edited) ? 'Vegetarian' : null;

  const [shareNote, setShareNote] = useState('');
  const toggleFavourite = () => {
    const next = { ...edited, favourite: !edited.favourite };
    setEdited(next);
    store?.updateRecipe?.(next);
  };
  // The phone's share sheet (WhatsApp, Messages, email…), or copy when there isn't one.
  const handleShare = async () => {
    const text = recipeShareText(edited, {
      people: portions,
      method,
      formatAmount: formatCookingAmount,
      scaleStep: (step, sc) => scaleRecipeStepQuantities(step, edited.ingredients, sc),
    });
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try { await nav.share({ title: edited.name, text }); return; }
      catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    try { await nav?.clipboard?.writeText(text); setShareNote('Copied: paste it into a message.'); }
    catch { setShareNote("Sharing isn't available here."); }
    setTimeout(() => setShareNote(''), 3500);
  };

  const handleSave = () => {
    const toSave: Recipe = {
      ...edited,
      name: edited.name.trim() || recipe.name,
      sourceUrl: edited.sourceUrl?.trim() || undefined,
      notes: edited.notes?.trim() || undefined,
      ingredients: edited.ingredients.filter((i) => i.name.trim() !== ''),
    };
    store?.updateRecipe?.(toSave);
    setEdited(toSave);
    setIsEditing(false);
    setShowAiPrompt(false);
  };

  const handleAiEdit = async () => {
    if (!aiInstruction.trim()) return;
    setAiBusy(true);
    setAiError('');
    try {
      const updated = await editRecipeApi(edited, aiInstruction);
      const merged: Recipe = { ...updated, id: edited.id, sourceUrl: edited.sourceUrl, notes: edited.notes };
      setEdited(merged);
      store?.updateRecipe?.(merged);
      setAiInstruction('');
      setShowAiPrompt(false);
      setIsEditing(false);
    } catch (err: any) {
      setAiError(err?.message === 'GEMINI_API_KEY_MISSING'
        ? 'Gemini needs its key: add it in Settings.'
        : (err?.message || 'Gemini could not change the recipe. Try again.'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleWriteMethod = async (target: CookingMethod) => {
    setWriting(target);
    setWriteError('');
    try {
      const from = methods[0] || 'oven_hob';
      const existing = edited.methodInstructions?.[from] || edited.instructions || [];
      const data = await generateAlternativeInstructionsApi(edited.name, edited.ingredients, target, existing, methods);
      const next: Recipe = {
        ...edited,
        cookingMethods: Array.from(new Set([...(edited.cookingMethods || methods), target])) as CookingMethod[],
        methodInstructions: { ...(edited.methodInstructions || {}), ...(methods.length === 0 && edited.instructions?.length ? { [from]: edited.instructions } : {}), [target]: data.instructions || [] },
        methodPrepTime: { ...(edited.methodPrepTime || {}), [target]: data.prepTime || edited.prepTime },
        methodCookTime: { ...(edited.methodCookTime || {}), [target]: data.cookTime || edited.cookTime },
      };
      setEdited(next);
      store?.updateRecipe?.(next);
      setMethod(target);
    } catch (err: any) {
      setWriteError(err?.message === 'GEMINI_API_KEY_MISSING'
        ? 'Gemini needs its key: add it in Settings.'
        : (err?.message || 'Gemini could not write the steps. Try again.'));
    } finally {
      setWriting(null);
    }
  };

  const tickedCount = Object.values(ticked).filter(Boolean).length;
  const contextBits: React.ReactNode[] = [];
  if (history?.nextPlanned) contextBits.push(
    <span key="planned" className="inline-flex items-center gap-1 text-emerald-800"><CalendarCheck className="w-4 h-4" />Planned for {formatPlannedDay(history.nextPlanned, today)}</span>,
  );
  if (history?.lastHad) contextBits.push(
    <span key="last" className="inline-flex items-center gap-1"><History className="w-4 h-4 text-zinc-400" />Last had {formatShortDate(history.lastHad, today)} ({formatAgo(history.lastHad, today)})</span>,
  );
  if (frozen > 0) contextBits.push(
    <span key="frozen" className="inline-flex items-center gap-1 text-cyan-900"><Snowflake className="w-4 h-4 text-cyan-600" />{frozen} {frozen === 1 ? 'portion' : 'portions'} in the freezer</span>,
  );
  if (store?.state?.mealPlans && !history) contextBits.push(<span key="new" className="text-zinc-500">Not had yet</span>);

  const footer = isEditing || onAddToDay || onStartCook;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget && !isEditing) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={edited.name}
        data-recipe-popup
        className="bg-white w-full sm:max-w-2xl h-[94dvh] sm:h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-zinc-200 shrink-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  value={edited.name}
                  onChange={(e) => setEdited({ ...edited, name: e.target.value })}
                  aria-label="Recipe name"
                  className="w-full text-lg font-bold text-zinc-900 border border-zinc-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              ) : (
                <h2 className="text-xl font-bold text-zinc-900 leading-tight break-words">{edited.name}</h2>
              )}
            </div>
            {isEditing && (
              <button
                type="button"
                onClick={() => { setShowAiPrompt(!showAiPrompt); setAiError(''); }}
                className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${showAiPrompt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}
                aria-label="Change it with Gemini"
                title="Change it with Gemini"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-11 h-11 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Edit recipe"
                title="Edit recipe"
              >
                <Pencil className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => { if (isEditing) { setEdited(recipe); setIsEditing(false); setShowAiPrompt(false); } else onClose(); }}
              className="w-11 h-11 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={isEditing ? 'Stop editing without saving' : 'Close'}
              title={isEditing ? 'Stop editing without saving' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isEditing && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-zinc-700" data-recipe-summary>
                {mins && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-4 h-4 text-zinc-400" />{formatMinutes(mins)}
                    {(edited.prepTime || 0) > 0 && (edited.cookTime || 0) > 0 && (
                      <span className="text-zinc-500">({edited.prepTime} prep, {edited.cookTime} cook)</span>
                    )}
                  </span>
                )}
                <span className="inline-flex items-center gap-1"><Users className="w-4 h-4 text-zinc-400" />Serves {edited.servings || 2}</span>
                {methods.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1">
                    {m === 'ninja' ? <Zap className="w-4 h-4 text-amber-500" /> : <Flame className="w-4 h-4 text-rose-500" />}{METHOD_LABEL[m]}
                  </span>
                ))}
                {veg && <span className="inline-flex items-center gap-1 text-emerald-800"><Leaf className="w-4 h-4 text-emerald-600" />{veg}</span>}
              </div>
              {contextBits.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[13px] text-zinc-600" data-recipe-context>{contextBits}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {store?.updateRecipe && (
                  <button
                    type="button"
                    onClick={toggleFavourite}
                    aria-pressed={!!edited.favourite}
                    data-favourite-toggle
                    className={`h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      edited.favourite ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-zinc-300 text-zinc-700'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${edited.favourite ? 'fill-amber-400 text-amber-500' : 'text-zinc-500'}`} />
                    {edited.favourite ? 'Favourite' : 'Add to favourites'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  data-share-recipe
                  className="h-9 px-3 rounded-full border border-zinc-300 bg-white text-zinc-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-zinc-500" />Share
                </button>
                {shareNote && <span className="text-[13px] text-emerald-800" role="status">{shareNote}</span>}
              </div>
            </>
          )}

          {isEditing && showAiPrompt && (
            <div className="mt-3 space-y-1.5">
              <div className="flex gap-2">
                <input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAiEdit(); }}
                  placeholder="e.g. make it dairy-free"
                  aria-label="What should Gemini change?"
                  disabled={aiBusy}
                  className="flex-1 min-w-0 h-11 rounded-xl border border-zinc-300 px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={handleAiEdit}
                  disabled={!aiInstruction.trim() || aiBusy}
                  className="h-11 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {aiBusy ? 'Changing…' : 'Change'}
                </button>
              </div>
              {aiError && (
                <p className="text-sm text-rose-700">
                  {aiError}{' '}
                  {/key/.test(aiError) && onNavigateTab && (
                    <button type="button" className="underline font-semibold cursor-pointer" onClick={() => { onClose(); onNavigateTab('settings'); }}>Open Settings</button>
                  )}
                </p>
              )}
            </div>
          )}
          {bannerMessage && !isEditing && <div className="mt-2">{bannerMessage}</div>}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-zinc-50/60">
          <div className="px-4 py-4 space-y-6">
            {!isEditing && recipeIntro(edited) && (
              <p className="text-[15px] text-zinc-600 leading-relaxed" data-recipe-intro>{recipeIntro(edited)}</p>
            )}

            {isEditing ? (
              <RecipeEditor
                recipe={edited}
                onChange={setEdited}
                method={method}
                onMethod={setMethod}
                store={store}
                onDelete={store?.deleteRecipe ? () => setShowDeleteConfirm(true) : undefined}
              />
            ) : (
              <>
                {/* People */}
                <section className="bg-white rounded-2xl border border-zinc-200 p-3 flex items-center justify-between gap-3" data-recipe-people>
                  <div>
                    <span className="text-base font-semibold text-zinc-900 block">Cooking for</span>
                    {portions !== (edited.servings || 2) && (
                      <span className="text-[13px] text-zinc-500">Recipe makes {edited.servings || 2}; amounts adjusted</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPortions((p) => Math.max(1, p - 1))}
                      disabled={portions <= 1}
                      className="w-11 h-11 rounded-xl border border-zinc-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      aria-label="One fewer person"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <span className="w-10 text-center text-xl font-bold tabular-nums" aria-live="polite" data-portions>{portions}</span>
                    <button
                      type="button"
                      onClick={() => setPortions((p) => Math.min(24, p + 1))}
                      disabled={portions >= 24}
                      className="w-11 h-11 rounded-xl border border-zinc-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      aria-label="One more person"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </section>

                {/* Ingredients */}
                <section data-recipe-ingredients>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className={sectionTitle}>Ingredients <span className="normal-case font-medium tracking-normal">({edited.ingredients.length})</span></h3>
                    {tickedCount > 0 && (
                      <button type="button" onClick={() => setTicked({})} className="text-[13px] font-semibold text-emerald-700 cursor-pointer">Clear ticks</button>
                    )}
                  </div>
                  <ul className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
                    {edited.ingredients.map((ing, idx) => {
                      const key = ing.id || String(idx);
                      const on = !!ticked[key];
                      const amount = formatCookingAmount((Number(ing.amount) || 0) * scale, ing.unit);
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setTicked((t) => ({ ...t, [key]: !t[key] }))}
                            aria-pressed={on}
                            className="w-full text-left px-3 py-2.5 flex items-start gap-3 cursor-pointer"
                          >
                            <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}>
                              {on && <Check className="w-3.5 h-3.5" />}
                            </span>
                            <span className={`min-w-0 flex-1 text-[15px] leading-snug ${on ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                              {amount && <span className="font-semibold tabular-nums">{amount}{ing.unit ? ` ${ing.unit}` : ''} </span>}
                              {ing.name}
                              {ing.note && <span className={`block text-[13px] ${on ? 'text-zinc-400' : 'text-zinc-500'}`}>{ing.note}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {edited.ingredients.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">No ingredients yet.</li>}
                  </ul>
                </section>

                {/* Method */}
                <section data-recipe-method>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <h3 className={sectionTitle}>Method</h3>
                    {methods.length > 1 && (
                      <div className="inline-flex bg-zinc-200/70 rounded-xl p-1" role="tablist" aria-label="Cook with">
                        {methods.map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="tab"
                            aria-selected={method === m}
                            onClick={() => setMethod(m)}
                            className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${method === m ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                          >
                            {m === 'ninja' ? <Zap className="w-4 h-4 text-amber-500" /> : <Flame className="w-4 h-4 text-rose-500" />}{METHOD_LABEL[m]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <ol className="space-y-2">
                    {steps.map((step, idx) => {
                      const done = !!doneSteps[idx];
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            onClick={() => setDoneSteps((d) => ({ ...d, [idx]: !d[idx] }))}
                            aria-pressed={done}
                            className="w-full text-left bg-white rounded-2xl border border-zinc-200 p-3 flex gap-3 cursor-pointer"
                          >
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-700'}`}>
                              {done ? <Check className="w-4 h-4" /> : idx + 1}
                            </span>
                            <span className={`text-base leading-relaxed pt-0.5 ${done ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                              {scaleRecipeStepQuantities(step, edited.ingredients, scale)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {steps.length === 0 && <li className="text-sm text-zinc-500">No steps yet. Tap the pencil to add them.</li>}
                  </ol>

                  {missingMethod && edited.ingredients.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => handleWriteMethod(missingMethod)}
                        disabled={!!writing}
                        className="w-full h-11 rounded-xl border border-dashed border-zinc-300 bg-white text-zinc-800 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                        data-write-method={missingMethod}
                      >
                        {writing ? (
                          <><span className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />Writing {METHOD_LABEL[missingMethod]} steps…</>
                        ) : (
                          <><Sparkles className="w-4 h-4 text-emerald-600" />Write {METHOD_LABEL[missingMethod]} instructions with Gemini</>
                        )}
                      </button>
                      {writeError && (
                        <p className="text-sm text-rose-700 mt-1.5">
                          {writeError}{' '}
                          {/key/.test(writeError) && onNavigateTab && (
                            <button type="button" className="underline font-semibold cursor-pointer" onClick={() => { onClose(); onNavigateTab('settings'); }}>Open Settings</button>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {(edited.notes || '').trim() && (
                  <section data-recipe-notes>
                    <h3 className={`${sectionTitle} mb-2`}>Our notes</h3>
                    <p className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 text-[15px] text-zinc-800 leading-relaxed whitespace-pre-line">{edited.notes}</p>
                  </section>
                )}

                {edited.sourceUrl && /^https?:\/\//i.test(edited.sourceUrl) && (
                  <a
                    href={edited.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-800 underline underline-offset-2"
                    data-recipe-source
                  >
                    From {siteName(edited.sourceUrl)}<ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer: only when there's something to do */}
        {footer && (
          <div className="px-4 py-3 border-t border-zinc-200 bg-white flex gap-2 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => { setEdited(recipe); setIsEditing(false); setShowAiPrompt(false); }}
                  className="flex-1 h-12 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-base font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 h-12 rounded-xl bg-zinc-900 text-white text-base font-semibold cursor-pointer"
                >
                  Save recipe
                </button>
              </>
            ) : (
              <>
                {onAddToDay && (
                  <button
                    type="button"
                    onClick={() => onAddToDay(edited)}
                    className={`flex-1 h-12 rounded-xl text-base font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${onStartCook ? 'border border-zinc-300 bg-white text-zinc-900' : 'bg-emerald-700 text-white'}`}
                  >
                    <CalendarPlus className="w-5 h-5" />Add to a day…
                  </button>
                )}
                {onStartCook && (
                  <button
                    type="button"
                    onClick={() => onStartCook(portions)}
                    className="flex-1 h-12 rounded-xl bg-emerald-700 text-white text-base font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ChefHat className="w-5 h-5" />Start cooking
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
            <div role="alertdialog" aria-label="Delete this recipe?" className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <h4 className="text-base font-bold text-zinc-900">Delete {edited.name}?</h4>
                <p className="text-sm text-zinc-600 mt-1">It's removed from the cookbook on both phones. This can't be undone.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 h-11 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer">Keep it</button>
                <button
                  type="button"
                  onClick={() => { store?.deleteRecipe?.(edited.id); setShowDeleteConfirm(false); onClose(); }}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white text-sm font-semibold cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
