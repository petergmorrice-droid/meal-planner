/** How the Shop list looks on this phone (not shared): grouping, bought to the bottom, one-line rows. */
import { useState } from 'react';

export type ShopViewMode = 'sections' | 'food_type' | 'all';

const save = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* per-phone convenience only */ }
};

export function useShopLayout() {
  // How the list is grouped: by aisle unless you chose otherwise.
  const [viewMode, setViewModeState] = useState<ShopViewMode>(() => {
    try {
      const v = localStorage.getItem('shop_view');
      return v === 'sections' || v === 'all' || v === 'food_type' ? v : 'food_type';
    } catch { return 'food_type'; }
  });
  const setViewMode = (v: ShopViewMode) => {
    setViewModeState(v);
    save('shop_view', v);
  };

  // Shopping mode: ticked things drop to the bottom.
  const [dropCompletedToBottom, setDropCompletedToBottom] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('shop_drop_completed_to_bottom');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const handleToggleDropCompleted = (val: boolean) => {
    setDropCompletedToBottom(val);
    save('shop_drop_completed_to_bottom', String(val));
  };

  // Shopping mode: one-line rows.
  const [compactRows, setCompactRows] = useState<boolean>(() => {
    try { return localStorage.getItem('shop_compact_rows') !== '0'; } catch { return true; }
  });
  const handleCompactRows = (val: boolean) => {
    setCompactRows(val);
    save('shop_compact_rows', val ? '1' : '0');
  };

  return { viewMode, setViewMode, dropCompletedToBottom, handleToggleDropCompleted, compactRows, handleCompactRows };
}
