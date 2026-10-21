// Hands-free cooking: what a spoken phrase means ("next", "go back", "start the timer",
// "question, can I use crème fraîche?"), and a listener that keeps the microphone open.
// Speech recognition is the browser's own (Chrome sends audio to Google, Safari to Apple;
// both need internet). Only short, whole phrases count as commands, and questions must start
// with "question", "ask" or "chef", so kitchen chatter doesn't move the steps on.

export type VoiceCommand =
  | { kind: 'next' }
  | { kind: 'back' }
  | { kind: 'repeat' }
  | { kind: 'goto'; step: number }
  | { kind: 'timer_start'; minutes?: number }
  | { kind: 'timer_stop' }
  | { kind: 'time_left' }
  | { kind: 'ingredients' }
  | { kind: 'finish' }
  | { kind: 'help' }
  | { kind: 'question'; text: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  a: 1,
  an: 1,
  half: 0.5,
};
const num = (w: string): number | null => (/^\d+$/.test(w) ? Number(w) : (NUMBER_WORDS[w] ?? null));

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Words people put around a command: "ok next please", "um, back".
    .replace(/^(?:(?:ok|okay|um|erm|uh|right|and|so|yes|yeah|please|now|then)\s+)+/, '')
    .replace(/(?:\s+(?:please|thanks|thank you|then|now))+$/, '');

const ONE_OF = (words: string[]) => new RegExp(`^(?:${words.join('|')})$`);
const NEXT = ONE_OF([
  'next',
  'next step',
  'next one',
  'go on',
  'carry on',
  'continue',
  'forward',
  'go forward',
  'move on',
  'go next',
  'whats next',
  'what next',
  'done next',
  'next please',
]);
const BACK = ONE_OF([
  'back',
  'go back',
  'previous',
  'previous step',
  'last step',
  'step back',
  'back one',
  'go back one',
  'back a step',
  'go back a step',
]);
const REPEAT = ONE_OF([
  'repeat',
  'repeat that',
  'repeat it',
  'repeat the step',
  'again',
  'say again',
  'say that again',
  'say it again',
  'read again',
  'read it again',
  'read that again',
  'read the step',
  'read it',
  'what was that',
  'pardon',
  'sorry',
  'come again',
  'what',
]);
const STOP = ONE_OF([
  'stop',
  'stop it',
  'stop timer',
  'stop the timer',
  'stop the alarm',
  'stop alarm',
  'cancel timer',
  'cancel the timer',
  'quiet',
  'be quiet',
  'silence',
  'shush',
  'shut up',
  'turn it off',
  'alarm off',
  'timer off',
]);
const LEFT = ONE_OF([
  'how long left',
  'how long is left',
  'how longs left',
  'how long has it got',
  'how long has it got left',
  'whats left',
  'how long to go',
  'how long',
  'time left',
  'how much time',
  'how much time left',
  'how much longer',
  'how long now',
  'whats left on the timer',
  'how long on the timer',
  'timer',
]);
const START = ONE_OF([
  'start timer',
  'start the timer',
  'set timer',
  'set the timer',
  'set a timer',
  'start a timer',
  'timer on',
  'go timer',
  'start it',
  'start',
]);
const INGREDIENTS = ONE_OF([
  'ingredients',
  'what do i need',
  'what do i need for this',
  'what do i need for this step',
  'what ingredients',
  'whats in it',
  'what goes in',
]);
const FINISH = ONE_OF([
  'finished',
  'finish',
  'all done',
  'im done',
  'were done',
  'done cooking',
  'finished cooking',
  'thats it',
  'the end',
]);
const HELP = ONE_OF(['help', 'what can i say', 'commands', 'what do i say']);
const QUESTION = /^(?:hey |ok |okay )?(?:chef|question|quick question|ask|i have a question|a question)\b[\s,:]*(.*)$/;

