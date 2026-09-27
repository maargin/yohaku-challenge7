/* ============================================================
   2019 replay (F10).

   Left, "Email world": what happened, scripted from ESA's
   published timeline (3 Sept 2019) and SpaceX's statement to
   SpaceNews about the missed messages.

   Right, "the System": the same encounter as a counterfactual.
   Who moves is not scripted — it is computed with rules.js from
   the aeolus-2019 episode's declared data, so the replay can
   never claim something the rules would not decide.

   8 beats x 4.2 s = 33.6 s, inside the brief's 40 s limit.
   ============================================================ */

import { verifyBothSides, RULES } from './rules.js';

const DEFAULT_BEAT_MS = 4200;

// Used only if episodes.json has no aeolus-2019 episode.
const FALLBACK_AGENTS = [
  { id: 43600, name: 'AEOLUS', class: 'manoeuvrable', operator: 'ESA', purpose: 'science' },
  { id: 44235, name: 'STARLINK-44', class: 'autonomous', operator: 'SpaceX', purpose: 'commercial' }
];

function buildScript(v) {
  return [
    {
      when: 'About a week out',
      email: 'US Air Force tracking data flags a possible close approach between Aeolus and Starlink 44 at 11:02 UTC on Monday 2 September.',
      system: `Same warning, same data. Both sides open a handshake and declare what they are: ${v.declared}.`
    },
    {
      when: 'Wed 28 Aug',
      email: 'The risk keeps rising. ESA emails the Starlink team to discuss options.',
      system: `Both sides run the right-of-way ladder on those declarations. ${v.ruleLine} Agreed in advance: if the risk crosses the threshold, ${v.mover} moves.`
    },
    {
      when: 'Thu 29 Aug',
      email: 'Starlink replies that it has no plan to act yet. SpaceX later put the risk at that point at about 1 in 50,000.',
      system: 'ACK. The plan goes into a shared log that both operators can see, and anyone can check later.'
    },
    {
      when: 'Thu 29 Aug, evening',
      email: 'The risk passes ESA\u2019s threshold of 1 in 10,000 for the first time. ESA prepares a burn to raise Aeolus by 350 m.',
      system: `Threshold crossed. Both sides see it in the same data, so nobody has to tell anybody. ${v.mover}\u2019s burn is prepared.`
    },
    {
      when: 'Fri 30 Aug \u2013 Sun 1 Sep',
      emailTone: 'fail',
      systemTone: 'ok',
      email: 'Refined data pushes the risk towards 1 in 1,000. The follow-up emails go unseen: a bug in SpaceX\u2019s on-call paging system.',
      system: 'There is no email to miss. The new risk arrives in the shared data, and the agreed plan still stands.'
    },
    {
      when: 'Sun 1 Sep',
      email: 'At about 1 in 1,000, ten times its threshold, ESA decides to move Aeolus on its own.',
      system: 'The collision probability crosses 1e\u22123, a hard trigger. A human confirms the plan that was already agreed.'
    },
    {
      when: 'Mon 2 Sep, 10:14 UTC',
      email: 'Aeolus fires its thrusters three times, half an orbit before closest approach.',
      system: `${v.mover} burns and sends EXECUTED. ${v.holder} holds course.`
    },
    {
      when: 'Mon 2 Sep, 11:02 UTC',
      email: 'Closest approach passes. About half an hour later Aeolus calls home. It is fine.',
      system: `Closest approach passes. The ledger credits ${v.moverOperator} for giving way.`
    }
  ];
}

export class Replay2019 {
  /**
   * @param {HTMLDialogElement} dialog  #replay-2019
   * @param {object} opts
   *   getEpisode: () => the aeolus-2019 episode, or undefined
   *   onWatch:    () => called by "Watch it on the globe"
   */
  constructor(dialog, opts = {}) {
    this.dialog = dialog;
    this.getEpisode = opts.getEpisode || (() => undefined);
    this.onWatch = opts.onWatch || null;
    this.beatMs = opts.beatMs || DEFAULT_BEAT_MS;
    this.index = -1;
    this.timer = null;
    this.paused = false;

    const $ = (sel) => dialog.querySelector(sel);
    this.list = $('#replay-beats');
    this.bar = $('#replay-bar');
    this.end = $('#replay-end');
    this.pauseBtn = $('#replay-pause');

    this.pauseBtn.addEventListener('click', () => (this.paused ? this.resume() : this.pause()));
    $('#replay-skip').addEventListener('click', () => this.skip());
    $('#replay-close').addEventListener('click', () => this.close());
    $('#replay-again').addEventListener('click', () => this.start());
    $('#replay-watch').addEventListener('click', () => { this.close(); if (this.onWatch) this.onWatch(); });
    dialog.addEventListener('close', () => this._stop());
  }

