// One shape for every visual: frames built from episode steps, whether pre-built, decided on the server,
// or converted from a live run. Pure functions, no DOM.
import { DV, isDangerous, priorityReason } from './liveEnv.js';
import { latestVerdict, needsDecision } from './playbackCore.js';

export const CHECKS = ['Cannot move', 'Crewed holds', 'Low fuel holds', 'Free-rider yields', 'Autonomous moves', 'Commercial yields', 'Tie-break'];
const CHECK_PATTERNS = [/cannot move|neither object/i, /crewed/i, /low-fuel|20% fuel|less than 20/i, /free-rider/i, /autonomous/i,
  /public-good|commercial/i, /tie-break|deterministic/i];
const MSG_MAX = 20;

// Which of the seven priority checks a decision reason belongs to (both wordings: pre-built and live).
export function checkIndex(reason) {
  const k = CHECK_PATTERNS.findIndex((re) => re.test(String(reason ?? '')));
  return k < 0 ? 6 : k;
}

const argmax = (xs) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);

export function framesFromEpisode(ep, steps) {
  if (!ep || !Array.isArray(steps)) return [];
  const ids = ep.agents.map((a) => a.id);
  const burnedSoFar = [false, false];
  return steps.map((s, k) => {
    const v = latestVerdict(steps, k);
    const live = s.live ?? null;
    const yi = v && v.yielder ? ids.indexOf(v.yielder) : -1;
    const yielder = yi < 0 ? null : yi;
    const msgs = s.messages ?? [];
    const agents = ep.agents.slice(0, 2).map((a, i) => {
      const act = (s.actions && s.actions[a.id]) || { action: 0, probs: [] };
      const probs = Array.isArray(act.probs) ? act.probs : [];
      const executed = Number.isInteger(act.action) ? act.action : 0;
      const proposedAction = live ? live.chosen[i] : (probs.length ? argmax(probs) : executed);
      const dv = live ? live.dv[i] : (executed >= 1 && executed <= 4 ? DV[executed] : 0);
      let why = live ? live.why[i] : null;
      if (!live && proposedAction !== executed) {
        if (yielder !== null && yielder !== i) why = 'holds course: the other satellite has priority to move';
        else if (msgs.some((m) => m.type === 'PROPOSE') && !msgs.some((m) => m.type === 'EXECUTED')) why = 'announces first, acts next step';
        else why = 'changed by the safety layer';
      }
      burnedSoFar[i] = burnedSoFar[i] || dv > 0;
      return { id: a.id, name: a.name, cls: a.class, fuel: a.fuel, proposed: { action: proposedAction, prob: probs[proposedAction] ?? null },
        probs, executed, dv, why, burned: burnedSoFar[i] };
    });
    const missAfter = live ? live.missAfter : (steps[k + 1] ? steps[k + 1].miss_m : s.miss_m);
    return {
      index: k, t: s.t_min, miss: s.miss_m, sigma: s.sigma_m, pc: s.pc, missAfter,
      danger: isDangerous(s.pc, s.miss_m, s.sigma_m), agents, yielder, reason: v ? v.reason : null,
      messages: msgs.map((m) => ({ from: ids.indexOf(m.from), to: ids.indexOf(m.to), type: m.type, text: m.text })),
      escalation: s.escalation ?? null, decision: needsDecision(s), note: s.note ?? null,
    };
  });
}

