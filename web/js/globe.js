// 3D globe of real CelesTrak objects (propagated with satellite.js) plus the current episode's agents,
// the risk link between them, and the Kessler fragment cascade.
import * as sat from '../vendor/satellite.js/index.js';
import { store } from './state.js';
import { currentEpisode, currentSteps } from './playback.js';
import { encounterSite, linkStyle, mix } from './threads.js';
import { log } from './log.js';

const EARTH_KM = 6371;
const CLASSES = ['debris', 'manoeuvrable', 'autonomous', 'crewed'];
let globe = null;
let records = [];
let simTime = Date.now();
let fragments = [];
let kesslerStart = 0;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function propagateAll(date) {
  const gmst = sat.gstime(date);
  const sets = Object.fromEntries(CLASSES.map((c) => [c, []]));
  for (const r of records) {
    try {
      const pv = sat.propagate(r.satrec, date);
      if (!pv || !pv.position || typeof pv.position === 'boolean') continue;
      const g = sat.eciToGeodetic(pv.position, gmst);
      const alt = g.height / EARTH_KM;
      if (!Number.isFinite(alt) || alt < 0 || alt > 0.9) continue;
      sets[r.cls].push({ lat: sat.degreesLat(g.latitude), lng: sat.degreesLong(g.longitude), alt });
    } catch { /* skip objects that fail to propagate */ }
  }
  return CLASSES.map((c) => ({ cls: c, pts: sets[c] }));
}

// Where a scenario is shown: a live pair sits at its first object's real position, others at a fixed site.
function siteOf(ep) {
  return ep && ep.site && Number.isFinite(ep.site.lat) && Number.isFinite(ep.site.lng) ? ep.site : encounterSite(ep ? ep.id : 'kessler');
}

// Has this agent executed a burn by step i?
function burnedBy(steps, i, agentId) {
  return steps.slice(0, i + 1).some((s) => { const a = s.actions && s.actions[agentId]; return a && [1, 2, 3, 4].includes(a.action); });
}

// Current position of a catalogue object, or null when it cannot be propagated.
export function positionOf(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return null;
  try {
    const date = new Date(simTime);
    const pv = sat.propagate(r.satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(date));
    return { lat: sat.degreesLat(g.latitude), lng: sat.degreesLong(g.longitude) };
  } catch { return null; }
}

function agentLayer() {
  const ep = currentEpisode();
  const steps = currentSteps();
  const i = store.get('stepIndex');
  if (!ep || !steps.length) return { points: [], arcs: [], labels: [] };
  const s = steps[Math.min(i, steps.length - 1)];
  const site = siteOf(ep);
  const closing = Math.max(0.15, -s.t_min / 240);
  const sep = 1.5 + 9 * closing;
  const [a, b] = ep.agents;
  const ba = burnedBy(steps, i, a.id);
  const bb = burnedBy(steps, i, b.id);
  // a satellite that has burned is pushed off the closing line: the reaction is visible on the globe
  const pa = { lat: site.lat + sep * 0.35 + (ba ? 2.5 : 0), lng: site.lng - sep, alt: ba ? 0.13 : 0.09, cls: a.class, name: ba ? `${a.name} · moved` : a.name };
  const pb = { lat: site.lat - sep * 0.35 - (bb ? 2.5 : 0), lng: site.lng + sep, alt: bb ? 0.13 : 0.09, cls: b.class, name: bb ? `${b.name} · moved` : b.name };
  const over = i >= steps.length - 1;
  const st = linkStyle(s.pc, { over });
  const color = mix(css('--link-low'), css('--link-high'), st.risk);
  return {
    points: [pa, pb],
    arcs: [{ startLat: pa.lat, startLng: pa.lng, endLat: pb.lat, endLng: pb.lng, stroke: st.stroke, color }],
    labels: [pa, pb],
  };
}

function render() {
  if (!globe) return;
  const L = agentLayer();
  globe.pointsData(L.points).labelsData(L.labels).arcsData(L.arcs);
}

