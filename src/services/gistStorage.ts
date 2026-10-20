import { AppState } from '../types';

export { mergeAppStates } from './syncMerge';

/**
 * Reads and writes the app data in a private GitHub Gist.
 *
 * Small data is stored as one JSON file (family-meal-planner.json). GitHub
 * truncates any single file over 1 MB when it is read back through the API, so
 * once the data passes CHUNK_SIZE it is split across numbered part files and the
 * main file becomes a small index pointing at them.
 */

const GIST_FILENAME = 'family-meal-planner.json';
const PART_PREFIX = 'family-meal-planner.part';
const PART_SUFFIX = '.txt';
const CHUNKED_FORMAT = 'chunked-v1';
/** Bytes per file. Kept well under GitHub's 1 MB read limit. */
export const CHUNK_SIZE = 800_000;

const API = 'https://api.github.com';

export interface GistConfig {
  pat: string;
  gistId: string;
}

export interface GistSnapshot {
  /** Data in the Gist, or null if the Gist has no meal planner file yet. */
  state: AppState | null;
  /** GitHub's version tag for this copy, used to ask "has it changed?" cheaply. */
  etag: string | null;
  /** File names currently in the Gist (needed to tidy up old part files). */
  files: string[];
}

export type FetchResult = { notModified: true } | { notModified: false; snapshot: GistSnapshot };

export function getGistConfig(): GistConfig | null {
  try {
    const pat = localStorage.getItem('github_pat') || '';
    const gistId = localStorage.getItem('github_gist_id') || '';
    if (pat && gistId) {
      return { pat, gistId };
    }
  } catch (e) {
    console.error('Failed to read Gist config from localStorage', e);
  }
  return null;
}

export function saveGistConfig(pat: string, gistId: string) {
  try {
    localStorage.setItem('github_pat', pat.trim());
    localStorage.setItem('github_gist_id', gistId.trim());
  } catch (e) {
    console.error('Failed to save Gist config to localStorage', e);
  }
}

export function clearGistConfig() {
  try {
    localStorage.removeItem('github_pat');
    localStorage.removeItem('github_gist_id');
  } catch (e) {
    console.error('Failed to clear Gist config from localStorage', e);
  }
}

const partName = (n: number) => `${PART_PREFIX}${n}${PART_SUFFIX}`;

/** Compact JSON with every non-ASCII character escaped, so 1 character = 1 byte. */
function toAsciiJson(state: AppState): string {
  return JSON.stringify(state).replace(
    /[\u007f-￿]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
  );
}

/** Turn app data into the Gist files to write (null = delete that file). */
export function encodeStateToGistFiles(
  state: AppState,
  existingFiles: string[] = []
): Record<string, { content: string } | null> {
  const json = toAsciiJson(state);
  const files: Record<string, { content: string } | null> = {};

  if (json.length <= CHUNK_SIZE) {
    files[GIST_FILENAME] = { content: json };
  } else {
    const parts = Math.ceil(json.length / CHUNK_SIZE);
    for (let i = 0; i < parts; i++) {
      files[partName(i + 1)] = { content: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) };
    }
    files[GIST_FILENAME] = {
      content: JSON.stringify({
        __format: CHUNKED_FORMAT,
        parts,
        note: 'Meal planner data is larger than 1 MB, so it is split across the part files in this Gist.',
      }),
    };
  }

  for (const name of existingFiles) {
    if (name.startsWith(PART_PREFIX) && !(name in files)) {
      files[name] = null;
    }
  }
  return files;
}

/** Read app data back out of the Gist's files. */
export function decodeGistFiles(files: Record<string, any> | undefined): AppState | null {
  const main = files?.[GIST_FILENAME];
  if (!main) return null;
  if (main.truncated) {
    throw new Error('The Gist data file is larger than GitHub allows the app to read (1 MB).');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(main.content);
  } catch {
    throw new Error('Gist content is not valid JSON.');
  }

  if (parsed && parsed.__format === CHUNKED_FORMAT) {
    let text = '';
    for (let i = 1; i <= parsed.parts; i++) {
      const part = files?.[partName(i)];
      if (!part) throw new Error(`Gist data is incomplete: ${partName(i)} is missing.`);
      if (part.truncated) throw new Error(`Gist data part ${i} could not be read in full.`);
      text += part.content;
    }
    try {
      return JSON.parse(text) as AppState;
    } catch {
      throw new Error('Gist data parts could not be joined back together.');
    }
  }
  return parsed as AppState;
}

