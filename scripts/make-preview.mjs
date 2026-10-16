// Builds a preview of the app that can be opened as a page inside Claude: the
// single-file build plus sample recipes and weeks, and a note saying what the
// preview can't do (syncing and Gemini need connections the preview blocks).
//
// Usage: node scripts/make-preview.mjs [singleDir] [outFile]
//   defaults: dist-single  ->  dist-preview/preview.html
// The output is page content (no <html>/<head>/<body>), as Claude's page
// publisher expects; it wraps it in its own document skeleton.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const singleDir = path.resolve(process.argv[2] || 'dist-single');
const outFile = path.resolve(process.argv[3] || 'dist-preview/preview.html');
const html = fs.readFileSync(path.join(singleDir, 'index.html'), 'utf8');

// The inlined stylesheet and the app's module script.
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>', styleStart);
if (styleStart < 0 || styleEnd < 0) throw new Error('No inlined <style> found; run build:single first');
const css = html.slice(styleStart + '<style>'.length, styleEnd);
const scriptTag = '<script type="module">';
const scriptStart = html.indexOf(scriptTag);
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd < scriptStart) throw new Error('No inlined app script found');
const appJs = html.slice(scriptStart + scriptTag.length, scriptEnd);
const fonts = (html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/) || [''])[0];
const sample = fs.readFileSync(path.join(here, 'preview-sample-data.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const page = `<title>Meal Planner Preview</title>
<meta name="meal-planner-preview" content="1">
${fonts}
<style>
${css}
</style>
<style>
  /* Preview only: the app is a single light design. */
  html, body { background: #fafafa; color: #18181b; }
  #preview-note {
    position: fixed; z-index: 2147483000; left: 50%; transform: translateX(-50%);
    top: calc(env(safe-area-inset-top, 0px) + 8px); width: min(560px, calc(100% - 24px));
    background: #052e1c; color: #ecfdf5; border-radius: 14px; padding: 12px 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
    font: 500 14px/1.45 "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: grid; gap: 10px;
  }
  #preview-note strong { font-weight: 700; }
  #preview-note .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  #preview-note button {
    font: inherit; font-weight: 700; border-radius: 10px; padding: 8px 14px; cursor: pointer;
    border: 1px solid #34d399; background: #34d399; color: #052e1c;
  }
  #preview-note button.secondary { background: transparent; color: #ecfdf5; border-color: rgba(236, 253, 245, .4); }
  #preview-note button:focus-visible { outline: 3px solid #ecfdf5; outline-offset: 2px; }
</style>
<div id="root"></div>
<div id="preview-note" role="note" hidden>
  <div><strong>Preview with sample recipes.</strong> Planning shows the new week layout: <strong>hold a recipe and drag it onto a day</strong>, or hold a planned meal and drag it to another day for leftovers. To compare with the old layout, tap the eye button on Planning and choose Classic. Syncing and Gemini don't work here, and changes stay in this browser only.</div>
  <div class="row">
    <button type="button" class="secondary" id="preview-reset">Start again with the sample</button>
    <button type="button" id="preview-ok">Got it</button>
  </div>
</div>
<script>
${sample}
(function () {
  var KEY = 'mealPlannerAppStateCache';
  var store = null;
  try { store = window.localStorage; store.getItem(KEY); } catch (e) { store = null; }
  try { if (store && !store.getItem(KEY)) store.setItem(KEY, JSON.stringify(makeSampleState())); } catch (e) {}
  // The preview opens Planning in the new week layout (your phones keep their own choice).
  try { if (store && !store.getItem('planner_layout')) store.setItem('planner_layout', 'week'); } catch (e) {}
  // No offline saving in the preview: there is no service worker file here.
  try { if (window.ServiceWorkerContainer) ServiceWorkerContainer.prototype.register = function () { return new Promise(function () {}); }; } catch (e) {}
  var note = document.getElementById('preview-note');
  var seen = false;
  try { seen = !!(store && store.getItem('mealPlannerPreviewNoteSeen')); } catch (e) {}
  note.hidden = seen;
  document.getElementById('preview-ok').addEventListener('click', function () {
    note.hidden = true;
    try { if (store) store.setItem('mealPlannerPreviewNoteSeen', '1'); } catch (e) {}
  });
  document.getElementById('preview-reset').addEventListener('click', function () {
    try {
      if (store) {
        ['mealPlannerAppStateCache', 'mealPlannerMealPlans', 'mealPlannerState', 'mealPlannerCustomFavouritesObj', 'shop_drop_completed_to_bottom', 'planner_layout']
          .forEach(function (k) { store.removeItem(k); });
        store.setItem(KEY, JSON.stringify(makeSampleState()));
        store.setItem('planner_layout', 'week');
      }
    } catch (e) {}
    location.reload();
  });
})();
</script>
<script type="module">${appJs}</script>
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, page);
console.log(`Preview -> ${outFile} (${Math.round(Buffer.byteLength(page) / 1024)} KB)`);