/** What a spoken phrase means, or null if it's not for us (chatter, a half-heard word). */
export function parseVoiceCommand(heard: string): VoiceCommand | null {
  const raw = String(heard || '').trim();
  const t = clean(raw);
  if (!t) return null;

  const q = t.match(QUESTION);
  if (q) {
    // Keep the question as said (with its capitals and accents), minus the "question," at the start.
    const said = raw
      .replace(/^\s*(?:hey |ok |okay )?(?:chef|question|quick question|ask|i have a question|a question)\b[\s,:]*/i, '')
      .trim();
    if (!q[1] || !said) return null;
    const text = said.charAt(0).toUpperCase() + said.slice(1);
    return { kind: 'question', text: /[?.!]$/.test(text) ? text : `${text}?` };
  }

  // Commands are short: a whole phrase of a few words, never part of a sentence.
  if (t.split(' ').length > 7) return null;
  if (NEXT.test(t)) return { kind: 'next' };
  if (BACK.test(t)) return { kind: 'back' };
  if (REPEAT.test(t)) return { kind: 'repeat' };
  if (STOP.test(t)) return { kind: 'timer_stop' };
  if (LEFT.test(t)) return { kind: 'time_left' };
  if (START.test(t)) return { kind: 'timer_start' };
  if (INGREDIENTS.test(t)) return { kind: 'ingredients' };
  if (FINISH.test(t)) return { kind: 'finish' };
  if (HELP.test(t)) return { kind: 'help' };

  // "go to step 3", "step three"
  const step = t.match(/^(?:go to |skip to |jump to )?step (\w+)$/);
  if (step && num(step[1]) && Number.isInteger(num(step[1]))) return { kind: 'goto', step: num(step[1])! };

  // "set a timer for 10 minutes", "start a 5 minute timer", "timer for an hour", "ten minute timer"
  if (/\btimer\b/.test(t)) {
    const m = t.match(/\b(\d+|[a-z]+)(?: and a half)? (minute|minutes|min|mins|hour|hours)\b/);
    const n = m ? num(m[1]) : null;
    if (n) {
      const half = /and a half/.test(t) ? 0.5 : 0;
      return { kind: 'timer_start', minutes: Math.round((n + half) * (/^hour/.test(m![2]) ? 60 : 1)) || 1 };
    }
  }
  return null;
}

/** The first of the recogniser's guesses that means something. */
export function parseAlternatives(alternatives: string[]): { command: VoiceCommand; heard: string } | null {
  for (const heard of alternatives) {
    const command = parseVoiceCommand(heard);
    if (command) return { command, heard };
  }
  return null;
}

// ---------- The listener ----------

export const canListen = (): boolean => {
  try {
    return (
      typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  } catch {
    return false;
  }
};

export type ListenerProblem = 'blocked' | 'no-mic' | 'network' | 'stopped' | 'unsupported';

/**
 * Keeps listening until stopped: browsers end recognition after a pause, so it starts again.
 * pause()/resume() while the phone is reading aloud, so it doesn't hear itself.
 */
export function createListener(handlers: {
  onHeard: (alternatives: string[]) => void;
  onListening?: (listening: boolean) => void;
  onProblem?: (problem: ListenerProblem) => void;
}) {
  const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any = null;
  let wanted = false;
  let paused = false;
  let starts: number[] = [];
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const begin = () => {
    if (!wanted || paused || rec || !Rec) return;
    // Something's wrong if it keeps ending straight away (no mic, no network): give up and say so.
    const now = Date.now();
    starts = [...starts.filter((t) => now - t < 15000), now];
    if (starts.length > 8) {
      wanted = false;
      handlers.onListening?.(false);
      handlers.onProblem?.('stopped');
      return;
    }
    try {
      rec = new Rec();
      rec.lang = 'en-GB';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.onstart = () => handlers.onListening?.(true);
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex ?? 0; i < (e.results?.length ?? 0); i++) {
          const r = e.results[i];
          if (r && (r.isFinal ?? true)) {
            const alts: string[] = [];
            for (let j = 0; j < r.length; j++) if (r[j]?.transcript) alts.push(String(r[j].transcript));
            if (alts.length) {
              starts = [];
              handlers.onHeard(alts);
            }
          }
        }
      };
      rec.onerror = (e: any) => {
        const err = String(e?.error || '');
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          wanted = false;
          handlers.onProblem?.('blocked');
        } else if (err === 'audio-capture') {
          wanted = false;
          handlers.onProblem?.('no-mic');
        } else if (err === 'network') {
          wanted = false;
          handlers.onProblem?.('network');
        }
        // 'no-speech' and 'aborted' just mean start again.
      };
      rec.onend = () => {
        rec = null;
        if (wanted && !paused) restartTimer = setTimeout(begin, 250);
        else handlers.onListening?.(false);
      };
      rec.start();
    } catch {
      rec = null;
      if (wanted) restartTimer = setTimeout(begin, 1000);
    }
  };
  const halt = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    try {
      rec?.abort?.();
    } catch {
      /* already stopped */
    }
    rec = null;
  };

  return {
    start() {
      if (!Rec) {
        handlers.onProblem?.('unsupported');
        return;
      }
      wanted = true;
      paused = false;
      starts = [];
      begin();
    },
    stop() {
      wanted = false;
      halt();
      handlers.onListening?.(false);
    },
    pause() {
      if (paused) return;
      paused = true;
      halt();
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (wanted) begin();
    },
  };
}
