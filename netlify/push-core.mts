// The notification sender's logic (netlify/functions/push.mts wires it to Netlify Blobs and web-push).
// Each phone that turns notifications on is saved under its household (a long random key both phones
// share through the synced app data), one entry per phone. When a phone adds things to the list, it
// asks for the household to be told: every other phone in it gets a push notification.

/** A phone's push sign-up, as the browser gives it (PushSubscription.toJSON()). */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SavedPhone {
  /** Who uses the phone ('P' or 'R'), so they aren't told about their own additions. */
  who: string;
  subscription: PushSubscriptionJSON;
  savedAt: number;
}

/** Where the sign-ups are kept (a Netlify Blobs store in production). */
export interface PhoneStore {
  get(key: string): Promise<SavedPhone | null>;
  set(key: string, phone: SavedPhone): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/** Sends one notification; resolves with the push service's status code (404/410 = phone gone). */
export type Sender = (subscription: PushSubscriptionJSON, payload: string) => Promise<number>;

/** At most this many phones per household (two people, a few new phones over the years). */
export const MAX_PHONES = 10;

const HOUSEHOLD = /^[0-9a-f]{32,64}$/;
const WHO = /^[A-Z]$/;
/** Only the browsers' own push services: the sender never posts anywhere else. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^web\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function validSubscription(s: unknown): s is PushSubscriptionJSON {
  const sub = s as PushSubscriptionJSON | null;
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return false;
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return false;
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) return false;
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** One entry per phone: the household, then a hash of the phone's push address. */
export const phoneKey = async (household: string, endpoint: string) =>
  `${household}/${(await sha256Hex(endpoint)).slice(0, 40)}`;

type Result = { status: number; body: Record<string, unknown> };
const bad = (error: string, status = 400): Result => ({ status, body: { error } });

/** Handle one request to /api/<action> with its JSON body. */
export async function handle(
  action: string,
  body: Record<string, unknown> | null,
  deps: { store: PhoneStore; send: Sender; now?: () => number },
): Promise<Result> {
  const { store, send } = deps;
  const household = String(body?.household ?? '');
  if (!HOUSEHOLD.test(household)) return bad('Unknown household.');

  if (action === 'subscribe') {
    const who = String(body?.who ?? '');
    if (!WHO.test(who)) return bad('Say who uses this phone.');
    if (!validSubscription(body?.subscription)) return bad('That is not a push sign-up from a browser.');
    const subscription = body.subscription as PushSubscriptionJSON;
    const key = await phoneKey(household, subscription.endpoint);
    const existing = await store.keys(`${household}/`);
    if (!existing.includes(key) && existing.length >= MAX_PHONES) return bad('Too many phones signed up.', 429);
    await store.set(key, {
      who,
      subscription: { endpoint: subscription.endpoint, keys: subscription.keys },
      savedAt: (deps.now ?? Date.now)(),
    });
    return { status: 200, body: { ok: true, phones: existing.includes(key) ? existing.length : existing.length + 1 } };
  }

  if (action === 'unsubscribe') {
    const endpoint = (body?.subscription as PushSubscriptionJSON | undefined)?.endpoint;
    if (typeof endpoint !== 'string') return bad('Which phone?');
    await store.delete(await phoneKey(household, endpoint));
    return { status: 200, body: { ok: true } };
  }

  if (action === 'notify') {
    const from = String(body?.from ?? '');
    const title = String(body?.title ?? 'Shopping list').slice(0, 80);
    const text = String(body?.body ?? '').slice(0, 300);
    const test = body?.test === true;
    if (!text) return bad('Nothing to say.');
    const payload = JSON.stringify({ title, body: text, tag: test ? 'test' : 'list-added', url: './?tab=shop' });
    let sent = 0;
    let gone = 0;
    let failed = 0;
    for (const key of await store.keys(`${household}/`)) {
      const phone = await store.get(key);
      if (!phone) continue;
      // Not your own phone: unless it's a test, which goes to every phone so you can check yours too.
      if (!test && phone.who === from) continue;
      try {
        const status = await send(phone.subscription, payload);
        if (status === 404 || status === 410) {
          await store.delete(key); // the phone turned notifications off or the app was removed
          gone++;
        } else if (status >= 200 && status < 300) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { status: 200, body: { ok: true, sent, gone, failed } };
  }

  return bad('Unknown action.', 404);
}