function tick() {
  if (!globe) return;
  if (store.get('playing')) simTime += 500 * 1000 * store.get('speed');
  const sets = propagateAll(new Date(simTime));
  if (fragments.length) {
    const age = Math.min(1, (performance.now() - kesslerStart) / 9000);
    const shown = Math.floor(fragments.length * age);
    sets.push({ cls: 'fragment', pts: fragments.slice(0, shown).map((f) => ({ lat: f.lat + f.dLat * age * 30, lng: f.lng + f.dLng * age * 30, alt: f.alt })) });
  }
  globe.particlesData(sets);
}

export function kessler() {
  if (fragments.length) { fragments = []; tick(); return false; }
  const ep = currentEpisode();
  const site = siteOf(ep);
  const n = 1500;
  fragments = Array.from({ length: n }, () => ({
    lat: site.lat, lng: site.lng, alt: 0.08 + Math.random() * 0.05,
    dLat: (Math.random() - 0.5) * 2, dLng: (Math.random() - 0.5) * 4,
  }));
  kesslerStart = performance.now();
  return true;
}

export function init() {
  const el = document.getElementById('globe');
  if (!hasWebGL() || typeof window.Globe !== 'function') {
    document.getElementById('globe-fallback').style.display = 'flex';
    log.warn('webgl unavailable; showing fallback');
    return;
  }
  const objs = store.get('data').objects ?? [];
  records = objs.map((o) => {
    try { return { id: o.id, cls: o.class, satrec: sat.json2satrec(o.omm) }; } catch { return null; }
  }).filter(Boolean);
  const colors = { debris: css('--cls-debris'), manoeuvrable: css('--cls-manoeuvrable'), autonomous: css('--cls-autonomous'), crewed: css('--cls-crewed'), fragment: css('--warn-strong') };
  globe = window.Globe()(el)
    .backgroundColor('rgba(0,0,0,0)')
    .showGraticules(true)
    .showAtmosphere(true).atmosphereColor('#3a6ea5').atmosphereAltitude(0.12)
    .particlesList((d) => d.pts).particleLat('lat').particleLng('lng').particleAltitude('alt')
    .particlesSize((d) => (d.cls === 'crewed' ? 3 : d.cls === 'fragment' ? 1.2 : 1.6)).particlesSizeAttenuation(false)
    .particlesColor((d) => colors[d.cls])
    .pointLat('lat').pointLng('lng').pointAltitude('alt').pointRadius(0.9).pointColor((d) => colors[d.cls])
    .labelLat('lat').labelLng('lng').labelAltitude((d) => d.alt + 0.01).labelText('name').labelSize(1.2)
    .labelColor(() => css('--text')).labelDotRadius(0).labelResolution(2)
    .arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
    .arcColor('color').arcStroke('stroke').arcAltitude(0.12).arcDashLength(1).arcDashGap(0);
  const mat = globe.globeMaterial();
  if (mat && mat.color) { mat.color.set(css('--globe-ocean')); }
  const size = () => { globe.width(el.clientWidth).height(el.clientHeight); };
  size();
  new ResizeObserver(size).observe(el);
  const controls = globe.controls();
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.35;
  globe.pointOfView({ lat: 15, lng: 10, altitude: 2.6 });
  store.on('change:stepIndex', render);
  store.on('change:episodeId', () => { render(); focus(); });
  store.on('change:variant', render);
  store.on('change:branch', render);
  store.on('theme', () => { if (mat && mat.color) mat.color.set(css('--globe-ocean')); render(); });
  render();
  focus();
  tick();
  setInterval(tick, 1000);
  log.info('globe ready', { objects: records.length });
}

export function focus() {
  const ep = currentEpisode();
  if (!globe || !ep) return;
  const site = siteOf(ep);
  globe.pointOfView({ lat: site.lat, lng: site.lng, altitude: 2.2 }, reduced ? 0 : 1200);
}
