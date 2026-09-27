/* ============================================================
   Who-Yields rules (F4).

   A fixed ladder. Walk it top to bottom; the first rule that
   separates the two objects decides who manoeuvres. Uses only
   the declared data both sides share — never private estimates —
   so both sides compute the same verdict on their own.

   Pure module: no DOM, no globals. Safe to import from tests.
   ============================================================ */

export const LOW_FUEL = 0.15;   // below this, an object "gets a break" (rule 3)

export const RULES = [
  { id: 'non-manoeuvrable', label: 'non-manoeuvrable' },
  { id: 'crewed',           label: 'crewed' },
  { id: 'low-fuel',         label: 'low fuel' },
  { id: 'priority-class',   label: 'priority class' },
  { id: 'fuel-margin',      label: 'fuel margin' },
  { id: 'ledger',           label: 'ledger' },
  { id: 'lower-id',         label: 'lower id' }
];

const PUBLIC_GOOD = new Set(['science', 'public-good', 'public_good', 'civil', 'government']);
const COMMERCIAL = new Set(['commercial']);

const has = (v) => v !== undefined && v !== null && !Number.isNaN(v);

/* Debris, a silent counterpart, or an empty tank cannot move. */
export function canManoeuvre(d) {
  if (d.class === 'debris') return false;
  if (d.silent) return false;
  if (has(d.fuel) && d.fuel <= 0) return false;
  return true;
}

function priorityTier(purpose) {
  if (!purpose) return null;
  const p = String(purpose).toLowerCase();
  if (PUBLIC_GOOD.has(p)) return 'public-good';
  if (COMMERCIAL.has(p)) return 'commercial';
  return null;
}

/**
 * @param {object} a  declared data: { id, name, class, fuel, ledger, purpose?, silent? }
 * @param {object} b  same shape
 * @returns {{ mover, holder, rule, ruleId, reason, escalate, trace }}
 *   mover/holder are ids (null when nobody can move).
 *   rule is 1-based. trace has one entry per rule: fired | tied | skipped | unreached.
 */
export function whoYields(a, b) {
  const trace = RULES.map((r, i) => ({ rule: i + 1, id: r.id, state: 'unreached', note: '' }));
  const mark = (i, state, note = '') => { trace[i].state = state; trace[i].note = note; };
  const verdict = (i, mover, holder, reason) => {
    mark(i, 'fired', reason);
    return { mover: mover.id, holder: holder.id, rule: i + 1, ruleId: RULES[i].id, reason, escalate: false, trace };
  };

  // 1. Non-manoeuvrable holds course; the other moves.
  const ma = canManoeuvre(a), mb = canManoeuvre(b);
  if (!ma && !mb) {
    mark(0, 'fired', 'Neither object can manoeuvre.');
    return { mover: null, holder: null, rule: 1, ruleId: RULES[0].id, reason: 'Neither object can manoeuvre.', escalate: true, trace };
  }
  if (ma !== mb) {
    const [mover, holder] = ma ? [a, b] : [b, a];
    return verdict(0, mover, holder, `${holder.name} cannot manoeuvre, so it holds course.`);
  }
  mark(0, 'tied');

  // 2. Crewed vehicles have priority; the uncrewed one moves.
  const ca = a.class === 'crewed', cb = b.class === 'crewed';
  if (ca !== cb) {
    const [mover, holder] = ca ? [b, a] : [a, b];
    return verdict(1, mover, holder, `${holder.name} is crewed and has priority.`);
  }
  mark(1, 'tied');

  // 3. Low fuel gets a break; the other one moves.
  if (!has(a.fuel) || !has(b.fuel)) {
    mark(2, 'skipped', 'Fuel not declared.');
  } else {
    const la = a.fuel < LOW_FUEL, lb = b.fuel < LOW_FUEL;
    if (la !== lb) {
      const [mover, holder] = la ? [b, a] : [a, b];
      return verdict(2, mover, holder, `${holder.name} is low on fuel and gets a break.`);
    }
    mark(2, 'tied');
  }

  // 4. Science / public-good outranks commercial; commercial moves.
  const ta = priorityTier(a.purpose), tb = priorityTier(b.purpose);
  if (!ta || !tb) {
    mark(3, 'skipped', 'Priority class not declared.');
  } else if (ta !== tb) {
    const [mover, holder] = ta === 'commercial' ? [a, b] : [b, a];
    return verdict(3, mover, holder, `${holder.name} is ${holder.purpose}; ${mover.name} is commercial.`);
  } else {
    mark(3, 'tied');
  }

  // 5. Larger fuel margin yields.
  if (!has(a.fuel) || !has(b.fuel)) {
    mark(4, 'skipped', 'Fuel not declared.');
  } else if (Math.abs(a.fuel - b.fuel) > 1e-9) {
    const [mover, holder] = a.fuel > b.fuel ? [a, b] : [b, a];
    return verdict(4, mover, holder, `${mover.name} has the larger fuel margin (${fmt(mover.fuel)} vs ${fmt(holder.fuel)}).`);
  } else {
    mark(4, 'tied');
  }

  // 6. Lower ledger balance yields — whoever has given way least.
  if (!has(a.ledger) || !has(b.ledger)) {
    mark(5, 'skipped', 'Ledger not declared.');
  } else if (a.ledger !== b.ledger) {
    const [mover, holder] = a.ledger < b.ledger ? [a, b] : [b, a];
    return verdict(5, mover, holder, `${mover.name} has the lower ledger balance (${signed(mover.ledger)} vs ${signed(holder.ledger)}).`);
  } else {
    mark(5, 'tied');
  }

  // 7. Lower id moves. Arbitrary, but always gives an answer.
  const cmp = compareIds(a.id, b.id);
  if (cmp === 0) {
    mark(6, 'fired', 'Identical ids; cannot break the tie.');
    return { mover: null, holder: null, rule: 7, ruleId: RULES[6].id, reason: 'Identical ids; cannot break the tie.', escalate: true, trace };
  }
  const [mover, holder] = cmp < 0 ? [a, b] : [b, a];
  return verdict(6, mover, holder, `Everything else tied; ${mover.name} has the lower id.`);
}

/**
 * The determinism claim, made checkable: run the ladder from each side
 * independently and confirm both sides land on the same answer.
 */
export function verifyBothSides(a, b) {
  const fromA = whoYields(a, b);
  const fromB = whoYields(b, a);
  return {
    verdict: fromA,
    match: fromA.mover === fromB.mover && fromA.rule === fromB.rule
  };
}

function compareIds(x, y) {
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  const sx = String(x), sy = String(y);
  return sx < sy ? -1 : sx > sy ? 1 : 0;
}

const fmt = (v) => Number(v).toFixed(2);
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
