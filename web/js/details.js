// Details page: worked examples with every panel, the simulator with its working, the replay, results and prose.
import { boot, kesslerButton, startGlobe } from './boot.js';
import { guard, toast } from './errors.js';
import { store } from './state.js';
import { log } from './log.js';
import { $, $$ } from './dom.js';
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
import * as globe from './globe.js';
import * as tour from './tour.js';

function tabs() {
  const buttons = $$('[role="tab"]');
  const selectTab = (btn) => {
    buttons.forEach((b) => {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
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

async function start() {
  guard('theme', theme.init)();
  tabs();
  const { ok } = await boot();
  if (!ok) {
    const t = $('#verdict-title');
    if (t) t.textContent = 'Scenario data unavailable';
    return;
  }
  [['playback', playback], ['events', events], ['handshake', handshake], ['ledger', ledger], ['escalation', escalation],
    ['brain', brain], ['explain', explain], ['replay', replay], ['results', results], ['live', live]]
    .forEach(([name, mod]) => guard(name, mod.init)());
  startGlobe(globe);
  kesslerButton(globe);
  guard('tour', () => tour.init(tour.DETAILS_STEPS, { auto: false }))();
  log.info('details ready', { episodes: store.get('data').episodes.length });
}

start().catch((err) => { log.error('startup failed', { message: String(err && err.message) }); toast(); });
