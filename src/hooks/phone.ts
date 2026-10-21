/** Small phone helpers for shopping mode: online/offline, a buzz, keeping the screen on. */
import { useState, useEffect } from 'react';

/** Is the phone online? (Ticks are kept on the phone either way.) */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** A little buzz on phones that can (Android); nothing elsewhere. */
export const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
};

/** Keep the phone's screen on while shopping or cooking (where the browser allows it). */
export function useScreenAwake() {
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.wakeLock?.request) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const grab = async () => {
      try {
        if (document.visibilityState !== 'visible' || stopped) return;
        lock = await nav.wakeLock.request('screen');
      } catch {
        /* not allowed here: the screen just sleeps as usual */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void grab();
    };
    void grab();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, []);
}
