/** Settings → History: past weeks with what you ate, ticks and verdicts; copy a week, or copy it as text. */
import { useState } from 'react';
import { RatingChip } from '../Stars';
import { ratingsFor } from '../../ratings';
import { Check, Copy, Search, ThumbsUp, ThumbsDown } from 'lucide-react';
import { MealPlan, Recipe, TabName } from '../../types';
import { formatDateISO, getMonday, DAYS_OF_WEEK } from '../../utils';
import { describeMeal, mealTitle } from '../planner/DayListRow';
import { leftoverSourceDay } from '../../planning';
import { formatWeekSpan } from '../../shopList';
import { Sheet, SubHeader } from './parts';
import { Confirm, SettingsTabProps } from './types';

export function HistoryPage({
  plans,
  store,
  onBack,
  say,
  setConfirm,
  onNavigateTab,
}: {
  plans: MealPlan[];
  store: SettingsTabProps['store'];
  onBack: () => void;
  say: (t: string) => void;
  setConfirm: (c: Confirm) => void;
  onNavigateTab?: (tab: TabName) => void;
}) {
  const [q, setQ] = useState('');
  const [copying, setCopying] = useState<MealPlan | null>(null);
  const recipes: Recipe[] = store.state.recipes || [];
  const t = q.trim().toLowerCase();
  const shown = t
    ? plans.filter((p) =>
        Object.values(p.days || {}).some((d) => (d.meals || []).some((m) => mealTitle(m).toLowerCase().includes(t))),
      )
    : plans;

  const copyText = (p: MealPlan) => {
    const lines = [
      `Meals ${formatWeekSpan(p.startDate)}`,
      ...DAYS_OF_WEEK.map((d) => {
        const m = p.days?.[d]?.meals?.[0];
        return `${d}: ${m ? mealTitle(m) : '—'}${m?.note ? ` (${m.note})` : ''}`;
      }),
    ];
    navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => say('Copied the week as text'))
      .catch(() => say("Couldn't copy on this phone"));
  };

  return (
    <>
      <SubHeader title="Past weeks" onBack={onBack} />
      <div className="flex-1 overflow-y-auto" data-history-page>
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-24 space-y-3">
          {plans.length > 3 && (
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a meal you had"
                className="w-full h-11 rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-base"
                data-history-search
                aria-label="Find a meal"
              />
            </div>
          )}
          {plans.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-10">
              Finished weeks appear here, with what you ate. You can copy one to a new week.
            </p>
          )}
          {shown.map((p) => (
            <section key={p.id} className="bg-white rounded-2xl border border-zinc-200" data-history-week={p.startDate}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-zinc-900">{formatWeekSpan(p.startDate)}</h3>
                <span className="text-xs text-zinc-500">
                  {DAYS_OF_WEEK.filter((d) => p.days?.[d]?.meals?.[0]?.cooked).length} cooked
                </span>
              </div>
              <ul className="px-4 divide-y divide-zinc-100">
                {DAYS_OF_WEEK.map((d) => {
                  const m = p.days?.[d]?.meals?.[0] || null;
                  const label = m ? describeMeal(m, leftoverSourceDay(p.days, d, m)).label?.text : '';
                  const recipe = m?.recipeId ? recipes.find((r) => r.id === m.recipeId) : null;
                  return (
                    <li key={d} className="py-1.5 flex items-center gap-2 text-sm" data-history-day={d}>
                      <span className="w-9 text-xs font-bold text-zinc-500 shrink-0">{d.slice(0, 3)}</span>
                      <span className={`flex-1 min-w-0 truncate ${m ? 'text-zinc-800' : 'text-zinc-400'}`}>
                        {m ? mealTitle(m) : 'Nothing planned'}
                        {label && label.toLowerCase() !== (m ? mealTitle(m).toLowerCase() : '') && (
                          <span className="text-zinc-500"> · {label}</span>
                        )}
                      </span>
                      {recipe && <RatingChip ratings={ratingsFor(store.state.preferences?.ratings, recipe.id)} />}
                      {recipe?.verdict === 'again' &&
                        !ratingsFor(store.state.preferences?.ratings, recipe.id).P &&
                        !ratingsFor(store.state.preferences?.ratings, recipe.id).R && (
                          <ThumbsUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Have it again" />
                        )}
                      {recipe?.verdict === 'not_for_us' &&
                        !ratingsFor(store.state.preferences?.ratings, recipe.id).P &&
                        !ratingsFor(store.state.preferences?.ratings, recipe.id).R && (
                          <ThumbsDown className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Not for us" />
                        )}
                      {m?.cooked && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Cooked" />}
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setCopying(p)}
                  className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
                  data-history-copy
                >
                  Copy to a week…
                </button>
                <button
                  type="button"
                  onClick={() => copyText(p)}
                  className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  Copy as text
                </button>
              </div>
            </section>
          ))}
          {plans.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: 'Clear all past weeks?',
                  body: `${plans.length} finished ${plans.length === 1 ? 'week is' : 'weeks are'} deleted from both phones. Recipes keep their "last had" dates only while the weeks exist.`,
                  action: 'Clear past weeks',
                  danger: true,
                  run: () => {
                    store.clearPastWeeks();
                    say('Past weeks cleared');
                  },
                })
              }
              className="w-full h-11 text-sm font-semibold text-rose-700 cursor-pointer"
              data-history-clear
            >
              Clear all past weeks…
            </button>
          )}
        </div>
      </div>
      {copying && (
        <CopyWeekSheet
          plan={copying}
          store={store}
          onClose={() => setCopying(null)}
          onDone={(label) => {
            setCopying(null);
            say(`Copied to ${label}`);
            setTimeout(() => onNavigateTab?.('planning'), 700);
          }}
        />
      )}
    </>
  );
}

function CopyWeekSheet({
  plan,
  store,
  onClose,
  onDone,
}: {
  plan: MealPlan;
  store: SettingsTabProps['store'];
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const monday = getMonday(new Date());
  const maxWeeks = store.state.preferences?.maxForwardWeeks || 4;
  const weeks = Array.from({ length: maxWeeks }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    const start = formatDateISO(d);
    const existing = (store.state.mealPlans || []).find((p) => p.startDate === start);
    const count = existing ? Object.values(existing.days || {}).reduce((n, day) => n + (day.meals?.length || 0), 0) : 0;
    const label =
      i === 0
        ? 'this week'
        : i === 1
          ? 'next week'
          : `w/c ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
    return { start, label, count, span: formatWeekSpan(start) };
  });
  return (
    <Sheet label="Copy to a week" onClose={onClose}>
      <div className="p-4" data-copy-week>
        <h3 className="text-lg font-bold text-zinc-900">Copy {formatWeekSpan(plan.startDate)} to…</h3>
        <p className="text-sm text-zinc-600 mt-0.5">The meals, people and notes come across, not yet cooked.</p>
        <div className="mt-3 space-y-1.5">
          {weeks.map((w) => (
            <button
              key={w.start}
              type="button"
              onClick={() => {
                store.duplicatePlanToWeek(plan.id, w.start);
                onDone(w.label);
              }}
              data-copy-to={w.start}
              className="w-full text-left rounded-xl border border-zinc-200 hover:bg-zinc-50 px-3 py-2.5 flex items-center gap-3 cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900 capitalize">{w.label}</span>
                <span className="block text-xs text-zinc-500">{w.span}</span>
              </span>
              <span
                className={`text-xs font-bold rounded-lg px-2 py-1 ${w.count ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}
              >
                {w.count ? `Replaces ${w.count} meals` : 'Empty'}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full h-11 rounded-xl border border-zinc-300 font-semibold cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
