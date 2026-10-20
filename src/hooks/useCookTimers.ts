import { useEffect, useState } from 'react';
import { CookTimer, newTimer, tickTimers, pauseTimer, resumeTimer, addMinute } from '../cookInfo';

/**
 * Kitchen timers, shared by cooking mode and the timer chips on every tab. They're kept on this
 * phone (so they survive leaving cooking mode or the app reloading) and count from the clock, so
 * they're right after the phone has been asleep. A finished timer rings until you stop it.
 */
const KEY = 'cook_timers';

const load = (): CookTimer[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((t) => t && typeof t.id === 'string') : [];
  } catch { return []; }
};

let timers: CookTimer[] = load();
const listeners = new Set<() => void>();
const save = (next: CookTimer[]) => {
  timers = next;
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* still works this session */ }
  listeners.forEach((l) => l());
};
const update = (id: string, fn: (t: CookTimer) => CookTimer) => save(timers.map((t) => (t.id === id ? fn(t) : t)));

// ---- Sound: an audio context unlocked by a tap (phones only allow sound after one) ----
let audio: AudioContext | null = null;
export function unlockTimerSound() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    void audio?.resume?.();
  } catch { /* no sound on this device */ }
}
function ringOnce() {
  try {
    if (!audio) unlockTimerSound();
    if (audio) {
      const now = audio.currentTime;
      [880, 660, 880].forEach((f, i) => {
        const osc = audio!.createOscillator();
        const gain = audio!.createGain();
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.35, now + i * 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 0.25);
        osc.connect(gain); gain.connect(audio!.destination);
        osc.start(now + i * 0.28); osc.stop(now + i * 0.28 + 0.26);
      });
    }
  } catch { /* ignore */ }
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
}

export const timerActions = {
  start(label: string, minutes: number, recipe?: string): string {
    unlockTimerSound();
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now() + Math.random());
    save([...timers, newTimer(id, label, minutes, Date.now(), recipe)]);
    return id;
  },
  pause: (id: string) => update(id, (t) => pauseTimer(t, Date.now())),
  resume: (id: string) => { unlockTimerSound(); update(id, (t) => resumeTimer(t, Date.now())); },
  addMinute: (id: string) => { unlockTimerSound(); update(id, (t) => addMinute(t, Date.now())); },
  stop: (id: string) => save(timers.filter((t) => t.id !== id)),
};

/** The timers, re-rendering every half second while any is counting or ringing. */
export function useCookTimers() {
  const [, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const active = timers.some((t) => t.state !== 'paused');
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      const next = tickTimers(timers, n);
      if (next !== timers) save(next);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [active]);
  return { timers, now, ...timerActions };
}

/** Rings (sound + buzz) every second and a half while any timer has gone off. Use once. */
export function useTimerAlarm(list: CookTimer[]) {
  const ringing = list.some((t) => t.state === 'ringing');
  useEffect(() => {
    if (!ringing) return;
    ringOnce();
    const iv = setInterval(ringOnce, 1500);
    return () => clearInterval(iv);
  }, [ringing]);
}
