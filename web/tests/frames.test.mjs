// Frames: every pre-built episode and every live run become well-formed frames; live runs become valid episodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { framesFromEpisode, episodeFromRun, framesFromRun, checkIndex, markers, CHECKS } from '../js/frames.js';
import { effectiveSteps, latestVerdict } from '../js/playbackCore.js';
import { createEncounter, priorityReason } from '../js/liveEnv.js';
import { PRESETS } from '../js/live.js';
import { validate } from '../js/validate.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const episodes = load('../data/episodes.json');
const policy = load('../data/policy.json');
const { cases } = load('./live.fixture.json');
const argmax = (xs) => xs.reduce((b, x, i) => (x > xs[b] ? i : b), 0);

function checkFrames(frames, steps, ep) {
  assert.equal(frames.length, steps.length);
  let burned = [false, false];
  frames.forEach((f, k) => {
    assert.equal(f.index, k);
    if (k > 0) assert.ok(f.t > frames[k - 1].t, 't increases');
    for (const x of [f.miss, f.sigma, f.pc, f.missAfter]) assert.ok(Number.isFinite(x));
    if (k < steps.length - 1 && !steps[k].live) assert.equal(f.missAfter, steps[k + 1].miss_m);
    assert.equal(f.agents.length, 2);
    f.agents.forEach((a, i) => {
      if (a.probs.length && !steps[k].live) assert.equal(a.proposed.action, argmax(a.probs));
      assert.ok(Number.isInteger(a.executed) && a.executed >= 0 && a.executed <= 6);
      assert.ok(a.burned || !burned[i], 'burned is monotone');
      burned[i] = a.burned;
    });
    const v = latestVerdict(steps, k);
    const want = v && v.yielder ? ep.agents.findIndex((a) => a.id === v.yielder) : null;
    assert.equal(f.yielder, want);
    assert.ok([0, 1, null].includes(f.yielder));
  });
}

test('frames from every committed episode and every branch are well-formed', () => {
  let n = 0;
  for (const ep of episodes) {
    checkFrames(framesFromEpisode(ep, ep.steps), ep.steps, ep);
    n += 1;
    ep.steps.forEach((s, k) => {
      for (const choice of Object.keys(s.branches ?? {})) {
        const steps = effectiveSteps(ep, { index: k, choice });
        checkFrames(framesFromEpisode(ep, steps), steps, ep);
        n += 1;
      }
    });
  }
  assert.ok(n >= episodes.length);
});

const specs = [...Object.values(PRESETS).map((p) => ({ ...p })), ...cases.map((c, k) => ({ ...c, agents: c.agents.map((a, i) => ({ ...a, name: `F${k}-${i}` })) }))];

test('a live run becomes a valid episode with well-formed frames', () => {
  for (const spec of specs) {
    const run = createEncounter(spec).run(policy);
    const ep = episodeFromRun(spec, run, 'live-x');
    assert.doesNotThrow(() => validate('episodes', [ep]));
    assert.equal(ep.steps.length, 24);
    for (const s of ep.steps) for (const m of s.messages) assert.ok(['PROPOSE', 'ACK', 'DO-NOT-MOVE', 'EXECUTED', 'ESCALATE'].includes(m.type));
    const sum = (i) => run.steps.reduce((acc, s) => acc + s.dv[i], 0);
    assert.ok(Math.abs(ep.outcome.dv_ms.a - sum(0)) < 1e-9 && Math.abs(ep.outcome.dv_ms.b - sum(1)) < 1e-9);
    const frames = framesFromRun(spec, run, 'live-x');
    checkFrames(frames, ep.steps, ep);
    assert.deepEqual(frames, framesFromEpisode(ep, ep.steps));
    frames.forEach((f, k) => {
      f.agents.forEach((a, i) => { assert.equal(a.dv, run.steps[k].dv[i]); assert.equal(a.why, run.steps[k].why[i]); assert.equal(a.proposed.action, run.steps[k].chosen[i]); });
      assert.equal(f.missAfter, run.steps[k].missAfter);
    });
  }
});

test('checkIndex maps both reason wordings onto the seven checks', () => {
  const reasons = new Set();
  for (const ep of episodes) for (const s of ep.steps) if (s.verdict && s.verdict.reason) reasons.add(s.verdict.reason);
  for (const spec of specs) reasons.add(priorityReason(spec.agents[0], spec.agents[1]).reason);
  for (const r of reasons) { const k = checkIndex(r); assert.ok(Number.isInteger(k) && k >= 0 && k < CHECKS.length, r); }
  assert.equal(checkIndex('the low-fuel satellite holds course'), 2);
  assert.equal(checkIndex('the satellite with less than 20% fuel holds course'), 2);
  assert.equal(checkIndex('a crewed vehicle holds course'), 1);
});

test('markers flag every burn and escalation step', () => {
  for (const ep of episodes) {
    const frames = framesFromEpisode(ep, ep.steps);
    markers(frames).forEach((m, k) => {
      assert.equal(m.burn, frames[k].agents.some((a) => a.dv > 0));
      assert.equal(m.esc, Boolean(ep.steps[k].escalation));
    });
  }
});
