/* ============================================================
   app.js — wiring only. Feature logic lives in its own module.
   ============================================================ */

import { SpaceMap } from './globe.js';
import { EpisodePlayer, formatTMin } from './player.js';
import { renderVerdict, hideVerdict } from './verdict.js';
import { HandshakeFeed } from './feed.js';
import { EscalationModal } from './escalation.js';
import { FairnessLedger } from './ledger.js';
import { Replay2019 } from './replay.js';
import { loadGovernance } from './governance.js';
import { Policy } from './policy.js';
import { AiBrain } from './brain.js';
import { Explainer } from './explainer.js';
import { ResultsPanel } from './results.js';
import { KesslerFinale } from './kessler.js';

const DATA = '../web/data';

const $ = (sel) => document.querySelector(sel);

const state = {
  objects: [],
  episodes: [],
  map: null,
  player: new EpisodePlayer(),
  mode: 'ai',
  verdict: null,
  decisions: []
};

/* ---------- data ---------- */

async function loadJSON(name) {
  try {
    const res = await fetch(`${DATA}/${name}.json`);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[data] ${name}.json unavailable (${err.message})`);
    return null;
  }
}

/* ---------- boot ---------- */

async function boot() {
  initTheme();
  initTabs();
  state.feed = new HandshakeFeed($('#panel-handshake'), (n) => bumpUnread('handshake', n));
  state.modal = new EscalationModal($('#escalation-modal'), onDecision);
  state.ledger = new FairnessLedger($('#panel-ledger'), () => bumpUnread('ledger', 1));
  state.brain = new AiBrain($('#panel-brain'));
  state.explain = new Explainer($('#panel-explain'));
  state.results = new ResultsPanel($('#results'));
  document.addEventListener('mode:change', (e) => { state.brain.setMode(e.detail); state.results.setMode(e.detail); });
  for (const a of document.querySelectorAll('[data-goto]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      $('#mission-control').scrollIntoView({ behavior: 'smooth' });
      selectTab(a.dataset.goto);
    });
  }
  state.replay = new Replay2019($('#replay-2019'), {
    getEpisode: () => state.episodes.find((e) => e.id === 'aeolus-2019'),
    onWatch: watchAeolusOnGlobe
  });
  for (const btn of document.querySelectorAll('[data-action="replay-2019"]')) {
    btn.addEventListener('click', () => { state.player.pause(); state.replay.open(); });
  }
  initTransport();

  const globeEl = $('#globe');
  try {
    state.map = new SpaceMap(globeEl, { onSelect: onGlobeSelect }).init();
  } catch (err) {
    console.error('[globe] init failed', err);
    globeEl.innerHTML = '<p class="faint" style="padding:var(--sp-5)">Space map unavailable.</p>';
  }

  if (state.map) {
    state.kessler = new KesslerFinale(state.map, { root: $('#kessler'), count: $('#kessler-count'), onReset: redrawCurrentThread });
  }
  for (const btn of document.querySelectorAll('[data-action="kessler"]')) {
    btn.addEventListener('click', runKessler);
    if (!state.map) btn.disabled = true;
  }

  loadGovernance('../docs/governance.md');   // independent of the data files

  const [objects, episodes] = await Promise.all([
    loadJSON('objects'),
    loadJSON('episodes')
  ]);

  if (objects && state.map) {
    const count = state.map.loadObjects(objects);
    console.info(`[globe] ${count} objects propagating`);
    state.map.start();
  }

  if (episodes && episodes.length) {
    state.episodes = episodes;
    renderEpisodePicker(episodes);
    renderEventList(episodes);
    state.player.load(episodes[0]);
  }

  // SHOULD-tier data: each file is optional, and the page works without any of them
  const [policySpec, testvec, explanations, results] = await Promise.all([
    loadJSON('policy'), loadJSON('testvec'), loadJSON('explanations'), loadJSON('results')
  ]);
  state.explain.setTexts(explanations);
  if (state.player.step) state.explain.render(state.player.step, state.player.index);
  state.results.load(results);
  if (policySpec) {
    try {
      const policy = new Policy(policySpec);
      const parity = policy.parity(testvec);
      if (parity.ok) console.info(`policy parity OK (max error ${parity.maxErr.toExponential(2)} over ${parity.n} vectors, weights ${parity.orientation})`);
      else console.warn(`policy parity FAILED (max error ${Number.isFinite(parity.maxErr) ? parity.maxErr.toExponential(2) : 'n/a'})`);
      state.policy = policy;
      state.brain.setPolicy(policy, parity);
    } catch (err) {
      console.warn('[policy] could not load', err);
    }
  }
}

/* ---------- episodes ---------- */

function renderEpisodePicker(episodes) {
  const sel = $('#episode-picker');
  sel.innerHTML = '';
  for (const ep of episodes) {
    const opt = document.createElement('option');
    opt.value = ep.id;
    opt.textContent = ep.id;
    sel.append(opt);
  }
  sel.addEventListener('change', () => {
    const ep = state.episodes.find((e) => e.id === sel.value);
    if (ep) state.player.load(ep);
  });
}

function renderEventList(episodes) {
  const list = $('#event-list');
  list.innerHTML = '';
  $('#event-count').textContent = episodes.length;

  for (const ep of episodes) {
    const first = (ep.steps && ep.steps[0]) || {};
    const agents = ep.agents || [];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'event-btn';
    btn.dataset.episode = ep.id;

    const title = document.createElement('span');
    title.style.fontWeight = '600';
    title.style.fontSize = '13px';
    title.textContent = agents.map((a) => a.name).join(' \u00d7 ') || ep.title || ep.id;

    const meta = document.createElement('span');
    meta.className = 'mono';
    meta.style.fontSize = '11px';
    meta.style.color = 'var(--text-2)';
    meta.append(
      document.createTextNode(`${formatTMin(first.t_min || 0)} \u00b7 Pc ${fmtPc(first.pc)} `)
    );
    const ill = document.createElement('span');
    ill.className = 'illustrative';
    meta.append(ill);

    const row = document.createElement('span');
    row.className = 'row gap-2';
    row.style.fontSize = '11px';
    row.style.color = 'var(--text-dim)';
    for (const a of agents) {
      const dot = document.createElement('span');
      dot.className = 'class-dot';
      dot.dataset.class = a.class;
      row.append(dot, document.createTextNode(a.operator || a.class));
    }

    btn.append(title, meta, row);
    btn.addEventListener('click', () => {
      const chosen = state.episodes.find((e) => e.id === ep.id);
      if (chosen) state.player.load(chosen);
      $('#episode-picker').value = ep.id;
    });
    list.append(btn);
  }
}

function markCurrentEvent(id) {
  for (const btn of document.querySelectorAll('.event-btn')) {
    btn.setAttribute('aria-current', String(btn.dataset.episode === id));
  }
}

/* ---------- transport ---------- */

const FOLLOW_MS = 250;   // how often the globe re-propagates while following an episode
let lastFollow = 0;

const ICON_PLAY  = '<svg width="12" height="13" viewBox="0 0 12 13" fill="currentColor" aria-hidden="true"><path d="M1 1 L11 6.5 L1 12 Z"/></svg>';
const ICON_PAUSE = '<svg width="12" height="13" viewBox="0 0 12 13" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="3.5" height="11" rx="1"/><rect x="7.5" y="1" width="3.5" height="11" rx="1"/></svg>';
const ICON_AGAIN = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 7 A4.5 4.5 0 1 0 4 3.6"/><path d="M1.8 1.8 L2 4.6 L4.8 4.2"/></svg>';

function initTransport() {
  const { player } = state;

  $('#play-toggle').addEventListener('click', () => player.toggle());

  // Start the player at whatever speed the picker shows, so the two can never disagree.
  const speedPicker = $('#speed-picker');
  const applySpeed = () => {
    const v = Number(speedPicker.value);
    player.setSpeed(v);
    if (state.map) state.map.setSpeed(v);
  };
  speedPicker.addEventListener('change', applySpeed);
  applySpeed();

  for (const btn of document.querySelectorAll('.segmented [data-mode]')) {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      for (const b of document.querySelectorAll('.segmented [data-mode]')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
      document.dispatchEvent(new CustomEvent('mode:change', { detail: state.mode }));
    });
  }

  player.on('load', ({ episode }) => {
    markCurrentEvent(episode.id);
    showVerdict(episode);
    state.feed.load(episode);
    clearUnread('handshake');
    state.ledger.seed(episode);
    state.brain.load(episode, state.verdict);
    state.explain.load(episode, state.verdict);
    if (state.kessler && state.kessler.active) state.kessler.reset(true);
    setAutonomy('L1');
    if (!state.map) return;
    state.map.clearThreads();
    state.map.setFocus(pairOf(episode));
    // With a TCA the globe follows the episode clock; without one it free-runs.
    if (episode.tca) state.map.stop();
    else if (!state.map.running) state.map.start();
  });

  player.on('tick', ({ t }) => {
    $('#clock').textContent = formatTMin(t);
    const ep = player.episode;
    if (!state.map || !ep || !ep.tca) return;
    const now = performance.now();
    if (now - lastFollow < FOLLOW_MS && player.playing) return;
    lastFollow = now;
    state.map.setTime(new Date(Date.parse(ep.tca) + t * 60000));
  });

  player.on('step', ({ step, index }) => {
    state.feed.showThrough(index);
    state.brain.show(step);
    state.explain.render(step, index);
    if (!state.map) return;
    const [a, b] = pairOf(player.episode);
    if (a !== undefined && b !== undefined) state.map.setThreads([{ a, b, pc: step.pc }]);
  });

  player.on('escalation', ({ escalation, step, index }) => {
    setAutonomy(escalation.level);
    const v = state.verdict;
    const plan = v && v.mover !== null
      ? `${agentName(player.episode, v.mover)} manoeuvres (rule ${v.rule}).`
      : 'No agreed plan: nobody can move.';
    state.modal.open({ episode: player.episode, step, index, escalation, plan });
  });

  player.on('state', ({ playing, ended, blocked }) => {
    const btn = $('#play-toggle');
    btn.innerHTML = playing ? ICON_PAUSE : ended ? ICON_AGAIN : ICON_PLAY;
    btn.setAttribute('aria-label', playing ? 'Pause' : ended ? 'Play again' : blocked ? 'Waiting for a human decision' : 'Play');
    btn.disabled = blocked;
  });

  player.on('end', ({ episode }) => {
    state.ledger.applyOutcome(episode);
    if (!state.map) return;
    state.map.clearThreads();
    if (!state.map.running) state.map.start();
  });
}

/* ---------- globe selection, Kessler (F3, F11) ---------- */

function onGlobeSelect(p) {
  if (p && state.brain.select(p.id)) selectTab('brain');
}

function runKessler() {
  if (!state.map || !state.kessler) return;
  state.player.pause();
  const ep = state.player.episode;
  const [a] = ep ? pairOf(ep) : [];
  const origin = (a !== undefined && state.map.positionOf(a)) || state.map.positions.values().next().value;
  state.kessler.run(origin);
}

function redrawCurrentThread() {
  const ep = state.player.episode, step = state.player.step;
  if (!state.map || !ep || !step) return;
  const [a, b] = pairOf(ep);
  if (a !== undefined && b !== undefined) state.map.setThreads([{ a, b, pc: step.pc }]);
}

/* ---------- 2019 replay (F10) ---------- */

function watchAeolusOnGlobe() {
  const ep = state.episodes.find((e) => e.id === 'aeolus-2019');
  $('#mission-control').scrollIntoView({ behavior: 'smooth' });
  if (!ep) return;
  state.player.load(ep);
  $('#episode-picker').value = ep.id;
  state.player.play();
}

/* ---------- escalation (F7) ---------- */

function onDecision(entry) {
  state.decisions.push(entry);
  renderDecisionLog();
  state.player.resolveEscalation(entry.decision);
}

function renderDecisionLog() {
  const list = $('#decision-log');
  if (!list) return;
  list.replaceChildren(...state.decisions.slice().reverse().map((d) => {
    const li = document.createElement('li');
    const what = document.createElement('span');
    what.textContent = `${d.label} by ${d.decidedBy}`;
    what.dataset.outcome = d.decision;
    const meta = document.createElement('span');
    meta.className = 'mono faint';
    meta.textContent = `${d.episode} \u00b7 ${formatTMin(d.t_min)} \u00b7 ${d.level || ''}`;
    li.append(what, meta);
    return li;
  }));
  $('#decision-log-wrap').hidden = state.decisions.length === 0;
}

/* Level meanings are not defined in the PRD yet; the indicator only shows which level is active. */
function setAutonomy(level) {
  for (const pill of document.querySelectorAll('#autonomy [data-level]')) {
    pill.dataset.active = String(pill.dataset.level === level);
  }
}

function agentName(episode, id) {
  const a = (episode.agents || []).find((x) => x.id === id);
  return a ? a.name : String(id);
}

/* ---------- tabs ---------- */

const TAB_IDS = ['brain', 'handshake', 'explain', 'ledger'];

function selectTab(id, focus = false) {
  for (const t of TAB_IDS) {
    const tab = $(`#tab-${t}`), panel = $(`#panel-${t}`);
    const on = t === id;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
    if (on) {
      clearUnread(t);
      if (focus) tab.focus();
      if (t === 'ledger' && state.ledger) requestAnimationFrame(() => state.ledger.onShow());
    }
  }
  state.activeTab = id;
}

