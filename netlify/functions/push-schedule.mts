// Every 15 minutes: send the morning notifications that are due ("Tonight: chilli con carne",
// "Take the lasagne out of the freezer tonight"). The app keeps each household's schedule up to
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
  // Every 15 minutes (UTC; the schedule's times are absolute, so time zones don't matter here).
  schedule: '*/15 * * * *',
};
