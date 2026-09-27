// Two-satellite encounter simulator for live mode: a direct port of sim/env_torch.py for one cluster of two
// (checked against the GPU environment in web/tests/live.test.mjs). No DOM access.
import { forward, softmax } from './policy.js';

export const STEPS = 24;
const STEP_MIN = 10;
const START_MIN = -240;
const HORIZON_MIN = 240;
const RADIUS_M = 20;
const ALONG_GAIN = 3;
const PROJECTION = 0.6;
const MEAN_MOTION = 0.0011;
const LOW_FUEL = 0.2;
const FREE_RIDER = -3;
const FUEL_TIE = 0.05;
const LEDGER_TIE = 0.5;
const DEADLINE_MIN = -60;
const MANOEUVRE_PC = 1e-4;
const DILUTION_PC = 1e-3;
const PC_HIGH = 1e-3;
export const HOLD = 0, SMALL_OPEN = 1, LARGE_OPEN = 2, SMALL_CLOSE = 3, RADIAL = 4, REQUEST_YIELD = 5, ESCALATE = 6;
const DV = [0, 0.02, 0.1, 0.02, 0.05, 0, 0];
const isBurn = (a) => a >= SMALL_OPEN && a <= RADIAL;

export function pc(miss, sigma) {
  const s2 = sigma * sigma;
  return Math.min(1, Math.max(0, (RADIUS_M * RADIUS_M) / (2 * s2) * Math.exp(-(miss * miss) / (2 * s2))));
}

function pcWorst(miss) {
  const d2 = Math.max(miss * miss, 1e-6);
  return Math.min(1, (RADIUS_M * RADIUS_M) / (2 * d2) * Math.exp(-0.5));
}

export function isDangerous(p, miss, sigma) {
  return p > MANOEUVRE_PC || (sigma > 2 * miss && pcWorst(miss) > DILUTION_PC);
}

// Safety-layer priority order: returns [hasYielder, iYields] for agent i against agent j.
function yields(a, b, iLower) {
  const nm = (x) => x.capability === 'debris' || x.fuel <= 0 || x.silent;
  const tie = Math.abs(a.fuel - b.fuel) > FUEL_TIE ? a.fuel > b.fuel
    : Math.abs(a.ledger - b.ledger) > LEDGER_TIE ? a.ledger < b.ledger : iLower;
  if (nm(a) && nm(b)) return [false, false];
  if (nm(a) !== nm(b)) return [true, !nm(a)];
  const cr = (x) => x.capability === 'crewed';
  if (cr(a) !== cr(b)) return [true, !cr(a)];
  if (cr(a) && cr(b)) return [true, tie];
  const lo = (x) => x.fuel < LOW_FUEL;
  if (lo(a) !== lo(b)) return [true, !lo(a)];
  const fr = (x) => x.ledger <= FREE_RIDER;
  if (fr(a) !== fr(b)) return [true, fr(a)];
  const au = (x) => x.capability === 'autonomous';
  if (au(a) !== au(b)) return [true, au(a)];
  const pb = (x) => x.purpose === 'public_good';
  const mixed = (pb(a) && b.purpose === 'commercial') || (pb(b) && a.purpose === 'commercial');
  if (mixed && pb(a) !== pb(b)) return [true, !pb(a)];
  return [true, tie];
}

const CAP_ONEHOT = { manoeuvrable: [1, 0, 0], autonomous: [0, 1, 0], crewed: [0, 0, 1], debris: [0, 0, 0] };
const THREAT_ONEHOT = { debris: [1, 0, 0], autonomous: [0, 1, 0], crewed: [0, 0, 1], manoeuvrable: [0, 0, 0] };

