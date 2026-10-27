/**
 * Settings → Notifications & calendar, at the top: how the pieces fit together. The reminders are
 * the same on both phones; each phone gets them as notifications or as calendar alerts. Each row
 * says how it's set now and jumps to its section below.
 */
import React from 'react';
import { Bell, CalendarSync, AlarmClock, ChevronDown } from 'lucide-react';
import { reminderSettings } from '../../reminderSettings';
import { UserPreferences } from '../../types';
import { card, row, sectionTitle } from './parts';
import { SettingsTabProps } from './types';

function Step({
  icon,
  title,
  sub,
  status,
  good,
  target,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  status: string;
  good: boolean;
  target: string;
}) {
  return (
    <button
      type="button"
      onClick={() => document.querySelector(`[${target}]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className={`${row} cursor-pointer hover:bg-zinc-50`}
      data-alerts-step={target.replace('data-settings-', '')}
    >
      <span className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900">{title}</span>
        <span className="block text-[13px] text-zinc-500">{sub}</span>
      </span>
      <span
        className={`text-[12px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
      >
        {status}
      </span>
      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
    </button>
  );
}

export function AlertsOverview({ store, pushOn }: { store: SettingsTabProps['store']; pushOn: boolean }) {
  const prefs: Partial<UserPreferences> = store.state.preferences || {};
  const s = reminderSettings(prefs);
  const remindersOn = [s.morning, s.cook, s.prep, s.plan].filter(Boolean).length;
  const calendarOn = Boolean(prefs.calendarSync) && Boolean(store.githubConfig);

  return (
    <section data-settings-overview>
      <h3 className={sectionTitle}>How it works</h3>
      <p className="text-[13px] text-zinc-500 px-1 -mt-1 mb-1.5">
        Choose what you're reminded about, then how this phone gets it: as notifications, or as alerts in your calendar.
      </p>
      <div className={card}>
        <Step
          icon={<AlarmClock className="w-5 h-5" />}
          title="1. Reminders"
          sub="What you're reminded about, on both phones"
          status={`${remindersOn} of 4 on`}
          good={remindersOn > 0}
          target="data-settings-reminders"
        />
        <Step
          icon={<Bell className="w-5 h-5" />}
          title="2. Notifications"
          sub="Reminders and shopping list news on this phone"
          status={pushOn ? 'On' : 'Off'}
          good={pushOn}
          target="data-settings-notifications"
        />
        <Step
          icon={<CalendarSync className="w-5 h-5" />}
          title="3. Calendar"
          sub="The planned meals in your own calendar"
          status={calendarOn ? 'Syncing' : 'Off'}
          good={calendarOn}
          target="data-settings-calendar"
        />
      </div>
    </section>
  );
}
