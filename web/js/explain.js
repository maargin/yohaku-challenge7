// Explanation tab: the latest plain-English explanation up to the current step, with a template fallback.
import { store } from './state.js';
import { currentEpisode, currentSteps } from './playback.js';
import { latestVerdict } from './playbackCore.js';
import { h, clear, $ } from './dom.js';
import { tMinus } from './format.js';

export function latestKey(explanations, epId, variant, i) {
  for (let k = i; k >= 0; k -= 1) {
    const key = `${epId}.${variant}:${k}`;
    if (explanations && explanations[key]) return { key, index: k };
  }
  return null;
}

function template(ep, steps, i) {
  const v = latestVerdict(steps, i);
  if (!v) return 'No close approach has been detected yet.';
  const y = ep.agents.find((a) => a.id === v.yielder);
  return y ? `${y.name} moves: ${v.reason}.` : `Neither object can move (${v.reason}); operators and the regulator are notified.`;
}

function render() {
  const panel = $('#panel-explain');
  const ep = currentEpisode();
  if (!panel || !ep) return;
  const steps = currentSteps();
  const i = Math.min(store.get('stepIndex'), steps.length - 1);
  const ex = store.get('data').explanations;
  const branched = store.get('branch') && i > store.get('branch').index;
  const found = branched ? null : latestKey(ex, ep.id, ep.variant, i);
  clear(panel);
  panel.append(h('div', { class: 'panel-title', text: 'Why this decision' }));
  if (found) {
    panel.append(h('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.6' }, text: ex[found.key] }),
      h('div', { class: 'small muted', text: `Written for ${tMinus(steps[found.index].t_min)} by a local open-weight language model from the decision data.` }));
  } else {
    panel.append(h('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.6' }, text: template(ep, steps, i) }),
      h('div', { class: 'small muted', text: 'Generated from the decision data (template).' }));
  }
}

export function init() {
  ['change:stepIndex', 'change:episodeId', 'change:variant', 'change:branch'].forEach((e) => store.on(e, render));
  render();
}