function describeHttpError(response: Response, body: any, action: string): Error {
  if (response.status === 404) return new Error('Gist not found. Please check your Gist ID.');
  if (response.status === 401) return new Error('Unauthorized. Please check your GitHub Personal Access Token.');
  if (response.status === 403 || response.status === 429) {
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      return new Error('GitHub rate limit reached. Sync will resume automatically shortly.');
    }
    return new Error(body?.message || 'GitHub refused the request. Check the token has the "gist" permission.');
  }
  return new Error(body?.message || `Failed to ${action} Gist (${response.status}).`);
}

async function request(url: string, init: RequestInit, _action: string): Promise<Response> {
  try {
    return await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error("Can't reach GitHub (offline?). Changes are saved on this phone and will sync when you're back online.");
  }
}

const authHeaders = (pat: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${pat}`,
  Accept: 'application/vnd.github+json',
  ...extra,
});

/**
 * Download the Gist. Pass the etag from the last download/upload to ask GitHub
 * "has it changed?" — an unchanged Gist returns { notModified: true } with no
 * data, and doesn't count against GitHub's rate limit.
 */
let conditionalRequestsWork = true;

export async function fetchGist(config: GistConfig, etag?: string | null): Promise<FetchResult> {
  const url = `${API}/gists/${config.gistId}`;
  const useEtag = Boolean(etag) && conditionalRequestsWork;
  let response: Response;
  try {
    const headers = authHeaders(config.pat, useEtag ? { 'If-None-Match': etag! } : {});
    response = await request(url, { method: 'GET', headers }, 'fetch');
  } catch (err) {
    if (!useEtag) throw err;
    // Safety net: if a browser ever rejects the "has it changed?" check, fall
    // back to plain downloads for the rest of the session (only if those work).
    response = await request(url, { method: 'GET', headers: authHeaders(config.pat) }, 'fetch');
    conditionalRequestsWork = false;
    console.warn('Gist conditional requests unavailable; using full downloads.');
  }

  if (response.status === 304) {
    return { notModified: true };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw describeHttpError(response, body, 'fetch');
  }

  const data = await response.json();
  return {
    notModified: false,
    snapshot: {
      state: decodeGistFiles(data.files),
      etag: response.headers.get('ETag'),
      files: Object.keys(data.files || {}),
    },
  };
}

/** Upload the whole app state. Returns the new version tag and file list. */
export async function saveGist(
  config: GistConfig,
  state: AppState,
  existingFiles: string[] = []
): Promise<{ etag: string | null; files: string[] }> {
  const response = await request(
    `${API}/gists/${config.gistId}`,
    {
      method: 'PATCH',
      headers: authHeaders(config.pat, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        description: 'Family Meal Planner App Data',
        files: encodeStateToGistFiles(state, existingFiles),
      }),
    },
    'update'
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw describeHttpError(response, body, 'update');
  }
  const data = await response.json().catch(() => ({}));
  return { etag: response.headers.get('ETag'), files: Object.keys(data.files || {}) };
}

/** Create a new private Gist holding the given state. */
export async function createPrivateGist(
  pat: string,
  initialState: AppState
): Promise<{ id: string; etag: string | null; files: string[] }> {
  const files = encodeStateToGistFiles(initialState);
  const response = await request(
    `${API}/gists`,
    {
      method: 'POST',
      headers: authHeaders(pat, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ description: 'Family Meal Planner App Data', public: false, files }),
    },
    'create'
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw describeHttpError(response, body, 'create');
  }
  const data = await response.json();
  return { id: data.id, etag: response.headers.get('ETag'), files: Object.keys(data.files || {}) };
}
