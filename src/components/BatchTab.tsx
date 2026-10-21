import React, { useEffect, useMemo, useRef, useState } from 'react';
import PersonMark, { noteLook } from './PersonMark';
import Notice from './Notice';
import { Snowflake, Plus, Minus, X, Check, CalendarPlus, BookOpen, Trash2, ChevronRight, Search, StickyNote } from 'lucide-react';
import { BatchItem, MealPlan, Recipe, TabName } from '../types';
import { DAYS_OF_WEEK, formatDateISO, isWeekWithinForwardLimit } from '../utils';
import { freezerGroups, frozenAgo, mealsFor, planDayDate, planFreezerMeal, whenText, FreezerGroup } from '../freezer';
import { mealTitle } from './planner/DayListRow';
import { RecipeModal } from './RecipePopup';
import type { AppStore } from '../store';
import { undoDays } from '../planning';


const portionsText = (n: number) => `${n} ${n === 1 ? 'portion' : 'portions'}`;
const isoAtNoon = (date: string) => new Date(`${date}T12:00:00`).toISOString();

/**
 * The Freezer: what's in it by dish, oldest first, how long it's been there, what the plan
 * already wants from it, and "Have it on…" to plan one. A portion is one person's helping,
 * the same as everywhere else in the app.
 */
export default function BatchTab({ store, onNavigateTab }: { store: AppStore; onNavigateTab?: (tab: TabName, planId?: string) => void }) {
  const storeRef = useRef(store);
  storeRef.current = store;
  const todayIso = formatDateISO(new Date());
  const people: number = store.state.preferences?.defaultServings || 2;
  const batches: BatchItem[] = store.state.batches || [];
  const recipes: Recipe[] = store.state.recipes || [];
  const plans: MealPlan[] = store.state.mealPlans || [];

  const groups = useMemo(() => freezerGroups(batches, recipes, plans, todayIso), [batches, recipes, plans, todayIso]);
  const total = groups.reduce((s, g) => s + g.portions, 0);

  const [adding, setAdding] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Recipe | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const latest = () => storeRef.current.getState?.() || storeRef.current.state;
  const liveBatch = (id: string): BatchItem | undefined => (latest().batches || []).find((b: BatchItem) => b.id === id);

  /** The panel closes when its last batch goes (Undo brings the batch back, not the panel). */
  const closeIfLast = (id: string) => {
    const g = groups.find((x) => x.batches.some((b) => b.id === id));
    if (g && g.batches.length <= 1) setOpenKey(null);
  };
  /** One more or one fewer portion (from the latest count, so quick taps all count); at 0 it's gone (with Undo). */
  const stepPortions = (id: string, change: number) => {
    const b = liveBatch(id);
    if (!b) return;
    const n = b.portions + change;
    if (n <= 0) {
      closeIfLast(id);
      storeRef.current.removeBatch(id);
      setToast({ text: `${b.name || 'That'} is all gone from the freezer`, undo: () => storeRef.current.addBatch({ ...b }) });
      return;
    }
    storeRef.current.changeBatch(id, (latestBatch) => ({ ...latestBatch, portions: Math.min(99, n) }));
  };
  const removeBatch = (id: string) => {
    const b = liveBatch(id);
    if (!b) return;
    closeIfLast(id);
    storeRef.current.removeBatch(id);
    setToast({ text: `Removed ${portionsText(b.portions)} of ${b.name || 'that'}`, undo: () => storeRef.current.addBatch({ ...b }) });
  };
  const patchBatch = (id: string, patch: Partial<BatchItem>) => storeRef.current.changeBatch(id, (b) => ({ ...b, ...patch }));

  const openGroup = groups.find((g) => g.key === openKey) || null;
  const planGroup = groups.find((g) => g.key === planning) || null;

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      <header className="app-bar border-b px-4 py-2 shrink-0">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-zinc-900 leading-tight">Freezer</h2>
            <p className="text-xs text-zinc-500 leading-tight truncate" data-freezer-total>
              {total ? `${portionsText(total)} · about ${Math.floor(total / people)} ${Math.floor(total / people) === 1 ? 'meal' : 'meals'} for ${people}` : 'Nothing in the freezer'}
            </p>
          </div>
          <button type="button" onClick={() => setAdding(true)} className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0" data-freezer-add>
            <Plus className="w-4 h-4" />Add
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 pt-2.5 pb-24 space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-14 px-6">
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-700 flex items-center justify-center mx-auto mb-3"><Snowflake className="w-6 h-6" /></div>
              <h3 className="text-base font-semibold text-zinc-900">The freezer's empty</h3>
              <p className="text-sm text-zinc-600 mt-1 max-w-xs mx-auto">When you cook extra, add the portions here. Finishing a batch cook in cooking mode adds them for you.</p>
              <button type="button" onClick={() => setAdding(true)} className="mt-4 h-11 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Add something</button>
            </div>
          ) : (
            groups.map((g) => <FreezerCard key={g.key} g={g} todayIso={todayIso} people={people} onOpen={() => setOpenKey(g.key)} onPlan={() => setPlanning(g.key)} />)
          )}
        </div>
      </div>

      {toast && <Notice text={toast.text} action={toast.undo ? { label: 'Undo', run: toast.undo } : undefined} onDone={() => setToast(null)} />}

      {openGroup && (
        <FreezerSheet
          key={openGroup.key}
          g={openGroup}
          todayIso={todayIso}
          people={people}
          recipe={openGroup.recipeId ? recipes.find((r) => r.id === openGroup.recipeId) || null : null}
          onPortions={stepPortions}
          onPatch={patchBatch}
          onRemove={removeBatch}
          onPlan={() => { setOpenKey(null); setPlanning(openGroup.key); }}
          onOpenRecipe={(r) => { setOpenKey(null); setViewing(r); }}
          onClose={() => setOpenKey(null)}
        />
      )}

      {planGroup && (
        <HaveItOnSheet
          g={planGroup}
          plans={plans}
          todayIso={todayIso}
          people={people}
          onPick={(plan, day) => {
            const live: MealPlan = (latest().mealPlans || []).find((p: MealPlan) => p.id === plan.id) || plan;
            const before = live;
            const mealId = crypto.randomUUID();
            const r = planFreezerMeal(live.days, day, planGroup, people, mealId);
            storeRef.current.changeMealPlan(live.id, (p) => ({ ...p, days: planFreezerMeal(p.days, day, planGroup, people, mealId).days }));
            setPlanning(null);
            const fresh = r.freshDays.length ? ` ${r.freshDays.join(' and ')} now cooked fresh.` : '';
            setToast({
              text: `${planGroup.name} on ${whenText(planDayDate(live, day), todayIso)}${r.replaced ? ` instead of ${mealTitle(r.replaced)}` : ''}.${fresh}`,
              undo: () => storeRef.current.changeMealPlan(before.id, (p) => ({ ...p, days: undoDays(p.days, before.days, r.days) })),
            });
          }}
          onGoPlanning={() => { setPlanning(null); onNavigateTab?.('planning'); }}
          onClose={() => setPlanning(null)}
        />
      )}

      {adding && (
        <AddSheet
          recipes={recipes}
          todayIso={todayIso}
          people={people}
          onAdd={(item) => {
            storeRef.current.addBatch(item);
            setAdding(false);
            setToast({ text: `Added ${portionsText(item.portions)} of ${item.name}`, undo: () => storeRef.current.removeBatch(item.id) });
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {viewing && <RecipeModal store={store} recipe={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** One dish: portions, how long it's been frozen, what's planned from it. */
function FreezerCard({ g, todayIso, people, onOpen, onPlan }: { key?: React.Key; g: FreezerGroup; todayIso: string; people: number; onOpen: () => void; onPlan: () => void }) {
  const short = g.plannedPortions > g.portions;
  // Blue (Peter) / pink (Rachel): who last put in or changed this, and who wrote each note.
  const latest = [...g.batches].sort((a, b) => (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0))[0];
  const changedBy = latest?.lastModifiedBy || latest?.addedBy;
  const notes = g.batches.filter((b) => (b.note || '').trim());
  return (
    <section className={`rounded-xl bg-white border px-3 py-2.5 ${g.useSoon ? 'border-amber-300' : 'border-zinc-200'}`} data-freezer-item={g.name}>
      <button type="button" onClick={onOpen} className="w-full flex items-start gap-3 text-left cursor-pointer" data-freezer-open>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] font-semibold text-zinc-900 leading-snug break-words">{g.name}</span>
            <PersonMark who={changedBy} what="Last changed" />
            {g.useSoon && <span className="text-[11px] font-bold uppercase tracking-wide rounded bg-amber-100 text-amber-800 px-1.5 py-px" data-use-soon>Use soon</span>}
          </span>
          <span className="block text-xs text-zinc-500 mt-0.5" data-freezer-age>
            Frozen {frozenAgo(g.oldest, todayIso)}{g.batches.length > 1 ? ` (oldest of ${g.batches.length})` : ''} · {mealsFor(g.portions, people)}
          </span>
          {g.planned.length > 0 && (
            <span className={`block text-xs mt-0.5 ${short ? 'text-rose-700 font-semibold' : 'text-cyan-800'}`} data-freezer-planned>
              {short
                ? `The plan needs ${g.plannedPortions}, only ${g.portions} in the freezer`
                : `Planned ${g.planned.map((p) => `${whenText(p.date, todayIso)} (${p.portions})`).join(', ')} · ${g.spare} spare`}
            </span>
          )}
          {notes.map((b) => (
            <span key={b.id} className={`mt-0.5 flex items-center gap-1 text-xs min-w-0 ${noteLook(b.noteBy).text}`} data-freezer-note={b.noteBy || ''}>
              <StickyNote className={`w-3 h-3 shrink-0 ${noteLook(b.noteBy).icon}`} />
              <span className="truncate">{b.note}</span>
            </span>
          ))}
          {g.batches.length > 1 && (
            <span className="mt-1 flex flex-wrap gap-1" data-freezer-batches>
              {g.batches.map((b) => (
                <span key={b.id} className="text-[11px] rounded bg-zinc-100 text-zinc-600 px-1.5 py-px">{b.portions} · {frozenAgo(b.dateAdded, todayIso)}</span>
              ))}
            </span>
          )}
        </span>
        <span className="shrink-0 text-center leading-none pt-0.5">
          <span className="block text-2xl font-bold text-zinc-900 tabular-nums" data-freezer-portions>{g.portions}</span>
          <span className="block text-[10px] font-semibold uppercase text-zinc-500 mt-0.5">{g.portions === 1 ? 'portion' : 'portions'}</span>
        </span>
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={onPlan} className="h-8 px-2.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 inline-flex items-center gap-1 cursor-pointer" data-freezer-plan>
          <CalendarPlus className="w-3.5 h-3.5" />Have it on…
        </button>
        <button type="button" onClick={onOpen} className="h-8 px-2.5 rounded-lg text-xs font-semibold text-zinc-500 inline-flex items-center gap-0.5 cursor-pointer hover:bg-zinc-100">
          Change<ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}

const Stepper = ({ value, onChange, label, min = 0 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) => (
  <div className="flex items-center gap-1.5" data-stepper={label}>
    <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} className="w-11 h-11 rounded-xl border border-zinc-300 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label={`One fewer ${label}`}><Minus className="w-5 h-5" /></button>
    <span className="w-10 text-center text-xl font-bold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" onClick={() => onChange(value + 1)} className="w-11 h-11 rounded-xl border border-zinc-300 bg-white flex items-center justify-center cursor-pointer" aria-label={`One more ${label}`}><Plus className="w-5 h-5" /></button>
  </div>
);

function Sheet({ label, children, onClose, footer }: { label: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div role="dialog" aria-label={label} className="bg-white w-full sm:max-w-md max-h-[90dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {children}
        {footer && <div className="px-4 py-3 border-t border-zinc-200 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  );
}

const SheetHead = ({ over, title, sub, onClose }: { over: string; title: string; sub?: React.ReactNode; onClose: () => void }) => (
  <div className="px-4 pt-4 pb-3 border-b border-zinc-200 flex items-start gap-2 shrink-0">
    <div className="flex-1 min-w-0">
      <span className="text-sm font-semibold text-zinc-500 block">{over}</span>
      <h3 className="text-lg font-bold text-zinc-900 leading-snug break-words">{title}</h3>
      {sub && <p className="text-sm text-zinc-600 mt-0.5">{sub}</p>}
    </div>
    <button type="button" onClick={onClose} className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center shrink-0 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
  </div>
);

/** A dish's batches: portions, when frozen, a note; remove; open the recipe; plan it. */
function FreezerSheet({ g, todayIso, people, recipe, onPortions, onPatch, onRemove, onPlan, onOpenRecipe, onClose }: {
  key?: React.Key;
  g: FreezerGroup;
  todayIso: string;
  people: number;
  recipe: Recipe | null;
  /** One more (+1) or one fewer (−1). */
  onPortions: (id: string, change: number) => void;
  onPatch: (id: string, patch: Partial<BatchItem>) => void;
  onRemove: (id: string) => void;
  onPlan: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={g.name} onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" onClick={onPlan} className="flex-1 h-12 rounded-xl border border-zinc-300 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer" data-sheet-plan><CalendarPlus className="w-4 h-4" />Have it on…</button>
        <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer" data-sheet-done>Done</button>
      </div>
    }>
      <div data-freezer-sheet={g.name} className="contents">
        <SheetHead over="In the freezer" title={g.name} sub={`${portionsText(g.portions)} · ${mealsFor(g.portions, people)}`} onClose={onClose} />
        <div className="overflow-y-auto px-4 py-3 space-y-3">
          {recipe && (
            <button type="button" onClick={() => onOpenRecipe(recipe)} className="text-[15px] font-semibold text-emerald-800 inline-flex items-center gap-1.5 cursor-pointer" data-sheet-recipe>
              <BookOpen className="w-4 h-4" />Open the recipe
            </button>
          )}
          {g.batches.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-zinc-200 p-3 space-y-2.5" data-sheet-batch={i}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">{g.batches.length > 1 ? `Batch ${i + 1}` : 'Portions'}<PersonMark who={b.lastModifiedBy || b.addedBy} what="Last changed" /></span>
                  <span className="text-xs text-zinc-500">frozen {frozenAgo(b.dateAdded, todayIso)}</span>
                </div>
                <Stepper value={b.portions} onChange={(n) => onPortions(b.id, n - b.portions)} label="portion" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-600 block mb-1">Frozen on</span>
                  <input type="date" defaultValue={String(b.dateAdded || '').slice(0, 10)} max={todayIso}
                    onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onPatch(b.id, { dateAdded: isoAtNoon(e.target.value) }); }}
                    className="w-full h-10 rounded-lg border border-zinc-300 px-2 text-sm" data-sheet-date />
                </label>
                <div className="flex items-end justify-end">
                  <button type="button" onClick={() => onRemove(b.id)} className="h-10 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer" data-sheet-remove>
                    <Trash2 className="w-4 h-4" />Remove
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5 mb-1">Note{b.note && <PersonMark who={b.noteBy} what="Note written" />}</span>
                <input type="text" defaultValue={b.note || ''} placeholder="e.g. garage freezer, blue tub"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (b.note || '')) onPatch(b.id, { note: v || undefined }); }}
                  className="w-full h-10 rounded-lg border border-zinc-300 px-2.5 text-sm" data-sheet-note />
              </label>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Pick a day for a freezer meal: today onwards on the weeks you've planned. */
function HaveItOnSheet({ g, plans, todayIso, people, onPick, onGoPlanning, onClose }: {
  g: FreezerGroup;
  plans: MealPlan[];
  todayIso: string;
  people: number;
  onPick: (plan: MealPlan, day: string) => void;
  onGoPlanning: () => void;
  onClose: () => void;
}) {
  const rows = plans
    .filter((p) => isWeekWithinForwardLimit(p.startDate) || DAYS_OF_WEEK.some((d) => planDayDate(p, d) >= todayIso))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .flatMap((p) => DAYS_OF_WEEK.filter((d) => p.days?.[d]).map((d) => ({ plan: p, day: d, date: planDayDate(p, d), meal: p.days[d].meals?.[0] || null })))
    .filter((r) => r.date >= todayIso);
  const short = g.spare < people;
  return (
    <Sheet label={`Have ${g.name} on…`} onClose={onClose}>
      <div data-have-it-on className="contents">
        <SheetHead over="Have it on…" title={g.name} sub={short ? <span className="text-amber-800 font-semibold">{g.spare <= 0 ? 'None spare: the plan already uses it all' : `Only ${portionsText(g.spare)} spare; you usually cook for ${people}`}</span> : `For ${people}: nothing to buy`} onClose={onClose} />
        <div className="overflow-y-auto px-4 py-3 space-y-1.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {rows.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-zinc-600">No weeks planned from today on yet.</p>
              <button type="button" onClick={onGoPlanning} className="mt-3 h-10 px-4 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer">Go to Planning</button>
            </div>
          ) : rows.map((r) => {
            const already = r.meal?.type === 'batch' && g.batches.some((b) => b.id === r.meal!.batchId);
            return (
              <button key={`${r.plan.id}-${r.day}`} type="button" onClick={() => !already && onPick(r.plan, r.day)} disabled={already} data-have-on={`${r.plan.startDate}:${r.day}`}
                className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 disabled:opacity-60 px-3 py-2.5 flex items-center gap-3 cursor-pointer">
                <span className="w-24 text-sm font-bold text-zinc-700 shrink-0 capitalize">{whenText(r.date, todayIso)}</span>
                <span className={`flex-1 min-w-0 text-[15px] truncate ${r.meal ? 'text-zinc-800' : 'text-zinc-400'}`}>{r.meal ? mealTitle(r.meal) : 'Free'}</span>
                <span className={`text-xs font-bold shrink-0 rounded-lg px-2 py-1 ${already ? 'text-zinc-500' : r.meal ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{already ? 'Planned' : r.meal ? 'Replace' : 'Put it here'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

/** Add to the freezer: one of your recipes (or anything), how many portions, when, a note. */
function AddSheet({ recipes, todayIso, people, onAdd, onClose }: {
  recipes: Recipe[];
  todayIso: string;
  people: number;
  onAdd: (b: BatchItem) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [portions, setPortions] = useState(people * 2);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState('');
  const q = name.trim().toLowerCase();
  const matches = !recipe && q ? recipes.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const exact = !recipe ? recipes.find((r) => r.name.trim().toLowerCase() === q) || null : recipe;
  const canSave = !!(recipe || name.trim()) && portions > 0;
  const save = () => {
    if (!canSave) return;
    const linked = recipe || exact;
    onAdd({
      id: crypto.randomUUID(),
      name: (linked?.name || name).trim(),
      ...(linked ? { recipeId: linked.id } : {}),
      portions,
      dateAdded: isoAtNoon(date),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };
  return (
    <Sheet label="Add to the freezer" onClose={onClose} footer={
      <button type="button" onClick={save} disabled={!canSave} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 cursor-pointer" data-add-save>
        Add {portionsText(portions)}
      </button>
    }>
      <div data-freezer-add-sheet className="contents">
        <SheetHead over="Add to the freezer" title={recipe ? recipe.name : 'What is it?'} onClose={onClose} />
        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {recipe ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900" data-add-linked>
              <Check className="w-4 h-4 shrink-0" /><span className="flex-1 min-w-0">From your recipes</span>
              <button type="button" onClick={() => { setName(recipe.name); setRecipe(null); }} className="text-xs font-semibold underline cursor-pointer">Change</button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Search your recipes, or type anything" aria-label="What is it?"
                  className="w-full h-11 rounded-xl border border-zinc-300 pl-9 pr-3 text-base outline-none focus:border-emerald-500" data-add-name />
              </div>
              {matches.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden" data-add-matches>
                  {matches.map((r) => (
                    <button key={r.id} type="button" onClick={() => { setRecipe(r); setName(r.name); }} className="w-full text-left px-3 py-2.5 text-[15px] hover:bg-zinc-50 cursor-pointer" data-add-match={r.name}>{r.name}</button>
                  ))}
                </div>
              )}
              {q && !matches.length && <p className="text-xs text-zinc-500 mt-1.5">Not one of your recipes. That's fine, it'll be added as “{name.trim()}”.</p>}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[15px] font-semibold text-zinc-900 block">Portions</span>
              <span className="text-xs text-zinc-500">{mealsFor(portions, people)}</span>
            </div>
            <Stepper value={portions} onChange={(n) => setPortions(Math.max(1, Math.min(99, n)))} label="portion" min={1} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600 block mb-1">Frozen on</span>
              <input type="date" value={date} max={todayIso} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-full h-10 rounded-lg border border-zinc-300 px-2 text-sm" data-add-date />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600 block mb-1">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. blue tub" className="w-full h-10 rounded-lg border border-zinc-300 px-2.5 text-sm" data-add-note />
            </label>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
