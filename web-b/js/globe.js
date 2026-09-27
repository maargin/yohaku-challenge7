/* ============================================================
   SpaceMap — F1 (globe + objects) and F2 (danger threads).

   Performance contract from the brief:
     - at most ~3,000 points
     - propagate about once a second, never every frame
     - draw points, not meshes

   Objects are drawn with globe.gl's particles layer (THREE.Points),
   one particle set per class. The points layer is NOT used: in
   globe.gl a "point" is a cylinder standing on the surface, which
   is why satellites looked like short lines.
   ============================================================ */

const EARTH_RADIUS_KM = 6371;
const PROPAGATE_MS = 1000;
const MAX_OBJECTS = 3000;

const EARTH_TEXTURE = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-night.jpg';

// Particle size is in screen pixels (size attenuation off).
const CLASS_STYLE = {
  debris:       { color: '#6B7488', size: 1.6 },
  manoeuvrable: { color: '#4C8DD6', size: 2.2 },
  autonomous:   { color: '#3FB59B', size: 2.2 },
  crewed:       { color: '#F0B429', size: 4.5 }
};
const CLASS_ORDER = ['debris', 'manoeuvrable', 'autonomous', 'crewed'];

export class SpaceMap {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelect = options.onSelect || null;
    this.accent = options.accent || '#E39A3C';

    this.entries = [];            // { id, name, class, operator, satrec }
    this.positions = new Map();   // id -> { lat, lng, alt, ... }
    this.focusIds = new Set();    // objects in the current episode, drawn larger
    this.threads = [];            // { a, b, pc }
    this.overlay = { particles: [], arcs: [], color: '#E3865C' };  // temporary layer (Kessler finale)
    this._baseSets = [];

