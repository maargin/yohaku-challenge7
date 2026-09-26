// Pure formatting helpers (Node-testable).
export const ACTION_LABELS = ['Hold', 'Small opening burn', 'Large opening burn', 'Small closing burn', 'Radial burn', 'Request yield', 'Escalate'];
export const CLASS_LABELS = { crewed: 'crewed', autonomous: 'autonomous', manoeuvrable: 'manoeuvrable', debris: 'debris' };

export function pcText(pc) {
  if (!Number.isFinite(pc) || pc <= 0) return '< 1e-12';
  if (pc >= 0.01) return pc.toFixed(3);
  return pc.toExponential(1).replace('e-', 'e-');
}

export function oneIn(pc) {
  if (!Number.isFinite(pc) || pc <= 0) return 'negligible';
  const n = 1 / pc;
  if (n < 2) return '1 in 1';
  const rounded = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  return `1 in ${rounded.toLocaleString('en-GB')}`;
}

export function tMinus(t) {
  if (!Number.isFinite(t)) return '';
  return t === 0 ? 'closest approach' : `T−${Math.abs(Math.round(t))} min`;
}

export function signed(x, digits = 1) {
  if (!Number.isFinite(x)) return '0';
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s.replace('-', '−');
}

export function pct(x, digits = 1) {
  return `${Number(x).toFixed(digits)}%`;
}
