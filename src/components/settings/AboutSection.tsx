/** Settings → About this app: the version, Check for updates, and the "newer files uploaded" banner. */
import { useState } from 'react';
import { runningVersion, checkForUpdate, updateNow, builtText, UpdateCheck } from '../../appVersion';
import { card, row, sectionTitle } from './parts';

export function AboutSection() {
  const running = runningVersion();
  const [check, setCheck] = useState<UpdateCheck | 'checking' | null>(null);
  return (
    <section data-settings-about>
      <h3 className={sectionTitle}>About this app</h3>
      <div className={card}>
        <div className={row}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Version</span>
            <span className="block text-[13px] text-zinc-500" data-app-version>
              {running
                ? `${builtText(running.built) || 'This version'} · ${running.id.slice(0, 7)}`
                : 'Preview (not the installed app)'}
            </span>
            {check && check !== 'checking' && (
              <span
                className={`block text-[13px] mt-0.5 ${check === 'available' ? 'text-emerald-700 font-semibold' : 'text-zinc-500'}`}
                data-update-result
              >
                {check === 'available'
                  ? 'A newer version has been uploaded.'
                  : check === 'current'
                    ? "You're on the latest version."
                    : "Couldn't check just now (no internet?)."}
              </span>
            )}
          </span>
          {check === 'available' ? (
            <button
              type="button"
              onClick={() => void updateNow()}
              className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer shrink-0"
            >
              Update
            </button>
          ) : (
            <button
              type="button"
              disabled={!running || check === 'checking'}
              onClick={async () => {
                setCheck('checking');
                setCheck(await checkForUpdate());
              }}
              className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-40 shrink-0"
              data-update-check
            >
              {check === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
