// Notifications when someone adds to the list: the Netlify sender's logic (with a fake store and
// fake push service) and how the app picks out and words what was added.
import assert from 'node:assert/strict';
import {
  handle,
  phoneKey,
  validSubscription,
  MAX_PHONES,
  cleanSchedule,
  runSchedule,
  STALE_MS,
} from '../.test-build/push.mjs';
import { addedByHand, addedMessage, listNames, newHouseholdKey } from '../.test-build/push.mjs';

let failures = 0;
let passes = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passes++;
    console.log('PASS', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '\n   ', e.message);
  }
};

const fakeStore = () => {
  const m = new Map();
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    keys: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
  };
};
const H = 'a'.repeat(32);
const sub = (n, host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/phone-${n}`,
  keys: { p256dh: 'BP' + n, auth: 'au' + n },
});

await test('sender: only real push sign-ups are accepted', () => {
  assert.equal(validSubscription(sub(1)), true);
  assert.equal(validSubscription(sub(1, 'web.push.apple.com')), true);
  assert.equal(validSubscription(sub(1, 'evil.example.com')), false, 'never posts anywhere else');
  assert.equal(validSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } }), false);
  assert.equal(validSubscription({ endpoint: sub(1).endpoint }), false, 'needs its keys');
});

await test('sender: phones sign up under the household; others are told, not the one adding', async () => {
  const store = fakeStore();
  const sent = [];
  const send = async (s, payload) => (sent.push([s.endpoint, JSON.parse(payload)]), 201);
  assert.equal(
    (await handle('subscribe', { household: H, who: 'P', subscription: sub(1) }, { store, send })).status,
    200,
  );
  assert.equal(
    (await handle('subscribe', { household: H, who: 'R', subscription: sub(2) }, { store, send })).status,
    200,
  );
  // Signing up again replaces, doesn't add
  const again = await handle('subscribe', { household: H, who: 'R', subscription: sub(2) }, { store, send });
  assert.equal(again.body.phones, 2);
  assert.ok(store.m.has(await phoneKey(H, sub(2).endpoint)));
  const r = await handle('notify', { household: H, from: 'P', body: 'Peter added milk' }, { store, send });
  assert.deepEqual(r.body, { ok: true, sent: 1, gone: 0, failed: 0 });
  assert.equal(sent[0][0], sub(2).endpoint, "Rachel's phone");
  assert.deepEqual(sent[0][1], {
    title: 'Shopping list',
    body: 'Peter added milk',
    tag: 'list-added',
    url: './?tab=shop',
  });
  // A test goes to every phone, yours too
  sent.length = 0;
  const t = await handle('notify', { household: H, from: 'P', body: 'Test', test: true }, { store, send });
  assert.equal(t.body.sent, 2);
  // Another household hears nothing
  sent.length = 0;
  await handle('notify', { household: 'b'.repeat(32), from: 'P', body: 'x' }, { store, send });
  assert.equal(sent.length, 0);
});

await test('sender: phones gone (404/410) are forgotten; failures are counted; unsubscribe removes', async () => {
  const store = fakeStore();
  await handle('subscribe', { household: H, who: 'R', subscription: sub(1) }, { store, send: null });
  await handle('subscribe', { household: H, who: 'R', subscription: sub(2) }, { store, send: null });
  await handle('subscribe', { household: H, who: 'R', subscription: sub(3) }, { store, send: null });
  const send = async (s) => (s.endpoint.endsWith('1') ? 410 : s.endpoint.endsWith('2') ? 500 : 201);
  const r = await handle('notify', { household: H, from: 'P', body: 'x' }, { store, send });
  assert.deepEqual(r.body, { ok: true, sent: 1, gone: 1, failed: 1 });
  assert.equal(store.m.size, 2);
  await handle('unsubscribe', { household: H, subscription: sub(3) }, { store, send });
  assert.equal(store.m.size, 1);
});

await test('sender: bad requests are refused', async () => {
  const store = fakeStore();
  const deps = { store, send: async () => 201 };
  assert.equal((await handle('notify', { household: 'short', from: 'P', body: 'x' }, deps)).status, 400);
  assert.equal((await handle('subscribe', { household: H, who: 'Peter', subscription: sub(1) }, deps)).status, 400);
  assert.equal(
    (await handle('subscribe', { household: H, who: 'P', subscription: sub(1, 'x.com') }, deps)).status,
    400,
  );
  assert.equal((await handle('notify', { household: H, from: 'P', body: '' }, deps)).status, 400);
  assert.equal((await handle('delete-all', { household: H }, deps)).status, 404);
  for (let i = 0; i < MAX_PHONES; i++)
    await handle('subscribe', { household: H, who: 'P', subscription: sub(i) }, deps);
  assert.equal((await handle('subscribe', { household: H, who: 'P', subscription: sub(99) }, deps)).status, 429);
});

const dataStore = () => {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    set: async (k, v) => void m.set(k, JSON.stringify(v)),
    keys: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
  };
};

await test('sender: a schedule is checked, trimmed and stored per household', async () => {
  const now = Date.UTC(2026, 9, 26, 8);
  const note = (id, hours, extra = {}) => ({
    id,
    at: now + hours * 3600e3,
    title: 'Tonight',
    body: 'Chilli',
    ...extra,
  });
  assert.equal(cleanSchedule('nope', now), null);
  assert.equal(cleanSchedule([{ id: 'bad id!', at: now, title: 'x' }], now), null);
  const clean = cleanSchedule(
    [note('b', 30, { tab: 'this_week' }), note('a', 1, { tab: 'evil' }), note('old', -48), note('far', 24 * 60)],
    now,
  );
  assert.deepEqual(
    clean.map((n) => n.id),
    ['a', 'b'],
    'sorted, too old and too far dropped',
  );
  assert.equal(clean[0].tab, undefined, 'only real tabs');
  const data = dataStore();
  const r = await handle(
    'schedule',
    { household: H, notes: [note('a', 1)] },
    { store: fakeStore(), send: null, data, now: () => now },
  );
  assert.deepEqual(r.body, { ok: true, scheduled: 1 });
  assert.equal((await data.get(`schedule/${H}`)).length, 1);
});

await test('sender: every 15 minutes, what is due goes to every phone, once; late ones are skipped', async () => {
  const store = fakeStore();
  const data = dataStore();
  const sent = [];
  const send = async (s, payload) => (sent.push([s.endpoint, JSON.parse(payload)]), 201);
  await handle('subscribe', { household: H, who: 'P', subscription: sub(1) }, { store, send });
  await handle('subscribe', { household: H, who: 'R', subscription: sub(2) }, { store, send });
  const nine = Date.UTC(2026, 9, 27, 8);
  await data.set(`schedule/${H}`, [
    { id: '2026-10-26-dinner', at: nine - 24 * 3600e3, title: "Tonight's dinner", body: 'Old' },
    { id: '2026-10-27-dinner', at: nine, title: "Tonight's dinner", body: 'Chilli con carne.', tab: 'this_week' },
    { id: '2026-10-27-prep', at: nine, title: 'To do tonight', body: 'Take the Lasagne out of the freezer tonight.' },
    { id: '2026-10-28-dinner', at: nine + 24 * 3600e3, title: "Tonight's dinner", body: 'Later' },
  ]);
  assert.deepEqual(await runSchedule({ store, data, send }, nine - 60e3), { households: 1, sent: 0 }, 'not yet');
  const r = await runSchedule({ store, data, send }, nine + 5 * 60e3);
  assert.deepEqual(r, { households: 1, sent: 4 }, 'two notes to both phones');
  assert.deepEqual(sent[0][1], {
    title: "Tonight's dinner",
    body: 'Chilli con carne.',
    tag: '2026-10-27-dinner',
    url: './?tab=this_week',
  });
  sent.length = 0;
  await runSchedule({ store, data, send }, nine + 15 * 60e3);
  assert.equal(sent.length, 0, 'not sent twice');
  // The plan changed at 10:00 (a new note for 9:00): too late, not sent
  await data.set(`schedule/${H}`, [{ id: '2026-10-27-late', at: nine, title: 'x', body: 'y' }]);
  await runSchedule({ store, data, send }, nine + STALE_MS + 60e3);
  assert.equal(sent.length, 0, 'late ones skipped');
});

const line = (id, name, extra = {}) => ({ id, name, amount: 1, unit: '', checked: false, isAdhoc: true, ...extra });

await test('app: only things added by hand count', () => {
  const seen = new Set();
  const before = [line('a', 'Milk'), line('m', 'Onion', { isAdhoc: false })];
  assert.deepEqual(
    addedByHand(before, [...before, line('b', 'Eggs'), line('c', 'Carrot', { isAdhoc: false })], seen).map(
      (i) => i.name,
    ),
    ['Eggs'],
    'meal ingredients from Send to list are not',
  );
  assert.deepEqual(
    addedByHand(
      before,
      [...before, line('r', 'Pasta', { isAdhoc: false, isBatch: true, batchRecipeName: 'Lasagne' })],
      seen,
    ).length,
    1,
    "a recipe's ingredients added are",
  );
  assert.deepEqual(addedByHand(before, [before[1], line('b2', 'Milk')], seen), [], 'moving to another week is not');
  assert.deepEqual(
    addedByHand(before, [...before, line('z', 'Bin bags')], new Set(['z'])),
    [],
    'Undo putting it back is not',
  );
});

await test('app: one message for a few things', () => {
  assert.equal(listNames(['Milk']), 'Milk');
  assert.equal(listNames(['Milk', 'Eggs']), 'Milk and Eggs');
  assert.equal(listNames(['Milk', 'Eggs', 'Milk', 'Bin bags']), 'Milk, Eggs and Bin bags');
  assert.equal(listNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'a, b, c, d, e and 2 more');
  assert.equal(
    addedMessage('R', [
      line('1', 'Milk'),
      line('2', 'Pasta', { isBatch: true, batchRecipeName: 'Lasagne' }),
      line('3', 'Mince', { isBatch: true, batchRecipeName: 'Lasagne' }),
    ]),
    'Rachel added Milk and the ingredients for Lasagne',
  );
  assert.match(newHouseholdKey(), /^[0-9a-f]{32}$/);
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