// A live run (browser copy or server) as an episode, so the same playback and views apply.
export function episodeFromRun(spec, run, id) {
  const ids = ['a', 'b'];
  const talkers = spec.agents.map((a) => a.capability !== 'debris' && !a.silent);
  const agents = spec.agents.map((a, i) => ({
    id: ids[i], name: String(a.name ?? `Satellite ${i + 1}`).slice(0, 40), class: a.capability,
    fuel: a.capability === 'debris' ? 0 : Number(a.fuel), ledger: Number(a.ledger ?? 0), operator: String(a.name ?? `Operator ${i + 1}`).slice(0, 40),
    purpose: a.purpose, silent: Boolean(a.silent) && a.capability !== 'debris',
  }));
  const pr = priorityReason(spec.agents[0], spec.agents[1]);
  const verdict = { yielder: pr.yielder === null ? null : ids[pr.yielder], reason: pr.reason };
  let seq = 0;
  let escalated = false;
  const crewed = spec.agents.some((a) => a.capability === 'crewed');
  const silent = agents.some((a) => a.silent);
  const steps = run.steps.map((s, k) => {
    const messages = [];
    const say = (from, to, type, text) => {
      if (messages.length < MSG_MAX) messages.push({ id: `${id}:ai:${++seq}`, t_min: s.t, from: ids[from], to: ids[to], type, text: text.slice(0, 200) });
    };
    if (k === 0) spec.agents.forEach((a, i) => { if (talkers[i]) say(i, 1 - i, 'PROPOSE', `${a.capability}, ${a.purpose}, fuel ${Math.round(agents[i].fuel * 100)}%`); });
    if (k === 0 && pr.yielder !== null) {
      if (talkers[pr.yielder]) say(pr.yielder, 1 - pr.yielder, 'ACK', 'will move if needed');
      if (talkers[1 - pr.yielder]) say(1 - pr.yielder, pr.yielder, 'DO-NOT-MOVE', 'holding course');
    }
    s.chosen.forEach((c, i) => {
      if (talkers[i] && c === 6) say(i, 1 - i, 'ESCALATE', 'asks for a human');
      if (talkers[i] && c === 5) say(i, 1 - i, 'PROPOSE', 'requests the other side to move');
    });
    s.dv.forEach((dv, i) => {
      if (dv > 0) { say(i, 1 - i, 'EXECUTED', `burn done, ${dv.toFixed(2)} m/s`); if (talkers[1 - i]) say(1 - i, i, 'EXECUTED', 'hold committed'); }
    });
    let escalation = null;
    if (run.human && !escalated) {
      if (k === 0 && crewed) escalation = { trigger: 'CREWED', level: 'L3', reason: 'a crewed vehicle is involved' };
      else if (k === 0 && silent) escalation = { trigger: 'SILENT', level: 'L3', reason: 'one satellite does not answer' };
      else if (s.pc > 1e-3) escalation = { trigger: 'PC-HIGH', level: 'L3', reason: 'high collision probability' };
      escalated = Boolean(escalation);
    }
    return {
      t_min: s.t, miss_m: s.miss, sigma_m: s.sigma, pc: s.pc,
      actions: { a: { action: s.executed[0], probs: s.probs[0] }, b: { action: s.executed[1], probs: s.probs[1] } },
      verdict, messages, escalation,
      live: { chosen: s.chosen, executed: s.executed, dv: s.dv, why: s.why, missAfter: s.missAfter },
    };
  });
  const sum = (i) => run.steps.reduce((acc, s) => acc + (s.dv[i] > 0 ? s.dv[i] : 0), 0);
  return {
    id, title: `Live: ${agents[0].name} and ${agents[1].name}`.slice(0, 120), variant: 'ai', scripted: false, agents, steps,
    outcome: { collision: Boolean(run.collision), dv_ms: { a: sum(0), b: sum(1) }, ledger_after: { commons: 0 } },
    spec: { m0_m: spec.m0_m, p0_m: spec.p0_m, sigma0_m: spec.sigma0_m, sigma_min_m: spec.sigma_min_m }, source: run.source ?? 'browser',
  };
}

export function framesFromRun(spec, run, id) {
  const ep = episodeFromRun(spec, run, id);
  return framesFromEpisode(ep, ep.steps);
}

// Where the timeline shows a mark: messages, burns, escalations and human decisions.
export function markers(frames) {
  return frames.map((f) => ({ index: f.index, msg: f.messages.length > 0, burn: f.agents.some((a) => a.dv > 0), esc: Boolean(f.escalation), decision: f.decision }));
}
