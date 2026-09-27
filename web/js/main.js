// Encounter page: setup strip, globe + approach view, timeline, decision flow, and the human decision dialog.
import { boot, kesslerButton, startGlobe } from './boot.js';
import { guard, toast } from './errors.js';
import { store } from './state.js';
import { log } from './log.js';
import { $ } from './dom.js';
import * as theme from './theme.js';
import * as playback from './playback.js';
import * as escalation from './escalation.js';
import * as stage from './stage.js';
import * as setup from './setup.js';
import * as pair from './pair.js';
import * as timeline from './timeline.js';
import * as approach from './approach.js';
import * as flow from './flow.js';
import * as globe from './globe.js';
import * as tour from './tour.js';

async function start() {
  guard('theme', theme.init)();
  const { ok } = await boot();
  if (!ok) {
    const s = $('#setup-status');
    if (s) s.textContent = 'Scenario data unavailable.';
    return;
  }
  [['playback', playback], ['escalation', escalation], ['stage', stage], ['setup', setup], ['pair', pair], ['timeline', timeline], ['approach', approach], ['flow', flow]]
    .forEach(([name, mod]) => guard(name, mod.init)());
  startGlobe(globe);
  kesslerButton(globe);
  guard('tour', () => tour.init(tour.ENCOUNTER_STEPS))();
  log.info('encounter ready', { episodes: store.get('data').episodes.length });
}

start().catch((err) => { log.error('startup failed', { message: String(err && err.message) }); toast(); });
