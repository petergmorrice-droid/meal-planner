import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag and drop that works with a finger as well as a mouse.
 *
 * - Finger: press and hold (about 0.3 s) to pick an item up, then drag it.
 *   Moving before the hold completes is treated as scrolling, so lists still scroll normally.
 * - Mouse: start moving with the button down.
 *
 * Drop targets are any elements with a `data-drop-day="Monday"` (etc.) attribute.
 * The browser's own drag and drop isn't used because phone browsers handle it unreliably.
 */
export interface HoldDragState<T> {
  payload: T;
  label: string;
  over: string | null;
}

interface Session<T> {
  payload: T;
  label: string;
  pointerId: number;
  pointerType: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  timer: number;
  raf: number;
  over: string | null;
  edgeSince: number;
}

interface Options<T> {
  onDrop: (payload: T, target: string) => void;
  /** Hold time before a touch starts dragging. */
  holdMs?: number;
  /** Scrolls this element when dragging near its top or bottom edge. */
  getScrollContainer?: () => HTMLElement | null;
}

const MOUSE_START_PX = 6;
const TOUCH_SLOP_PX = 10;
const EDGE_PX = 48;
/** Rest at the edge this long before the list starts scrolling, so dropping on an edge row doesn't move it away. */
const EDGE_DWELL_MS = 300;

export function useHoldDrag<T>({ onDrop, holdMs = 300, getScrollContainer }: Options<T>) {
  const [drag, setDrag] = useState<HoldDragState<T> | null>(null);
  const session = useRef<Session<T> | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const suppressClickUntil = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const scrollRef = useRef(getScrollContainer);
  scrollRef.current = getScrollContainer;

  const placeGhost = () => {
    const s = session.current;
    const g = ghostRef.current;
    if (s && g) g.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
  };

  const updateOver = () => {
    const s = session.current;
    if (!s) return;
    const el = document.elementFromPoint(s.x, s.y) as HTMLElement | null;
    const target = el?.closest('[data-drop-day]')?.getAttribute('data-drop-day') ?? null;
    if (target !== s.over) {
      s.over = target;
      setDrag((d) => (d ? { ...d, over: target } : d));
    }
  };

  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void; touch: (e: TouchEvent) => void } | null>(null);

  const finish = useCallback((drop: boolean) => {
    const s = session.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    const l = listeners.current;
    if (l) {
      window.removeEventListener('pointermove', l.move);
      window.removeEventListener('pointerup', l.up);
      window.removeEventListener('pointercancel', l.cancel);
      window.removeEventListener('touchmove', l.touch);
    }
    listeners.current = null;
    session.current = null;
    if (s.active) {
      // The tap that ends a drag must not also open the item.
      suppressClickUntil.current = Date.now() + 500;
      document.documentElement.style.removeProperty('user-select');
      document.documentElement.style.removeProperty('-webkit-user-select');
      setDrag(null);
      if (drop && s.over) onDropRef.current(s.payload, s.over);
    }
  }, []);

  useEffect(() => () => finish(false), [finish]);

  const activate = () => {
    const s = session.current;
    if (!s || s.active) return;
    s.active = true;
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    document.documentElement.style.setProperty('user-select', 'none');
    document.documentElement.style.setProperty('-webkit-user-select', 'none');
    window.getSelection?.()?.removeAllRanges();
    setDrag({ payload: s.payload, label: s.label, over: null });
    const loop = () => {
      const cur = session.current;
      if (!cur || !cur.active) return;
      const el = scrollRef.current?.();
      if (el) {
        const r = el.getBoundingClientRect();
        // Only when the finger is inside the list, near its top or bottom (not up in the recipe strip).
        const inside = cur.x >= r.left && cur.x <= r.right && cur.y >= r.top && cur.y <= r.bottom;
        const up = inside && cur.y < r.top + EDGE_PX && el.scrollTop > 0;
        const down = inside && cur.y > r.bottom - EDGE_PX && el.scrollTop < el.scrollHeight - el.clientHeight;
        if (up || down) {
          const now = performance.now();
          if (!cur.edgeSince) cur.edgeSince = now;
          if (now - cur.edgeSince > EDGE_DWELL_MS) {
            const depth = up ? r.top + EDGE_PX - cur.y : cur.y - (r.bottom - EDGE_PX);
            el.scrollTop += (up ? -1 : 1) * Math.max(2, Math.ceil(depth / 6));
            updateOver();
          }
        } else {
          cur.edgeSince = 0;
        }
      }
      cur.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => { placeGhost(); updateOver(); });
  };

  const bind = (payload: T, label: string) => ({
    'data-draggable': 'true',
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || session.current) return;
      const s: Session<T> = {
        payload, label,
        pointerId: e.pointerId, pointerType: e.pointerType,
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
        active: false, timer: 0, raf: 0, over: null, edgeSince: 0,
      };
      session.current = s;
      if (e.pointerType !== 'mouse') s.timer = window.setTimeout(activate, holdMs);

      const move = (ev: PointerEvent) => {
        const cur = session.current;
        if (!cur || ev.pointerId !== cur.pointerId) return;
        cur.x = ev.clientX;
        cur.y = ev.clientY;
        if (!cur.active) {
          const moved = Math.hypot(cur.x - cur.x0, cur.y - cur.y0);
          if (cur.pointerType === 'mouse') {
            if (moved > MOUSE_START_PX) activate();
          } else if (moved > TOUCH_SLOP_PX) {
            finish(false); // they're scrolling, not dragging
          }
          return;
        }
        ev.preventDefault();
        placeGhost();
        updateOver();
      };
      const up = (ev: PointerEvent) => {
        const cur = session.current;
        if (!cur || ev.pointerId !== cur.pointerId) return;
        cur.x = ev.clientX;
        cur.y = ev.clientY;
        if (cur.active) updateOver();
        finish(true);
      };
      const cancel = (ev: PointerEvent) => {
        if (session.current && ev.pointerId === session.current.pointerId) finish(false);
      };
      // Once dragging, stop the page scrolling under the finger.
      const touch = (ev: TouchEvent) => {
        if (session.current?.active && ev.cancelable) ev.preventDefault();
      };
      listeners.current = { move, up, cancel, touch };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('touchmove', touch, { passive: false });
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      // Android opens a menu on long press; the hold is ours.
      if (session.current || Date.now() < suppressClickUntil.current) e.preventDefault();
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  });

  /** Where the ghost starts when it first appears (later moves are applied directly). */
  const ghostStart = () => {
    const s = session.current;
    return s ? `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)` : 'translate(-999px, -999px)';
  };

  return { drag, bind, ghostRef, ghostStart };
}
