// Pure ledger helpers (Node-testable).
export function isBalanced(balances, tol = 1e-6) {
  const total = Object.values(balances).reduce((a, b) => a + b, 0);
  return Math.abs(total) <= tol;
}

/** Bar geometry for signed balances: returns [{operator, value, side, widthPct}] with widthPct in [0, 50]. */
export function bars(balances, { includeCommons = false } = {}) {
  const rows = Object.entries(balances).filter(([op]) => includeCommons || op !== 'commons');
  const max = Math.max(1e-9, ...rows.map(([, v]) => Math.abs(v)));
  return rows
    .map(([operator, value]) => ({ operator, value, side: value >= 0 ? 'pos' : 'neg', widthPct: (Math.abs(value) / max) * 50 }))
    .sort((a, b) => b.value - a.value || a.operator.localeCompare(b.operator));
}

/** Opening balances as in sim/ledger.opening: each operator's starting balance, offset by commons. */
export function openingBalances(agents) {
  const out = {};
  for (const a of agents) out[a.operator] = a.ledger;
  out.commons = -Object.values(out).reduce((s, v) => s + v, 0);
  return out;
}
