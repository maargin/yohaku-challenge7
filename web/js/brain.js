// AI Brain tab: what the selected satellite sees, its action probabilities, and the live policy parity check.
import { store } from './state.js';
import { currentEpisode, currentSteps } from './playback.js';
import { latestVerdict } from './playbackCore.js';
import { parity } from './policy.js';
import { h, clear, $ } from './dom.js';
import { ACTION_LABELS, pcText, tMinus } from './format.js';

let parityResult = null;
let selected = null;

function row(label, value, pctWidth, color = 'var(--info)') {
  return h('div', { class: 'bar-row' },
    h('span', { class: 'muted', text: label }),
    h('div', { class: 'bar' }, h('i', { style: { width: `${Math.max(0, Math.min(100, pctWidth))}%`, background: color } })),
    h('span', { class: 'bar-val', text: value }));
}

function render() {
  const panel = $('#panel-brain');
  const ep = currentEpisode();
  if (!panel || !ep) return;
  const steps = currentSteps();
  const i = Math.min(store.get('stepIndex'), steps.length - 1);
  const s = steps[i];
  const v = latestVerdict(steps, i);
  const agent = ep.agents.find((a) => a.id === selected) ?? ep.agents.find((a) => v && a.id === v.yielder) ?? ep.agents[0];
  const other = ep.agents.find((a) => a.id !== agent.id);
  clear(panel);
  const picker = h('div', { class: 'seg', role: 'group', 'aria-label': 'Satellite' },
    ...ep.agents.map((a) => h('button', { class: 'btn', 'aria-pressed': String(a.id === agent.id), 'data-testid': `brain-agent-${a.id}`,
      onClick: () => { selected = a.id; render(); }, text: a.name })));
  panel.append(
    h('div', { class: 'panel-title', text: 'AI Brain · shared policy' }),
    picker,
    h('div', { class: 'verdict-title', style: { fontSize: '19px' }, text: `What ${agent.name} sees` }),
    row('Time to closest', tMinus(s.t_min), (-s.t_min / 240) * 100),
    row('Miss distance', `${Math.round(s.miss_m)} m`, Math.min(100, s.miss_m / 20), 'var(--warn-strong)'),
    row('Uncertainty σ', `${Math.round(s.sigma_m)} m`, Math.min(100, s.sigma_m / 20)),
    row('Collision prob.', pcText(s.pc), ((Math.log10(Math.max(s.pc, 1e-10)) + 10) / 10) * 100, 'var(--warn)'),
    row('Own fuel', `${Math.round(agent.fuel * 100)}%`, agent.fuel * 100, 'var(--ok)'),
    h('div', { class: 'bar-row' }, h('span', { class: 'muted', text: 'Threat' }), h('span', { text: `${other.name} (${other.class})` }), h('span', {})),
    h('div', { class: 'bar-row' }, h('span', { class: 'muted', text: 'Priority' }), h('span', { text: v ? (v.yielder === agent.id ? 'yielder' : 'stand-on') : 'pending' }), h('span', {})),
    h('div', { class: 'panel-title', style: { marginTop: '8px' }, text: 'Action probabilities' }),
  );
  const probs = s.actions[agent.id]?.probs ?? [];
  const best = probs.indexOf(Math.max(...probs));
  probs.forEach((p, k) => panel.append(row(ACTION_LABELS[k], p.toFixed(2), p * 100, k === best ? 'var(--accent)' : 'var(--line-3)')));
  panel.append(h('div', { class: 'card' },
    h('span', { class: 'small muted', text: 'Safety layer' }),
    h('span', { class: 'small', text: 'Every proposal passes through the safety layer before it is executed: a fixed priority check (debris never moves, crewed holds, low fuel is protected) and the hard escalation triggers. If the AI proposes something the safety layer forbids, the safe action is executed and the conflict is logged.' })));
  if (parityResult !== null) {
    const ok = parityResult < 1e-4;
    panel.append(h('span', { class: `badge ${ok ? 'ok' : 'warn'}`, 'data-testid': 'policy-parity-badge',
      text: ok ? `policy parity OK · max error ${parityResult.toExponential(1)}` : 'policy parity check failed' }));
  }
}

export function init() {
  const { policy, testvec } = store.get('data');
  if (policy && testvec) {
    parityResult = parity(policy, testvec);
    const msg = `policy parity ${parityResult < 1e-4 ? 'OK' : 'FAILED'} (max error ${parityResult})`;
    console.log(msg);
  }
  store.on('change:episodeId', () => { selected = null; render(); });
  ['change:stepIndex', 'change:variant', 'change:branch'].forEach((e) => store.on(e, render));
  render();
}
