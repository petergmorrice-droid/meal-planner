import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a ticked item stays where it is (crossed out, with Undo) before it moves down. */
export const JUST_TICKED_MS = 4000;

/**
 * Items ticked in the last few seconds. The tick counts straight away (the % goes up), but the
 * row stays put, crossed out with an Undo button, so a mis-tap is easy to put right.
 */
export function useJustTicked(ms: number = JUST_TICKED_MS) {
  const [justTicked, setJustTicked] = useState<Record<string, true>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    [],
  );

  const drop = useCallback((key: string) => {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    setJustTicked((s) => {
      if (!s[key]) return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
  }, []);

  /** Ticked: hold it in place for a few seconds. */
  const hold = useCallback(
    (key: string) => {
      clearTimeout(timers.current[key]);
      setJustTicked((s) => ({ ...s, [key]: true }));
      timers.current[key] = setTimeout(() => drop(key), ms);
    },
    [drop, ms],
  );

  return { justTicked, hold, release: drop };
}