  open() {
    if (!this.dialog.open) this.dialog.showModal();
    this.start();
  }

  close() {
    this._stop();
    if (this.dialog.open) this.dialog.close();
  }

  start() {
    this._stop();
    this.script = buildScript(this._verdictText());
    this.index = -1;
    this.paused = false;
    this.pauseBtn.textContent = 'Pause';
    this.list.replaceChildren();
    this.end.hidden = true;
    this._setProgress();
    this._next();
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
    this.pauseBtn.textContent = 'Resume';
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseBtn.textContent = 'Pause';
    this._schedule();
  }

  skip() {
    clearTimeout(this.timer);
    while (this.index < this.script.length - 1) this._show(this.index + 1, false);
    this._finish();
  }

  /* ---------- internals ---------- */

  _verdictText() {
    const ep = this.getEpisode();
    const agents = (ep && ep.agents && ep.agents.length >= 2) ? ep.agents : FALLBACK_AGENTS;
    const aeolus = agents.find((x) => /aeolus/i.test(x.name)) || agents[0];
    const starlink = agents.find((x) => x !== aeolus) || agents[1];
    const { verdict } = verifyBothSides(aeolus, starlink);
    const byId = (id) => (id === aeolus.id ? aeolus : starlink);
    const mover = verdict.mover !== null ? byId(verdict.mover) : null;
    const holder = verdict.holder !== null ? byId(verdict.holder) : null;
    const describe = (d) => `${d.name}, ${d.purpose || d.class}`;

    return {
      declared: `${describe(aeolus)}; ${describe(starlink)}`,
      ruleLine: `Rule ${verdict.rule} (${RULES[verdict.rule - 1].label}): ${verdict.reason}`,
      mover: mover ? mover.name : 'nobody',
      holder: holder ? holder.name : 'Neither',
      moverOperator: mover ? (mover.operator || mover.name) : 'nobody'
    };
  }

  _next() {
    if (this.index >= this.script.length - 1) { this._finish(); return; }
    this._show(this.index + 1, true);
    this._schedule();
  }

  _schedule() {
    clearTimeout(this.timer);
    if (this.paused) return;
    this.timer = setTimeout(() => this._next(), this.beatMs);
  }

  _show(i, animate) {
    this.index = i;
    const beat = this.script[i];
    const li = document.createElement('li');
    li.className = 'replay__beat' + (animate ? ' is-new' : '');

    const card = (text, tone, side) => {
      const d = document.createElement('div');
      d.className = `replay__card replay__card--${side}` + (tone ? ` is-${tone}` : '');
      d.textContent = text;
      return d;
    };
    const when = document.createElement('div');
    when.className = 'replay__when mono';
    when.textContent = beat.when;

    li.append(card(beat.email, beat.emailTone, 'email'), when, card(beat.system, beat.systemTone, 'system'));
    for (const old of this.list.querySelectorAll('.replay__beat.is-current')) old.classList.remove('is-current');
    li.classList.add('is-current');
    this.list.append(li);
    li.scrollIntoView({ block: 'nearest', behavior: animate ? 'smooth' : 'auto' });
    this._setProgress();
  }

  _finish() {
    clearTimeout(this.timer);
    this.timer = null;
    this.index = this.script.length - 1;
    this._setProgress();
    this.end.hidden = false;
    this.end.scrollIntoView({ block: 'nearest' });
    this.pauseBtn.textContent = 'Pause';
    // only offer the globe if there is an episode to show on it
    const watch = this.dialog.querySelector('#replay-watch');
    watch.hidden = !this.getEpisode();
    (watch.hidden ? this.dialog.querySelector('#replay-again') : watch).focus();
  }

  _stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  _setProgress() {
    const n = this.script ? this.script.length : 1;
    this.bar.style.width = `${Math.max(0, ((this.index + 1) / n) * 100)}%`;
  }
}
