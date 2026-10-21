/**
 * Colour themes (Settings → This phone → Colour theme). Each phone keeps its own choice.
 *
 * A theme only changes the page, the bars at the top of each screen, the tab bar and the greys
 * (see the "Colour themes" block in index.css). Colours that mean something stay the same in
 * every theme: green for go/done, amber for "check this", red for remove, and each aisle's colour.
 */
export type ThemeId = 'clean' | 'tabs' | 'warm' | 'sage';

export const THEMES: { id: ThemeId; name: string; sub: string; page: string; bar: string; accent: string }[] = [
  { id: 'clean', name: 'Clean', sub: 'White and light grey', page: '#fafafa', bar: '#ffffff', accent: '#059669' },
  {
    id: 'tabs',
    name: 'Tab colours',
    sub: "Each screen in its tab's colour",
    page: '#eff6ff',
    bar: '#dbeafe',
    accent: '#2563eb',
  },
  {
    id: 'warm',
    name: 'Warm kitchen',
    sub: 'Oat and cream, terracotta',
    page: '#f4ede2',
    bar: '#f6dccb',
    accent: '#b4532a',
  },
  { id: 'sage', name: 'Sage garden', sub: 'Soft green', page: '#edf3ea', bar: '#d9e8d2', accent: '#1f5c46' },
];

const KEY = 'app_theme';

/** This phone's theme ('clean' if none chosen, or storage isn't available). */
export function savedTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t as ThemeId;
  } catch {
    /* private window etc.: the default look */
  }
  return 'clean';
}

/** Show a theme now (and remember it on this phone when `save`). */
export function applyTheme(id: ThemeId, save = false): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = id;
  if (save) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* still shown until the app is closed */
    }
  }
}

/** Which tab is showing, for "Tab colours". */
export function applyTabColour(tab: string): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.tab = tab;
}
