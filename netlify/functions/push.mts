// The meal planner's notification sender (Netlify Function): /api/key, /api/subscribe,
// /api/unsubscribe, /api/notify, /api/test-later and /api/schedule. The logic is in
// ../push-core.mts and the Netlify wiring in ../push-wiring.mts. ALLOWED_ORIGINS (optional
// environment variable, comma-separated) says where the app is served from.
import type { Config } from '@netlify/functions';
import { TEST_DELAY_S, handle } from '../push-core.mts';
import { dataStore, phoneStore, sender, signingKeys } from '../push-wiring.mts';

// The app is served from GitHub Pages, a different address, so the browser needs to be told it may call this.
function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Netlify.env.get('ALLOWED_ORIGINS') || 'https://petergmorrice-droid.github.io')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: cors });
  const action = new URL(req.url).pathname.split('/').pop() || '';
  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Send JSON.' }, { status: 400, headers: cors });
  }
  try {
    const keys = await signingKeys();
    if (action === 'key') return Response.json({ publicKey: keys.publicKey }, { headers: cors });
    const deps = { store: phoneStore(), data: dataStore(), send: sender(keys) };
    if (action === 'test-later') {
      // A test that arrives with the app closed: wait, then send, then answer. The phone doesn't wait
      // for the answer (it may be closed by then); waiting here keeps the function running until it's sent.
      const check = await handle('notify', { ...body, test: true, body: 'x' }, { ...deps, send: async () => 200 });
      if (check.status !== 200) return Response.json(check.body, { status: check.status, headers: cors });
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_S * 1000));
      const sent = await handle('notify', { ...body, test: true }, deps);
      console.log(`push test-later: ${JSON.stringify(sent.body)}`);
      return Response.json({ ...sent.body, in: TEST_DELAY_S }, { status: sent.status, headers: cors });
    }
    const result = await handle(action, body, deps);
    if (action === 'notify') console.log(`push notify: ${JSON.stringify(result.body)}`);
    return Response.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    console.error(`push ${action} failed:`, err);
    return Response.json({ error: 'Something went wrong sending notifications.' }, { status: 500, headers: cors });
  }
};

export const config: Config = {
  path: ['/api/key', '/api/subscribe', '/api/unsubscribe', '/api/notify', '/api/test-later', '/api/schedule'],
  method: ['POST', 'OPTIONS'],
};
