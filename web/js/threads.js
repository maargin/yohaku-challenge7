// Risk-link styling (pure): width and colour follow log10(Pc); links fade once the pass is over.
export function linkStyle(pc, { over = false } = {}) {
  const lp = Math.max(-10, Math.min(0, Math.log10(Math.max(pc, 1e-12))));
  const k = (lp + 10) / 10;                 // 0 at 1e-10, 1 at Pc = 1
  const risk = Math.max(0, Math.min(1, (lp + 7) / 5)); // 0 below 1e-7, 1 at 1e-2 and above
  return {
    stroke: over ? 0.15 : 0.2 + 1.6 * k * k,
    risk: over ? 0 : risk,
    opacity: over ? 0.25 : 0.45 + 0.55 * risk,
  };
}

export function mix(low, high, t) {
  const a = hexToRgb(low);
  const b = hexToRgb(high);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic encounter location for an episode id (so each scenario appears in the same place). */
export function encounterSite(id) {
  let h = 2166136261;
  for (const ch of id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return { lat: ((h % 1200) / 10) - 60, lng: (((h >>> 11) % 3600) / 10) - 180 };
}
