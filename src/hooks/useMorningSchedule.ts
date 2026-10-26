// Keeps the notification sender's copy of the morning notifications up to date: a little after the
// plan, recipes, freezer or settings change (and on opening), when notifications are set up.
import { useEffect } from 'react';
import type { AppState } from '../types';
import { morningSchedule } from '../pushSchedule';
import { uploadSchedule } from '../pushNotify';

const WAIT_MS = 5000;

export function useMorningSchedule(state: AppState) {
  const { mealPlans, recipes, batches, preferences } = state;
  const household = preferences?.pushHousehold;
  useEffect(() => {
    if (!household) return;
    const t = setTimeout(() => {
      const notes = morningSchedule({ mealPlans, recipes, batches, preferences }, new Date());
      uploadSchedule(household, notes).catch((err) => console.warn('Morning notifications not updated:', err));
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [household, mealPlans, recipes, batches, preferences]);
}
