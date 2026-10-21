// Talking to Gemini: what the app asks for, the next model when one can't answer, and the plain
// reason when none can. Google is replaced by a stand-in that answers as scripted.
// Run with: npm test
import assert from 'node:assert/strict';
import {
  askGemini,
  geminiFailure,
  geminiDetail,
  testGeminiKeyApi,
  nextAllowanceReset,
  setBusyRetryWait,
  saveGeminiApiKey,
} from '../.test-build/gemini.mjs';

console.warn = () => {}; // each failed try is logged for the phone's console; not needed here
setBusyRetryWait(20);
// The phone's storage (which models are used up today), fresh for each test.
const stored = new Map();
globalThis.localStorage = {
  getItem: (k) => (stored.has(k) ? stored.get(k) : null),
  setItem: (k, v) => stored.set(k, String(v)),
  removeItem: (k) => stored.delete(k),
};
const M = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

let failures = 0,
  passes = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passes++;
    console.log('PASS', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '\n    ', String(e.message).split('\n').slice(0, 8).join('\n     '));
  }
};

// ---- A stand-in for Google: each request gets the next scripted answer ----
let calls = [];
const google = (...answers) => {
  calls = [];
  stored.clear();
  globalThis.fetch = async (url, init) => {
    calls.push({ model: /models\/([^:]+):/.exec(url)?.[1], body: JSON.parse(init.body) });
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error('more requests than expected');
    return answer(init);
  };
};
const json = (status, body) => () => new Response(JSON.stringify(body), { status });
const says = (text, finishReason = 'STOP') =>
  json(200, { candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const quota = (per) =>
  json(429, {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota, please check your plan and billing details.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaId: `GenerateRequestsPer${per}PerProjectPerModel-FreeTier` }],
        },
      ],
    },
  });
const badKey = json(400, {
  error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' },
});
const busy = json(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } });
const neverAnswers = (init) =>
  new Promise((_, reject) =>
    init.signal.addEventListener('abort', () => reject(new DOMException('signal is aborted', 'AbortError'))),
  );
const noSignal = () => {
  throw new TypeError('Failed to fetch');
};
const quick = { thinking: 'low', waitSeconds: 5 };
const failing = async (fn) => {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected it to fail');
};
const page = (e) => geminiFailure(e, 'open that page');

// ---- What the app asks for ----
await test('a quick job: Gemini thinks briefly, and no temperature is sent', async () => {
  google(says('Lemon pasta\nServes 2'));
  const r = await askGemini('k', [{ text: 'Open this page' }], { ...quick, tools: [{ url_context: {} }] });
  assert.equal(r.text, 'Lemon pasta\nServes 2');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-3.8-flash');
  assert.deepEqual(calls[0].body.generationConfig, { thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(calls[0].body.tools, [{ url_context: {} }]);
  assert.doesNotMatch(JSON.stringify(calls[0].body), /temperature/i);
});

await test("writing a recipe: Gemini's own amount of thinking, and a JSON answer", async () => {
  google(says('{"name":"Curry"}'));
  await askGemini('k', [{ text: 'Write a curry' }], {
    systemInstruction: 'You are a chef.',
    responseSchema: { type: 'OBJECT' },
    waitSeconds: 5,
  });
  assert.deepEqual(calls[0].body.generationConfig, {
    responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT' },
  });
  assert.deepEqual(calls[0].body.systemInstruction, { parts: [{ text: 'You are a chef.' }] });
});

// ---- The next model ----
await test("the first model's free allowance is used up: the next answers", async () => {
  google(quota('Day'), says('Lemon pasta'));
  const r = await askGemini('k', [{ text: 'x' }], quick);
  assert.equal(r.text, 'Lemon pasta');
  assert.deepEqual(
    calls.map((c) => c.model),
    M.slice(0, 2),
  );
});

await test("a model used up today isn't asked again until its allowance comes back", async () => {
  google(quota('Day'), says('one'));
  await askGemini('k', [{ text: 'x' }], quick);
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push({ model: /models\/([^:]+):/.exec(url)?.[1] });
    return says('two')();
  };
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'two');
  assert.deepEqual(
    calls.map((c) => c.model),
    ['gemini-3.6-flash'],
    '3.8 Flash skipped',
  );
  const saved = JSON.parse(stored.get('gemini_used_up'));
  assert.ok(saved['gemini-3.8-flash'] > Date.now(), 'remembered until the reset');
  saveGeminiApiKey('new-key');
  assert.equal(stored.get('gemini_used_up'), undefined, 'a new key starts afresh');
});

await test("today's allowance comes back at midnight in California: 8am here (7am in the odd week)", async () => {
  const at = (iso) => new Date(nextAllowanceReset(new Date(iso))).toISOString();
  assert.equal(at('2026-10-21T15:39:00+01:00'), '2026-10-22T07:00:00.000Z'); // 8am BST
  assert.equal(at('2026-10-21T07:30:00+01:00'), '2026-10-21T07:00:00.000Z'); // 8am today
  assert.equal(at('2026-11-02T12:00:00Z'), '2026-11-03T08:00:00.000Z'); // 8am GMT
  assert.equal(at('2026-10-27T12:00:00Z'), '2026-10-28T07:00:00.000Z'); // 7am GMT (US clocks not back yet)
});

