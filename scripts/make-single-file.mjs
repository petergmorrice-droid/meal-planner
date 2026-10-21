// Turns the normal build (dist/index.html + assets/*.js + assets/*.css) into ONE
// self-contained index.html, so the whole app can be put online by uploading a
// handful of files (e.g. to a GitHub Pages repository). The few small files
// that can't be inlined (sw.js for opening without signal, the manifest and
// icons for installing on the home screen) are copied next to it.
//
// Usage: node scripts/make-single-file.mjs [buildDir] [outDir]
//   defaults: dist  ->  dist-single
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const buildDir = path.resolve(process.argv[2] || 'dist');
const outDir = path.resolve(process.argv[3] || 'dist-single');
const htmlPath = path.join(buildDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const readAsset = (ref) => {
  const clean = ref.replace(/^\.?\//, '').split('?')[0];
  return fs.readFileSync(path.join(buildDir, clean), 'utf8');
};

let scripts = 0;
let styles = 0;

// <script type="module" crossorigin src="./assets/index-abc.js"></script>
html = html.replace(/<script\b([^>]*?)\bsrc="([^"]+\.js)"([^>]*)><\/script>/g, (_m, before, src) => {
  if (/^https?:/.test(src)) return _m;
  scripts++;
  const code = readAsset(src)
    .replace(/\n\/\/# sourceMappingURL=.*$/m, '')
    .replace(/<\/script/gi, '<\\/script');
  const isModule = /type="module"/.test(before);
  return `<script${isModule ? ' type="module"' : ''}>\n${code}\n</script>`;
});

// <link rel="stylesheet" crossorigin href="./assets/index-abc.css">
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+\.css)"[^>]*>/g, (m, href) => {
  if (/^https?:/.test(href)) return m;
  styles++;
  return `<style>\n${readAsset(href).replace(/<\/style/gi, '<\\/style')}\n</style>`;
});

// Remove module preload hints for files that are now inlined.
html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/g, '');

// Manifest and icon links must be relative ("./icon-192.png", not "/icon-192.png"),
// or they break when the app lives in a sub-folder such as user.github.io/meal-planner/.
html = html.replace(/(<link\b[^>]*\bhref=")\/(?!\/)/g, '$1./');

if (scripts === 0) {
  console.error('No local <script src> found in', htmlPath);
  process.exit(1);
}

// A version stamp for this build: the same one goes in sw.js (below), so the app can tell when a
// newer version has been uploaded (Settings → About this app, and the "new version" banner).
const version = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
html = html.replace(
  /<head>/i,
  `<head>\n<meta name="app-version" content="${version}" data-built="${new Date().toISOString()}">`,
);

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
fs.writeFileSync(outFile, html);
console.log(
  `Inlined ${scripts} script(s) and ${styles} stylesheet(s) -> ${outFile} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`,
);

// Copy the files that must stay separate. sw.js gets a version stamp so phones
// replace their saved copy of the app when a new version is uploaded.
const extras = [];
for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === 'index.html' || entry.name.endsWith('.map')) continue;
  const from = path.join(buildDir, entry.name);
  const to = path.join(outDir, entry.name);
  if (entry.name === 'sw.js') {
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/__BUILD_VERSION__/g, version));
  } else {
    fs.copyFileSync(from, to);
  }
  extras.push(entry.name);
}
console.log(`Also copied: ${extras.join(', ') || '(none)'}${extras.includes('sw.js') ? ` (version ${version})` : ''}`);