    this.simTime = new Date();
    this.speed = 60;
    this.globe = null;
    this._propTimer = null;
    this._lastTick = 0;
  }

  /* ---------- setup ---------- */

  init() {
    if (typeof Globe !== 'function') throw new Error('globe.gl did not load');

    this.globe = Globe()(this.container)
      .globeImageUrl(EARTH_TEXTURE)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#4C8DD6')
      .atmosphereAltitude(0.14)
      // objects (F1)
      .particlesList('particles')
      .particleLat('lat')
      .particleLng('lng')
      .particleAltitude('alt')
      .particleLabel('label')
      .particlesColor('color')
      .particlesSize('size')
      .particlesSizeAttenuation(false)
      .onParticleClick((p) => { if (this.onSelect) this.onSelect(p); })
      // threads (F2) — start and end at the satellites, not at the ground
      .arcStartAltitude('startAlt')
      .arcEndAltitude('endAlt')
      .arcAltitude('apex')
      .arcColor('color')
      .arcStroke('stroke')
      .arcDashLength(0.35)
      .arcDashGap(0.12)
      .arcDashAnimateTime(1600)
      .arcsTransitionDuration(0);

    const controls = this.globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;

    this._fit();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this.container);
    return this;
  }

  _fit() {
    if (!this.globe) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width && rect.height) this.globe.width(rect.width).height(rect.height);
  }

  /* ---------- objects ---------- */

  loadObjects(objects) {
    const entries = [];
    let skipped = 0;

    for (const obj of objects.slice(0, MAX_OBJECTS)) {
      let satrec = null;
      try { satrec = satellite.json2satrec(obj.omm); } catch (err) { /* fall through */ }
      if (!satrec || satrec.error) { skipped++; continue; }
      entries.push({ id: obj.id, name: obj.name, class: obj.class, operator: obj.operator, satrec });
    }

    this.entries = entries;
    if (skipped) console.warn(`[globe] skipped ${skipped} objects with unusable elements`);
    this._propagate();
    return entries.length;
  }

  /* Objects taking part in the current episode get drawn larger, in the accent colour. */
  setFocus(ids) {
    this.focusIds = new Set(ids || []);
    this._propagate();
  }

  /* ---------- clock ---------- */

  /* Free-running clock: advances simTime by speed x real time. */
  start(epoch) {
    if (epoch) this.simTime = new Date(epoch);
    this._lastTick = performance.now();
    clearInterval(this._propTimer);
    this._propTimer = setInterval(() => {
      const now = performance.now();
      this.simTime = new Date(this.simTime.getTime() + (now - this._lastTick) * this.speed);
      this._lastTick = now;
      this._propagate();
    }, PROPAGATE_MS);
  }

  stop() {
    clearInterval(this._propTimer);
    this._propTimer = null;
  }

  get running() { return this._propTimer !== null; }

  setSpeed(speed) { this.speed = Number(speed) || 1; }

  /* Jump to an exact time (used to follow an episode's clock). */
  setTime(date) {
    this.simTime = new Date(date);
    this._propagate();
  }

  /* ---------- propagation ---------- */

  _propagate() {
    if (!this.globe || !this.entries.length) return;

    const t = this.simTime;
    const gmst = satellite.gstime(t);
    const sets = {};
    for (const cls of CLASS_ORDER) sets[cls] = [];
    const focus = [];
    this.positions.clear();

    for (const e of this.entries) {
      let pv;
      try { pv = satellite.propagate(e.satrec, t); } catch (err) { continue; }
      if (!pv || !pv.position) continue;               // decayed or unpropagatable

      const geo = satellite.eciToGeodetic(pv.position, gmst);
      if (!Number.isFinite(geo.height) || geo.height < 80) continue;

      const p = {
        id: e.id,
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        alt: geo.height / EARTH_RADIUS_KM,
        label: `${e.name} · ${e.operator || e.class}`,
        name: e.name,
        class: e.class,
        operator: e.operator
      };
      this.positions.set(e.id, p);
      (this.focusIds.has(e.id) ? focus : (sets[e.class] || sets.debris)).push(p);
    }

    const data = CLASS_ORDER.map((cls) => ({
      particles: sets[cls], color: CLASS_STYLE[cls].color, size: CLASS_STYLE[cls].size
    }));
    if (focus.length) data.push({ particles: focus, color: this.accent, size: 7 });

    this._baseSets = data;
    this._pushParticles();
    this._renderThreads();
  }

  _pushParticles() {
    const data = this._baseSets.slice();
    if (this.overlay.particles.length) {
      data.push({ particles: this.overlay.particles, color: this.overlay.color, size: 2.4 });
    }
    this.globe.particlesData(data);
  }

  /* ---------- temporary overlay (F11) ---------- */

  /* Draw extra points and arcs without re-propagating the catalogue. */
  setOverlay({ particles = [], arcs = [], color } = {}) {
    this.overlay = { particles, arcs, color: color || this.overlay.color };
    if (!this.globe) return;
    this._pushParticles();
    this._renderThreads();
  }

  clearOverlay() { this.setOverlay({}); }

  /* A few random catalogue positions near a point, for the finale's threads. */
  objectsNear(p, maxDeg = 40, limit = 80) {
    const out = [];
    for (const q of this.positions.values()) {
      if (angularDistance(p, q) * 180 / Math.PI <= maxDeg) out.push(q);
      if (out.length >= limit) break;
    }
    return out;
  }

  /* ---------- F2 danger threads ---------- */

  setThreads(threads) {
    this.threads = threads || [];
    this._renderThreads();
  }

  clearThreads() {
    this.threads = [];
    this._renderThreads();
  }

  _renderThreads() {
    if (!this.globe) return;
    const arcs = [];
    for (const t of this.threads) {
      const a = this.positions.get(t.a);
      const b = this.positions.get(t.b);
      if (!a || !b) continue;
      const k = riskIntensity(t.pc);
      const col = withAlpha(this.accent, 0.3 + k * 0.65);
      arcs.push({
        startLat: a.lat, startLng: a.lng, startAlt: a.alt,
        endLat: b.lat, endLng: b.lng, endAlt: b.alt,
        // lift the arc a little above the higher of the two so it never dips into the planet
        apex: Math.max(a.alt, b.alt) + 0.02 + 0.25 * angularDistance(a, b),
        color: [col, col],
        stroke: 0.35 + k * 1.9
      });
    }
    for (const o of this.overlay.arcs) arcs.push(o);
    this.globe.arcsData(arcs);
  }

  positionOf(id) { return this.positions.get(id) || null; }
}

/* Pc spans 1e-7 to 1e-3. Map on a log scale to 0..1 so the thread visibly
   grows through the whole encounter instead of only in the last second. */
export function riskIntensity(pc) {
  if (!pc || pc <= 0) return 0;
  return Math.max(0, Math.min(1, (Math.log10(pc) + 7) / 4));
}

/* Great-circle angle between two positions, in radians (0..pi). */
function angularDistance(a, b) {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
