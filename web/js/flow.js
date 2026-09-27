// Decision flow: the seven stages of the current step, lit from the frame. Built once, re-rendered per step.
import { store } from './state.js';
import { h, clear, $ } from './dom.js';
import { CHECKS, checkIndex } from './frames.js';
import { ACTION_LABELS, pcText } from './format.js';

const STAGES = [['sense', '1 · Sense'], ['announce', '2 · Announce'], ['priority', '3 · Priority check'], ['propose', '4 · AI proposal'],
  ['safety', '5 · Safety layer'], ['execute', '6 · Execute'], ['human', '7 · Human']];
const MSG_COLOR = { PROPOSE: 'var(--info)', ACK: 'var(--ok)', 'DO-NOT-MOVE': 'var(--text-3)', EXECUTED: 'var(--accent)', ESCALATE: 'var(--warn)' };
const KIND = { 1: 'small opening burn', 2: 'large opening burn', 3: 'closing burn', 4: 'radial burn' };
const nodes = {};
const bodies = {};
let root = null;

const fmtM = (m) => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const cls = (c) => `var(--cls-${c})`;

function bar(label, pct, color, value) {
  return h('div', { class: 'fbar' },
    h('span', { class: 'fbar-label', text: label }),
    h('div', { class: 'fbar-track' }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: color } })),
    h('span', { class: 'fbar-val', text: value }));
}

function lit(stage, on) {
  nodes[stage].classList.toggle('lit', Boolean(on));
}

function agentTag(a) {
  return h('span', { class: 'ftag' }, h('i', { class: 'dot', style: { background: cls(a.cls) } }), h('span', { text: a.name }));
}

