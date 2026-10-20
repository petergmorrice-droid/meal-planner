import { useEffect, useState } from 'react';
import Notice from '../Notice';

export interface ShopToastState { message: string; action?: { label: string; run: () => void } }

/** The Shop's short message (Undo, Edit…): the app's light notice, above shopping mode's bottom bar when that's open. */
export function ShopToast({ toast, onClose, shoppingMode = false }: { toast: ShopToastState; onClose: () => void; shoppingMode?: boolean }) {
  return <Notice text={toast.message} action={toast.action} onDone={onClose} shop placement={shoppingMode ? 'screen' : 'tab'} lift={shoppingMode ? 84 : 12} />;
}

/** The message's state: shown with setToastMessage, gone by itself after a few seconds (longer with a button, e.g. Undo). */
export function useShopToast() {
  const [toast, setToast] = useState<ShopToastState | null>(null);
  const setToastMessage = (message: string | null, action?: ShopToastState['action']) => setToast(message ? { message, action } : null);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.action ? 5000 : 2800);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return { toast, setToast, setToastMessage };
}
