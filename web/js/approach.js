// Approach view: the encounter plane at closest approach, drawn from frames on a 2D canvas.
// Origin = the object that holds course; the mover's track passes at the predicted miss distance.
import { store } from './state.js';
import { $ } from './dom.js';
import { currentEpisode } from './playback.js';
import { linkStyle, mix } from './threads.js';
import { tMinus, pcText } from './format.js';

const RADIUS_M = 20;
const RINGS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let canvas = null;
let ctx = null;
let hud = null;
let announcer = null;
let W = 0;
let H = 0;
let shown = null;
let raf = 0;
let lastAnnounced = null;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmtM = (m) => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

function current() {
  const frames = store.get('frames') ?? [];
  if (!frames.length) return null;
  const i = Math.min(store.get('stepIndex') ?? 0, frames.length - 1);
  return { frame: frames[i], i, n: frames.length };
}

// Where the two objects sit in the encounter plane for this frame (metres).
function geometry(frame, ep) {
  const perp = ep && ep.spec ? Math.max(0, Number(ep.spec.p0_m) || 0) : 0;
  const mover = frame.yielder === null ? 1 : frame.yielder;
  const sign = mover === 1 ? 1 : -1;
  const along = Math.sqrt(Math.max(0, frame.miss * frame.miss - perp * perp)) * sign;
  const alongAfter = Math.sqrt(Math.max(0, frame.missAfter * frame.missAfter - perp * perp)) * sign;
  return { mover, standOn: 1 - mover, along, perp, alongAfter, sigma: frame.sigma };
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

function circle(x, y, r, stroke, fill, dash) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  ctx.setLineDash(dash || []);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.setLineDash([]);
}

function arrow(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 9 * Math.cos(ang - 0.4), y2 - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - 9 * Math.cos(ang + 0.4), y2 - 9 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
}

