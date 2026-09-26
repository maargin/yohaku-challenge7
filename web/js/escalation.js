// Human decision dialog: opens on an escalation that needs approval; the choice selects a precomputed branch.
import { store } from './state.js';
import { currentEpisode, play } from './playback.js';
import { $, $$ } from './dom.js';
import { oneIn, pcText, tMinus } from './format.js';

let pending = null;

function describe(ep, step) {
  const v = step.verdict;
  const y = v && ep.agents.find((a) => a.id === v.yielder);
  const other = v && ep.agents.find((a) => a.id !== v.yielder);
  return y ? `${y.name} burns; ${other.name} holds course` : 'Both hold';
}

function open({ index, step }) {
  const ep = currentEpisode();
  pending = { index, t_min: step.t_min };
  $('#decision-kicker').textContent = `ESCALATION · ${step.escalation.trigger} · LEVEL ${step.escalation.level}`;
  $('#decision-when').textContent = `${ep.agents.map((a) => a.name).join(' × ')} · ${tMinus(step.t_min)}`;
  $('#decision-title').textContent = step.escalation.trigger === 'CREWED'
    ? 'A crewed vehicle is involved. The plan needs your approval.'
    : `${step.escalation.reason.charAt(0).toUpperCase()}${step.escalation.reason.slice(1)}. The plan needs your approval.`;
  $('#decision-plan').textContent = describe(ep, step);
  $('#decision-risk').textContent = `Pc ${pcText(step.pc)} (${oneIn(step.pc)})`;
  $('#decision-text').textContent = 'The rules decided who moves. Neither side has committed yet, so you can still override. Once both send EXECUTED, any change must go back through the handshake.';
  const dlg = $('#decision');
  if (!dlg.open) dlg.showModal();
  $('[data-choice="approve"]').focus();
}

function choose(choice) {
  if (!pending) return;
  const decisions = store.get('decisions').concat([{ choice, t_min: pending.t_min, at: new Date().toISOString().slice(11, 19) + ' UTC' }]);
  store.set('decisions', decisions);
  store.set('branch', { index: pending.index, choice });
  pending = null;
  $('#decision').close();
  play();
}

export function init() {
  store.on('decision:needed', open);
  $$('[data-choice]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.choice)));
  $('#decision').addEventListener('cancel', () => { pending = null; });
}