// spec: { agents: [{capability, purpose, fuel, ledger, silent}, x2], m0_m, p0_m, sigma0_m, sigma_min_m, coup? }
export function createEncounter(spec) {
  const agents = spec.agents.map((a) => ({
    ...a, fuel: a.capability === 'debris' ? 0 : a.fuel, silent: a.capability !== 'debris' && Boolean(a.silent),
    d: 0, dv: 0, burned: false, intent: 0,
  }));
  const coup = spec.coup ?? (spec.m0_m >= 0 ? 1 : -1);
  const st = { agents, tIdx: 0, hard: false, reasons: new Set() };

  const tMin = () => START_MIN + STEP_MIN * st.tIdx;
  const along = () => spec.m0_m + coup * (agents[0].d + agents[1].d);
  const sigma = () => {
    const frac = Math.max(0, Math.min(1, -tMin() / HORIZON_MIN));
    return spec.sigma_min_m + (spec.sigma0_m - spec.sigma_min_m) * frac;
  };
  const miss = () => Math.hypot(spec.p0_m, along());
  const acting = (a) => a.capability !== 'debris' && !a.silent && a.fuel > 0;

  function snapshot() {
    const m = miss();
    const s = sigma();
    const p = pc(m, s);
    const role = agents.map((a, i) => yields(a, agents[1 - i], i === 0));
    return { t: tMin(), miss: m, sigma: s, pc: p, danger: isDangerous(p, m, s), iYields: role.map(([h, y]) => h && y) };
  }

  function obs(i, snap = snapshot()) {
    const a = agents[i];
    const o = agents[1 - i];
    const intent = [0, 0, 0, 0];
    intent[o.intent] = 1;
    return [
      -snap.t / 240, along() / 1000, spec.p0_m / 1000, snap.miss / 1000,
      Math.max(-10, Math.min(0, Math.log10(snap.pc + 1e-12))) / 10, snap.sigma / spec.sigma0_m,
      ...CAP_ONEHOT[a.capability], a.fuel, a.ledger / 5,
      ...THREAT_ONEHOT[o.capability], o.fuel, o.ledger / 5, ...intent,
      snap.iYields[i] ? 1 : 0, a.d / 1000, 1, o.silent ? 1 : 0,
    ];
  }

  // Safety layer: the same checks the published results were produced with.
  function shield(prop, snap) {
    return prop.map((p, i) => {
      const y = snap.iYields[i];
      let e = p;
      let why = null;
      if (!y && isBurn(p)) { e = HOLD; why = 'holds course: the other satellite has priority to move'; }
      else if (y && p === SMALL_CLOSE) { e = SMALL_OPEN; why = 'changed to an opening burn (closing burns are not allowed)'; }
      else if (p === REQUEST_YIELD) { e = HOLD; why = y ? 'this satellite is the one that must move' : null; }
      if (p === ESCALATE) e = HOLD;
      if (y && !agents[i].burned && snap.t >= DEADLINE_MIN && snap.danger && !isBurn(e)) {
        e = SMALL_OPEN; why = 'deadline reached: a small opening burn is forced';
      }
      return { executed: e, why };
    });
  }

  // prop: optional [a0, a1]; when omitted the shared policy chooses. Returns the record of this step.
  function step(policy, prop) {
    const snap = snapshot();
    const observations = [0, 1].map((i) => obs(i, snap));
    const probs = observations.map((o) => softmax(forward(policy, o)));
    const chosen = prop ?? probs.map((p) => p.indexOf(Math.max(...p)));
    const crewedPair = agents.some((a) => a.capability === 'crewed');
    if (snap.pc > PC_HIGH) { st.hard = true; st.reasons.add('high collision probability'); }
    if (crewedPair) { st.hard = true; st.reasons.add('a crewed vehicle is involved'); }
    if (agents.some((a) => a.silent)) { st.hard = true; st.reasons.add('one satellite does not answer'); }
    const sh = shield(chosen, snap);
    const lead = -snap.t * 60;
    const actBefore = agents.map(acting);
    const done = sh.map(({ executed, why }, i) => {
      const a = agents[i];
      let e = actBefore[i] ? executed : HOLD;
      let dv = DV[e];
      if (dv > a.fuel) dv = 0;
      if (dv === 0 && isBurn(e)) e = HOLD;
      const alongGain = ALONG_GAIN * dv * lead * PROJECTION;
      const delta = dv === 0 ? 0 : e === SMALL_CLOSE ? -alongGain : e === RADIAL ? 2 * dv / MEAN_MOTION * PROJECTION : alongGain;
      return { e, dv, delta, why: actBefore[i] ? why : null };
    });
    done.forEach(({ e, dv, delta }, i) => {
      const a = agents[i];
      a.d += delta;
      a.fuel = Math.min(1, Math.max(0, a.fuel - dv));
      a.dv += dv;
      a.burned ||= dv > 0;
      const act = actBefore[i];
      a.intent = dv > 0 ? 1 : chosen[i] === ESCALATE && act ? 3 : chosen[i] === REQUEST_YIELD && act ? 2 : 0;
    });
    st.tIdx += 1;
    return { ...snap, observations, probs, chosen, executed: done.map((d) => d.e), dv: done.map((d) => d.dv),
      why: done.map((d) => d.why), missAfter: miss() };
  }

  function run(policy) {
    const steps = [];
    while (st.tIdx < STEPS) steps.push(step(policy));
    const final = snapshot();
    return { steps, final, collision: final.miss < RADIUS_M, agents, human: st.hard, reasons: [...st.reasons] };
  }

  return { step, run, snapshot, obs, agents, state: st };
}