function initTabs() {
  for (const t of TAB_IDS) {
    $(`#tab-${t}`).addEventListener('click', () => selectTab(t));
  }
  // arrow keys move between tabs, as screen-reader users expect
  $('.tabs').addEventListener('keydown', (e) => {
    const i = TAB_IDS.indexOf(state.activeTab);
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(TAB_IDS[(i + 1) % TAB_IDS.length], true); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); selectTab(TAB_IDS[(i + TAB_IDS.length - 1) % TAB_IDS.length], true); }
  });
  selectTab('handshake');
}

function bumpUnread(tabId, n) {
  if (state.activeTab === tabId) return;
  const tab = $(`#tab-${tabId}`);
  let badge = tab.querySelector('.unread');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'unread';
    badge.dataset.count = '0';
    tab.append(badge);
  }
  const count = Number(badge.dataset.count) + n;
  badge.dataset.count = String(count);
  badge.textContent = String(count);
  badge.setAttribute('aria-label', `${count} new`);
}

function clearUnread(tabId) {
  const badge = $(`#tab-${tabId}`)?.querySelector('.unread');
  if (badge) badge.remove();
}

/* ---------- theme ---------- */

function initTheme() {
  const btn = $('#theme-toggle');
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  };
  apply(document.documentElement.dataset.theme || 'dark');
  btn.addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

