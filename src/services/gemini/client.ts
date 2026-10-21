/**
 * Talking to Gemini: each phone's own key (kept on that phone, never synced), the request (the
 * main model, then a lighter one if that can't answer), a time limit, and a plain-English reason
 * when it can't do the job, with what happened on each model in the small print.
 */
import { messageOf } from '../../errors';

/**
 * Asked in this order. Each has its own free daily allowance (3.8 Flash's is only about 20), so when
 * one is used up, busy or too slow, the next usually still answers. All can read web pages (the URL
 * context tool).
 */
const MODELS = [
  { id: 'gemini-3.8-flash', name: '3.8 Flash' },
  { id: 'gemini-3.6-flash', name: '3.6 Flash' },
  { id: 'gemini-3.1-flash-lite', name: '3.1 Flash-Lite' },
];

/** How long to wait before asking a busy model once more (Google's advice for a 503). */
let BUSY_RETRY_MS = 2500;
/** For the tests only: wait less. */
export const setBusyRetryWait = (ms: number) => {
  BUSY_RETRY_MS = ms;
};

// ---- Models whose free allowance for today is used up (kept on this phone until it comes back) ----
const USED_UP_KEY = 'gemini_used_up';
/** When today's free allowance comes back: the next midnight in California, as a time here. */
export function nextAllowanceReset(now = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000; // California minus UTC
  return Date.UTC(parts.year, parts.month - 1, parts.day + 1) - offset;
}
function readUsedUp(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(USED_UP_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
function markUsedUp(model: string, now = Date.now()) {
  try {
    const all = readUsedUp();
    all[model] = nextAllowanceReset(new Date(now));
    localStorage.setItem(USED_UP_KEY, JSON.stringify(all));
  } catch {
    // only saves a wasted request
  }
}
const isUsedUp = (model: string, now = Date.now()) => (readUsedUp()[model] ?? 0) > now;

export function getGeminiApiKey(): string | null {
  try {
    return localStorage.getItem('gemini_api_key') || null;
  } catch (e) {
    console.error('Failed to read Gemini API key from localStorage', e);
    return null;
  }
}

export function saveGeminiApiKey(key: string) {
  try {
    localStorage.setItem('gemini_api_key', key.trim());
    localStorage.removeItem(USED_UP_KEY); // a new key may have its own allowance
  } catch (e) {
    console.error('Failed to save Gemini API key to localStorage', e);
  }
}

export function clearGeminiApiKey() {
  try {
    localStorage.removeItem('gemini_api_key');
  } catch (e) {
    console.error('Failed to clear Gemini API key from localStorage', e);
  }
}
/** A part of a request to Gemini: text, or a photo. */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
/** The shape Gemini's answer must have (the schemas are written out in prompts.ts). */
type ResponseSchema = Record<string, unknown>;
/**
 * There's deliberately no temperature: Google says to leave it at its default for Gemini 3 models
 * (a low one can make them repeat themselves until the time runs out), and newer ones ignore it.
 */
interface GeminiRequest {
  contents: { parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: ResponseSchema;
    thinkingConfig?: { thinkingLevel: 'low' };
  };
  tools?: object[];
}
/** The parts of Gemini's reply the app reads. It's JSON from outside, so every field may be missing. */
export interface GeminiReply {
  candidates?: {
    content?: { parts?: { text?: unknown; thought?: unknown }[] };
    finishReason?: unknown;
    urlContextMetadata?: UrlContext;
    url_context_metadata?: UrlContext;
  }[];
  promptFeedback?: { blockReason?: unknown };
}
interface UrlContext {
  urlMetadata?: UrlRead[];
  url_metadata?: UrlRead[];
}
export interface UrlRead {
  urlRetrievalStatus?: string;
  url_retrieval_status?: string;
}
/** Google's error reply (only the parts the app reads). */
interface GoogleError {
  error?: { message?: unknown; status?: unknown; details?: unknown };
}

/** Why Gemini couldn't answer, in a form the app can explain. */
export type GeminiProblem =
  | 'key' // the key wasn't accepted (the same on every model, so the next isn't tried)
  | 'offline' // the phone couldn't reach Google
  | 'slow' // no answer within the time allowed
  | 'busy' // Google's side is overloaded or had a fault
  | 'limit' // a free allowance is used up (per minute or per day)
  | 'blocked' // Google's checks stopped the answer (e.g. copying some text word for word)
  | 'cut-off' // the answer ran on and was cut off, so it's incomplete
  | 'refused' // Google turned the request down for another reason
  | 'empty'; // an answer with nothing in it

/** One model's failed try. */
export interface GeminiTry {
  model: string;
  problem: GeminiProblem;
  /** Which free allowance ran out, when Google says. */
  limit?: 'day' | 'minute';
  /** A few words on what happened, for the small print ("free limit for today (429)"). */
  note: string;
}
class TryFailed extends Error {
  constructor(public result: Omit<GeminiTry, 'model'>) {
    super(result.note);
  }
}
/** Every model failed. `problem` is the one worth telling you about; `tries` has them all. */
export class GeminiError extends Error {
  readonly problem: GeminiProblem;
  readonly limit?: 'day' | 'minute';
  constructor(readonly tries: GeminiTry[]) {
    const main = mainTry(tries);
    super(`Gemini failed: ${describeTries(tries)}`);
    this.name = 'GeminiError';
    this.problem = main?.problem ?? 'empty';
    this.limit = tries.some((t) => t.problem === 'limit' && t.limit === 'day')
      ? 'day'
      : tries.find((t) => t.problem === 'limit')?.limit;
  }
}
/** What happened on each model, in a line ("3.8 Flash: free limit for today (429) · 3.1 Flash-Lite: …"). */
const describeTries = (tries: GeminiTry[]) => tries.map((t) => `${t.model}: ${t.note}`).join(' · ');
/**
 * The failure to explain: a key or connection problem first (it's the same on every model), then
 * the one that tells you most. A used-up allowance comes near the end, because the other model is
 * there for exactly that, so when that one failed too, its reason is the more useful one.
 */
const ORDER: GeminiProblem[] = ['key', 'offline', 'blocked', 'slow', 'busy', 'cut-off', 'refused', 'empty', 'limit'];
const mainTry = (tries: GeminiTry[]) =>
  [...tries].sort((a, b) => ORDER.indexOf(a.problem) - ORDER.indexOf(b.problem))[0];

export interface AskOptions {
  systemInstruction?: string;
  /** The answer must be JSON of this shape. */
  responseSchema?: ResponseSchema;
  /** E.g. [{ url_context: {} }] to let Gemini open a web page. */
  tools?: object[];
  /**
   * 'low' for copying, matching and quick answers: Gemini thinks briefly, so it answers in seconds.
   * Unset (Gemini's own default, more thinking, slower) for writing or changing a recipe.
   */
  thinking?: 'low';
  /** How long to wait for each model before trying the next, in seconds. */
  waitSeconds: number;
}

/**
 * Ask Gemini: the main model, then the lighter one if that fails. Returns the answer's text and the
 * whole reply (for tool details, such as whether a page was opened). Throws a GeminiError.
 */
export async function askGemini(
  apiKey: string,
  parts: GeminiPart[],
  options: AskOptions,
): Promise<{ text: string; response: GeminiReply }> {
  const tries: GeminiTry[] = [];
  // Models already used up today are skipped (unless they all are: then each is asked anyway).
  const fresh = MODELS.filter((m) => !isUsedUp(m.id));
  for (const model of MODELS) {
    if (fresh.length && !fresh.includes(model)) {
      tries.push({ model: model.name, problem: 'limit', limit: 'day', note: 'free limit for today used up earlier' });
      continue;
    }
    try {
      try {
        return await askModel(model.id, apiKey, parts, options);
      } catch (first) {
        // Busy for a moment: ask the same model once more after a short wait.
        if (!(first instanceof TryFailed && first.result.problem === 'busy')) throw first;
        console.warn(`[Gemini ${model.id}] busy; asking again`);
        await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
        return await askModel(model.id, apiKey, parts, options);
      }
    } catch (err) {
      const result = err instanceof TryFailed ? err.result : { problem: 'refused' as const, note: String(err) };
      tries.push({ model: model.name, ...result });
      console.warn(`[Gemini ${model.id}] ${result.problem}: ${result.note}`);
      if (result.problem === 'limit' && result.limit === 'day') markUsedUp(model.id);
      // A key Google says isn't valid, or no signal at all, would fail the same way on the next model.
      const badKey = result.problem === 'key' && /API_KEY_INVALID|not valid|expired/i.test(result.note);
      if (badKey || (result.problem === 'offline' && globalThis.navigator?.onLine === false)) break;
    }
  }
  throw new GeminiError(tries);
}

/** Ask Gemini with a single piece of text; returns just the answer. */
export async function askGeminiText(apiKey: string, prompt: string, options: AskOptions): Promise<string> {
  return (await askGemini(apiKey, [{ text: prompt }], options)).text;
}

async function askModel(model: string, apiKey: string, parts: GeminiPart[], o: AskOptions) {
  const request: GeminiRequest = { contents: [{ parts }] };
  if (o.systemInstruction) request.systemInstruction = { parts: [{ text: o.systemInstruction }] };
  if (o.tools) request.tools = o.tools;
  const config: NonNullable<GeminiRequest['generationConfig']> = {};
  if (o.responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = o.responseSchema;
  }
  if (o.thinking) config.thinkingConfig = { thinkingLevel: o.thinking };
  if (Object.keys(config).length) request.generationConfig = config;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  // The time limit covers the whole answer, not just its first bytes.
  const timer = setTimeout(() => controller.abort(), o.waitSeconds * 1000);
  const tooSlow = () => new TryFailed({ problem: 'slow', note: `no answer within ${o.waitSeconds} s` });
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw tooSlow();
      throw new TryFailed({ problem: 'offline', note: `couldn't connect (${messageOf(err) || 'network error'})` });
    }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch (err) {
      if (controller.signal.aborted) throw tooSlow();
      if (response.ok && !(err instanceof SyntaxError))
        throw new TryFailed({ problem: 'offline', note: 'the connection dropped mid-answer' });
    }
    if (!response.ok) throw new TryFailed(httpProblem(response.status, data as GoogleError | null));
    return readReply(data as GeminiReply | null);
  } finally {
    clearTimeout(timer);
  }
}

