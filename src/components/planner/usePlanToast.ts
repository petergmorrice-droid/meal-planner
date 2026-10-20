/** Planning's short message at the bottom (with Undo or "See the list" when there's something to do). */
import { useEffect, useState } from 'react';

export type ToastAction = { label: string; run: () => void };

export function usePlanToast() {
  const [toastMessage, setToastMessageState] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const setToastMessage = (msg: string | null, action: ToastAction | null = null) => {
    setToastMessageState(msg);
    setToastAction(action);
  };

  // Gone by itself after a few seconds (longer when it offers Undo).
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), toastAction ? 6000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, toastAction]);

  return { toastMessage, toastAction, setToastMessage };
}
