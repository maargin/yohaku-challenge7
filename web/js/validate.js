// Fail-closed validators for every data file (SECURITY-05/13), mirroring schema/*.schema.json for the
// fields the UI uses. No code generation, no eval: keeps the CSP strict.
export class DataError extends Error {}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x, max = 1000) => typeof x === 'string' && x.length <= max;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const CLASSES = new Set(['crewed', 'autonomous', 'manoeuvrable', 'debris']);
const MSG_TYPES = new Set(['PROPOSE', 'ACK', 'DO-NOT-MOVE', 'EXECUTED', 'ESCALATE']);
const LEVELS = new Set(['L0', 'L1', 'L2', 'L3', 'L4']);

function need(cond, where) {
  if (!cond) throw new DataError(`invalid data at ${where}`);
}

function step(s, where) {
  need(isObj(s), where);
  need(isNum(s.t_min) && s.t_min >= -240 && s.t_min <= 0, `${where}.t_min`);
  need(isNum(s.pc) && s.pc >= 0 && s.pc <= 1, `${where}.pc`);
  need(isNum(s.miss_m) && s.miss_m >= 0, `${where}.miss_m`);
  need(isNum(s.sigma_m) && s.sigma_m > 0, `${where}.sigma_m`);
  need(isObj(s.actions), `${where}.actions`);
  for (const [k, a] of Object.entries(s.actions)) {
    need(ID.test(k) && isObj(a) && Number.isInteger(a.action) && a.action >= 0 && a.action <= 6, `${where}.actions.${k}`);
    need(Array.isArray(a.probs) && a.probs.length === 7 && a.probs.every((p) => isNum(p) && p >= 0 && p <= 1), `${where}.probs`);
  }
  need(Array.isArray(s.messages) && s.messages.length <= 20, `${where}.messages`);
  for (const m of s.messages) {
    need(isObj(m) && MSG_TYPES.has(m.type) && ID.test(m.from) && ID.test(m.to) && isStr(m.text, 200) && isNum(m.t_min), `${where}.message`);
  }
  need(s.escalation === null || (isObj(s.escalation) && isStr(s.escalation.trigger, 40) && LEVELS.has(s.escalation.level)), `${where}.escalation`);
  if (s.verdict !== undefined) need(isObj(s.verdict) && (s.verdict.yielder === null || ID.test(s.verdict.yielder)), `${where}.verdict`);
  if (s.note !== undefined) need(isStr(s.note, 240), `${where}.note`);
  if (s.branches !== undefined) {
    need(isObj(s.branches), `${where}.branches`);
    for (const [k, list] of Object.entries(s.branches)) {
      need(['approve', 'override', 'stop'].includes(k) && Array.isArray(list), `${where}.branches.${k}`);
      list.forEach((b, i) => step(b, `${where}.branches.${k}[${i}]`));
    }
  }
}

const validators = {
  objects(d) {
    need(Array.isArray(d) && d.length <= 5000, 'objects');
    d.forEach((o, i) => need(isObj(o) && Number.isInteger(o.id) && isStr(o.name, 64) && CLASSES.has(o.class) && isObj(o.omm), `objects[${i}]`));
  },
  episodes(d) {
    need(Array.isArray(d) && d.length <= 500, 'episodes');
    d.forEach((e, i) => {
      const w = `episodes[${i}]`;
      need(isObj(e) && ID.test(e.id) && isStr(e.title, 120) && Array.isArray(e.agents) && e.agents.length >= 2, w);
      e.agents.forEach((a, j) => need(ID.test(a.id) && CLASSES.has(a.class) && isNum(a.fuel) && a.fuel >= 0 && a.fuel <= 1 && isNum(a.ledger), `${w}.agents[${j}]`));
      need(Array.isArray(e.steps) && e.steps.length >= 1 && e.steps.length <= 48, `${w}.steps`);
      e.steps.forEach((s, j) => step(s, `${w}.steps[${j}]`));
      need(isObj(e.outcome) && typeof e.outcome.collision === 'boolean' && isObj(e.outcome.dv_ms) && isObj(e.outcome.ledger_after), `${w}.outcome`);
    });
  },
  socrates_top(d) {
    need(Array.isArray(d) && d.length <= 100, 'socrates_top');
    d.forEach((r, i) => need(isObj(r) && Number.isInteger(r.id1) && Number.isInteger(r.id2) && isNum(r.range_km) && isNum(r.max_prob), `socrates_top[${i}]`));
  },
  policy(d) {
    need(isObj(d) && Array.isArray(d.layers) && d.layers.length >= 1 && Array.isArray(d.obs_mean) && Array.isArray(d.obs_std), 'policy');
    need(d.obs_std.every((x) => isNum(x) && x > 0) && d.obs_mean.every(isNum), 'policy.norm');
    d.layers.forEach((l, i) => need(Array.isArray(l.W) && Array.isArray(l.b) && l.W.length === l.b.length && l.W.every((r) => Array.isArray(r) && r.every(isNum)), `policy.layers[${i}]`));
  },
  testvec(d) {
    need(Array.isArray(d) && d.length <= 1000, 'testvec');
    d.forEach((v, i) => need(isObj(v) && Array.isArray(v.obs) && v.obs.every(isNum) && Array.isArray(v.logits) && v.logits.length === 7, `testvec[${i}]`));
  },
  explanations(d) {
    need(isObj(d) && Object.keys(d).length <= 5000, 'explanations');
    for (const [k, v] of Object.entries(d)) need(/^[A-Za-z0-9_.-]{1,64}:[0-9]{1,3}$/.test(k) && isStr(v, 600), `explanations.${k}`);
  },
  results(d) {
    need(isObj(d) && Array.isArray(d.strategies) && isObj(d.curves) && Array.isArray(d.plots), 'results');
    d.strategies.forEach((s, i) => need(isStr(s.name, 64) && ['collisions_pct', 'dv_mean_ms', 'manoeuvres_per_event', 'burden_gini', 'escalation_pct'].every((k) => isNum(s[k]) && s[k] >= 0), `results.strategies[${i}]`));
    d.plots.forEach((p, i) => need(/^img\/plots\/[A-Za-z0-9_.-]+\.png$/.test(p), `results.plots[${i}]`));
    if (d.gate !== undefined) need(d.gate === 'ship' || d.gate === 'rules-only', 'results.gate');
  },
};

export const KINDS = Object.keys(validators);

export function validate(kind, data) {
  const v = validators[kind];
  if (!v) throw new DataError(`unknown kind ${kind}`);
  v(data);
  return data;
}
