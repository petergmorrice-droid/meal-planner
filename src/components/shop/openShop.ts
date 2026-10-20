// Shopping mode survives the phone locking or the app closing mid-shop (for a few hours).
const OPEN_SHOP_KEY = 'shop_mode_open';
const OPEN_SHOP_MS = 6 * 3600_000;
export function readOpenShop(): { planId: string; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_SHOP_KEY) || 'null');
    if (v && typeof v.planId === 'string' && typeof v.at === 'number' && Date.now() - v.at < OPEN_SHOP_MS) return v;
  } catch { /* nothing saved */ }
  return null;
}
export const saveOpenShop = (planId: string | null) => {
  try {
    if (planId) localStorage.setItem(OPEN_SHOP_KEY, JSON.stringify({ planId, at: Date.now() }));
    else localStorage.removeItem(OPEN_SHOP_KEY);
  } catch { /* per-phone convenience only */ }
};
