// Every 15 minutes in the morning and from mid-afternoon to the evening: send the reminder notifications
// that are due ("Tonight's dinner: chilli con carne", "Start cooking: chilli con carne", "Take the
// lasagne out of the freezer tonight"). The app keeps each household's schedule up to
// date through /api/schedule; the logic is runSchedule in ../push-core.mts.
import type { Config } from '@netlify/functions';
import { runSchedule } from '../push-core.mts';
import { dataStore, phoneStore, sender, signingKeys } from '../push-wiring.mts';

export default async () => {
  const keys = await signingKeys();
  const r = await runSchedule({ store: phoneStore(), data: dataStore(), send: sender(keys) }, Date.now());
  if (r.sent) console.log(`Scheduled notifications: ${r.sent} sent across ${r.households} households.`);
};

export const config: Config = {
  // Every 15 minutes in two windows: 05:00–11:45 and 14:00–21:45 UTC, which cover 6am–11:45am and
  // 3pm–9:45pm in the UK in both summer (BST, UTC+1) and winter (GMT). The app only schedules
  // reminders in those hours (src/reminderSettings.ts: MORNING_WINDOW and EVENING_WINDOW).
  schedule: '*/15 5-11,14-21 * * *',
};
