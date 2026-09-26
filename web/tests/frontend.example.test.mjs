// Example-based tests: fail-closed loading, formatting, explanation lookup, and CSP hygiene of the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadOne } from '../js/data.js';
import { oneIn, pcText, signed, tMinus } from '../js/format.js';
import { createStore } from '../js/state.js';

const fakeFetch = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, text: async () => body });

test('loadOne rejects invalid JSON shape (fail closed)', async () => {
  await assert.rejects(loadOne('results', { fetchImpl: fakeFetch('{"strategies": 3}') }));
  await assert.rejects(loadOne('results', { fetchImpl: fakeFetch('not json') }));
  await assert.rejects(loadOne('results', { fetchImpl: fakeFetch('{}', false) }));
});

test('loadOne accepts a valid file', async () => {
  const good = readFileSync(new URL('../data/results.json', import.meta.url), 'utf8');
  const r = await loadOne('results', { fetchImpl: fakeFetch(good) });
  assert.ok(Array.isArray(r.strategies));
});

test('formatting helpers', () => {
  assert.equal(tMinus(-70), 'T−70 min');
  assert.equal(tMinus(0), 'closest approach');
  assert.equal(oneIn(2e-5), '1 in 50,000');
  assert.equal(pcText(0), '< 1e-12');
  assert.equal(signed(0.5, 1), '+0.5');
  assert.equal(signed(-2, 1), '−2.0');
});

test('store emits change events only on change', () => {
  const s = createStore({ a: 1 });
  let n = 0;
  s.on('change:a', () => { n += 1; });
  s.set('a', 1);
  s.set('a', 2);
  assert.equal(n, 1);
});

test('no inline scripts or inline event handlers in index.html (CSP)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'inline <script> found');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'inline on* handler found');
});

test('no innerHTML, eval or new Function in app code', () => {
  const dir = new URL('../js/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/\binnerHTML\b|\beval\s*\(|new Function\s*\(/.test(src), f);
  }
});

test('security headers file sets every required header', () => {
  const hdr = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  for (const h of ["script-src 'self'", "frame-ancestors 'none'", 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy: strict-origin-when-cross-origin']) {
    assert.ok(hdr.includes(h), h);
  }
});

test('no fungi wording in the UI', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').toLowerCase();
  assert.ok(!/fung|mycel|hypha/.test(html));
});
