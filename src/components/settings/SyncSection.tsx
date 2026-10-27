/** Settings → Sync between phones: how it's going in plain words, Sync now, the sync code, or setting it up. */
import { useEffect, useState } from 'react';
import { Copy, X, RefreshCw } from 'lucide-react';
import { agoText, syncProblemText } from '../../settingsInfo';
import { messageOf } from '../../errors';
import { getTokenExpiry } from '../../services/gistStorage';
import { card, row, sectionTitle } from './parts';
import { Confirm, SettingsTabProps } from './types';

export function SyncSection({
  store,
  say,
  setConfirm,
}: {
  store: SettingsTabProps['store'];
  say: (t: string) => void;
  setConfirm: (c: Confirm) => void;
}) {
  const cfg = store.githubConfig;
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  const [pat, setPat] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'merge' | 'pull' | 'push'>('merge');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const status = store.syncStatus;
  const problemNow = status === 'error' ? syncProblemText(store.syncError) : '';
  const expires = getTokenExpiry();
  const tokenEnds = expires
    ? `${new Date(expires).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${new Date(expires).getFullYear()}`
    : null;

  const connect = async () => {
    if (!pat.trim()) {
      setProblem('Paste the GitHub token first.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      if (code.trim()) await store.saveGithubConfig(pat, code, mode);
      else await store.createGistFromLocal(pat);
      say('Syncing is on');
      setPat('');
      setCode('');
    } catch (e) {
      setProblem(syncProblemText(messageOf(e) || String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-settings-sync>
      <h3 className={sectionTitle}>Sync between phones</h3>
      <div className={card}>
        {cfg ? (
          <>
            <div className={row}>
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${status === 'error' ? 'bg-rose-500' : status === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-zinc-900" data-sync-status>
                  {status === 'loading'
                    ? 'Syncing…'
                    : status === 'error'
                      ? 'Not syncing right now'
                      : store.lastSynced
                        ? `Synced ${agoText(store.lastSynced)}`
                        : 'Connected'}
                </span>
                <span
                  className={`block text-[13px] ${problemNow ? 'text-rose-700' : 'text-zinc-500'}`}
                  data-sync-detail
                >
                  {problemNow ||
                    `Changes go up straight away; the other phone's appear within about ${store.syncPollSeconds || 20} seconds.`}
                </span>
                {tokenEnds && (
                  <span className="block text-[13px] text-zinc-500" data-sync-token-expires>
                    The GitHub token runs out on {tokenEnds}.
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await store.manualSync();
                  say('Synced');
                }}
                disabled={status === 'loading'}
                className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                data-sync-now
              >
                <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
                Sync now
              </button>
            </div>
            {store.syncNotice && (
              <div className="px-4 py-3 flex items-start gap-3 bg-amber-50" data-sync-notice>
                <span className="flex-1 text-[13px] text-amber-900">{store.syncNotice}</span>
                <button
                  type="button"
                  onClick={() => store.clearSyncNotice?.()}
                  className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-amber-800 cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-zinc-500">Sync code (for the other phone)</span>
                <span className="block font-mono text-sm text-zinc-800 truncate" data-sync-code>
                  {cfg.gistId}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(cfg.gistId)
                    .then(() => say('Sync code copied'))
                    .catch(() => say("Couldn't copy: select it and copy instead"));
                }}
                className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: 'Stop syncing on this phone?',
                  body: "Everything stays on this phone, but changes won't go to or come from the other phone until you connect again.",
                  action: 'Stop syncing',
                  danger: true,
                  run: () => {
                    store.clearGithubConfig();
                    say('Syncing stopped on this phone');
                  },
                })
              }
              className={`${row} text-sm font-semibold text-rose-700 cursor-pointer`}
              data-sync-stop
            >
              Stop syncing on this phone
            </button>
          </>
        ) : (
          <div className="px-4 py-3 space-y-3" data-sync-setup>
            <p className="text-[15px] text-zinc-700">
              Both phones keep the same recipes, plans, lists and freezer through a private file on your GitHub account.
            </p>
            <ol className="text-sm text-zinc-700 list-decimal pl-5 space-y-1">
              <li>
                On github.com, make a token with only the <strong>gist</strong> permission (Settings → Developer
                settings → Personal access tokens).
              </li>
              <li>Paste it below.</li>
              <li>
                On the second phone, also paste the <strong>sync code</strong> shown on the first phone.
              </li>
            </ol>
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="GitHub token (ghp_…)"
              autoComplete="off"
              className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base"
              aria-label="GitHub token"
              data-sync-token
            />
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Sync code from the other phone"
                className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base"
                aria-label="Sync code"
                data-sync-code-input
              />
              <span className="block text-xs text-zinc-500 mt-1">Leave this empty on the first phone.</span>
            </div>
            <details className="text-sm text-zinc-600">
              <summary className="cursor-pointer font-semibold">Advanced: what if both have data?</summary>
              <div className="mt-2 space-y-1.5">
                {(
                  [
                    ['merge', 'Combine both (recommended)'],
                    ['pull', "Use what's on GitHub (replace this phone's)"],
                    ['push', "Use this phone's (replace what's on GitHub)"],
                  ] as const
                ).map(([id, label]) => (
                  <label key={id} className="flex items-center gap-2">
                    <input type="radio" name="sync-mode" checked={mode === id} onChange={() => setMode(id)} />
                    {label}
                  </label>
                ))}
              </div>
            </details>
            {problem && (
              <p className="text-sm text-rose-700" data-sync-problem>
                {problem}
              </p>
            )}
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
              data-sync-connect
            >
              {busy ? 'Connecting…' : code.trim() ? 'Connect to the other phone' : 'Start syncing'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
