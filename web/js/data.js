// Fail-closed data gate: fetch each file with a timeout, validate, and store it — or mark it failed.
import { validate, KINDS } from './validate.js';
import { log } from './log.js';

export async function loadOne(kind, { fetchImpl = globalThis.fetch, base = 'data/', timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}${kind}.json`, { signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return validate(kind, JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAll(store, opts = {}) {
  const results = await Promise.allSettled(KINDS.map((k) => loadOne(k, opts)));
  const data = {};
  const failed = {};
  results.forEach((r, i) => {
    const kind = KINDS[i];
    if (r.status === 'fulfilled') data[kind] = r.value;
    else {
      failed[kind] = true;
      log.warn('data file unavailable', { kind, reason: String(r.reason && r.reason.message) });
    }
  });
  store.set('failed', failed);
  store.set('data', data);
  return { data, failed };
}
