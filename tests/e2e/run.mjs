#!/usr/bin/env node
// Runs every browser test against a built copy of the app.
//
//   npm run test:e2e                       build, then run them all
//   node tests/e2e/run.mjs dist-single     run against an already-built folder
//   node tests/e2e/run.mjs dist-single --only shop-list,themes --jobs 2
//   APP_URL=https://... node tests/e2e/run.mjs   run against a copy that's already online
//
// Each test is a plain script that prints PASS/FAIL lines and exits 1 if anything failed.
// Screenshots go to tests/e2e/.out/<test>/. A test that fails is run once more on its own
// (some timing checks are sensitive to the machine being busy); it only counts as failed if it
// fails again.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPERS = new Set(['pw.cjs', 'review-seed.cjs', 'flow-lib.cjs', 'mockgist.cjs']);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const appDir = path.resolve(
  args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'dist-single',
);
const only = (opt('--only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const jobs = Math.max(1, Number(opt('--jobs', '4')) || 4);
const outRoot = path.resolve(opt('--out', path.join(HERE, '.out')));

const tests = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith('.cjs') && !HELPERS.has(f))
  .map((f) => f.replace(/\.cjs$/, ''))
  .filter((n) => !only.length || only.includes(n))
  .sort();
if (!tests.length) {
  console.error('No tests matched.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};
function serve(dir) {
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`No built app in ${dir}. Run "npm run build:single" first (or pass the folder).`);
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(dir, 'index.html');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function runOne(name, url) {
  const out = path.join(outRoot, name);
  fs.mkdirSync(out, { recursive: true });
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(HERE, `${name}.cjs`), out], {
      env: { ...process.env, APP_URL: url },
      cwd: HERE,
    });
    let log = '';
    child.stdout.on('data', (d) => {
      log += d;
    });
    child.stderr.on('data', (d) => {
      log += d;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 8 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(out, 'log.txt'), log);
      const passed = (log.match(/^PASS /gm) || []).length;
      const failed = log.split('\n').filter((l) => l.startsWith('FAIL '));
      resolve({
        name,
        ok: code === 0,
        passed,
        failed,
        seconds: Math.round((Date.now() - started) / 1000),
        tail: log.trim().split('\n').slice(-6).join('\n'),
      });
    });
  });
}

async function pool(items, n, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const server = process.env.APP_URL ? null : await serve(appDir);
const url = process.env.APP_URL || `http://127.0.0.1:${server.address().port}/`;
console.log(`Running ${tests.length} browser tests against ${url} (${jobs} at a time)…`);
let results = await pool(tests, jobs, (t) => runOne(t, url));
const retry = results.filter((r) => !r.ok).map((r) => r.name);
if (retry.length) {
  console.log(`Running again on their own: ${retry.join(', ')}`);
  for (const name of retry) {
    const again = await runOne(name, url);
    results = results.map((r) => (r.name === name ? { ...again, retried: true } : r));
  }
}
server?.close();

let failures = 0;
for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${r.name.padEnd(22)} ${String(r.passed).padStart(4)} checks  ${r.seconds}s${r.retried && r.ok ? '  (passed on a second run)' : ''}`,
  );
  if (!r.ok) {
    failures++;
    for (const f of r.failed.slice(0, 8)) console.log(`       ${f.slice(0, 200)}`);
    if (!r.failed.length)
      console.log(
        r.tail
          .split('\n')
          .map((l) => `       ${l}`)
          .join('\n'),
      );
  }
}
const total = results.reduce((s, r) => s + r.passed, 0);
console.log(
  failures
    ? `\n${failures} of ${results.length} tests FAILED (${total} checks passed). Logs and screenshots: ${outRoot}`
    : `\nAll ${results.length} browser tests passed (${total} checks).`,
);
process.exit(failures ? 1 : 0);