/** Google's error reply, sorted into a problem. */
function httpProblem(code: number, data: GoogleError | null): Omit<GeminiTry, 'model'> {
  const error = data?.error;
  const message = typeof error?.message === 'string' ? error.message : '';
  const status = typeof error?.status === 'string' ? error.status : '';
  const details = JSON.stringify(error?.details ?? '');
  const said = (s: string) => `${s} (${code}${status ? ' ' + status : ''})`;
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
    // Google names the allowance in the details (e.g. "…RequestsPerDayPerProjectPerModel-FreeTier").
    const limit = /PerDay/i.test(details) ? 'day' : /PerMinute/i.test(details) ? 'minute' : undefined;
    const which = limit === 'day' ? ' for today' : limit === 'minute' ? ' per minute' : '';
    return { problem: 'limit', limit, note: said(`free limit${which} reached`) };
  }
  if (code === 401 || code === 403 || /API_KEY_INVALID|API key/i.test(message + details))
    return { problem: 'key', note: said(`key not accepted: ${clip(message)}`) };
  if (code === 504 || status === 'DEADLINE_EXCEEDED') return { problem: 'slow', note: said('Google gave up waiting') };
  if (code >= 500) return { problem: 'busy', note: said('busy') };
  return { problem: 'refused', note: said(`refused: ${clip(message) || 'no reason given'}`) };
}
const clip = (s: string) => (s.length > 120 ? s.slice(0, 117) + '…' : s);

