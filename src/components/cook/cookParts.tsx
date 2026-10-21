/** Small things cooking mode uses: remembered choices, ingredient lines, spoken messages and the header buttons' shape. */
import type { ReactNode } from 'react';
import { formatCookingAmount } from '../../shopping';
import { Ingredient } from '../../types';

export const METHOD_LABEL: Record<string, string> = { oven_hob: 'Oven/Hob', ninja: 'Ninja' };
export const readPref = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
export const savePref = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? '1' : '0');
  } catch {
    /* per phone */
  }
};

/** "500 g potatoes", "4 pork sausages", "salt" for an ingredient at this scale. */
export function ingredientLine(ing: Ingredient, scale: number): { amount: string; name: string } {
  const amount = formatCookingAmount((Number(ing.amount) || 0) * scale, ing.unit);
  return { amount: amount ? `${amount}${ing.unit ? ` ${ing.unit}` : ''}` : '', name: ing.name };
}

/** One of the round buttons at the top of cooking mode (Big, Read, Voice, Ask). */
export interface HeaderButton {
  key: string;
  label: string;
  on: boolean;
  dim?: boolean;
  icon: ReactNode;
  onClick: () => void;
  attrs: { 'aria-label': string } & Record<`data-${string}`, boolean>;
}
export const NO_LISTEN =
  "Voice commands aren't available here. They work in Chrome on Android and Safari on iPhone (and need internet), not inside some other apps' browsers.";
export const VOICE_HELP =
  'Say next, back, or repeat. Say start the timer, how long left, or stop. Or say question, then ask anything about the recipe.';
export const NO_SPEECH =
  "Reading aloud isn't available here. It works when the app is opened in Chrome or Safari (or added to your home screen), not inside some other apps' browsers.";

/** What's read out for a step: "Step 2 of 4. Boil the potatoes…". */
export function i18nStep(step: number, count: number, text: string) {
  return step === 0 ? text : `Step ${step} of ${count - 1}. ${text}`;
}
