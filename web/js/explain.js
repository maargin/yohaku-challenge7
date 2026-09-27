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

// The latest step up to i worth explaining: the first decision, an escalation, a burn or a note (mirrors sim/explain.py).
export function latestInteresting(steps, i) {
  const firstVerdict = steps.findIndex((s) => s.verdict);
  for (let k = Math.min(i, steps.length - 1); k >= 0; k -= 1) {
    const s = steps[k];
    const burn = Object.values(s.actions ?? {}).some((a) => a && [1, 2, 4].includes(a.action));
    if (k === firstVerdict || s.escalation || burn || s.note) return k;
  }
  return null;
}

function template(ep, steps, i) {
  const v = latestVerdict(steps, i);
  if (!v) return 'No close approach has been detected yet.';
  const y = ep.agents.find((a) => a.id === v.yielder);
  return y ? `${y.name} moves: ${v.reason}.` : `Neither object can move (${v.reason}); operators and the regulator are notified.`;
}

const liveText = new Map();
const pending = new Set();

async function requestLive(ep, index, key) {
  if (liveText.has(key) || pending.has(key)) return;
  pending.add(key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch('api/explain-step', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ep.id, variant: ep.variant, step: index }), signal: ctrl.signal, credentials: 'omit' });
    const j = res.ok ? await res.json() : null;
    liveText.set(key, j && typeof j.text === 'string' && j.text
      ? { text: j.text.slice(0, 600), source: j.source === 'model' ? 'model' : 'template' } : { text: null });
  } catch { liveText.set(key, { text: null }); } finally { clearTimeout(timer); pending.delete(key); }
  render();
}

function render() {
  const panel = $('#panel-explain');
  const ep = currentEpisode();
  if (!panel || !ep) return;
  const steps = currentSteps();
  const i = Math.min(store.get('stepIndex'), steps.length - 1);
  const ex = store.get('data').explanations;
  // the approve branch is the main line, so its steps can still be explained; other branches are not pre-written
  const branch = store.get('branch');
  const branched = Boolean(branch) && branch.choice !== 'approve' && i > branch.index;
  const idx = branched ? null : latestInteresting(steps, i);
  const key = idx === null ? null : `${ep.id}.${ep.variant}:${idx}`;
  const found = key !== null && ex && ex[key] ? { key, index: idx } : (branched ? null : latestKey(ex, ep.id, ep.variant, i));
  const live = store.get('live');
  const liveOn = Boolean(live && live.explain) && key !== null;
  const got = liveOn ? liveText.get(key) : null;
  if (liveOn && !got) requestLive(ep, idx, key);
  clear(panel);
  panel.append(h('div', { class: 'panel-title', text: 'Why this decision' }));
  if (got && got.text) {
    panel.append(h('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.6' }, text: got.text }),
      h('div', { class: 'small muted', text: `Written just now for ${tMinus(steps[idx].t_min)} by the local language model from the decision data${got.source === 'template' ? ' (offline template: the model did not answer)' : ''}.` }));
  } else if (found) {
    panel.append(h('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.6' }, text: ex[found.key] }),
      h('div', { class: 'small muted', text: `Written for ${tMinus(steps[found.index].t_min)} by a local open-weight language model from the decision data.` }));
    if (liveOn && !got) panel.append(h('div', { class: 'small muted', 'data-testid': 'explain-live-pending', text: 'Asking the local language model for a fresh explanation…' }));
  } else {
    panel.append(h('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.6' }, text: template(ep, steps, i) }),
      h('div', { class: 'small muted', text: 'Generated from the decision data (template).' }));
    if (liveOn && !got) panel.append(h('div', { class: 'small muted', 'data-testid': 'explain-live-pending', text: 'Asking the local language model for a fresh explanation…' }));
  }
}

export function init() {
  ['change:stepIndex', 'change:episodeId', 'change:variant', 'change:branch'].forEach((e) => store.on(e, render));
  render();
}
