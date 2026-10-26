// The meal planner's notification sender (Netlify Function): /api/key, /api/subscribe,
// /api/unsubscribe and /api/notify. The logic is in ../push-core.mts; this wires it to Netlify Blobs
// (the phones' sign-ups) and web-push (sending through Apple's and Google's push services).
// Its signing keys are made the first time it's used and kept in its own Blobs store, so the private
// key never leaves Netlify; /api/key gives the app the public half. ALLOWED_ORIGINS (optional
// environment variable, comma-separated) says where the app is served from.
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { handle, type PhoneStore, type SavedPhone, type Sender } from '../push-core.mts';

const STORE = 'push-phones';
const KEYS = 'push-keys';
const SUBJECT = 'https://petergmorrice-droid.github.io/meal-planner/';

interface Keys {
  publicKey: string;
  privateKey: string;
}

/** The sender's signing keys: made once, the first time they're needed. */
async function signingKeys(): Promise<Keys> {
  const store = getStore({ name: KEYS, consistency: 'strong' });
  const saved = (await store.get('vapid', { type: 'json' })) as Keys | null;
  if (saved?.publicKey && saved.privateKey) return saved;
  // Two first requests at once: only one set of keys is kept, and both use it.
  await store.setJSON('vapid', webpush.generateVAPIDKeys(), { onlyIfNew: true });
  return (await store.get('vapid', { type: 'json' })) as Keys;
}

function phoneStore(): PhoneStore {
  // Strong consistency: a phone that just signed up is told about the next addition.
  const blobs = getStore({ name: STORE, consistency: 'strong' });
  return {
    get: async (key) => (await blobs.get(key, { type: 'json' })) as SavedPhone | null,
    set: async (key, phone) => {
      await blobs.setJSON(key, phone);
    },
    delete: (key) => blobs.delete(key),
    keys: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
}

const sender = (keys: Keys): Sender => {
  return async (subscription, payload) => {
    try {
      const res = await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 12,
        urgency: 'normal',
        vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
      });
      return res.statusCode;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (typeof status === 'number') return status;
      throw err;
    }
  };
};

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
    const result = await handle(action, body, { store: phoneStore(), send: sender(keys) });
    return Response.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    console.error(`push ${action} failed:`, err);
    return Response.json({ error: 'Something went wrong sending notifications.' }, { status: 500, headers: cors });
  }
};

export const config: Config = {
  path: ['/api/key', '/api/subscribe', '/api/unsubscribe', '/api/notify'],
  method: ['POST', 'OPTIONS'],
};
