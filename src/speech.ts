// Reading cooking steps aloud with the phone's own voice (the browser's speech synthesis).
// Works in Chrome and Safari and in the app added to the home screen; some in-app browsers
// (for example Android's built-in web view) don't have it, so check canSpeak() first.

type Synth = {
  speak: (u: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  resume?: () => void;
  getVoices?: () => SpeechSynthesisVoice[];
};

const synth = (): Synth | null => {
  try { return (typeof window !== 'undefined' && (window as any).speechSynthesis) || null; } catch { return null; }
};

/** Can this phone/browser read aloud? */
export function canSpeak(): boolean {
  return !!synth() && typeof (window as any).SpeechSynthesisUtterance === 'function';
}

/** A British English voice if there is one, else any English one, else the default. */
function pickVoice(s: Synth): SpeechSynthesisVoice | null {
  try {
    const voices = s.getVoices?.() || [];
    return voices.find((v) => /^en[-_]GB$/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  } catch { return null; }
}

/**
 * Split into pieces of a sentence or two: some browsers stop reading a long utterance part-way
 * through (Chrome cuts off after about 15 seconds).
 */
export function speechChunks(text: string, max = 180): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) { out.push(cur.trim()); cur = s; } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const FRACTIONS: Record<string, [string, string]> = {
  // after a whole number, on its own
  '½': ['and a half', 'half'], '⅓': ['and a third', 'a third'], '⅔': ['and two thirds', 'two thirds'],
  '¼': ['and a quarter', 'a quarter'], '¾': ['and three quarters', 'three quarters'],
};

/**
 * Written kitchen shorthand as it should be said: "500g" → "500 grams", "2 tbsp" → "2 tablespoons",
 * "200C/180C fan" → "200 degrees, or 180 degrees fan", "1½" → "1 and a half", "10 mins" → "10 minutes".
 */
export function forSpeech(text: string): string {
  return text
    .replace(/\s*x\s*(\d+)\s*g\s+(tins?|cans?|packs?|jars?)\b/gi, ' $1 gram $2')
    .replace(/([\d½⅓⅔¼¾])\s*kg\b/gi, '$1 kilos')
    .replace(/([\d½⅓⅔¼¾])\s*g\b/g, '$1 grams')
    .replace(/([\d½⅓⅔¼¾])\s*ml\b/gi, '$1 millilitres')
    .replace(/([\d½⅓⅔¼¾])\s*l\b/g, '$1 litres')
    .replace(/(\d)\s*([½⅓⅔¼¾])/g, (_m, d, f) => `${d} ${FRACTIONS[f][0]}`)
    .replace(/([½⅓⅔¼¾])/g, (f) => FRACTIONS[f][1])
    .replace(/\b1\s*tbsp\b/gi, '1 tablespoon').replace(/\btbsps?\b/gi, 'tablespoons')
    .replace(/\b1\s*tsp\b/gi, '1 teaspoon').replace(/\btsps?\b/gi, 'teaspoons')
    .replace(/(\d+)\s*°?\s*C\b/g, '$1 degrees')
    .replace(/degrees\s*\/\s*/g, 'degrees, or ')
    .replace(/\bmins?\b/gi, 'minutes').replace(/\bhrs?\b/gi, 'hours')
    .replace(/\b1 minutes\b/g, '1 minute').replace(/\b1 hours\b/g, '1 hour');
}

export interface SpeakEvents {
  onStart?: () => void;
  onEnd?: () => void;
  /** 'not-allowed' when the browser blocked it (no recent tap), anything else for other failures. */
  onError?: (reason: string) => void;
}

/** Read text aloud, replacing anything being read now. Returns false if it can't. */
export function speak(text: string, events: SpeakEvents = {}): boolean {
  const s = synth();
  if (!s || !canSpeak()) return false;
  try {
    s.cancel();
    const chunks = speechChunks(forSpeech(text));
    if (!chunks.length) return false;
    const voice = pickVoice(s);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = 'en-GB';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      if (i === 0) u.onstart = () => events.onStart?.();
      if (i === chunks.length - 1) u.onend = () => events.onEnd?.();
      u.onerror = (e: any) => {
        const reason = String(e?.error || 'error');
        // Stopping or replacing what's being read isn't a failure.
        if (reason === 'interrupted' || reason === 'canceled') { events.onEnd?.(); return; }
        events.onError?.(reason);
      };
      s.speak(u);
    });
    s.resume?.(); // Chrome sometimes leaves speech paused
    return true;
  } catch {
    events.onError?.('error');
    return false;
  }
}

export function stopSpeaking() {
  try { synth()?.cancel(); } catch { /* nothing to stop */ }
}