/** The answer's text, or why there isn't a complete one. */
function readReply(data: GeminiReply | null): { text: string; response: GeminiReply } {
  const reply = data || {};
  const candidate = reply.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => (typeof p?.text === 'string' && p.thought !== true ? p.text : ''))
    .join('')
    .trim();
  const finish = typeof candidate?.finishReason === 'string' ? candidate.finishReason : '';
  const blockedAsk = reply.promptFeedback?.blockReason;
  if (blockedAsk)
    throw new TryFailed({ problem: 'blocked', note: `stopped by Google's checks (${String(blockedAsk)})` });
  // Part of a recipe is worse than none, so an answer that stopped early isn't used.
  if (finish === 'MAX_TOKENS') throw new TryFailed({ problem: 'cut-off', note: 'answer ran on and was cut off' });
  if (/^(SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY)$/.test(finish))
    throw new TryFailed({ problem: 'blocked', note: `stopped by Google's checks (${finish})` });
  if (!text) throw new TryFailed({ problem: 'empty', note: `empty answer${finish ? ` (${finish})` : ''}` });
  return { text, response: reply };
}

/** Gemini's answer read as JSON (it sometimes wraps it in ```json fences). */
export function readJsonAnswer<T>(rawText: string): T {
  const cleanText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleanText);
}

