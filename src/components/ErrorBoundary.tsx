import React from 'react';
import { TriangleAlert, RotateCcw } from 'lucide-react';

/**
 * A safety net around one tab: if something on it goes wrong, that tab shows a short message with
 * "Try again" and "Reload the app" instead of the whole app going blank. Your data isn't touched.
 */
export default class ErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Something went wrong on ${this.props.name}`, error, info?.componentStack);
    try {
      localStorage.setItem('last_app_error', JSON.stringify({ at: new Date().toISOString(), tab: this.props.name, message: String(error?.message || error).slice(0, 300) }));
    } catch { /* only for looking into it later */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full flex items-center justify-center p-6 app-page" role="alert" data-tab-error={this.props.name}>
        <div className="max-w-sm w-full bg-white rounded-2xl border border-amber-200 p-5 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-3"><TriangleAlert className="w-6 h-6" /></div>
          <h2 className="text-lg font-bold text-zinc-900">Something went wrong on {this.props.name}</h2>
          <p className="text-sm text-zinc-600 mt-1">Your meals, list and recipes are safe. The other tabs still work.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={() => this.setState({ error: null })} className="h-11 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer" data-tab-error-retry>
              <RotateCcw className="w-4 h-4" />Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer" data-tab-error-reload>Reload the app</button>
          </div>
        </div>
      </div>
    );
  }
}

/** Only for the automated tests: makes a tab fail on purpose when this phone has `test_break_tab` set to its name. */
export function TestBreak({ tab }: { tab: string }) {
  let broken = false;
  try { broken = localStorage.getItem('test_break_tab') === tab; } catch { /* never */ }
  if (broken) throw new Error(`Test break on ${tab}`);
  return null;
}
