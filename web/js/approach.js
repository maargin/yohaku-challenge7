// Approach view: the two paths over time, drawn from frames on a 2D canvas.
// Time runs left to right up to closest approach. The object that holds course is a straight line with a red band
// of one hard-body radius (20 m) on each side; the other object's path comes in from far away and crosses at the
// predicted miss distance, inside an uncertainty funnel that narrows as tracking improves. A burn bends the path.
// The picture is schematic: distances on the vertical axis are real, the shape of the path is illustrative.
import { store } from './state.js';
import { $ } from './dom.js';
import { linkStyle, mix } from './threads.js';
import { tMinus, pcText } from './format.js';

const RADIUS_M = 20;
const T_START = -240;
const T_END = 50;
const FAR_M = 2000;
const STAGES = ['Detect', 'Announce', 'Priority', 'Propose', 'Check', 'Burn', 'Safe'];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let canvas = null;
let ctx = null;
let hud = null;
let announcer = null;
let W = 0;
let H = 0;
let shownT = null;
let raf = 0;
let lastAnnounced = null;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmtM = (m) => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

function current() {
  const frames = store.get('frames') ?? [];
  if (!frames.length) return null;
  const i = Math.min(store.get('stepIndex') ?? 0, frames.length - 1);
  return { frame: frames[i], frames, i };
}

// What the encounter looks like from the frames: who moves, when the burn happens, the miss before and after.
function story(frames, i) {
  const f = frames[i];
  const mover = f.yielder === null ? 1 : f.yielder;
  const burnIdx = frames.findIndex((fr) => fr.agents[mover].dv > 0);
  const burned = burnIdx >= 0 && i >= burnIdx;
  const missBefore = burnIdx >= 0 ? frames[burnIdx].miss : f.miss;
  const missAfter = burnIdx >= 0 ? frames[burnIdx].missAfter : f.miss;
  const stage = (() => {
    if (burned && missAfter > RADIUS_M && f.pc < 1e-4) return 6;
    if (burned) return 5;
    if (f.reason && f.agents[mover].proposed.action !== 0) return 4;
    if (f.reason && f.agents.some((a) => a.probs.length)) return 3;
    if (f.reason) return 2;
    if (f.messages.length) return 1;
    return f.danger ? 0 : -1;
  })();
  return { mover, standOn: 1 - mover, burnIdx, burned, missBefore, missAfter, stage };
}