await test('Google busy for a moment: the same model is asked again and answers', async () => {
  google(busy, says('Lemon pasta'));
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'Lemon pasta');
  assert.deepEqual(
    calls.map((c) => c.model),
    [M[0], M[0]],
  );
});

await test('what happened on the phone: 3.8 Flash used up, Flash-Lite busy — now 3.6 Flash answers', async () => {
  google(quota('Day'), says('Lemon pasta'));
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'Lemon pasta');
});

await test('an answer that ran on and was cut off is not used: the second model is asked', async () => {
  google(says('Lemon pasta. Boil the pasta. Boil the pasta. Boil the', 'MAX_TOKENS'), says('Lemon pasta'));
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'Lemon pasta');
  assert.equal(calls.length, 2);
});

await test("a key that isn't accepted: the second model isn't tried, and it points to Settings", async () => {
  google(badKey);
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.equal(calls.length, 1);
  assert.match(e.message, /^Gemini couldn't open that page: the Gemini key wasn't accepted\./);
  assert.match(e.message, /Settings → This phone/);
});

await test('a model the key may not use (403): the other model is still asked', async () => {
  google(json(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Permission denied.' } }), says('OK'));
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'OK');
  assert.equal(calls.length, 2);
});

await test('a model Google has retired (404): the other model answers', async () => {
  google(
    json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'models/gemini-3.8-flash is not found' } }),
    says('OK'),
  );
  assert.equal((await askGemini('k', [{ text: 'x' }], quick)).text, 'OK');
});

// ---- The reason given when none can answer ----
await test('all used up for today: says so, and when it comes back', async () => {
  google(quota('Day'), quota('Day'), quota('Day'));
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.match(e.message, /today's free Gemini allowance is used up\. It comes back at about 8am\./);
  assert.equal(
    geminiDetail(e),
    '3.8 Flash: free limit for today reached (429 RESOURCE_EXHAUSTED) · 3.6 Flash: free limit for today reached (429 RESOURCE_EXHAUSTED) · 3.1 Flash-Lite: free limit for today reached (429 RESOURCE_EXHAUSTED)',
  );
  // Asked again later: every model is used up, so they're all asked anyway (the estimate may be off).
  calls = [];
  await failing(() => askGemini('k', [{ text: 'x' }], quick));
  assert.equal(calls.length, 3);
});

await test('the per-minute allowance: wait a minute', async () => {
  google(quota('Minute'), quota('Minute'), quota('Minute'));
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.match(e.message, /only takes a few requests a minute\. Wait a minute, then try again\./);
});

await test('first used up, second too slow: says it didn\'t answer in time (not "no connection")', async () => {
  google(quota('Day'), quota('Day'), neverAnswers);
  const started = Date.now();
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], { thinking: 'low', waitSeconds: 0.1 })));
  assert.ok(Date.now() - started < 2000, 'gave up at the time limit');
  assert.match(e.message, /: it didn't answer in time\. Nothing has been saved/);
  assert.match(
    geminiDetail(e),
    /3\.8 Flash: free limit for today reached .* · 3\.1 Flash-Lite: no answer within 0\.1 s$/,
  );
});

await test("Google busy on all, even asked twice: says it's busy, try in a minute", async () => {
  google(busy, busy, busy, busy, busy, busy);
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.equal(calls.length, 6);
  assert.match(e.message, /Google's Gemini service is busy just now/);
  assert.match(geminiDetail(e), /busy \(503 UNAVAILABLE\)/);
});

await test("Google's checks stop the copy on both: says so", async () => {
  google(says('Lemon pasta. 200 g', 'RECITATION'), says('', 'RECITATION'), says('', 'RECITATION'));
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.match(e.message, /Google's checks stopped its answer part-way/);
  assert.match(geminiDetail(e), /RECITATION/);
});

await test("no connection: says the phone couldn't reach Google", async () => {
  google(noSignal, noSignal, noSignal);
  const e = page(await failing(() => askGemini('k', [{ text: 'x' }], quick)));
  assert.match(e.message, /this phone couldn't reach Google\. Check it's online\./);
  // With the phone saying it's offline, the second model isn't tried either.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  try {
    google(noSignal);
    await failing(() => askGemini('k', [{ text: 'x' }], quick));
    assert.equal(calls.length, 1);
  } finally {
    delete globalThis.navigator.onLine;
  }
});

await test("an answer that isn't JSON: says it couldn't be read", async () => {
  let err;
  try {
    JSON.parse('{"name": "Cur');
  } catch (e) {
    err = e;
  }
  assert.match(
    geminiFailure(err, 'read this recipe').message,
    /^Gemini couldn't read this recipe: its answer couldn't be read\./,
  );
});

// ---- Settings → This phone → Test it ----
await test('Test it: works, a bad key, and a used-up allowance (the key still works)', async () => {
  google(says('OK'));
  assert.deepEqual(await testGeminiKeyApi('k'), { ok: true, message: 'It works.' });
  assert.deepEqual(calls[0].body.generationConfig, { thinkingConfig: { thinkingLevel: 'low' } });
  google(badKey);
  assert.match((await testGeminiKeyApi('k')).message, /isn't valid/);
  google(quota('Day'), quota('Day'), quota('Day'));
  const used = await testGeminiKeyApi('k');
  assert.equal(used.ok, true);
  assert.match(used.message, /today's free allowance is used up\. It comes back at about 8am/);
});

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nall ${passes} passed`);
process.exit(failures ? 1 : 0);
