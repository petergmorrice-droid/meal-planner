import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the newest value, for code that runs later and must not act on an old
 * copy: an Undo tapped a minute after the change, an answer that arrives after a wait, a speech
 * listener set up once. It's updated straight after each render is put on screen (never during
 * the render itself, so a render React throws away can't leave it pointing at the wrong thing).
 *
 * Effects that need the newest value without re-running use React's useEffectEvent instead.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
