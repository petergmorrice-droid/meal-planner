import { ShoppingListItem } from '../types';

export interface AggregatedQuantity {
  amount: number | string;
  unit: string;
  displayQuantity: string;
}

export function aggregateIngredients(items: ShoppingListItem[]): AggregatedQuantity {
  if (items.length === 0) return { amount: 0, unit: '', displayQuantity: '0' };
  
  const unitGroups: Record<string, number> = {};
  
  items.forEach(item => {
    const unit = (item.unit || '').trim().toLowerCase();
    unitGroups[unit] = (unitGroups[unit] || 0) + (item.amount || 0);
  });

  const units = Object.keys(unitGroups);
  
  // If all units match perfectly
  if (units.length === 1) {
    const u = units[0];
    const val = unitGroups[u];
    return {
      amount: val,
      unit: u,
      displayQuantity: u ? `${val} ${u}` : `${val}`
    };
  }
  
  // Fallback: Clash of units
  const parts = units.map(u => {
    const val = unitGroups[u];
    return u ? `${val} ${u}` : `${val}`;
  });
  
  return {
    amount: parts.join(' + '),
    unit: '', // Mixed units
    displayQuantity: parts.join(' + ')
  };
}