/** An error to show as it is, with what happened on each model in `detail` (the small print). */
export class GeminiTaskError extends Error {
  readonly detail: string;
  constructor(message: string, detail = '') {
    super(message);
    this.name = 'GeminiTaskError';
    this.detail = detail;
  }
}
/** The small print for an error, if it has any. */
export const geminiDetail = (err: unknown): string => (err instanceof GeminiTaskError ? err.detail : '');

/**
 * Today's free allowance comes back at midnight California time: 8am here, or 7am in the week or two
 * each spring and autumn when the US and UK clocks have changed on different dates.
 */
const RESETS = 'It comes back at about 8am';

/**
 * A clear error when Gemini can't do the job. We no longer fall back to the built-in parser for
 * recipes: it guesses quantities badly (100 g -> 1 g) and those guesses went straight into the
 * shopping list without anyone noticing.
 */
export function geminiFailure(err: unknown, task: string): GeminiTaskError {
  const start = `Gemini couldn't ${task}`;
  const again = 'Nothing has been saved, so you can just try again.';
  if (!(err instanceof GeminiError)) {
    if (err instanceof SyntaxError)
      return new GeminiTaskError(`${start}: its answer couldn't be read. ${again}`, String(err.message));
    return new GeminiTaskError(`${start}: something went wrong. ${again}`, String(messageOf(err) || err || ''));
  }
  const detail = describeTries(err.tries);
  const say = (m: string) => new GeminiTaskError(`${start}: ${m}`, detail);
  switch (err.problem) {
    case 'key':
      return say("the Gemini key wasn't accepted. Check it in Settings → This phone.");
    case 'offline':
      return say(`this phone couldn't reach Google. Check it's online. ${again}`);
    case 'slow':
      return say(`it didn't answer in time. ${again}`);
    case 'busy':
      return say(`Google's Gemini service is busy just now. Nothing has been saved, so try again in a minute.`);
    case 'limit':
      if (err.limit === 'day') return say(`today's free Gemini allowance is used up. ${RESETS}.`);
      if (err.limit === 'minute')
        return say('the free Gemini allowance only takes a few requests a minute. Wait a minute, then try again.');
      return say(
        `the free Gemini allowance has run out for now. Wait a minute and try again; if it keeps saying this, today's allowance is used up (${RESETS.toLowerCase()}).`,
      );
    case 'blocked':
      return say(`Google's checks stopped its answer part-way. ${again}`);
    case 'cut-off':
      return say(`its answer ran on and was cut off. ${again}`);
    case 'refused':
      return say(`Google turned the request down. ${again}`);
    case 'empty':
      return say(`it sent back an empty answer. ${again}`);
  }
}
/** No Gemini key on this phone: questions about a recipe can't be answered. */
export class NoGeminiKeyError extends Error {
  constructor() {
    super('No Gemini key');
  }
}
/** Check a Gemini key works (Settings → This phone → Test it), with a plain answer. */
export async function testGeminiKeyApi(key: string): Promise<{ ok: boolean; message: string }> {
  const k = key.trim();
  if (!k) return { ok: false, message: 'Paste a key first.' };
  try {
    await askGeminiText(k, 'Reply with the single word OK.', { thinking: 'low', waitSeconds: 20 });
    return { ok: true, message: 'It works.' };
  } catch (e) {
    if (!(e instanceof GeminiError)) return { ok: false, message: String(messageOf(e) || e) };
    const what = describeTries(e.tries);
    switch (e.problem) {
      case 'key':
        return /not valid|API_KEY_INVALID|expired/i.test(what)
          ? { ok: false, message: "Google says that key isn't valid. Copy it again from Google AI Studio." }
          : { ok: false, message: "That key isn't allowed to use Gemini. Make a new one in Google AI Studio." };
      case 'limit':
        return {
          ok: true,
          message:
            e.limit === 'day'
              ? `The key works, but today's free allowance is used up. ${RESETS}.`
              : 'The key works, but the free allowance has run out for now. Try again in a minute.',
        };
      case 'offline':
        return { ok: false, message: "Couldn't reach Gemini. Check the phone is online." };
      case 'slow':
      case 'busy':
        return { ok: false, message: "Gemini didn't answer just now. Try again in a minute." };
      default:
        return { ok: false, message: `Gemini didn't answer properly (${what}).` };
    }
  }
}
