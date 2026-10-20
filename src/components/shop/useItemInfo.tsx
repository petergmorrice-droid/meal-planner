/** (i) on a row: what it's for, what was added and by whom, any note, who ticked it. */
import { useState } from 'react';
import { ShoppingListItem } from '../../types';
import { AggregatedShoppingListItem, shopQuantityText } from '../../shopList';
import { getGroceryAisle } from '../../utils';
import { noteAuthor } from '../../whoChanged';
import { personName } from '../PersonMark';
import ItemInfoSheet, { ItemInfoLine } from './ItemInfoSheet';

/** The (i) panel's lines for a row: meals first, then extra recipes, staples, what was added by hand. */
export function itemInfoLines(
  row: AggregatedShoppingListItem,
  whoName: (id?: string) => string,
  mealBreakdown: (part: ShoppingListItem) => { label: string; amount: string }[],
): ItemInfoLine[] {
  const lines: ItemInfoLine[] = [];
  const order = (p: ShoppingListItem) => (p.isAdhoc && !p.isRecurring && !p.isBatch ? 3 : p.isRecurring ? 2 : p.isBatch ? 1 : 0);
  const parts = [...row.parts].sort((a, b) => order(a) - order(b));
  let sentBy: string | undefined;
  for (const part of parts) {
    if (part.isRecurring) lines.push({ kind: 'staple', text: 'Weekly staple', amount: shopQuantityText(part) });
    else if (part.isBatch) lines.push({ kind: 'extra', text: part.batchRecipeName ? `For ${part.batchRecipeName} (extra recipe)` : 'For an extra recipe', amount: shopQuantityText(part) });
    else if (part.isAdhoc) {
      const who = part.editedBy || part.addedBy;
      const by = whoName(who);
      lines.push({ kind: 'added', text: by ? `Added by ${by}` : 'Added by hand', amount: shopQuantityText(part), who });
    } else {
      const meals = mealBreakdown(part);
      if (meals.length) meals.forEach((m) => lines.push({ kind: 'meal', text: m.label, amount: m.amount || undefined }));
      else lines.push({ kind: 'meal', text: part.recipeNames?.length ? `For ${part.recipeNames.join(', ')}` : 'For your meals', amount: shopQuantityText(part) });
      sentBy = sentBy || part.addedBy;
    }
  }
  if (sentBy && whoName(sentBy)) {
    const firstOther = lines.findIndex((l) => l.kind !== 'meal');
    const line: ItemInfoLine = { kind: 'added', text: `Meals sent to the list by ${whoName(sentBy)}`, who: sentBy };
    if (firstOther === -1) lines.push(line); else lines.splice(firstOther, 0, line);
  }
  if (row.note) { const by = noteAuthor(row.parts); lines.push({ kind: 'note', text: whoName(by) ? `${row.note} (${personName(by)})` : row.note, who: by }); }
  if (row.outOfStock) lines.push({ kind: 'out', text: 'Out of stock at the shop' });
  if (row.checked) lines.push({ kind: 'bought', text: row.checkedBy && whoName(row.checkedBy) ? `Bought · ticked by ${whoName(row.checkedBy)}` : 'Bought', who: row.checkedBy });
  return lines;
}

export function useItemInfo({ currentUser, rows, mealBreakdown, onEdit, clearToast }: {
  currentUser?: string;
  rows: AggregatedShoppingListItem[];
  mealBreakdown: (part: ShoppingListItem) => { label: string; amount: string }[];
  /** "Edit" in the panel (left out in shopping mode). */
  onEdit?: (row: AggregatedShoppingListItem) => void;
  clearToast: () => void;
}) {
  const [infoKey, setInfoKey] = useState<string | null>(null);
  /** "Peter (you)", "Rachel", or '' if it isn't known who. */
  const whoName = (id?: string) => {
    const name = personName(id);
    if (!name) return '';
    return id === currentUser ? `${name} (you)` : name;
  };
  /** (i): the message at the bottom goes, so it can't cover the answer. */
  const openInfo = (row: AggregatedShoppingListItem) => { clearToast(); setInfoKey(row.key); };
  const infoRow = infoKey ? rows.find((r) => r.key === infoKey) || null : null;
  const sheet = infoRow && (
    <ItemInfoSheet
      row={infoRow}
      aisle={getGroceryAisle(infoRow)}
      lines={itemInfoLines(infoRow, whoName, mealBreakdown)}
      onEdit={onEdit ? () => { setInfoKey(null); onEdit(infoRow); } : undefined}
      onClose={() => setInfoKey(null)}
    />
  );
  return { openInfo, sheet };
}