/* ---------- helpers ---------- */

/* F4: run the ladder on the episode's pair and show the result under the globe. */
function showVerdict(episode) {
  const root = $('#verdict-strip');
  const ids = pairOf(episode);
  const agents = episode.agents || [];
  const a = agents.find((x) => x.id === ids[0]);
  const b = agents.find((x) => x.id === ids[1]);
  if (!a || !b) { hideVerdict(root); state.verdict = null; return; }

  const verdict = renderVerdict(root, a, b);
  state.verdict = verdict;

  // Sanity check against the episode itself: did the object the rules chose actually burn?
  const dv = (episode.outcome && episode.outcome.dv_ms) || {};
  const burned = Object.entries(dv).filter(([, v]) => v > 0).map(([id]) => String(id));
  if (verdict.mover !== null && burned.length && !burned.includes(String(verdict.mover))) {
    console.warn(`[rules] ${episode.id}: rules say ${verdict.mover} moves, but outcome shows ${burned.join(', ')} burned`);
  } else {
    console.info(`[rules] ${episode.id}: rule ${verdict.rule} → ${verdict.mover} moves`);
  }
}

/* The two objects in conflict. episodes.json has no explicit field for this yet,
   so fall back to the first two agents when "pair" is absent. */
function pairOf(episode) {
  if (Array.isArray(episode.pair) && episode.pair.length >= 2) return episode.pair;
  return (episode.agents || []).slice(0, 2).map((a) => a.id);
}

function fmtPc(pc) {
  if (!pc) return '\u2014';
  // 0.00042 -> "4.2e−4"  (minus sign, not hyphen)
  return pc.toExponential(1).replace('e-', 'e\u2212').replace('e+', 'e');
}

boot();

export { state };
