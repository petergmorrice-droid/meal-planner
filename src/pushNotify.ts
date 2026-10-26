// Notifications when someone adds things to the shopping list (Settings → Notifications).
// The phones sign up with the notification sender on Netlify (netlify/functions/push.mts) under a
// household key kept in the synced settings. Adding things by hand on one phone tells the other
// phones straight away; each notification replaces the last one and lists everything added in the
// last few minutes ("Rachel added milk, eggs and bin bags"), so a run of additions doesn't pile up.
import { personName } from './components/PersonMark';
import type { ShoppingListItem } from './types';
import type { ScheduledNote } from './pushSchedule';

/** The notification sender. */
export const PUSH_API = 'https://morrice-meal-planner-push.netlify.app/api';
/** A notification lists what was added in this long (each one replaces the last on the other phone). */
export const RECENT_MS = 10 * 60 * 1000;
/** Remembered on the phone: this phone has notifications on. */
const LS_ON = 'mp-push-on';

/** A new household key: 32 random hex characters. */
export function newHouseholdKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What was added by hand in one change to the list: lines that are new, typed or browsed in (or a
 * recipe's ingredients added). Meal ingredients and staples from Send to list don't count, and
 * nor does a change that also took lines away (moving things to another week). `seen` is every
 * line id this phone has had, so Undo putting a removed line back doesn't count either.
 */
export function addedByHand(
  before: ShoppingListItem[],
  after: ShoppingListItem[],
  seen: Set<string>,
): ShoppingListItem[] {
  const had = new Set(before.map((i) => i.id));
  const now = new Set(after.map((i) => i.id));
  if (before.some((i) => !now.has(i.id))) return [];
  return after.filter((i) => !had.has(i.id) && !seen.has(i.id) && (i.isAdhoc || i.isBatch));
}

/** "milk, eggs and bin bags"; "milk, eggs, bin bags and 3 more". */
export function listNames(names: string[], max = 5): string {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  const shown = unique.slice(0, max);
  const more = unique.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length <= 1) return shown[0] || '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The message for things added: "Rachel added Milk, Eggs and the ingredients for Lasagne". */
export function addedMessage(who: string, items: ShoppingListItem[]): string {
  const recipes = Array.from(
    new Set(items.filter((i) => i.isBatch && i.batchRecipeName).map((i) => i.batchRecipeName!)),
  );
  const names = [
    ...items.filter((i) => !(i.isBatch && i.batchRecipeName)).map((i) => i.name),
    ...recipes.map((r) => `the ingredients for ${r}`),
  ];
  return `${personName(who) || 'Someone'} added ${listNames(names)}`;
}

async function post(action: string, body: unknown, keepalive = false): Promise<Record<string, unknown>> {
  const res = await fetch(`${PUSH_API}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `The notification sender said no (${res.status}).`);
  return data;
}

// ---------- Sending: things added on this phone ----------

let recent: { household: string; who: string; items: ShoppingListItem[]; last: number } | null = null;

/** Things added by hand on this phone: tell the other phones now, with whatever else was added just before. */
export function queueAdded(household: string, who: string, items: ShoppingListItem[]) {
  if (!household || !items.length) return;
  const now = Date.now();
  const carryOn = recent && recent.household === household && recent.who === who && now - recent.last < RECENT_MS;
  recent = { household, who, items: [...(carryOn ? recent!.items : []), ...items], last: now };
  post('notify', { household, from: who, body: addedMessage(who, recent.items) }, true).catch((err) =>
    console.warn('Notification not sent:', err),
  );
}

/** Every list line this phone has had (see addedByHand). */
const seenIds = new Set<string>();

/**
 * Called by the store with each change made on this phone: anything added by hand is queued to
 * tell the other phones (when the household has notifications set up).
 */
export function listChanged(
  before: ShoppingListItem[],
  after: ShoppingListItem[],
  household: string | undefined,
  who: string,
) {
  const added = addedByHand(before, after, seenIds);
  for (const i of before) seenIds.add(i.id);
  for (const i of after) seenIds.add(i.id);
  if (household && added.length) queueAdded(household, who, added);
}

// ---------- This phone getting notifications ----------

export type PushSupport = 'ok' | 'home-screen' | 'unsupported';

/** Can this phone get notifications? iPhones only from the Home Screen app (iOS 16.4 on). */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'home-screen';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported';
  return 'ok';
}

export function pushOnHere(): boolean {
  try {
    return localStorage.getItem(LS_ON) === '1';
  } catch {
    return false;
  }
}
function rememberOn(on: boolean) {
  try {
    if (on) localStorage.setItem(LS_ON, '1');
    else localStorage.removeItem(LS_ON);
  } catch {
    /* private browsing: asked again next time */
  }
}

const keyBytes = (base64url: string) => {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

async function registration(): Promise<ServiceWorkerRegistration> {
  const ready = navigator.serviceWorker.ready;
  const late = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("The app's offline helper isn't running: close the app and open it again.")),
      10000,
    ),
  );
  return Promise.race([ready, late]);
}

/** Turn notifications on for this phone: asks permission, signs up with the sender. */
export async function enablePush(household: string, who: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      permission === 'denied'
        ? "Notifications are blocked for this app: allow them in the phone's settings, then try again."
        : "Notifications weren't allowed.",
    );
  const reg = await registration();
  const { publicKey } = (await post('key', {})) as { publicKey?: string };
  if (!publicKey) throw new Error("The notification sender didn't answer properly. Try again in a minute.");
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await post('subscribe', { household, who, subscription: sub.toJSON() });
  rememberOn(true);
}

/** Turn notifications off for this phone. */
export async function disablePush(household: string): Promise<void> {
  rememberOn(false);
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('unsubscribe', { household, subscription: sub.toJSON() }).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

/** A test notification to every phone signed up, this one included. Says how many it reached. */
export async function sendTest(household: string, who: string): Promise<number> {
  const res = await post('notify', {
    household,
    from: who,
    test: true,
    title: 'Meal planner',
    body: `Test from ${personName(who) || 'the meal planner'}: notifications are working.`,
  });
  return Number(res.sent) || 0;
}

/** How long the delayed test waits (netlify/push-core.mts TEST_DELAY_S). */
export const TEST_LATER_S = 45;

/**
 * A test sent in about 45 seconds: close the app to check notifications arrive with it closed. The
 * sender holds the request until it has sent the test, so this doesn't wait for its answer (the
 * request carries on with the app closed).
 */
export function sendTestLater(household: string, who: string): number {
  post(
    'test-later',
    {
      household,
      from: who,
      title: 'Meal planner',
      body: `Delayed test from ${personName(who) || 'the meal planner'}: notifications work with the app closed.`,
    },
    true,
  ).catch((err) => console.warn('Delayed test not sent:', err));
  return TEST_LATER_S;
}

// ---------- The morning notifications' schedule ----------

const LS_SCHEDULE = 'mp-push-schedule';

/**
 * Send the sender the coming days' morning notifications, when they've changed since this phone last
 * sent them (either phone can: both work it out from the same synced plan).
 */
export async function uploadSchedule(household: string, notes: ScheduledNote[]): Promise<boolean> {
  const sig = `${household}|${JSON.stringify(notes)}`;
  try {
    if (localStorage.getItem(LS_SCHEDULE) === sig) return false;
  } catch {
    /* private browsing: just send it */
  }
  await post('schedule', { household, notes });
  try {
    localStorage.setItem(LS_SCHEDULE, sig);
  } catch {
    /* sent again next time */
  }
  return true;
}
