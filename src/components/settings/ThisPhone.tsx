/** Settings → This phone: who's using it, the colour theme, and the Gemini key (kept on this phone only). */
import { useState } from 'react';
import { THEMES, ThemeId, applyTheme, savedTheme } from '../../theme';
import { Check } from 'lucide-react';
import { setCurrentDeviceIdentity } from '../../hooks/useDeviceIdentity';
import { testGeminiKeyApi, getGeminiApiKey, saveGeminiApiKey, clearGeminiApiKey } from '../../services/geminiService';
import { Segmented, card, row, sectionTitle } from './parts';

/** Colour theme: four looks, each shown as a little screen. This phone only. */
function ThemeChooser({ say }: { say: (t: string) => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => savedTheme());
  return (
    <div className="px-4 py-3" data-setting-theme>
      <span className="block text-[15px] font-semibold text-zinc-900">Colour theme</span>
      <span className="block text-[13px] text-zinc-500 mb-2.5">
        Just this phone. Ticks, aisles and buttons keep their colours.
      </span>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => {
          const on = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTheme(t.id);
                applyTheme(t.id, true);
                say(`Colour theme: ${t.name}`);
              }}
              aria-pressed={on}
              className={`text-left rounded-xl border-2 p-1.5 cursor-pointer ${on ? 'border-emerald-600' : 'border-zinc-200'}`}
              data-theme-choice={t.id}
            >
              {/* A little screen in that theme (fixed colours, so each looks like itself) */}
              <span
                className="block rounded-lg overflow-hidden border border-black/5"
                style={{ background: t.page }}
                aria-hidden="true"
              >
                <span className="block h-3.5" style={{ background: t.bar }} />
                <span className="flex gap-1 p-1.5">
                  <span className="h-2 flex-1 rounded-sm bg-white/90" />
                  <span className="h-2 w-5 rounded-sm" style={{ background: t.accent }} />
                </span>
                {t.id === 'tabs' && (
                  <span className="flex h-1.5">
                    {['#f59e0b', '#10b981', '#3b82f6', '#f97316', '#06b6d4'].map((c) => (
                      <span key={c} className="flex-1" style={{ background: c }} />
                    ))}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 mt-1.5 px-0.5">
                <span className={`text-sm font-semibold ${on ? 'text-emerald-800' : 'text-zinc-900'}`}>{t.name}</span>
                {on && <Check className="w-3.5 h-3.5 text-emerald-700" />}
              </span>
              <span className="block text-[11px] text-zinc-500 px-0.5 leading-tight">{t.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ThisPhone({ who, say }: { who: string; say: (t: string) => void }) {
  const [hasKey, setHasKey] = useState(() => !!getGeminiApiKey());
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; message?: string } | null>(null);
  const runTest = async (k: string) => {
    setTest({ busy: true });
    setTest(await testGeminiKeyApi(k));
  };
  return (
    <section data-settings-phone>
      <h3 className={sectionTitle}>This phone</h3>
      <div className={card}>
        <div className={row} data-setting-who>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Who's using this phone</span>
            <span className="block text-[13px] text-zinc-500">Shown on what you add and tick</span>
          </span>
          <Segmented
            value={who as 'P' | 'R'}
            options={[
              { id: 'P', label: 'Peter' },
              { id: 'R', label: 'Rachel' },
            ]}
            onChange={(v) => {
              setCurrentDeviceIdentity(v);
              say(`This is ${v === 'P' ? "Peter's" : "Rachel's"} phone`);
            }}
            attr="who"
          />
        </div>
        <ThemeChooser say={say} />
        <div className="px-4 py-3" data-setting-gemini>
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-zinc-900">Gemini key</span>
              <span
                className={`block text-[13px] ${test && !test.busy ? (test.ok ? 'text-emerald-700' : 'text-rose-700') : 'text-zinc-500'}`}
                data-gemini-status
              >
                {test?.busy
                  ? 'Checking…'
                  : test?.message
                    ? test.message
                    : hasKey
                      ? 'Saved on this phone'
                      : 'Not added: needed for importing recipes and asking questions'}
              </span>
            </span>
            {!editing && hasKey && (
              <button
                type="button"
                onClick={() => void runTest(getGeminiApiKey() || '')}
                disabled={test?.busy}
                className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer disabled:opacity-50"
                data-gemini-test
              >
                Test it
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setKey('');
                  setTest(null);
                }}
                className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
                data-gemini-edit
              >
                {hasKey ? 'Change' : 'Add'}
              </button>
            )}
          </div>
          {editing && (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste the key (starts AIza…)"
                autoComplete="off"
                className="w-full h-11 rounded-xl border border-zinc-300 px-3 text-base outline-none focus:border-emerald-500"
                data-gemini-input
                aria-label="Gemini key"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!key.trim()}
                  onClick={() => {
                    saveGeminiApiKey(key);
                    setHasKey(true);
                    setEditing(false);
                    say('Gemini key saved');
                    void runTest(key);
                  }}
                  className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 cursor-pointer"
                  data-gemini-save
                >
                  Save and test
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                {hasKey && (
                  <button
                    type="button"
                    onClick={() => {
                      clearGeminiApiKey();
                      setHasKey(false);
                      setEditing(false);
                      setTest(null);
                      say('Gemini key removed from this phone');
                    }}
                    className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer"
                    data-gemini-remove
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Get a free key at{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google AI Studio
                </a>
                . Each phone needs its own copy: it's kept only on this phone and never synced.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
