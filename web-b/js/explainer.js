/* ============================================================
   Explanation panel (F9).

   One plain-English paragraph per step. Uses explanations.json
   ("<episodeId>:<stepIndex>" -> text) when it has an entry, and
   otherwise builds a template sentence from the step itself, so
   every step always has an explanation and no server is needed.
   ============================================================ */

import { formatTMin } from './player.js';

const TRIGGER = {
  pc_above_threshold: 'the collision probability crossed the 1e\u22123 hard trigger',
  'pc_above_1e-3': 'the collision probability crossed the 1e\u22123 hard trigger',
  crewed_vehicle: 'a crewed vehicle is involved',
  rules_conflict: 'the policy and the rules disagree',
  silent_counterpart: 'the other side has not answered the handshake',
  high_fuel_cost: 'the manoeuvre is expensive in fuel',
  low_confidence: 'the policy is not confident',
  predictor_alarm: 'the danger predictor raised an alarm'
};

const make = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export class Explainer {
  constructor(panel) {
    this.panel = panel;
    this.texts = null;
    this.episode = null;
    this.verdict = null;
    this.render(null, -1);
  }

  setTexts(texts) { this.texts = texts && typeof texts === 'object' ? texts : null; }

  load(episode, verdict) {
    this.episode = episode;
    this.verdict = verdict;
    this.render(null, -1);
  }

  /** @returns {{ text, source }} */
  explain(episode, index) {
    const key = `${episode.id}:${index}`;
    const pre = this.texts && typeof this.texts[key] === 'string' ? this.texts[key].trim() : '';
    if (pre) return { text: pre, source: 'pre-generated' };
    return { text: template(episode, index, this.verdict), source: 'template' };
  }

  render(step, index) {
    const head = make('span', 'eyebrow', 'Why this is happening');
    head.style.cssText = 'display: block; margin-bottom: var(--sp-3)';

    if (!this.episode || !step) {
      this.panel.replaceChildren(head, make('p', 'faint explain__empty', 'Press play to hear the reasoning step by step.'));
      return;
    }
    const { text, source } = this.explain(this.episode, index);
    const body = make('p', 'explain__text', text);
    const meta = make('p', 'mono faint explain__meta', `${this.episode.id} \u00b7 step ${index} \u00b7 ${formatTMin(step.t_min)} \u00b7 ${source}`);
    const note = make('p', 'faint explain__note',
      'Collision probabilities are illustrative and come from linearised dynamics.' +
      (source === 'template' ? ' No pre-written explanation for this step, so this one is built from the step data.' : ''));
    this.panel.replaceChildren(head, body, meta, note);
  }
}

function template(episode, index, verdict) {
  const step = (episode.steps || [])[index];
  if (!step) return '';
  const name = (id) => ((episode.agents || []).find((a) => a.id === id) || {}).name || String(id);
  const parts = [];

  parts.push(`At ${formatTMin(step.t_min)} the collision probability is ${fmtPc(step.pc)} (illustrative), with a predicted miss of ${fmtM(step.miss_m)}.`);

  if (verdict && verdict.mover !== null) {
    parts.push(`The rules have already settled who moves: ${name(verdict.mover)} (rule ${verdict.rule}: ${verdict.reason.replace(/\.$/, '')}).`);
  } else if (verdict) {
    parts.push('Neither object can move, so this has to go to a human.');
  }

  const burned = Object.entries(step.actions || {}).find(([, a]) => a && a.action >= 1 && a.action <= 4);
  if (burned) parts.push(`${name(Number(burned[0]) || burned[0])} is burning at this step.`);

  if (step.escalation) {
    const why = TRIGGER[step.escalation.trigger] || 'a hard trigger fired';
    parts.push(`A human is asked to confirm, because ${why}.`);
  }

  const last = (step.messages || []).slice(-1)[0];
  if (last && !step.escalation) parts.push(`Latest message: ${last.type} from ${last.from}.`);

  return parts.join(' ');
}

const fmtPc = (pc) => (!pc ? 'unknown' : pc.toExponential(1).replace('e-', 'e\u2212'));
const fmtM = (v) => (!Number.isFinite(v) ? 'unknown distance' : v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`);
