/* ============================================================
   AI Brain panel (F3).

   For one satellite at the current step:
     - what it perceives (from the episode's step data)
     - the probability it gave each action, and its choice
       (as recorded by the simulation in steps[].actions)
     - the safety shield: if the rules say this object holds
       course but the policy chose a burn, the rules win

   The browser network itself (policy.js) is verified against
   Python by the parity check; its result is shown here.
   ============================================================ */

import { riskIntensity } from './globe.js';
import { formatTMin } from './player.js';
import { DEFAULT_ACTIONS } from './policy.js';

const GLOSS = {
  hold: 'Keep course.',
  small_open: 'Small burn to widen the gap.',
  large_open: 'Large burn to widen the gap.',
  small_close: 'Small burn in the opposite direction.',
  radial: 'Burn up or down.',
  request_yield: 'Ask the other object to move.',
  escalate: 'Call a human.'
};
const BURNS = new Set(['small_open', 'large_open', 'small_close', 'radial']);

const make = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export class AiBrain {
  constructor(panel) {
    this.panel = panel;
    this.episode = null;
    this.step = null;
    this.selected = null;
    this.verdict = null;
    this.mode = 'ai';
    this.actions = DEFAULT_ACTIONS;
    this.parity = null;
    this.render();
  }

  setPolicy(policy, parity) {
    if (policy) this.actions = policy.actions;
    this.parity = parity || null;
    this.render();
  }

  load(episode, verdict) {
    this.episode = episode;
    this.verdict = verdict;
    const agents = episode.agents || [];
    const first = agents.find((a) => a.class !== 'debris') || agents[0];
    this.selected = first ? first.id : null;
    this.step = null;
    this.render();
  }

  show(step) { this.step = step; this.render(); }

  select(id) {
    if (!this.episode || !(this.episode.agents || []).some((a) => a.id === id)) return false;
    this.selected = id;
    this.render();
    return true;
  }

  setMode(mode) { this.mode = mode; this.render(); }

  /* ---------- rendering ---------- */

  render() {
    const p = this.panel;
    const head = make('span', 'eyebrow', 'AI brain');
    head.style.cssText = 'display: block; margin-bottom: var(--sp-3)';

    if (!this.episode) {
      p.replaceChildren(head, make('p', 'faint brain__empty', 'Load an encounter to see what each satellite decides.'));
      return;
    }

    const agents = this.episode.agents || [];
    const me = agents.find((a) => a.id === this.selected) || agents[0];
    const other = agents.find((a) => a !== me);

    p.replaceChildren(head, this._picker(agents), ...this._body(me, other), this._footer());
  }

  _picker(agents) {
    const group = make('div', 'segmented brain__picker');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Choose a satellite');
    for (const a of agents) {
      const b = make('button', '', a.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(a.id === this.selected));
      b.addEventListener('click', () => this.select(a.id));
      group.append(b);
    }
    return group;
  }

  _body(me, other) {
    const out = [];
    const step = this.step;

    // debris has no brain
    if (me.class === 'debris') {
      out.push(make('p', 'brain__note', `${me.name} is debris. It has no controller and cannot act, so the other object moves.`));
      return out;
    }

    // perception
    const sees = make('section', 'brain__section');
    sees.append(make('span', 'brain__title', `What ${me.name} sees`));
    if (step) {
      const tMax = Math.abs((this.episode.steps || [])[0]?.t_min || 240) || 240;
      const rows = [
        ['time to closest approach', 1 - Math.min(1, Math.abs(step.t_min) / tMax), formatTMin(step.t_min)],
        ['collision risk (illustrative)', riskIntensity(step.pc), fmtPc(step.pc)],
        ['miss distance', Math.min(1, (step.miss_m || 0) / 8000), fmtM(step.miss_m)],
        ['uncertainty', Math.min(1, (step.sigma_m || 0) / 1000), fmtM(step.sigma_m)],
        ['own fuel', clamp01(me.fuel), fmt2(me.fuel)],
        ['other side\u2019s fuel', clamp01(other && other.fuel), fmt2(other && other.fuel)],
        ['own ledger', clamp01(((me.ledger || 0) + 10) / 20), signed(me.ledger)]
      ];
      for (const [label, v, text] of rows) sees.append(meterRow(label, v, text));
    } else {
      sees.append(make('p', 'faint', 'Press play to start the encounter.'));
    }
    out.push(sees);

    // rules-only mode: the policy is switched off
    if (this.mode === 'rules') {
      const v = this.verdict;
      const note = make('p', 'brain__note');
      note.textContent = v && v.mover !== null
        ? `Rules only: the policy is switched off. The who-yields rules alone decide: ${this._name(v.mover)} moves, ${this._name(v.holder)} holds course.`
        : 'Rules only: the policy is switched off.';
      out.push(note);
      return out;
    }

    // probabilities and choice
    const rec = step && step.actions ? step.actions[String(me.id)] : null;
    const probs = make('section', 'brain__section');
    probs.append(make('span', 'brain__title', 'Action probabilities'));
    if (!rec || !Array.isArray(rec.probs)) {
      probs.append(make('p', 'faint', step ? 'No decision recorded at this step.' : '\u2014'));
      out.push(probs);
      return out;
    }
    rec.probs.forEach((pr, i) => {
      const row = meterRow(this.actions[i] || `action ${i}`, pr, pr.toFixed(2), true);
      if (i === rec.action) row.classList.add('is-chosen');
      probs.append(row);
    });
    out.push(probs);

    const chosenName = this.actions[rec.action] || `action ${rec.action}`;
    const chosen = make('div', 'block brain__chosen');
    chosen.append(make('span', 'eyebrow', 'Chosen'), make('span', 'mono brain__action', chosenName),
      make('span', 'brain__gloss', GLOSS[chosenName] || ''));
    out.push(chosen);

    // safety shield: the rules outrank the policy
    const v = this.verdict;
    if (v && v.holder === me.id && BURNS.has(chosenName)) {
      out.push(make('p', 'brain__shield',
        `Safety shield: the rules say ${me.name} holds course, so this burn is not executed. The rules win and the case goes to a human.`));
    }
    return out;
  }

  _footer() {
    const f = make('p', 'faint brain__foot');
    const parts = ['The policy chooses how to move. Who moves was already decided by the rules.'];
    if (this.parity) {
      parts.push(this.parity.ok
        ? `Browser network verified against Python on ${this.parity.n} test vectors (max error ${this.parity.maxErr.toExponential(1)}).`
        : `Browser network does not match Python yet (max error ${Number.isFinite(this.parity.maxErr) ? this.parity.maxErr.toExponential(1) : 'n/a'}).`);
    }
    f.textContent = parts.join(' ');
    return f;
  }

  _name(id) {
    const a = (this.episode.agents || []).find((x) => x.id === id);
    return a ? a.name : String(id);
  }
}

function meterRow(label, value, text, mono) {
  const row = make('div', 'brain__row');
  const l = make('span', mono ? 'brain__label mono' : 'brain__label', label);
  const meter = make('span', 'meter');
  const fill = make('span');
  fill.style.width = `${Math.round(clamp01(value) * 100)}%`;
  meter.append(fill);
  const t = make('span', 'brain__value mono', text);
  row.append(l, meter, t);
  return row;
}

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '\u2014');
const signed = (v) => (Number.isFinite(v) ? (v > 0 ? `+${v}` : `${v}`) : '\u2014');
const fmtM = (v) => (!Number.isFinite(v) ? '\u2014' : v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`);
const fmtPc = (pc) => (!pc ? '\u2014' : pc.toExponential(1).replace('e-', 'e\u2212'));
