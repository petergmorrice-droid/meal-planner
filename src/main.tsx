import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyTheme, savedTheme } from './theme';

// This phone's colour theme, before the first paint.
applyTheme(savedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Save the app on the phone so it opens without signal (see public/sw.js).
// Skipped on the Vite dev server, where files change on every edit.
const onDevServer = !!document.querySelector('script[src*="@vite/client"]');
if ('serviceWorker' in navigator && !onDevServer) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support unavailable:', err));
  });
}

// Ask the browser to keep this app's data (recipes, plans, sync token) when the phone runs low on
// space, instead of clearing it like a cached web page. Installed home-screen apps are usually allowed.
if (navigator.storage?.persist) {
  void navigator.storage
    .persisted()
    .then((already) => (already ? true : navigator.storage.persist()))
    .catch(() => false);
}
