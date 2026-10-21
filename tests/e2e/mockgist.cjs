// In-memory fake of the GitHub Gist API, shared by several Playwright browser contexts.
const crypto = require('crypto');

function createMockGist(initialFiles) {
  const gist = { id: 'testgist123', files: { ...initialFiles }, version: 1 };
  const log = [];
  const etag = () =>
    'W/"' +
    crypto
      .createHash('sha1')
      .update(JSON.stringify(gist.files) + gist.version)
      .digest('hex') +
    '"';
  const filesForApi = () => {
    const out = {};
    for (const [name, content] of Object.entries(gist.files)) {
      const bytes = Buffer.byteLength(content);
      out[name] = {
        filename: name,
        size: bytes,
        truncated: bytes > 1000000,
        content: bytes > 1000000 ? content.slice(0, 1000000) : content,
        raw_url: 'https://gist.githubusercontent.com/x/' + name,
      };
    }
    return out;
  };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'ETag, Link, x-ratelimit-limit, x-ratelimit-remaining',
    'access-control-allow-headers': 'Authorization, Content-Type, If-Match, If-None-Match',
    'access-control-allow-methods': 'GET, POST, PATCH',
  };

  async function handle(route, who) {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const auth = req.headers()['authorization'];
    if (auth !== 'Bearer test-token')
      return route.fulfill({
        status: 401,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Bad credentials' }),
      });
    if (method === 'GET') {
      const inm = req.headers()['if-none-match'];
      if (inm && inm === etag()) {
        log.push({ who, method, status: 304 });
        return route.fulfill({ status: 304, headers: { ...cors, etag: etag() } });
      }
      log.push({ who, method, status: 200, bytes: JSON.stringify(gist.files).length });
      return route.fulfill({
        status: 200,
        headers: { ...cors, etag: etag() },
        contentType: 'application/json',
        body: JSON.stringify({ id: gist.id, files: filesForApi() }),
      });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(req.postData());
      for (const [name, f] of Object.entries(body.files || {})) {
        if (f === null) delete gist.files[name];
        else gist.files[name] = f.content;
      }
      gist.version++;
      log.push({ who, method, status: 200, files: Object.keys(gist.files) });
      return route.fulfill({
        status: 200,
        headers: { ...cors, etag: etag() },
        contentType: 'application/json',
        body: JSON.stringify({ id: gist.id, files: filesForApi() }),
      });
    }
    return route.fulfill({ status: 405, headers: cors });
  }

  return {
    gist,
    log,
    handle,
    state() {
      const main = JSON.parse(gist.files['family-meal-planner.json']);
      if (main.__format) {
        let t = '';
        for (let i = 1; i <= main.parts; i++) t += gist.files[`family-meal-planner.part${i}.txt`];
        return JSON.parse(t);
      }
      return main;
    },
  };
}

module.exports = { createMockGist };
