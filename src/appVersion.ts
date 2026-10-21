// Which version of the app this phone is running, and whether a newer one has been uploaded.
// The build stamps a version into index.html (<meta name="app-version">) and the same one into
// sw.js; reading sw.js fresh from the site tells us the newest uploaded version.

export interface RunningVersion {
  id: string;
  built?: string;
}

/** The version in this page, or null (the preview inside Claude has none). */
export function runningVersion(): RunningVersion | null {
  try {
    const m = document.querySelector('meta[name="app-version"]') as HTMLMetaElement | null;
    const id = m?.content?.trim();
    return id ? { id, built: m?.getAttribute('data-built') || undefined } : null;
  } catch {
    return null;
  }
}

/** The version stamped in a sw.js ("const CACHE = 'meal-planner-abc123…'"). */
export function versionInServiceWorker(text: string): string | null {
  const m = String(text || '').match(/meal-planner-([0-9a-f]{8,})/);
  return m ? m[1] : null;
}

/** The newest version on the site, or null if it can't tell (offline, preview). */
export async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`./sw.js?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return versionInServiceWorker(await res.text());
  } catch {
    return null;
  }
}

export type UpdateCheck = 'current' | 'available' | 'unknown';

export async function checkForUpdate(): Promise<UpdateCheck> {
  const running = runningVersion();
  if (!running) return 'unknown';
  const latest = await latestVersion();
  if (!latest) return 'unknown';
  return latest === running.id ? 'current' : 'available';
}

/** Load the newest version (the service worker fetches the app fresh when online). */
export async function updateNow() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update?.();
  } catch {
    /* reload anyway */
  }
  window.location.reload();
}

/** "18 Oct 2026, 12:47". */
export function builtText(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
