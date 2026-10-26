// "Test in 45 seconds" (Settings → Notifications): a background function, so it keeps running after
// it has answered (an ordinary function is stopped after about 30 seconds, or when the phone that
// asked closes the app). Netlify answers the phone straight away; this waits, then sends the test to
// every phone in the household.
// The phone sends it as plain text, so the browser doesn't first ask whether it may (a background
// function can't answer that); it doesn't need to read the answer.
import type { Config } from '@netlify/functions';
import { TEST_DELAY_S, handle } from '../push-core.mts';
import { dataStore, phoneStore, sender, signingKeys } from '../push-wiring.mts';

export default async (req: Request) => {
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(await req.text());
  } catch {
    console.warn('push test-later: not JSON');
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_S * 1000));
  const keys = await signingKeys();
  const sent = await handle(
    'notify',
    { ...body, test: true },
    { store: phoneStore(), data: dataStore(), send: sender(keys) },
  );
  console.log(`push test-later: ${sent.status} ${JSON.stringify(sent.body)}`);
};

export const config: Config = {
  path: '/api/test-later',
  background: true,
};
