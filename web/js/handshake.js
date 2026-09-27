// Safety-layer decision card + handshake message log + autonomy ladder + decision log + live announcements.
import { store } from './state.js';
import { currentEpisode, currentSteps } from './playback.js';
import { latestVerdict, messagesUpTo } from './playbackCore.js';
import { h, clear, $, $$ } from './dom.js';
import { tMinus } from './format.js';

const LADDER_TEXT = {
  L0: 'L0 — manual: humans decide and act.',
  L1: 'L1 — humans decide; the AI advises.',
  L2: 'L2 — human approval required before acting.',
  L3: 'L3 — the AI acts; a human is notified and can veto.',
  L4: 'L4 — the AI acts on its own, inside the safety layer.',
};

function nameOf(ep, id) {
  const a = ep.agents.find((x) => x.id === id);
  return a ? a.name : id;
}

function currentLevel(steps, i) {
  for (let k = Math.min(i, steps.length - 1); k >= 0; k -= 1) if (steps[k].escalation) return steps[k].escalation.level;
  return 'L4';
}

let lastAnnounced = '';

function render() {
  const ep = currentEpisode();
  const steps = currentSteps();
  const i = store.get('stepIndex');
  if (!ep) return;
  const v = latestVerdict(steps, i);
  const branch = store.get('branch');
  const human = branch && i >= branch.index ? branch.choice : null;
  if (human === 'override' && v) {
    $('#verdict-title').textContent = `${nameOf(ep, v.yielder)} yields (human override)`;
    $('#verdict-reason').textContent = `A human overrode the safety-layer decision before either side committed. The change went back through the handshake and is logged.`;
  } else if (human === 'stop') {
    $('#verdict-title').textContent = 'Both hold (human stop)';
    $('#verdict-reason').textContent = 'A human stopped the manoeuvre. Both satellites hold course; the decision and its outcome are logged.';
  } else {
    $('#verdict-title').textContent = !v ? 'Waiting for detection' : v.yielder ? `${nameOf(ep, v.yielder)} yields` : 'Nobody can move';
    $('#verdict-reason').textContent = v ? `${v.reason[0].toUpperCase()}${v.reason.slice(1)}. Both onboard AIs computed this from shared handshake data.` : 'No close approach detected yet.';
  }
  const log = $('#handshake-log');
  clear(log);
  // The precomputed default ("human decision: APPROVED") is hidden; only the viewer's own decision is shown.
  const msgs = messagesUpTo(steps, i).filter((m) => !m.text.startsWith('human decision:'));
  for (const m of msgs) {
    log.append(h('li', {},
      h('span', { class: 'muted', text: tMinus(m.t_min).replace(' min', '') }),
      h('span', { class: `t-${m.type}`, text: m.type }),
      h('span', { text: `${nameOf(ep, m.from)}: ${m.text}` })));
  }
  if (!msgs.length) log.append(h('li', {}, h('span', { class: 'muted', text: '—' }), h('span', { class: 'muted', text: 'no messages' }), h('span', {})));
  for (const d of store.get('decisions')) {
    log.append(h('li', {}, h('span', { class: 'muted', text: 'human' }), h('span', { class: 't-ESCALATE', text: 'DECISION' }), h('span', { text: `${d.choice} at ${tMinus(d.t_min)} (logged ${d.at})` })));
  }
  const level = currentLevel(steps, i);
  $$('#ladder span').forEach((s) => s.classList.toggle('on', s.dataset.level === level));
  $('#ladder-text').textContent = LADDER_TEXT[level];
  const s = steps[Math.min(i, steps.length - 1)];
  const banner = $('#note-banner');
  banner.textContent = s && s.note ? s.note : '';
  banner.style.display = s && s.note ? 'block' : 'none';
  const say = v ? `${tMinus(s.t_min)}. ${v.yielder ? `${nameOf(ep, v.yielder)} yields: ${v.reason}` : 'Nobody can move'}.${s.escalation ? ` Escalated: ${s.escalation.trigger}, level ${s.escalation.level}.` : ''}` : '';
  if (say && say !== lastAnnounced) { $('#announcer').textContent = say; lastAnnounced = say; }
}

export function init() {
  ['change:stepIndex', 'change:episodeId', 'change:variant', 'change:branch', 'change:decisions'].forEach((e) => store.on(e, render));
  render();
}
