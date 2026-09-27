// Entry point: install the error boundary, load and validate data, then start every view.
import { install, guard, toast } from './errors.js';
import { store } from './state.js';
import { loadAll } from './data.js';
import { log } from './log.js';
import { $, $$, h } from './dom.js';
import * as theme from './theme.js';
import * as playback from './playback.js';
import * as events from './events.js';
import * as handshake from './handshake.js';
import * as ledger from './ledger.js';
import * as escalation from './escalation.js';
import * as brain from './brain.js';
import * as explain from './explain.js';
import * as replay from './replay.js';
import * as results from './results.js';
import * as live from './live.js';
import * as pair from './pair.js';
import * as globe from './globe.js';

install();

function tabs() {
  const buttons = $$('[role="tab"]');
  const selectTab = (btn) => {
    buttons.forEach((b) => {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
    });
  };
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => selectTab(b));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      selectTab(next);
      next.focus();
    });
  });
}

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

async function start() {
  guard('theme', theme.init)();
  tabs();
  const liveCfg = (await probeLive()) ?? { explain: false, run: false, episodes: false, pair: false };
  store.set('live', liveCfg);
  const { failed } = await loadAll(store, liveCfg.episodes ? { urls: { episodes: 'api/episodes' } } : {});
  if (liveCfg.episodes && !failed.episodes) {
    $('.mc-bar .spacer').before(h('span', { class: 'badge ok', 'data-testid': 'live-badge',
      text: `Live: scenarios decided by the simulator at ${new Date().toLocaleTimeString('en-GB')}` }));
  }
  if (Object.keys(failed).length) toast('Some demo data could not be loaded; affected panels show a notice.');
  if (!store.get('data').episodes) {
    $('#verdict-title').textContent = 'Scenario data unavailable';
    return;
  }
  guard('playback', playback.init)();
  guard('events', events.init)();
  guard('handshake', handshake.init)();
  guard('ledger', ledger.init)();
  guard('escalation', escalation.init)();
  guard('brain', brain.init)();
  guard('explain', explain.init)();
  guard('replay', replay.init)();
  guard('results', results.init)();
  guard('live', live.init)();
  guard('pair', pair.init)();
  const startGlobe = guard('globe', globe.init);
  if (typeof window.Globe === 'function') startGlobe();
  else window.addEventListener('load', startGlobe, { once: true });
  $('#kessler-btn').addEventListener('click', guard('kessler', () => {
    const on = globe.kessler();
    const banner = $('#note-banner');
    banner.textContent = on ? 'What if we fail? One collision creates thousands of fragments that stay in orbit for decades, and each one can cause the next collision (illustrative).' : '';
    banner.style.display = on ? 'block' : 'none';
    $('#kessler-btn').textContent = on ? 'Reset' : 'What if we fail?';
  }));
  log.info('app ready', { episodes: store.get('data').episodes.length });
}

start().catch((err) => { log.error('startup failed', { message: String(err && err.message) }); toast(); });
