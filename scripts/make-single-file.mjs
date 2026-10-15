// Turns the normal build (dist/index.html + assets/*.js + assets/*.css) into ONE
// self-contained index.html, so the whole app can be put online by uploading a
// single file (e.g. to a GitHub Pages repository).
//
// Usage: node scripts/make-single-file.mjs [buildDir] [outDir]
//   defaults: dist  ->  dist-single
import fs from 'node:fs';
import path from 'node:path';

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

if (scripts === 0) {
  console.error('No local <script src> found in', htmlPath);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
fs.writeFileSync(outFile, html);
console.log(`Inlined ${scripts} script(s) and ${styles} stylesheet(s) -> ${outFile} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
