// The notification sender's logic (netlify/push-wiring.mts wires it to Netlify Blobs and web-push).
// Each phone that turns notifications on is saved under its household (a long random key both phones
// share through the synced app data), one entry per phone. When a phone adds things to the list, it
// asks for the household to be told: every other phone in it gets a push notification.
// The app also sends a schedule of the coming days' morning notifications ("Tonight: chilli", "Take
// the lasagne out of the freezer tonight"); every 15 minutes the sender sends whatever is due.

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

/** Plain JSON storage for the schedules and what's been sent (a Netlify Blobs store in production). */
export interface DataStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/** One notification to send at a set time. `id` stays the same for the same day and kind. */
export interface ScheduledNote {
  id: string;
  /** When, in milliseconds since 1970 (the phone works it out in its own time zone). */
  at: number;
  title: string;
  body: string;
  /** The app's tab to open when tapped. */
  tab?: 'shop' | 'this_week';
}

/** Sends one notification; resolves with the push service's status code (404/410 = phone gone). */
export type Sender = (subscription: PushSubscriptionJSON, payload: string) => Promise<number>;

/** At most this many phones per household (two people, a few new phones over the years). */
export const MAX_PHONES = 10;
/** At most this many scheduled notifications per household (a few weeks of mornings). */
export const MAX_SCHEDULED = 80;
/** A scheduled notification more than this late isn't sent (the plan changed after its time). */
export const STALE_MS = 30 * 60 * 1000;
/** How long the delayed test waits (the function can run for 60 seconds at most). */
export const TEST_DELAY_S = 45;

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

const DAY = 24 * 60 * 60 * 1000;
const TABS = ['shop', 'this_week'];

/** A schedule from the app, checked and trimmed; null if it isn't one. */
export function cleanSchedule(raw: unknown, now: number): ScheduledNote[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ScheduledNote[] = [];
  for (const n of raw as Partial<ScheduledNote>[]) {
    if (!n || typeof n.id !== 'string' || typeof n.at !== 'number' || typeof n.title !== 'string') return null;
    if (!/^[\w:-]{1,60}$/.test(n.id) || !Number.isFinite(n.at)) return null;
    if (n.at < now - DAY || n.at > now + 45 * DAY) continue;
    out.push({
      id: n.id,
      at: n.at,
      title: n.title.slice(0, 80),
      body: String(n.body ?? '').slice(0, 300),
      ...(n.tab && TABS.includes(n.tab) ? { tab: n.tab } : {}),
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

/** Send to every phone in the household (or all but `except`); forget phones that are gone. */
async function sendToHousehold(
  household: string,
  payload: string,
  deps: { store: PhoneStore; send: Sender },
  except?: string,
): Promise<{ sent: number; gone: number; failed: number }> {
  let sent = 0;
  let gone = 0;
  let failed = 0;
  for (const key of await deps.store.keys(`${household}/`)) {
    const phone = await deps.store.get(key);
    if (!phone || (except && phone.who === except)) continue;
    try {
      const status = await deps.send(phone.subscription, payload);
      if (status === 404 || status === 410) {
        await deps.store.delete(key); // the phone turned notifications off or the app was removed
        gone++;
      } else if (status >= 200 && status < 300) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, gone, failed };
}

const payloadOf = (title: string, body: string, tag: string, tab: string = 'shop') =>
  JSON.stringify({ title, body, tag, url: `./?tab=${tab}` });

/**
 * The every-15-minutes job: for each household, send the scheduled notifications whose time has
 * come (and that aren't too late, or already sent).
 */
export async function runSchedule(
  deps: { store: PhoneStore; data: DataStore; send: Sender },
  now: number,
): Promise<{ households: number; sent: number }> {
  let households = 0;
  let total = 0;
  for (const key of await deps.data.keys('schedule/')) {
    const household = key.slice('schedule/'.length);
    if (!HOUSEHOLD.test(household)) continue;
    households++;
    const notes = (await deps.data.get<ScheduledNote[]>(key)) || [];
    const sentKey = `sent/${household}`;
    const already = (await deps.data.get<{ id: string; at: number }[]>(sentKey)) || [];
    const done = new Set(already.map((s) => s.id));
    const due = notes.filter((n) => n.at <= now && now - n.at <= STALE_MS && !done.has(n.id));
    if (!due.length) continue;
    for (const n of due) {
      const r = await sendToHousehold(household, payloadOf(n.title, n.body, n.id, n.tab), deps);
      total += r.sent;
    }
    // Remember what's been sent for a couple of days, so a changed plan doesn't send it twice.
    const keep = [...already, ...due.map((n) => ({ id: n.id, at: now }))].filter((s) => now - s.at < 3 * DAY);
    await deps.data.set(sentKey, keep);
  }
  return { households, sent: total };
}

type Result = { status: number; body: Record<string, unknown> };
const bad = (error: string, status = 400): Result => ({ status, body: { error } });

/** Handle one request to /api/<action> with its JSON body. */
export async function handle(
  action: string,
  body: Record<string, unknown> | null,
  deps: { store: PhoneStore; send: Sender; data?: DataStore; now?: () => number },
): Promise<Result> {
  const { store } = deps;
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
    // Not your own phone: unless it's a test, which goes to every phone so you can check yours too.
    const r = await sendToHousehold(
      household,
      payloadOf(title, text, test ? 'test' : 'list-added'),
      deps,
      test ? undefined : from,
    );
    return { status: 200, body: { ok: true, ...r } };
  }

  if (action === 'schedule') {
    if (!deps.data) return bad('No schedule storage.', 500);
    const notes = cleanSchedule(body?.notes, (deps.now ?? Date.now)());
    if (!notes) return bad('That is not a schedule.');
    await deps.data.set(`schedule/${household}`, notes);
    return { status: 200, body: { ok: true, scheduled: notes.length } };
  }

  return bad('Unknown action.', 404);
}
