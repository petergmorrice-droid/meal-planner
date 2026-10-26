// Connects the sender's logic (push-core.mts) to Netlify: Blobs for the phones' sign-ups, the
// schedules and the signing keys, and web-push for sending through Apple's and Google's services.
// The signing keys are made the first time they're needed and kept in their own Blobs store, so the
// private key never leaves Netlify.
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import type { DataStore, PhoneStore, SavedPhone, Sender } from './push-core.mts';

const SUBJECT = 'https://petergmorrice-droid.github.io/meal-planner/';

export interface Keys {
  publicKey: string;
  privateKey: string;
}

/** The sender's signing keys: made once, the first time they're needed. */
export async function signingKeys(): Promise<Keys> {
  const store = getStore({ name: 'push-keys', consistency: 'strong' });
  const saved = (await store.get('vapid', { type: 'json' })) as Keys | null;
  if (saved?.publicKey && saved.privateKey) return saved;
  // Two first requests at once: only one set of keys is kept, and both use it.
  await store.setJSON('vapid', webpush.generateVAPIDKeys(), { onlyIfNew: true });
  return (await store.get('vapid', { type: 'json' })) as Keys;
}

/** The phones' sign-ups. Strong consistency: a phone that just signed up is told about the next addition. */
export function phoneStore(): PhoneStore {
  const blobs = getStore({ name: 'push-phones', consistency: 'strong' });
  return {
    get: async (key) => (await blobs.get(key, { type: 'json' })) as SavedPhone | null,
    set: async (key, phone) => {
      await blobs.setJSON(key, phone);
    },
    delete: (key) => blobs.delete(key),
    keys: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
}

/** The households' schedules and what's been sent. */
export function dataStore(): DataStore {
  const blobs = getStore({ name: 'push-schedules', consistency: 'strong' });
  return {
    get: async <T,>(key: string) => (await blobs.get(key, { type: 'json' })) as T | null,
    set: async (key, value) => {
      await blobs.setJSON(key, value);
    },
    keys: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
}

export const sender =
  (keys: Keys): Sender =>
  async (subscription, payload) => {
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
