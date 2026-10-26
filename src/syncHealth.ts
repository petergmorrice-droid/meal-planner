// Whether to warn, on every tab, that Sync between phones has stopped or is about to. Pure
// functions (no React, no storage). A problem that won't fix itself (GitHub turned the token down,
// the shared data has gone) is said straight away; one that usually does (no internet, GitHub busy)
// only once this phone hasn't synced for a couple of days.
import { agoText, syncProblemText } from './settingsInfo';

/** Without a sync this long, a passing problem is worth saying. */
export const STALE_MS = 2 * 24 * 60 * 60 * 1000;
/** A token running out this soon is worth saying. */
export const EXPIRY_WARN_MS = 14 * 24 * 60 * 60 * 1000;

export interface SyncWarning {
  kind: 'token' | 'missing' | 'stale' | 'expiring';
  text: string;
}

const dayText = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function syncWarning(s: {
  /** Sync is set up on this phone. */
  configured: boolean;
  status: 'idle' | 'loading' | 'synced' | 'error';
  error: string | null;
  /** When this phone last synced (ms), if it ever has. */
  lastOkAt: number | null;
  /** When the GitHub token runs out (ms), if GitHub has said. */
  tokenExpiresAt: number | null;
  now: number;
}): SyncWarning | null {
  if (!s.configured) return null;
  const since = s.lastOkAt ? ` Last synced ${agoText(s.lastOkAt, s.now)}.` : '';
  if (s.status === 'error' && s.error) {
    if (/401|bad credentials|unauthori[sz]ed|refused the request|"gist" permission/i.test(s.error))
      return {
        kind: 'token',
        text: `Sync has stopped: GitHub didn't accept the token (it may have run out).${since} Make a new one and connect again.`,
      };
    if (/404|not found/i.test(s.error))
      return { kind: 'missing', text: `Sync has stopped: the shared data couldn't be found on GitHub.${since}` };
    if (s.lastOkAt && s.now - s.lastOkAt > STALE_MS)
      return { kind: 'stale', text: `Last synced ${agoText(s.lastOkAt, s.now)}. ${syncProblemText(s.error)}` };
  }
  if (s.tokenExpiresAt && s.tokenExpiresAt - s.now < EXPIRY_WARN_MS)
    return s.tokenExpiresAt <= s.now
      ? { kind: 'token', text: 'The GitHub token for sync has run out. Make a new one and connect again.' }
      : {
          kind: 'expiring',
          text: `The GitHub token for sync runs out on ${dayText(s.tokenExpiresAt)}. Make a new one and connect again before then.`,
        };
  return null;
}

/**
 * When a token runs out, from GitHub's "GitHub-Authentication-Token-Expiration" header
 * ("2026-12-03 10:00:00 UTC"); null if there's none or it can't be read.
 */
export function parseTokenExpiry(header: string | null | undefined): number | null {
  const v = String(header || '').trim();
  if (!v) return null;
  const t = Date.parse(
    v
      .replace(/^(\d{4}-\d\d-\d\d) /, '$1T')
      .replace(/ ?UTC$/, 'Z')
      .replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2'),
  );
  return Number.isFinite(t) ? t : null;
}
