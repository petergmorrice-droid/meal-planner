import { CheckCircle2 } from 'lucide-react';

/**
 * The app's one short message ("Note saved", "Removed Milk · Undo"): a light card at the bottom
 * of the screen, just above the tabs, so it never covers what you're typing into. Every tab uses
 * this; there are no dark pop-ups anywhere.
 *
 * placement 'tab': inside a tab (above the tab bar). 'screen': over a full-screen view (shopping
 * mode), lifted by `lift` px so it sits above that view's own bottom bar.
 */
export default function Notice({
  text,
  action,
  onDone,
  placement = 'tab',
  lift = 12,
  shop = false,
}: {
  text: string;
  action?: { label: string; run: () => void };
  /** Called when the action is tapped (before the action runs), so the message goes away. */
  onDone: () => void;
  placement?: 'tab' | 'screen';
  lift?: number;
  /** The Shop's message (kept for its tests). */
  shop?: boolean;
}) {
  const outer = placement === 'screen' ? 'fixed left-3 right-3 z-[80]' : 'absolute left-3 right-3 bottom-3 z-40';
  return (
    <div
      className={`${outer} flex justify-center pointer-events-none`}
      style={placement === 'screen' ? { bottom: `calc(env(safe-area-inset-bottom) + ${lift}px)` } : undefined}
    >
      <div
        role="status"
        className="pointer-events-auto max-w-md w-full bg-white text-zinc-800 border border-zinc-200 rounded-2xl shadow-lg shadow-zinc-900/10 pl-3.5 pr-1.5 py-1.5 min-h-[48px] flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
        data-toast
        data-notice
        {...(shop ? { 'data-shop-toast': '' } : {})}
      >
        <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 shrink-0" />
        <span className="flex-1 min-w-0 text-sm leading-snug py-1">{text}</span>
        {action ? (
          <button
            type="button"
            onClick={() => {
              const run = action.run;
              onDone();
              run();
            }}
            className="shrink-0 h-9 px-3 rounded-xl text-sm font-semibold text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 cursor-pointer"
            data-toast-action
            {...(action.label === 'Undo' ? { 'data-toast-undo': '' } : {})}
          >
            {action.label}
          </button>
        ) : (
          <span className="w-1.5" />
        )}
      </div>
    </div>
  );
}
