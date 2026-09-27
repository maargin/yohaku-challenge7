/* ============================================================
   Kessler finale (F11) — "What if we fail?"

   One collision at the current encounter becomes a spreading
   cloud of fragments. Each tick, new red threads connect
   fragments to objects nearby: every fragment is a new
   conjunction for someone. The screen reddens as it spreads.

   Performance: the 3,000 catalogue objects are frozen during the
   finale; only the fragment layer is redrawn, 4 times a second.
   The fragment count is illustrative.
   ============================================================ */

const FRAGMENTS = 360;
const MAX_THREADS = 64;
const TICK_MS = 250;
const DURATION_MS = 12000;
const RED = '#E3865C';

export class KesslerFinale {
  /**
   * @param {SpaceMap} map
   * @param {object} ui { root: overlay element, count: element for the live count, onReset }
   */
  constructor(map, ui) {
    this.map = map;
    this.ui = ui;
    this.running = false;
    this.timer = null;
    this.fragments = [];
    this.arcs = [];
    this._wasRunning = false;
    ui.root.querySelector('[data-kessler="reset"]').addEventListener('click', () => this.reset());
  }

  get active() { return this.fragments.length > 0; }

  /** @param {{lat, lng, alt}} origin */
  run(origin) {
    if (!this.map) return;
    this.reset(true);
    this.origin = origin || { lat: 20, lng: 0, alt: 0.12 };
    this._wasRunning = this.map.running;
    this.map.stop();
    this.map.clearThreads();

    this.fragments = makeFragments(this.origin, FRAGMENTS);
    this.arcs = [];
    this.nearby = this.map.objectsNear(this.origin, 55, 140);
    this.t0 = performance.now();
    this.running = true;
    this.ui.root.hidden = false;
    this.ui.root.dataset.phase = 'running';
    document.body.classList.add('is-kessler');

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { this._advance(DURATION_MS); this._end(); return; }

    this._advance(0);
    this.timer = setInterval(() => {
      const elapsed = performance.now() - this.t0;
      this._advance(Math.min(elapsed, DURATION_MS));
      if (elapsed >= DURATION_MS) this._end();
    }, TICK_MS);
  }

  reset(silent) {
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.fragments = [];
    this.arcs = [];
    if (this.map) {
      this.map.clearOverlay();
      if (this._wasRunning && !this.map.running) this.map.start();
    }
    this._wasRunning = false;
    this.ui.root.hidden = true;
    this.ui.root.style.removeProperty('--kessler-level');
    document.body.classList.remove('is-kessler');
    if (!silent && this.ui.onReset) this.ui.onReset();
  }

  _advance(elapsed) {
    const k = elapsed / DURATION_MS;           // 0 .. 1
    const t = elapsed / 1000;                  // seconds of animation

    const particles = this.fragments.map((f) => ({
      lat: clampLat(f.lat + f.vlat * t),
      lng: wrapLng(f.lng + f.vlng * t),
      alt: Math.max(0.02, f.alt + f.valt * t),
      label: 'fragment (illustrative)'
    }));

    // threads multiply: each tick connects a few more fragments to objects nearby.
    // A thread remembers its fragment by index, so it follows it as the cloud spreads.
    const target = Math.round(MAX_THREADS * Math.min(1, k * 1.3));
    while (this.arcs.length < target && this.nearby.length) {
      this.arcs.push({
        fi: (Math.random() * particles.length) | 0,
        to: this.nearby[(Math.random() * this.nearby.length) | 0]
      });
    }
    const arcs = this.arcs.map(({ fi, to }) => {
      const from = particles[fi];
      return {
        startLat: from.lat, startLng: from.lng, startAlt: from.alt,
        endLat: to.lat, endLng: to.lng, endAlt: to.alt,
        apex: Math.max(from.alt, to.alt) + 0.03,
        color: ['rgba(227, 134, 92, 0.75)', 'rgba(227, 134, 92, 0.35)'],
        stroke: 0.5
      };
    });

    this.map.setOverlay({ particles, arcs, color: RED });
    this.ui.root.style.setProperty('--kessler-level', (0.15 + 0.85 * k).toFixed(3));
    if (this.ui.count) this.ui.count.textContent = `${particles.length} fragments \u00b7 ${arcs.length} new conjunctions`;
  }

  _end() {
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.ui.root.dataset.phase = 'done';
    const reset = this.ui.root.querySelector('[data-kessler="reset"]');
    if (reset) reset.focus();
  }
}

/* A debris cloud: most fragments near the collision's own velocity,
   a few flung much further. Units are degrees and globe radii per second. */
function makeFragments(o, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const speed = 0.8 + Math.pow(Math.random(), 3) * 5.5;      // long tail
    const dir = Math.random() * Math.PI * 2;
    out.push({
      lat: o.lat, lng: o.lng, alt: o.alt,
      vlat: Math.sin(dir) * speed * 0.45,
      vlng: Math.cos(dir) * speed + 1.6,                        // drift along track
      valt: (Math.random() - 0.5) * 0.012
    });
  }
  return out;
}

const clampLat = (v) => Math.max(-85, Math.min(85, v));
const wrapLng = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
