// Keeps the notification sender's copy of the reminder notifications up to date: a little after the
// plan, recipes, freezer or settings change (and on opening), when notifications are set up.
import { useEffect } from 'react';
import type { AppState } from '../types';
import { notificationSchedule } from '../pushSchedule';
import { uploadSchedule } from '../pushNotify';

const WAIT_MS = 5000;

export function useNotificationSchedule(state: AppState) {
  const { mealPlans, recipes, batches, preferences } = state;
  const household = preferences?.pushHousehold;
  useEffect(() => {
    if (!household) return;
    const t = setTimeout(() => {
      const notes = notificationSchedule({ mealPlans, recipes, batches, preferences }, new Date());
      uploadSchedule(household, notes).catch((err) => console.warn('Reminder notifications not updated:', err));
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [household, mealPlans, recipes, batches, preferences]);
}
