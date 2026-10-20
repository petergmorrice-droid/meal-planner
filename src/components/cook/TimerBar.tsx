import React from 'react';
import { Pause, Play, X, BellRing, Timer } from 'lucide-react';
import { CookTimer, timeLeft, timerText } from '../../cookInfo';
import { useCookTimers, useTimerAlarm } from '../../hooks/useCookTimers';

/** One timer: name, time left, pause/resume, +1 min, stop. A finished one flashes "Stop". */
function TimerChip({ t, now, compact }: { key?: React.Key; t: CookTimer; now: number; compact?: boolean }) {
  const { pause, resume, addMinute, stop } = useCookTimers();
  const ringing = t.state === 'ringing';
  if (ringing) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-rose-600 text-white pl-3 pr-1.5 py-1.5 shadow-md animate-pulse" data-timer={t.label} data-timer-ringing>
        <BellRing className="w-4 h-4 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-bold truncate">{t.label}: done!</span>
        <button type="button" onClick={() => addMinute(t.id)} className="shrink-0 h-9 px-2.5 rounded-lg bg-white/20 text-sm font-semibold cursor-pointer" aria-label={`${t.label}: one more minute`}>+1 min</button>
        <button type="button" onClick={() => stop(t.id)} className="shrink-0 h-9 px-3 rounded-lg bg-white text-rose-700 text-sm font-bold cursor-pointer" data-timer-stop>Stop</button>
      </div>
    );
  }
  const left = timeLeft(t, now);
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border pl-3 pr-1 py-1 ${t.state === 'paused' ? 'bg-zinc-50 border-zinc-200' : 'bg-white border-emerald-300'} ${compact ? 'shadow-md' : ''}`} data-timer={t.label}>
      <Timer className={`w-4 h-4 shrink-0 ${t.state === 'paused' ? 'text-zinc-400' : 'text-emerald-600'}`} />
      <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-800 truncate">{t.label}</span>
      <span className={`shrink-0 text-base font-bold tabular-nums ${t.state === 'paused' ? 'text-zinc-400' : 'text-zinc-900'}`} data-timer-left>{timerText(left)}</span>
      {t.state === 'paused' ? (
        <button type="button" onClick={() => resume(t.id)} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label={`Carry on: ${t.label}`}><Play className="w-4 h-4" /></button>
      ) : (
        <button type="button" onClick={() => pause(t.id)} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label={`Pause: ${t.label}`}><Pause className="w-4 h-4" /></button>
      )}
      {!compact && (
        <button type="button" onClick={() => addMinute(t.id)} className="shrink-0 h-9 px-1.5 rounded-lg text-xs font-semibold text-zinc-700 hover:bg-zinc-100 cursor-pointer" aria-label={`${t.label}: one more minute`}>+1</button>
      )}
      <button type="button" onClick={() => stop(t.id)} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 cursor-pointer" aria-label={`Stop: ${t.label}`}><X className="w-4 h-4" /></button>
    </div>
  );
}

/** All running timers, in cooking mode (under the header). */
export function TimerBar() {
  const { timers, now } = useCookTimers();
  if (!timers.length) return null;
  return (
    <div className="shrink-0 bg-zinc-50 border-b border-zinc-200 px-3 py-2" data-timer-bar>
      <div className="max-w-2xl mx-auto grid gap-1.5 sm:grid-cols-2">
        {timers.map((t) => <TimerChip key={t.id} t={t} now={now} />)}
      </div>
    </div>
  );
}

/**
 * Timers on every tab (above the menu bar), so one you started while cooking keeps going and
 * rings wherever you are. Also plays the alarm.
 */
export function TimerDock({ hidden = false }: { hidden?: boolean }) {
  const { timers, now } = useCookTimers();
  useTimerAlarm(timers);
  if (!timers.length || hidden) return null;
  return (
    <div className="fixed left-3 right-3 bottom-[84px] z-40 flex flex-col items-end gap-1.5 pointer-events-none" data-timer-dock>
      {timers.slice(0, 3).map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm"><TimerChip t={t} now={now} compact /></div>
      ))}
    </div>
  );
}