function size() {
  const r = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(r.width));
  H = Math.max(1, Math.round(r.height));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  raf = 0;
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const cur = current();
  if (!cur) { if (hud) hud.textContent = 'Waiting for an encounter'; return; }
  const { frame, frames, i } = cur;
  const st = story(frames, i);
  const mover = frame.agents[st.mover];
  const standOn = frame.agents[st.standOn];

  // time tween for the marker
  if (shownT === null || reduced) shownT = frame.t;
  else shownT += (frame.t - shownT) * 0.3;
  const settled = Math.abs(shownT - frame.t) < 0.2;

  // plot area and scales: time along x; separation along y (linear to 50 m, then logarithmic to 2 km)
  const left = 58;
  const right = W - 14;
  const top = 46;
  const bottom = H - 62;
  const cy = (top + bottom) / 2;
  const halfH = (bottom - top) / 2;
  const x = (t) => left + ((t - T_START) / (T_END - T_START)) * (right - left);
  const k1 = Math.min(1.1, (halfH * 0.32) / 50);
  const k2 = (halfH - 50 * k1 - 6) / Math.log10(FAR_M / 50);
  const f = (m) => (m <= 50 ? m * k1 : 50 * k1 + Math.log10(m / 50) * k2);
  const y = (sep) => cy - f(Math.min(FAR_M, Math.max(0, sep)));
  const sepPath = (t, missAtTca) => missAtTca + (FAR_M - missAtTca) * Math.pow(Math.max(0, -t) / 240, 1.6);
  const sigmaAt = (t) => {
    const k = frames.findIndex((fr) => fr.t >= t);
    return frames[k < 0 ? frames.length - 1 : k].sigma;
  };

  const mono = `12px ${css('--font-mono') || 'monospace'}`;
  ctx.font = mono;
  ctx.lineWidth = 1;

  // axes
  ctx.fillStyle = css('--text-4');
  ctx.textAlign = 'right';
  for (const m of [0, 100, 500, 1000, 2000]) {
    ctx.strokeStyle = css('--line');
    ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(left, y(m)); ctx.lineTo(right, y(m)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(m === 0 ? '0' : fmtM(m), left - 8, y(m) + 4);
  }
  ctx.textAlign = 'center';
  ctx.strokeStyle = css('--line-3');
  for (const t of [-240, -180, -120, -60, 0]) {
    ctx.fillText(t === 0 ? 'closest approach' : tMinus(t), x(t), bottom + 18);
    ctx.beginPath(); ctx.moveTo(x(t), bottom); ctx.lineTo(x(t), bottom + 5); ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.fillText('separation from the object that holds course', left + 6, top - 8);

  // the collision band around the object that holds course
  const bandTop = y(RADIUS_M);
  ctx.fillStyle = css('--warn');
  ctx.globalAlpha = 0.18;
  ctx.fillRect(left, bandTop, right - left, (cy - bandTop) * 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = css('--warn');
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(left, bandTop); ctx.lineTo(right, bandTop); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css('--warn');
  ctx.fillText(`±${RADIUS_M} m: collision band`, right - 156, bandTop - 6);

  // the object that holds course: a straight path at zero separation
  ctx.strokeStyle = css(`--cls-${standOn.cls}`);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(left, cy); ctx.lineTo(right, cy); ctx.stroke();
  ctx.lineWidth = 1;

  // uncertainty funnel around the current predicted path
  const tb = st.burnIdx >= 0 ? frames[st.burnIdx].t : null;
  const missNow = st.burned ? st.missAfter : st.missBefore;
  const risk = linkStyle(frame.pc, { over: i >= frames.length - 1 }).risk;
  const riskColor = mix(css('--link-low'), css('--link-high'), risk);
  const pts = [];
  for (let t = T_START; t <= 0; t += 5) pts.push(t);
  ctx.beginPath();
  pts.forEach((t, k) => { const py = y(sepPath(t, missNow) + sigmaAt(t)); if (k === 0) ctx.moveTo(x(t), py); else ctx.lineTo(x(t), py); });
  for (let k = pts.length - 1; k >= 0; k -= 1) { const t = pts[k]; ctx.lineTo(x(t), y(Math.max(0, sepPath(t, missNow) - sigmaAt(t)))); }
  ctx.closePath();
  ctx.fillStyle = riskColor;
  ctx.globalAlpha = 0.14;
  ctx.fill();
  ctx.globalAlpha = 1;

  // the mover's path: the original path, and the new path after a burn
  const pathTo = (missAtTca, from, color, width, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let first = true;
    for (let t = from; t <= 0; t += 2.5) { const px = x(t); const py = y(sepPath(t, missAtTca)); if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py); }
    for (let t = 0; t <= T_END; t += 5) ctx.lineTo(x(t), y(sepPath(-t, missAtTca)));
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  const moverColor = css(`--cls-${mover.cls}`);
  if (st.burned) {
    pathTo(st.missBefore, tb, css('--text-4'), 1.5, [6, 6]);
    pathTo(st.missAfter, T_START, moverColor, 2.5);
    const bx = x(tb);
    const y1 = y(sepPath(tb, st.missBefore));
    const y2 = y(sepPath(tb, st.missAfter));
    ctx.strokeStyle = css('--accent'); ctx.fillStyle = css('--accent'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, y1); ctx.lineTo(bx, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, y2); ctx.lineTo(bx - 5, y2 + 8); ctx.lineTo(bx + 5, y2 + 8); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
    ctx.fillStyle = css('--accent-text');
    ctx.textAlign = 'center';
    ctx.fillText(`burn ${frames[st.burnIdx].agents[st.mover].dv.toFixed(2)} m/s`, bx, y2 - 8);
    ctx.textAlign = 'left';
  } else {
    pathTo(st.missBefore, T_START, moverColor, 2.5);
  }

  // the crossing at closest approach and the verdict
  const inside = missNow < RADIUS_M;
  const unsure = !inside && frame.danger;
  const verdictColor = inside ? css('--warn') : unsure ? css('--accent-text') : css('--ok');
  const xt = x(0);
  ctx.strokeStyle = verdictColor;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(xt, cy); ctx.lineTo(xt, y(missNow)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = verdictColor;
  ctx.beginPath(); ctx.arc(xt, y(missNow), 4, 0, Math.PI * 2); ctx.fill();
  const verdict = inside ? `ON COURSE TO COLLIDE · miss ${fmtM(missNow)} < ${RADIUS_M} m`
    : unsure ? `TOO CLOSE TO BE SURE · miss ${fmtM(missNow)} · Pc ${pcText(frame.pc)}`
      : `SAFE · miss ${fmtM(missNow)} · Pc ${pcText(frame.pc)}`;
  ctx.font = `bold 13px ${css('--font-mono') || 'monospace'}`;
  const vw = ctx.measureText(verdict).width + 20;
  const vx = Math.max(left, Math.min(right - vw, xt - vw / 2));
  ctx.fillStyle = css('--surface');
  ctx.fillRect(vx, top + 2, vw, 24);
  ctx.strokeStyle = verdictColor;
  ctx.strokeRect(vx + 0.5, top + 2.5, vw - 1, 23);
  ctx.fillStyle = verdictColor;
  ctx.fillText(verdict, vx + 10, top + 19);
  ctx.font = mono;

  // now: the time marker and the two objects on their paths
  const tx = x(Math.min(0, shownT));
  ctx.strokeStyle = css('--text-3');
  ctx.beginPath(); ctx.moveTo(tx, top + 30); ctx.lineTo(tx, bottom); ctx.stroke();
  const sepNow = sepPath(Math.min(0, shownT), missNow);
  const dot = (px, py, color) => {
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = css('--bg'); ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  };
  dot(tx, cy, css(`--cls-${standOn.cls}`));
  dot(tx, y(sepNow), moverColor);
  const labelLeft = tx > right - 170;
  ctx.textAlign = labelLeft ? 'right' : 'left';
  const lx = labelLeft ? tx - 10 : tx + 10;
  ctx.fillStyle = css('--text');
  ctx.fillText(`${standOn.name} · holds course`, lx, cy + 18);
  ctx.fillText(`${mover.name}${st.burned ? ' · moved' : frame.yielder === null ? '' : ' · must move'}`, lx, y(sepNow) - 10);
  ctx.fillStyle = css('--text-3');
  ctx.fillText(`uncertainty σ ${fmtM(frame.sigma)}`, lx, y(sepNow) + 18);
  ctx.textAlign = 'left';

  // the thinking steps, with the current one lit
  let sx = left;
  STAGES.forEach((name, k) => {
    const on = k <= st.stage;
    const now = k === st.stage;
    const w = ctx.measureText(name).width + 14;
    ctx.fillStyle = now ? css('--accent') : on ? css('--surface-3') : css('--surface');
    ctx.fillRect(sx, 6, w, 20);
    ctx.strokeStyle = on ? css('--accent') : css('--line-2');
    ctx.strokeRect(sx + 0.5, 6.5, w - 1, 19);
    ctx.fillStyle = now ? css('--accent-ink') : on ? css('--text') : css('--text-4');
    ctx.fillText(name, sx + 7, 20);
    sx += w + 6;
    if (k < STAGES.length - 1) { ctx.fillStyle = css('--text-4'); ctx.fillText('›', sx - 5, 20); sx += 8; }
  });

  if (hud) hud.textContent = `${tMinus(frame.t)} · σ ${fmtM(frame.sigma)} · Pc ${pcText(frame.pc)} · miss ${fmtM(frame.miss)}${st.burned && Math.abs(frame.missAfter - frame.miss) > 0.5 ? ` → ${fmtM(frame.missAfter)}` : ''}`;
  if (announcer && lastAnnounced !== frame.index) {
    lastAnnounced = frame.index;
    announcer.textContent = `${tMinus(frame.t)}: ${verdict.toLowerCase()}; uncertainty ${fmtM(frame.sigma)}.`;
  }
  if (!settled && !reduced) raf = requestAnimationFrame(draw);
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(draw);
}

export function init() {
  canvas = $('#approach');
  hud = $('#approach-hud');
  announcer = $('#stage-announcer');
  if (!canvas || !canvas.getContext) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;
  new ResizeObserver(() => size()).observe(canvas.parentElement);
  ['change:frames', 'change:stepIndex', 'change:episodeId'].forEach((e) => store.on(e, schedule));
  store.on('theme', schedule);
  size();
}
