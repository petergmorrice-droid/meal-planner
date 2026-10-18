// Helpers for the Cook tab and cooking mode: when to start, what to do the night before,
// what each step needs, and kitchen timers. Pure functions (no React, no storage).
import { Ingredient, PlannedMeal, Recipe } from './types';

// ---------- When to start ----------

/** "19:00" -> minutes after midnight (null if not a time). */
export function parseClock(hhmm: string | undefined | null): number | null {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Minutes after midnight -> "5:45pm", "7pm", "12:30pm". */
export function clockText(minutes: number): string {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60), m = t % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h24 < 12 ? 'am' : 'pm'}`;
}

/** Eat at 19:00, 75 minutes of prep and cooking: start by 17:45 (in minutes after midnight). */
export function startBy(dinner: string, minutesNeeded: number): number | null {
  const d = parseClock(dinner);
  return d === null ? null : d - Math.max(0, minutesNeeded);
}

/** When you eat if you haven't said: 6pm. */
export const DEFAULT_EAT_AT = '18:00';

/**
 * When you're eating tonight: the time set just for tonight on the Cook tab, else your usual
 * time from Settings, else 6pm.
 */
export function eatAtFor(
  prefs: { eatAt?: string; eatAtTonight?: { date: string; time: string } } | null | undefined,
  todayIso: string,
): { time: string; usual: string; tonightOnly: boolean } {
  const usual = parseClock(prefs?.eatAt) !== null ? prefs!.eatAt! : DEFAULT_EAT_AT;
  const t = prefs?.eatAtTonight;
  if (t && t.date === todayIso && parseClock(t.time) !== null && t.time !== usual) return { time: t.time, usual, tonightOnly: true };
  return { time: usual, usual, tonightOnly: false };
}

/** Prep + cook time for the method you'll use (falls back to the recipe's times). */
export function recipeMinutes(recipe: Recipe | null | undefined, method?: string): number {
  if (!recipe) return 0;
  const prep = (method && recipe.methodPrepTime?.[method as keyof typeof recipe.methodPrepTime]) ?? recipe.prepTime ?? 0;
  const cook = (method && recipe.methodCookTime?.[method as keyof typeof recipe.methodCookTime]) ?? recipe.cookTime ?? 0;
  return (Number(prep) || 0) + (Number(cook) || 0);
}

// ---------- The night before ----------

const AHEAD = /\b(marinat\w*|overnight|soak\w*|defrost\w*|thaw\w*|the night before|day before|brine\w*)\b/i;

/** Steps that need doing ahead ("Marinate the chicken overnight", "Soak the beans"). */
export function stepsToDoAhead(recipe: Recipe | null | undefined): string[] {
  if (!recipe) return [];
  const all = [...(recipe.instructions || []), ...Object.values(recipe.methodInstructions || {}).flat()];
  return Array.from(new Set(all.filter((s) => typeof s === 'string' && AHEAD.test(s)).map((s) => s.trim())));
}

const short = (s: string, max = 90) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/**
 * Anything to do tonight for tomorrow's meal: take a freezer meal out, or a step the recipe
 * says needs doing ahead. Null when there's nothing.
 */
export function prepTonight(meal: PlannedMeal | null | undefined, recipe: Recipe | null | undefined, freezerName?: string): string | null {
  if (!meal || meal.cooked) return null;
  if (meal.type === 'batch') {
    const name = (freezerName || meal.name || '').replace(/^batch:\s*/i, '').trim() || 'meal';
    return `Take the ${name.toLowerCase().startsWith('the ') ? name.slice(4) : name} out of the freezer tonight`;
  }
  if (meal.type !== 'recipe') return null;
  const ahead = stepsToDoAhead(recipe);
  return ahead.length ? `Get ahead tonight: ${short(ahead[0])}` : null;
}

/** "Batch cook: freeze 4" -> 4 (how many portions the note says go in the freezer). */
export function freezePortionsFromNote(note?: string | null): number | null {
  const m = String(note ?? '').match(/\bfreeze\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

// ---------- What each step needs ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (w: string) =>
  /ies$/.test(w) ? w.slice(0, -3) + 'y'
  : /(oes|ches|shes|sses|xes)$/.test(w) ? w.slice(0, -2)
  : /[^s]s$/.test(w) ? w.slice(0, -1)
  : w;
/** Words too general to say a step uses an ingredient ("the water", "the sauce", "the pan"). */
/** Words that say what form something comes in, not what it is. */
const FORM = new Set(['granule', 'powder', 'paste', 'flake', 'cube', 'puree', 'leave', 'leaf', 'fillet', 'breast', 'thigh']);
const GENERIC = new Set(['water', 'oil', 'salt', 'pepper', 'sauce', 'stock', 'mix', 'mixture', 'powder', 'paste', 'fresh', 'dried', 'frozen', 'large', 'small', 'medium', 'red', 'green', 'white', 'black']);

/**
 * The ingredients a step mentions, in recipe order: "Boil the potatoes… mash with the butter and
 * milk" -> potatoes, butter, milk. Matches the ingredient's main word ("pork sausages" -> sausage).
 */
export function ingredientsForStep(step: string, ingredients: Ingredient[]): Ingredient[] {
  const words = new Set(norm(step).split(' ').map(singular));
  const text = ` ${norm(step)} `;
  return ingredients.filter((ing) => {
    const name = norm(ing.name);
    if (!name) return false;
    if (text.includes(` ${name} `)) return true;
    const parts = name.split(' ').filter((w) => w.length > 2 && !GENERIC.has(w));
    if (!parts.length) return false;
    // The main word is the last one, unless that's just its form ("gravy granules", "chilli powder").
    const last = singular(parts[parts.length - 1]);
    const head = FORM.has(last) && parts.length > 1 ? singular(parts[parts.length - 2]) : last;
    return words.has(head);
  });
}

// ---------- Timers ----------

/** First time in a step, in minutes: "Simmer for 10-15 minutes" -> 10, "Roast for 1 hour" -> 60. */
export function stepMinutes(step: string): number | null {
  const hours = step.match(/(\d+(?:\.\d+)?|½|an?)\s*(?:-|to)?\s*(?:\d+\s*)?(?:hours?|hrs?)\b/i);
  const mins = step.match(/(\d+)\s*(?:-|to)?\s*(?:\d+)?\s*(?:minutes|minute|mins|min)\b/i);
  let total = 0;
  if (hours) total += (hours[1] === '½' ? 0.5 : /^an?$/i.test(hours[1]) ? 1 : Number(hours[1])) * 60;
  if (mins) total += Number(mins[1]);
  return total > 0 ? Math.round(total) : null;
}

const TIMER_VERBS = /^(simmer|boil|fry|stir-fry|roast|bake|grill|cook|rest|leave|marinate|soak|chill|stir|brown|steam|poach|reduce|heat|microwave|air[- ]fry|sear|toast|blanch|slow[- ]cook|pressure[- ]cook|prove|stand|steep|braise|stew|saute|sauté|griddle|warm|melt|whisk|knead|set|cool|freeze|defrost|thaw)\b/i;

/**
 * A short name for a step's timer, from the words just before the time:
 * "Grill the sausages for 20 mins, turning." -> "Grill the sausages";
 * "Add the tomatoes and beans and simmer for 45 mins." -> "Simmer";
 * "Heat oven to 200C. Roast the potatoes in oil for 15 mins." -> "Roast the potatoes".
 */
export function stepTimerLabel(step: string): string {
  const time = step.search(/(\d+(?:\.\d+)?|½|an?)\s*(?:-|to)?\s*(?:\d+\s*)?(?:hours?|hrs?|minutes?|mins?)\b/i);
  let before = (time > 0 ? step.slice(0, time) : step).replace(/\s+(?:for|about|around|approx\.?|roughly|another|more|a further)\s*$/i, '').replace(/\s+(?:for|about|around)\s*$/i, '');
  // The sentence the time is in.
  const sentences = before.split(/[.;:!?]\s+/);
  before = (sentences[sentences.length - 1] || before).trim();
  // The last part of it that starts with something you do ("…and simmer").
  const clauses = before.split(/,\s*|\s+then\s+|\s+and\s+/i).map((c) => c.trim()).filter(Boolean);
  let label = clauses.slice().reverse().find((c) => TIMER_VERBS.test(c)) || clauses[0] || before || step;
  // Drop "in 2 tbsp olive oil", "on a medium heat", "to 200C".
  label = label.split(/\s+(?:in|with|on|over|under|until|at|to|into|from|following)\s+/i)[0];
  const words = label.split(/\s+/).slice(0, 5).join(' ');
  const out = words.length > 32 ? `${words.slice(0, 31)}…` : words;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export type TimerState = 'running' | 'paused' | 'ringing';
export interface CookTimer {
  id: string;
  label: string;
  /** Recipe it belongs to, shown on the timer. */
  recipe?: string;
  durationMs: number;
  /** When it goes off (while running). */
  endsAt: number | null;
  /** Time left (while paused). */
  leftMs: number;
  state: TimerState;
}

export function newTimer(id: string, label: string, minutes: number, now: number, recipe?: string): CookTimer {
  const ms = Math.max(1, minutes) * 60_000;
  return { id, label, recipe, durationMs: ms, endsAt: now + ms, leftMs: ms, state: 'running' };
}

/** Time left, worked out from the clock (so it's right after the phone has been asleep). */
export function timeLeft(t: CookTimer, now: number): number {
  if (t.state === 'running') return Math.max(0, (t.endsAt ?? now) - now);
  if (t.state === 'paused') return t.leftMs;
  return 0;
}

/** Running timers whose time is up start ringing. */
export function tickTimers(timers: CookTimer[], now: number): CookTimer[] {
  let changed = false;
  const out = timers.map((t) => {
    if (t.state === 'running' && t.endsAt !== null && t.endsAt <= now) { changed = true; return { ...t, state: 'ringing' as const, leftMs: 0 }; }
    return t;
  });
  return changed ? out : timers;
}

export function pauseTimer(t: CookTimer, now: number): CookTimer {
  return t.state === 'running' ? { ...t, state: 'paused', leftMs: timeLeft(t, now), endsAt: null } : t;
}
export function resumeTimer(t: CookTimer, now: number): CookTimer {
  return t.state === 'paused' ? { ...t, state: 'running', endsAt: now + t.leftMs } : t;
}
/** +1 minute (a ringing timer starts again with a minute to go). */
export function addMinute(t: CookTimer, now: number): CookTimer {
  if (t.state === 'running') return { ...t, endsAt: (t.endsAt ?? now) + 60_000, durationMs: t.durationMs + 60_000 };
  if (t.state === 'paused') return { ...t, leftMs: t.leftMs + 60_000, durationMs: t.durationMs + 60_000 };
  return { ...t, state: 'running', endsAt: now + 60_000, leftMs: 60_000 };
}

/** "4:05", "1:02:00", "0:09". */
export function timerText(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
