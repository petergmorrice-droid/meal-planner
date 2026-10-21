/**
 * Talking to Gemini: each phone's own key (kept on that phone, never synced), the request with
 * retries and a time limit, and plain-English errors when it can't do the job.
 */
import { messageOf } from '../../errors';

const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

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
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
/** The shape Gemini's answer must have (the schemas are written out below). */
type ResponseSchema = Record<string, unknown>;
interface GeminiRequest {
  contents: { parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: { responseMimeType?: string; responseSchema?: ResponseSchema; temperature?: number };
  tools?: object[];
}
/** The parts of Gemini's reply the app reads. It's JSON from outside, so every field may be missing. */
export interface GeminiReply {
  candidates?: {
    content?: { parts?: { text?: unknown }[] };
    urlContextMetadata?: UrlContext;
    url_context_metadata?: UrlContext;
  }[];
  error?: { message?: string };
}
interface UrlContext {
  urlMetadata?: UrlRead[];
  url_metadata?: UrlRead[];
}
export interface UrlRead {
  urlRetrievalStatus?: string;
  url_retrieval_status?: string;
}
/**
 * Direct REST API request wrapper with retries and timeout
 */
export async function callGeminiRest(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  responseSchema?: ResponseSchema,
  options: { temperature?: number } = {},
): Promise<string> {
  let lastError: unknown = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const payload: GeminiRequest = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      if (responseSchema) {
        payload.generationConfig = {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        };
      }
      if (options.temperature !== undefined) {
        // Low temperature = the same answer every time; right for copying, not for creating.
        payload.generationConfig = { ...(payload.generationConfig || {}), temperature: options.temperature };
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Client': 'aistudio-build',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!response.ok) {
        const errorData: GeminiReply = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API error (${response.status})`);
      }

      const responseData: GeminiReply = await response.json();
      const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return text as string;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini REST ${model}] failed:`, messageOf(err) || err);
    }
  }

  throw lastError || new Error('All candidate models failed');
}

/**
 * A request with any parts (text, a photo) and optional tools (e.g. reading a web page).
 * Returns the answer's text and the whole response (for tool details such as which pages were read).
 */
export async function callGeminiParts(
  apiKey: string,
  parts: GeminiPart[],
  options: { systemInstruction?: string; tools?: object[]; temperature?: number; timeoutMs?: number } = {},
): Promise<{ text: string; response: GeminiReply }> {
  let lastError: unknown = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload: GeminiRequest = { contents: [{ parts }] };
      if (options.systemInstruction) payload.systemInstruction = { parts: [{ text: options.systemInstruction }] };
      if (options.tools) payload.tools = options.tools;
      if (options.temperature !== undefined) payload.generationConfig = { temperature: options.temperature };
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), options.timeoutMs || 60000);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!response.ok) {
        const errorData: GeminiReply = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API error (${response.status})`);
      }
      const data: GeminiReply = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
      if (text) return { text, response: data };
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini REST ${model}] failed:`, messageOf(err) || err);
    }
  }
  throw lastError || new Error('All candidate models failed');
}
/** Gemini's answer read as JSON (it sometimes wraps it in ```json fences). */
export function readJsonAnswer<T>(rawText: string): T {
  const cleanText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleanText);
}

/**
 * A clear error when Gemini can't do the job. We no longer fall back to the
 * built-in parser for recipes: it guesses quantities badly (100 g -> 1 g) and
 * those guesses went straight into the shopping list without anyone noticing.
 */
export function geminiFailure(err: unknown, task: string): Error {
  const raw = String(messageOf(err) || err || '');
  let reason = 'it may be busy or unreachable';
  if (/quota|exhaust|rate|429/i.test(raw)) reason = "today's free Gemini limit may have been reached";
  else if (/api key|permission|401|403/i.test(raw))
    reason = 'the Gemini API key was not accepted (check Settings → This phone)';
  else if (/abort|timeout|network|fetch/i.test(raw)) reason = 'there was no connection, or it took too long';
  else if (/json|unexpected token/i.test(raw)) reason = 'its answer could not be read';
  return new Error(`Gemini couldn't ${task}: ${reason}. Nothing has been saved, so please try again in a minute.`);
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
    await callGeminiRest(k, 'Reply with the single word OK.', undefined, undefined, { temperature: 0 });
    return { ok: true, message: 'It works.' };
  } catch (e) {
    const m = String(messageOf(e) || e || '');
    if (/api key not valid|api_key_invalid|invalid api key|api key expired/i.test(m))
      return { ok: false, message: "Google says that key isn't valid. Copy it again from Google AI Studio." };
    if (/quota|exhausted|rate limit|429/i.test(m))
      return { ok: true, message: "The key works, but today's free limit has been used. It'll work again tomorrow." };
    if (/permission|forbidden|403/i.test(m))
      return { ok: false, message: "That key isn't allowed to use Gemini. Make a new one in Google AI Studio." };
    if (/failed to fetch|network|load failed|abort/i.test(m))
      return { ok: false, message: "Couldn't reach Gemini. Check the phone is online." };
    return { ok: false, message: m || "Gemini didn't answer." };
  }
}