function render() {
  if (!root) return;
  const frames = store.get('frames') ?? [];
  if (!frames.length) return;
  const f = frames[Math.min(store.get('stepIndex') ?? 0, frames.length - 1)];
  const [a, b] = f.agents;

  // 1 · Sense
  let body = bodies.sense;
  clear(body);
  const lp = Math.max(-10, Math.min(0, Math.log10(Math.max(f.pc, 1e-12))));
  body.append(
    bar('Collision probability (illustrative)', (lp + 10) * 10, f.danger ? 'var(--warn)' : 'var(--info)', pcText(f.pc)),
    bar('Tracking uncertainty σ', Math.min(100, f.sigma / 30), 'var(--info)', fmtM(f.sigma)),
    bar('Predicted miss', Math.min(100, f.miss / 30), 'var(--text-3)', fmtM(f.miss)),
    h('div', { class: 'small', text: f.danger ? 'Dangerous: a manoeuvre is needed' : 'Not dangerous yet' }),
  );
  lit('sense', f.danger);

  // 2 · Announce
  body = bodies.announce;
  clear(body);
  body.append(
    h('div', { class: 'lane' },
      h('i', { class: 'dot', style: { background: cls(a.cls) }, title: a.name }),
      h('div', { class: 'wire' }, ...f.messages.slice(0, 4).map((m, k) => h('span', {
        class: `chip ${m.from === 0 ? 'ltr' : 'rtl'}`, style: { animationDelay: `${k * 0.3}s`, borderColor: MSG_COLOR[m.type] || 'var(--line-2)', color: MSG_COLOR[m.type] || 'var(--text)' }, text: m.type }))),
      h('i', { class: 'dot', style: { background: cls(b.cls) }, title: b.name })),
    ...(f.messages.length
      ? f.messages.slice(0, 3).map((m) => h('div', { class: 'small muted fmsg', text: `${f.agents[m.from] ? f.agents[m.from].name : '?'}: ${m.text}` }))
      : [h('div', { class: 'small muted', text: 'No messages this step' })]),
  );
  lit('announce', f.messages.length > 0);

  // 3 · Priority check
  body = bodies.priority;
  clear(body);
  const on = f.reason ? checkIndex(f.reason) : -1;
  body.append(
    h('div', { class: 'pills' }, ...CHECKS.map((c, k) => h('span', { class: `pill${k === on ? ' on' : ''}`, text: c }))),
    h('div', { class: 'small', text: f.reason ? (f.yielder === null ? 'Nobody can move' : `${f.agents[f.yielder].name} moves · ${f.agents[1 - f.yielder].name} holds`) : 'Waiting for both announcements' }),
    f.reason ? h('div', { class: 'small muted', text: f.reason }) : null,
  );
  lit('priority', Boolean(f.reason));

  // 4 · AI proposal
  body = bodies.propose;
  clear(body);
  f.agents.forEach((ag) => {
    const chosen = ag.proposed.action;
    body.append(
      h('div', { class: 'small fhead' }, agentTag(ag), h('span', { class: 'muted', text: ` proposes ${ACTION_LABELS[chosen]}${ag.proposed.prob !== null ? ` · ${Math.round(ag.proposed.prob * 100)}%` : ''}` })),
      h('div', { class: 'mini' }, ...ag.probs.map((p, k) => h('i', { title: `${ACTION_LABELS[k]} ${Math.round(p * 100)}%`, style: { height: `${Math.max(2, p * 100)}%`, background: k === chosen ? 'var(--accent)' : 'var(--line-3)' } }))),
    );
  });
  lit('propose', f.agents.some((ag) => ag.probs.length));

  // 5 · Safety layer
  body = bodies.safety;
  clear(body);
  let changed = false;
  f.agents.forEach((ag) => {
    const same = ag.proposed.action === ag.executed;
    changed = changed || !same;
    body.append(h('div', { class: 'small frow' }, agentTag(ag),
      h('span', { class: same ? 'ok' : 'warn', text: same ? ' ✓ ' : ' ⟲ ' }),
      h('span', { class: 'muted', text: same ? `${ACTION_LABELS[ag.executed]} allowed` : `${ACTION_LABELS[ag.proposed.action]} → ${ACTION_LABELS[ag.executed]}${ag.why ? ` · ${ag.why}` : ''}` })));
  });
  lit('safety', changed);

  // 6 · Execute
  body = bodies.execute;
  clear(body);
  f.agents.forEach((ag) => {
    body.append(h('div', { class: 'small frow' }, agentTag(ag),
      h('span', { class: ag.dv > 0 ? 'accent' : 'muted', text: ag.dv > 0 ? ` Δv ${ag.dv.toFixed(2)} m/s · ${KIND[ag.executed] || 'burn'}` : ' holds course' })));
  });
  if (Math.abs(f.missAfter - f.miss) > 0.5) body.append(h('div', { class: 'small', text: `Miss ${fmtM(f.miss)} → ${fmtM(f.missAfter)}` }));
  lit('execute', f.agents.some((ag) => ag.dv > 0));

  // 7 · Human
  body = bodies.human;
  clear(body);
  const decisions = store.get('decisions') ?? [];
  const last = decisions[decisions.length - 1];
  if (f.escalation) {
    body.append(h('div', { class: 'small warn', text: `${f.escalation.trigger} · ${f.escalation.level}` }),
      h('div', { class: 'small muted', text: f.escalation.reason || '' }),
      h('div', { class: 'small', text: f.decision ? 'Approval needed before acting' : 'Notified; can veto' }));
  } else {
    body.append(h('div', { class: 'small muted', text: 'Not needed this step' }));
  }
  if (last) body.append(h('span', { class: 'badge', text: `human: ${last.choice} at ${last.at || ''}` }));
  lit('human', Boolean(f.escalation) || Boolean(last));
}

export function init() {
  root = $('#pipe');
  if (!root) return;
  clear(root);
  STAGES.forEach(([key, label]) => {
    bodies[key] = h('div', { class: 'pnode-body' });
    nodes[key] = h('div', { class: 'pnode', 'data-stage': key }, h('div', { class: 'pnode-head', text: label }), bodies[key]);
    root.append(nodes[key]);
  });
  ['change:frames', 'change:stepIndex', 'change:decisions'].forEach((e) => store.on(e, render));
  store.on('change:playing', (p) => root.classList.toggle('playing', Boolean(p)));
  render();
}
