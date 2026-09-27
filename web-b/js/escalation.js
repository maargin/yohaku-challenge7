/* ============================================================
   Human escalation (F7).

   Opens when a step carries an `escalation`. The player is paused
   until a human chooses Approve / Override / Stop.

   Überlingen rule: an agreed machine plan beats an ad-hoc override.
   Override is only available until the plan has been committed
   (an EXECUTED message has been sent); after that, changes must
   go back through the handshake.

   A decision is required: Escape does not dismiss the dialog.
   ============================================================ */

import { formatTMin } from './player.js';

const TRIGGER_TEXT = {
  pc_above_threshold: 'Collision probability crossed the 1e\u22123 hard trigger (illustrative).',
  'pc_above_1e-3':    'Collision probability crossed the 1e\u22123 hard trigger (illustrative).',
  crewed_vehicle:     'A crewed vehicle is involved. A human must approve any plan.',
  rules_conflict:     'The policy and the rules disagree. The rules win, and a human confirms.',
  silent_counterpart: 'The counterpart has not answered the handshake.',
  high_fuel_cost:     'The planned manoeuvre has a high fuel cost.',
  low_confidence:     'The policy is not confident in its choice.',
  predictor_alarm:    'The danger predictor raised an alarm.'
};

const DECISION_LABEL = { approve: 'Approved', override: 'Overridden', stop: 'Stopped' };

export class EscalationModal {
  /**
   * @param {HTMLDialogElement} dialog  #escalation-modal
   * @param {(entry) => void} onDecision  called with the logged decision
   */
  constructor(dialog, onDecision) {
    this.dialog = dialog;
    this.onDecision = onDecision;
    this.ctx = null;
    this.log = [];

    for (const btn of dialog.querySelectorAll('[data-decision]')) {
      btn.addEventListener('click', () => this._decide(btn.dataset.decision));
    }
    // A decision point: Escape must not silently dismiss it.
    dialog.addEventListener('cancel', (e) => e.preventDefault());
  }

  /**
   * @param {object} ctx { episode, step, index, escalation, plan }
   *   plan: short text of the agreed machine plan, e.g. "STARLINK-44 manoeuvres"
   */
  open(ctx) {
    this.ctx = ctx;
    const { episode, step, index, escalation, plan } = ctx;
    const $ = (sel) => this.dialog.querySelector(sel);

    $('#escalation-meta').textContent =
      `${escalation.level || 'L?'} \u00b7 ${formatTMin(step.t_min)} \u00b7 ${episode.id}`;

    const escMsg = (step.messages || []).find((m) => m.type === 'ESCALATE');
    $('#escalation-reason').textContent =
      TRIGGER_TEXT[escalation.trigger] || (escMsg && escMsg.text) || `Trigger: ${escalation.trigger || 'unspecified'}`;

    $('#escalation-plan').textContent = plan || 'No agreed plan yet.';

    // Überlingen: once committed, override is no longer a unilateral option.
    const committed = (episode.steps || []).slice(0, index + 1)
      .some((s) => (s.messages || []).some((m) => m.type === 'EXECUTED'));
    const overrideBtn = $('[data-decision="override"]');
    overrideBtn.disabled = committed;
    $('#override-note').textContent = committed
      ? 'The plan is already committed. Any change must go back through the handshake.'
      : 'You can override until both sides commit. After that, changes go back through the handshake.';

    if (!this.dialog.open) this.dialog.showModal();
    $('[data-decision="approve"]').focus();
  }

  _decide(decision) {
    if (!this.ctx) return;
    const { episode, step, index, escalation } = this.ctx;
    const entry = {
      episode: episode.id,
      step: index,
      t_min: step.t_min,
      level: escalation.level || null,
      trigger: escalation.trigger || null,
      decision,
      label: DECISION_LABEL[decision] || decision,
      decidedBy: 'operator',
      at: new Date().toISOString()
    };
    this.log.push(entry);
    this.ctx = null;
    this.dialog.close();
    if (this.onDecision) this.onDecision(entry);
  }
}
