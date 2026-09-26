// Who-Yields rules engine — mirror of sim/rules.py (checked for parity in CI).
// Pure function of shared data only: both declarations, the registry and ledger balances.

export const LOW_FUEL = 0.2;
export const FREE_RIDER = -3.0;
export const FUEL_TIE = 0.05;
export const LEDGER_TIE = 0.5;

function effective(decl, registry, balances) {
  const reg = registry[decl.agent_id];
  if (!reg) throw new Error(`unknown agent ${decl.agent_id}`);
  const penalties = [];
  if (decl.capability !== reg.capability || decl.purpose !== reg.purpose) {
    penalties.push({ kind: 'FALSE_DECLARATION', operator: reg.operator });
  }
  const fuel = Math.min(1, Math.max(0, Number(decl.fuel)));
  return {
    eff: {
      agent_id: decl.agent_id,
      operator: reg.operator,
      capability: reg.capability,
      purpose: reg.purpose,
      fuel,
      balance: Number(balances[reg.operator] ?? 0),
      nm: reg.capability === 'debris' || fuel <= 0 || Boolean(decl.silent),
    },
    penalties,
  };
}

function exactlyOne(a, b, pred) {
  const pa = pred(a);
  const pb = pred(b);
  if (pa && !pb) return a;
  if (pb && !pa) return b;
  return null;
}

function tiebreak(a, b) {
  if (Math.abs(a.fuel - b.fuel) > FUEL_TIE) return ['R8a', a.fuel > b.fuel ? a : b, 'larger fuel margin yields'];
  if (Math.abs(a.balance - b.balance) > LEDGER_TIE) return ['R8b', a.balance < b.balance ? a : b, 'lower ledger balance yields'];
  return ['R8c', a.agent_id < b.agent_id ? a : b, 'deterministic ID tie-break'];
}

export function verdict(declA, declB, registry, balances = {}) {
  const { eff: a, penalties: pa } = effective(declA, registry, balances);
  const { eff: b, penalties: pb } = effective(declB, registry, balances);
  const penalties = [...pa, ...pb].sort((x, y) => (x.operator + x.kind).localeCompare(y.operator + y.kind));
  const result = (rule, y, reason, escalate = null) => {
    if (!y) return { yielder: null, stand_on: null, rule, reason, penalties, escalate };
    const other = y === a ? b : a;
    return { yielder: y.agent_id, stand_on: other.agent_id, rule, reason, penalties, escalate };
  };

  if (a.nm && b.nm) return result('R1', null, 'neither object can move', 'BOTH_NM');
  const stuck = exactlyOne(a, b, (x) => x.nm);
  if (stuck) return result('R2', stuck === a ? b : a, 'the other object cannot move');
  const crewed = exactlyOne(a, b, (x) => x.capability === 'crewed');
  if (crewed) return result('R3', crewed === a ? b : a, 'a crewed vehicle holds course');
  if (a.capability === 'crewed' && b.capability === 'crewed') {
    const [rule, y, why] = tiebreak(a, b);
    return result('R3b', y, `both crewed; proposal by ${rule} (${why})`, 'BOTH_CREWED');
  }
  const low = exactlyOne(a, b, (x) => x.fuel < LOW_FUEL);
  if (low) return result('R4', low === a ? b : a, 'the low-fuel satellite holds course');
  const rider = exactlyOne(a, b, (x) => x.balance <= FREE_RIDER);
  if (rider) return result('R5', rider, 'free-rider loses priority');
  const auto = exactlyOne(a, b, (x) => x.capability === 'autonomous');
  if (auto) return result('R6', auto, 'the more capable (autonomous) satellite moves');
  const pub = exactlyOne(a, b, (x) => x.purpose === 'public_good');
  if (pub && new Set([a.purpose, b.purpose]).has('commercial')) {
    return result('R7', pub === a ? b : a, 'commercial yields to public-good mission');
  }
  const [rule, y, why] = tiebreak(a, b);
  return result(rule, y, why);
}
