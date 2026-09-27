// Shared start-up for both pages: error boundary, live-server probe, data loading, globe start, Kessler button.
// Every element access here is guarded: the two pages do not share all ids.
import { install, guard, toast } from './errors.js';
import { store } from './state.js';
import { loadAll } from './data.js';
import { h, $ } from './dom.js';
import { log } from './log.js';

// The live server (same origin) is optional: without it every panel uses the pre-built data files.
async function probeLive() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch('api/health', { signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) return null;
    const j = await res.json();
    return { explain: j.explain === true, run: j.run === true, episodes: j.episodes === true, pair: j.pair === true };
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function boot() {
  install();
  const liveCfg = (await probeLive()) ?? { explain: false, run: false, episodes: false, pair: false };
  store.set('live', liveCfg);
  const { failed } = await loadAll(store, liveCfg.episodes ? { urls: { episodes: 'api/episodes' } } : {});
  if (Object.keys(failed).length) toast('Some demo data could not be loaded; affected panels show a notice.');
  const spacer = $('.mc-bar .spacer');
  if (liveCfg.episodes && !failed.episodes && spacer) {
    spacer.before(h('span', { class: 'badge ok', 'data-testid': 'live-badge',
      text: `Live: scenarios decided by the simulator at ${new Date().toLocaleTimeString('en-GB')}` }));
  }
  const ok = Boolean(store.get('data').episodes);
  log.info('boot', { ok, live: liveCfg });
  return { liveCfg, failed, ok };
}

export function startGlobe(globe) {
  if (!$('#globe')) return;
  const start = guard('globe', globe.init);
  if (typeof window.Globe === 'function') start();
  else window.addEventListener('load', start, { once: true });
}

export function kesslerButton(globe) {
  const btn = $('#kessler-btn');
  const banner = $('#note-banner');
  if (!btn) return;
  btn.addEventListener('click', guard('kessler', () => {
    const on = globe.kessler();
    if (banner) {
      banner.textContent = on ? 'What if we fail? One collision creates thousands of fragments that stay in orbit for decades, and each one can cause the next collision (illustrative).' : '';
      banner.style.display = on ? 'block' : 'none';
    }
    btn.textContent = on ? 'Reset' : 'What if we fail?';
  }));
}
