import { ShoppingListItem } from '../types';
import { canonicalUnit, formatUnit, formatAmount } from '../shopping';

export interface AggregatedQuantity {
  amount: number | string;
  unit: string;
  displayQuantity: string;
}

/**
 * Add up list rows for the same product in shopping mode. Rows are added only
 * when their units are the same unit ("1 can" + "2 cans" = "3 cans"); otherwise
 * both amounts are shown ("500 g + 1 pack").
 */
export function aggregateIngredients(items: ShoppingListItem[]): AggregatedQuantity {
  if (items.length === 0) return { amount: 0, unit: '', displayQuantity: '0' };

  const groups = new Map<string, number>();
  items.forEach(item => {
    const unit = canonicalUnit(item.unit);
    const amount = typeof item.amount === 'number' && isFinite(item.amount) ? item.amount : 0;
    groups.set(unit, (groups.get(unit) || 0) + amount);
  });

  const show = (unit: string, amount: number) => {
    const label = formatUnit(unit, amount);
    return label ? `${formatAmount(amount)} ${label}` : formatAmount(amount);
  };

  if (groups.size === 1) {
    const [unit, amount] = [...groups.entries()][0];
    const rounded = Math.round(amount * 100) / 100;
    return { amount: rounded, unit: formatUnit(unit, rounded), displayQuantity: show(unit, rounded) };
  }

  const parts = [...groups.entries()].map(([unit, amount]) => show(unit, Math.round(amount * 100) / 100));
  return { amount: parts.join(' + '), unit: '', displayQuantity: parts.join(' + ') };
}
