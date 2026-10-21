/** Settings → Household: how many you usually cook for, when you usually eat, your usual appliance. */
import { Plus, Minus } from 'lucide-react';
import { parseClock, DEFAULT_EAT_AT } from '../../cookInfo';
import { UserPreferences } from '../../types';
import { Segmented, card, row, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

export function Household({ prefs, store }: { prefs: UserPreferences; store: SettingsTabProps['store'] }) {
  const people = prefs.defaultServings || 2;
  const appliance = (prefs.preferredCookingMethod || 'all') as 'all' | 'oven_hob' | 'ninja';
  return (
    <section data-settings-household>
      <h3 className={sectionTitle}>Household</h3>
      <div className={card}>
        <div className={row} data-setting-people>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">Usually cooking for</span>
            <span className="block text-[13px] text-zinc-500">New meals start with this many people</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                store.updatePreferences((p) => ({ defaultServings: Math.max(1, (p.defaultServings || 2) - 1) }))
              }
              disabled={people <= 1}
              className="w-10 h-10 rounded-xl border border-zinc-300 flex items-center justify-center disabled:opacity-40 cursor-pointer"
              aria-label="One fewer person"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums" data-people-count>
              {people}
            </span>
            <button
              type="button"
              onClick={() =>
                store.updatePreferences((p) => ({ defaultServings: Math.min(12, (p.defaultServings || 2) + 1) }))
              }
              className="w-10 h-10 rounded-xl border border-zinc-300 flex items-center justify-center cursor-pointer"
              aria-label="One more person"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <label className={row} data-setting-eat-at>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-zinc-900">We usually eat at</span>
            <span className="block text-[13px] text-zinc-500">
              The Cook tab says when to start. Change it for one evening there.
            </span>
          </span>
          <input
            id="setting-eat-at"
            type="time"
            value={parseClock(prefs.eatAt) !== null ? prefs.eatAt : DEFAULT_EAT_AT}
            onChange={(e) => {
              if (parseClock(e.target.value) !== null) store.updatePreferences({ eatAt: e.target.value });
            }}
            className="h-10 px-2 bg-white border border-zinc-300 rounded-xl text-base font-bold tabular-nums"
            data-setting-eat-at-input
            aria-label="We usually eat at"
          />
        </label>
        <div className="px-4 py-3" data-setting-appliance>
          <span className="block text-[15px] font-semibold text-zinc-900">Usual appliance</span>
          <span className="block text-[13px] text-zinc-500 mb-2">
            Cooking mode and start times use these steps when a recipe has both
          </span>
          <Segmented
            value={appliance}
            options={[
              { id: 'oven_hob', label: 'Oven & hob' },
              { id: 'ninja', label: 'Ninja' },
              { id: 'all', label: 'Either' },
            ]}
            onChange={(v) => store.updatePreferences({ preferredCookingMethod: v })}
            attr="appliance"
          />
        </div>
      </div>
    </section>
  );
}
