/* ============================================================
   EpisodePlayer — the spine.

   Time-driven: keeps a simulated clock t (minutes relative to
   closest approach) and enters each step when t reaches its t_min.
   Speed means simulated seconds per real second, so 600x plays a
   240-minute encounter in 24 seconds. Uneven step spacing works.

   Events:
     load       { episode }
     tick       { t }                           — clock moved
     step       { step, index, tMin }
     message    { message, step, index }
     escalation { escalation, step, index }     — playback pauses until resolved
     state      { playing, speed, index, blocked, ended }
     end        { episode, outcome }
   ============================================================ */

const TICK_MS = 100;

export class EpisodePlayer {
  constructor() {
    this.episode = null;
    this.index = -1;
    this.t = 0;
    this.speed = 600;
    this.playing = false;
    this._blocked = false;   // waiting on a human decision
    this._ended = false;
    this._timer = null;
    this._last = 0;
    this._listeners = new Map();
  }

  /* ---------- subscription ---------- */

  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type).delete(fn);
  }

  _emit(type, payload) {
    for (const fn of this._listeners.get(type) || []) {
      try { fn(payload); } catch (err) { console.error(`[player] listener for "${type}" threw`, err); }
    }
  }

  /* ---------- loading ---------- */

  load(episode) {
    this.pause();
    this.episode = episode;
    this.index = -1;
    this._blocked = false;
    this._ended = false;
    this._emit('load', { episode });
    this.seek(0);
  }

  get steps() { return (this.episode && this.episode.steps) || []; }
  get step() { return this.steps[this.index] || null; }
  get tMin() { return this.t; }
  get blocked() { return this._blocked; }
  get ended() { return this._ended; }

  /* ---------- transport ---------- */

  play() {
    if (this.playing || this._blocked || !this.episode) return;
    if (this._ended) {                 // pressing play at the end restarts
      this.seek(0);
      if (this._blocked) return;
    }
    this.playing = true;
    this._last = performance.now();
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._emit('state', this._state());
  }

  pause() {
    this.playing = false;
    clearInterval(this._timer);
    this._timer = null;
    this._emit('state', this._state());
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  setSpeed(speed) {
    this.speed = Math.max(1, Number(speed) || 1);
    this._emit('state', this._state());
  }

  next() {
    if (this.index < this.steps.length - 1) this.seek(this.index + 1);
    else this._finish();
  }

  prev() { if (this.index > 0) this.seek(this.index - 1); }

  /* Jump to a step. Resets the clock to that step's time. */
  seek(index) {
    if (!this.episode || !this.steps.length) return;
    const i = Math.max(0, Math.min(index, this.steps.length - 1));
    this._ended = false;
    this.t = this.steps[i].t_min;
    this._enter(i);
    this._emit('tick', { t: this.t });
  }

  /* Called by the escalation modal once a human has decided. */
  resolveEscalation(decision) {
    this._blocked = false;
    this._emit('state', this._state());
    if (decision !== 'stop') this.play();
  }

  /* ---------- internals ---------- */

  _tick() {
    const now = performance.now();
    const dtSec = (now - this._last) / 1000;
    this._last = now;
    this.t += (this.speed * dtSec) / 60;

    const steps = this.steps;
    while (this.playing && !this._blocked &&
           this.index < steps.length - 1 && steps[this.index + 1].t_min <= this.t) {
      this._enter(this.index + 1);
    }

    if (this._blocked) this.t = this.step.t_min;   // clock freezes at the escalation

    const last = steps[steps.length - 1];
    if (!this._blocked && this.index === steps.length - 1 && this.t >= last.t_min) {
      this.t = last.t_min;
      this._emit('tick', { t: this.t });
      this._finish();
      return;
    }
    this._emit('tick', { t: this.t });
  }

  _enter(i) {
    this.index = i;
    const step = this.steps[i];
    this._emit('step', { step, index: i, tMin: step.t_min });
    for (const message of step.messages || []) this._emit('message', { message, step, index: i });
    if (step.escalation) {
      this._blocked = true;
      this.pause();
      this._emit('escalation', { escalation: step.escalation, step, index: i });
    }
  }

  _finish() {
    this.pause();
    this._ended = true;
    this._emit('state', this._state());
    this._emit('end', { episode: this.episode, outcome: this.episode ? this.episode.outcome : null });
  }

  _state() {
    return { playing: this.playing, speed: this.speed, index: this.index, blocked: this._blocked, ended: this._ended };
  }
}

/* t is minutes relative to closest approach. Render as T−HH:MM. */
export function formatTMin(t) {
  const total = Math.abs(Math.round(t));
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${t > 0.5 ? 'T+' : 'T\u2212'}${h}:${m}`;
}