function draw() {
  raf = 0;
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const cur = current();
  if (!cur) { if (hud) hud.textContent = 'Waiting for an encounter'; return; }
  const { frame, i, n } = cur;
  const g = geometry(frame, currentEpisode());
  const target = { along: g.along, perp: g.perp, sigma: g.sigma };
  if (!shown || reduced) shown = { ...target };
  else {
    const k = 0.3;
    shown.along += (target.along - shown.along) * k;
    shown.perp += (target.perp - shown.perp) * k;
    shown.sigma += (target.sigma - shown.sigma) * k;
  }
  const settled = Math.abs(shown.along - target.along) < 0.3 && Math.abs(shown.sigma - target.sigma) < 0.3 && Math.abs(shown.perp - target.perp) < 0.3;
  const cx = W / 2;
  const cy = H / 2;
  const scale = 0.45 * (H / 2) / Math.max(shown.sigma, Math.abs(shown.along), Math.abs(g.alongAfter), 60);
  const px = (m) => cx + m * scale;
  const py = (m) => cy - m * scale;
  const mono = `12px ${css('--font-mono') || 'monospace'}`;
  ctx.font = mono;
  ctx.lineWidth = 1;

  // range rings
  let rings = 0;
  let lastLabelY = -1e9;
  ctx.fillStyle = css('--text-4');
  ctx.textAlign = 'center';
  for (const r of RINGS) {
    const rp = r * scale;
    if (rp < 18) continue;
    if (rp > Math.hypot(W, H) / 2) break;
    circle(cx, cy, rp, css('--line-2'), null, [3, 5]);
    const ly = cy - rp - 4;
    if (Math.abs(ly - lastLabelY) > 14 && ly > 14) { ctx.fillText(fmtM(r), cx, ly); lastLabelY = ly; }
    if (++rings >= 3) break;
  }
  ctx.textAlign = 'left';

  // the mover's track and its approach along it
  const P = { x: px(shown.along), y: py(shown.perp) };
  const mover = frame.agents[g.mover];
  const standOn = frame.agents[g.standOn];
  const burned = Math.abs(frame.missAfter - frame.miss) > 0.5 && mover.dv > 0;
  ctx.strokeStyle = css('--line-3');
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, P.y);
  ctx.lineTo(W, P.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = Math.max(0, Math.min(1, 1 - (-frame.t / 240)));
  const fromX = g.mover === 1 ? W - 70 : 70;
  const mx = fromX + (P.x - fromX) * (0.12 + 0.88 * progress);

  // uncertainty disc at the predicted pass point
  const st = linkStyle(frame.pc, { over: i >= n - 1 });
  const riskColor = mix(css('--link-low'), css('--link-high'), st.risk);
  ctx.globalAlpha = 0.12;
  circle(P.x, P.y, shown.sigma * scale, null, riskColor);
  ctx.globalAlpha = 0.8;
  circle(P.x, P.y, shown.sigma * scale, riskColor, null);
  ctx.globalAlpha = 1;
  ctx.fillStyle = css('--text-3');
  ctx.textAlign = 'center';
  ctx.fillText(`uncertainty σ ${fmtM(frame.sigma)}`, P.x, P.y + shown.sigma * scale + 14);
  ctx.textAlign = 'left';

  // hard-body circle around the object that holds course
  circle(cx, cy, Math.max(3, RADIUS_M * scale), css('--warn'), null);
  ctx.fillStyle = css('--warn');
  ctx.fillText(`${RADIUS_M} m hard body`, cx + 10, cy + Math.max(3, RADIUS_M * scale) + 16);

  // miss vector
  ctx.strokeStyle = css('--text-2');
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(P.x, P.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css('--text-2');
  const near = Math.hypot(P.x - cx, P.y - cy) < 70;
  ctx.fillText(`miss ${fmtM(frame.miss)}`, near ? cx + 10 : (cx + P.x) / 2 + 6, near ? cy + Math.max(3, RADIUS_M * scale) + 32 : (cy + P.y) / 2 - 6);

  // the burn: the pass point moves out along the track
  if (burned) {
    const P2 = { x: px(g.alongAfter), y: py(g.perp) };
    ctx.globalAlpha = 0.35;
    circle(P.x, P.y, 5, null, css('--text-3'));
    ctx.globalAlpha = 1;
    arrow(P.x, P.y, P2.x, P2.y, css('--accent'));
    ctx.fillStyle = css('--accent-text');
    ctx.fillText(`+${mover.dv.toFixed(2)} m/s · ${fmtM(frame.missAfter - frame.miss)} farther`, Math.min(P.x, P2.x), P2.y + 22);
  }

  // the two objects
  circle(cx, cy, 6, css('--bg'), css(`--cls-${standOn.cls}`));
  ctx.fillStyle = css('--text');
  ctx.fillText(`${standOn.name} · holds`, cx + 10, cy - 12);
  circle(mx, P.y, 6, css('--bg'), css(`--cls-${mover.cls}`));
  ctx.textAlign = g.mover === 1 ? 'right' : 'left';
  ctx.fillText(`${mover.name}${burned || mover.burned ? ' · moved' : frame.yielder === null ? '' : ' · must move'}`, g.mover === 1 ? mx - 10 : mx + 10, P.y + 22);
  ctx.textAlign = 'left';

  if (hud) hud.textContent = `${tMinus(frame.t)} · σ ${fmtM(frame.sigma)} · Pc ${pcText(frame.pc)} · miss ${fmtM(frame.miss)}${burned ? ` → ${fmtM(frame.missAfter)}` : ''}`;
  if (announcer && lastAnnounced !== frame.index) {
    lastAnnounced = frame.index;
    announcer.textContent = `${tMinus(frame.t)}: miss ${fmtM(frame.miss)}, uncertainty ${fmtM(frame.sigma)}${burned ? `; ${mover.name} burned and the miss becomes ${fmtM(frame.missAfter)}` : ''}.`;
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
