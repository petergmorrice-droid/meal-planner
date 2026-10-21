// Plain-words helpers for Settings (no React, so they can be tested on their own).

/** "just now", "2 min ago", "3 hours ago", "yesterday", "12 Oct". */
export function agoText(when: Date | string | number | null | undefined, now = Date.now()): string {
  if (!when) return '';
  const t = new Date(when).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A sync problem in plain words. */
export function syncProblemText(err: string | null | undefined): string {
  const e = String(err || '');
  if (!e) return '';
  if (/401|bad credentials|unauthori[sz]ed/i.test(e))
    return "GitHub didn't accept the token (it may have expired). Make a new one and connect again.";
  if (/404|not found/i.test(e))
    return "Couldn't find the shared data on GitHub. Check the sync code, or connect again.";
  if (/403|rate limit|abuse/i.test(e)) return 'GitHub is limiting requests for a while. It will try again by itself.';
  if (/failed to fetch|network|offline|load failed|timed? ?out|abort/i.test(e))
    return "No internet just now. Changes are kept on this phone and sync when it's back.";
  return e;
}

/** What's in a backup file, to show before restoring. */
export function backupSummary(text: string): { ok: boolean; parts: string[]; state?: any } {
  try {
    const s = JSON.parse(text);
    if (!s || typeof s !== 'object' || (!Array.isArray(s.recipes) && !Array.isArray(s.mealPlans)))
      return { ok: false, parts: [] };
    const n = (a: any) => (Array.isArray(a) ? a.length : 0);
    const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    return {
      ok: true,
      state: s,
      parts: [
        plural(n(s.recipes), 'recipe', 'recipes'),
        plural(n(s.mealPlans), 'week', 'weeks'),
        plural(n(s.shoppingList), 'shopping list item', 'shopping list items'),
        plural(n(s.batches), 'freezer item', 'freezer items'),
      ],
    };
  } catch {
    return { ok: false, parts: [] };
  }
}
