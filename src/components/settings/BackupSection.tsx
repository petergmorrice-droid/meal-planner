/** Settings → Backup & reset: download and restore everything, the products file, and the resets. */
import { useRef, useState } from 'react';
import { Check, Download, Upload } from 'lucide-react';
import { GroceryItem } from '../../types';
import { formatDateISO } from '../../utils';
import { agoText, backupSummary } from '../../settingsInfo';
import { Sheet, card, row, sectionTitle } from './parts';
import { Confirm, SettingsTabProps } from './types';

const LAST_BACKUP_KEY = 'last_backup_at';

export function BackupSection({
  store,
  catalog,
  say,
  setConfirm,
}: {
  store: SettingsTabProps['store'];
  catalog: GroceryItem[];
  say: (t: string) => void;
  setConfirm: (c: Confirm) => void;
}) {
  const [last, setLast] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_BACKUP_KEY);
    } catch {
      return null;
    }
  });
  const [restore, setRestore] = useState<{ name: string; text: string; parts: string[] } | null>(null);
  const [badFile, setBadFile] = useState('');
  const productsInput = useRef<HTMLInputElement>(null);

  const download = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const backup = () => {
    download(store.exportAllData(), `meal-planner-backup-${formatDateISO(new Date())}.json`);
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      /* fine */
    }
    setLast(now);
    say('Backup downloaded');
  };
  const pickRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const s = backupSummary(text);
      if (!s.ok) {
        setBadFile(`“${file.name}” isn't a backup from this app.`);
        return;
      }
      setBadFile('');
      setRestore({ name: file.name, text, parts: s.parts });
    };
    reader.readAsText(file);
  };
  const importProducts = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // A products file: checked field by field, as it may have come from anywhere.
        const arr: unknown = JSON.parse(String(reader.result || ''));
        if (!Array.isArray(arr)) throw new Error('not a list');
        const items: GroceryItem[] = (arr as (FileProduct | null)[])
          .filter(
            (x): x is FileProduct & { name: string } =>
              !!x && typeof x.name === 'string' && !!x.name.trim() && !x.removed,
          )
          .map((x, i: number) => ({
            id: typeof x.id === 'string' ? x.id : `gdb-imported-${i}-${Date.now()}`,
            name: x.name.trim(),
            category: typeof x.category === 'string' ? x.category : '',
            unit: typeof x.unit === 'string' ? x.unit : 'each',
            increment: typeof x.increment === 'number' ? Math.max(0.01, x.increment) : 1,
            ...(Array.isArray(x.aliases) && x.aliases.length
              ? { aliases: x.aliases.filter((a): a is string => typeof a === 'string') }
              : {}),
            ...(Array.isArray(x.hiddenAliases) && x.hiddenAliases.length
              ? { hiddenAliases: x.hiddenAliases.filter((a): a is string => typeof a === 'string') }
              : {}),
          }));
        if (!items.length) throw new Error('empty');
        setConfirm({
          title: `Replace your products with ${items.length} from the file?`,
          body: "The Shop will use these to turn recipe amounts into things you buy. Products that aren't in the file are taken off (on both phones).",
          action: 'Replace products',
          run: () => {
            if (store.replaceProducts) store.replaceProducts(items);
            else store.updateGroceryDatabase?.(items);
            say(`${items.length} products loaded`);
          },
        });
      } catch {
        say("That file isn't a products list");
      }
    };
    reader.readAsText(file);
  };

  return (
    <section data-settings-backup>
      <h3 className={sectionTitle}>Backup &amp; reset</h3>
      <div className={card}>
        <div className={row}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Download a backup</span>
            <span className="block text-[13px] text-zinc-500" data-last-backup>
              {last ? `Last downloaded on this phone ${agoText(last)}` : 'Never downloaded on this phone'}
            </span>
          </span>
          <button
            type="button"
            onClick={backup}
            className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            data-backup-download
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
        <label className={`${row} cursor-pointer`}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Restore from a backup…</span>
            <span className={`block text-[13px] ${badFile ? 'text-rose-700' : 'text-zinc-500'}`}>
              {badFile || "Shows what's in the file before anything changes"}
            </span>
          </span>
          <Upload className="w-4 h-4 text-zinc-500" />
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickRestore(f);
              e.target.value = '';
            }}
            data-restore-input
          />
        </label>
        <div className="px-4 py-3">
          <span className="block text-[15px] font-semibold text-zinc-900">Products list</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                download(
                  JSON.stringify(
                    catalog.map(({ lastModifiedAt: _t, notSameAs: _n, ...rest }) => rest),
                    null,
                    2,
                  ),
                  `products-${formatDateISO(new Date())}.json`,
                );
                say('Products downloaded');
              }}
              className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
              data-products-download
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => productsInput.current?.click()}
              className="h-9 px-3 rounded-xl border border-zinc-300 text-sm font-semibold cursor-pointer"
            >
              Load from a file…
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: 'Go back to the built-in products?',
                  body: "The app's own products go back to how they come (aisles, how they're sold, other names), any you took off come back, and products you added are taken off, on both phones.\nRecipes linked to products you added are matched by name again.",
                  action: 'Use built-in list',
                  danger: true,
                  run: () => {
                    store.resetProducts?.();
                    say('Products reset');
                  },
                })
              }
              className="h-9 px-3 rounded-xl text-sm font-semibold text-rose-700 cursor-pointer"
              data-products-reset
            >
              Reset to built-in
            </button>
            <input
              ref={productsInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importProducts(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setConfirm({
              title: 'Reset settings?',
              body: 'People, eating time, appliance and how recipe cards look go back to how they started.\nYour recipes, plans, lists, freezer, staples, aisle order and past shops are kept.',
              action: 'Reset settings',
              danger: true,
              run: () => {
                store.resetPreferences();
                say('Settings reset');
              },
            })
          }
          className={`${row} text-sm font-semibold text-rose-700 cursor-pointer`}
          data-settings-reset
        >
          Reset settings…
        </button>
      </div>

      {restore && (
        <Sheet label="Restore from a backup" onClose={() => setRestore(null)}>
          <div className="p-4" data-restore-sheet>
            <h3 className="text-lg font-bold text-zinc-900">Restore this backup?</h3>
            <p className="text-sm text-zinc-500 mt-0.5 break-all">{restore.name}</p>
            <ul className="mt-3 space-y-1 text-[15px] text-zinc-800" data-restore-parts>
              {restore.parts.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              This replaces everything on this phone
              {store.githubConfig ? ', and then the other phone too when it syncs' : ''}. Download a backup first if
              you're not sure.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRestore(null)}
                className="flex-1 h-12 rounded-xl border border-zinc-300 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = store.importAllData(restore.text);
                  setRestore(null);
                  say(ok ? 'Backup restored' : "Couldn't restore that file");
                }}
                className="flex-1 h-12 rounded-xl bg-rose-600 text-white font-semibold cursor-pointer"
                data-restore-ok
              >
                Replace and restore
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}
/** A product as read from a products file (any field may be missing or the wrong kind). */
interface FileProduct {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  unit?: unknown;
  increment?: unknown;
  aliases?: unknown;
  hiddenAliases?: unknown;
  removed?: unknown;
}
