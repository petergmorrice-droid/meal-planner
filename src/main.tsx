import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
