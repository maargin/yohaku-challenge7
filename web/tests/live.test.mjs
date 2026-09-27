// Live mode parity: the browser simulator reproduces the GPU training environment step by step
// (fixture: two-satellite clusters run by sim/env_torch.py with the shipped policy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEncounter, STEPS } from '../js/liveEnv.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const policy = load('../data/policy.json');
const { cases } = load('./live.fixture.json');

test('fixture covers a range of encounters', () => {
  assert.ok(cases.length >= 10);
});

cases.forEach((c, n) => {
  test(`case ${n}: observations, executed actions and miss distance match the GPU environment`, () => {
    const enc = createEncounter(c);
    for (let k = 0; k < STEPS; k += 1) {
      const snap = enc.snapshot();
      [0, 1].forEach((i) => {
        const got = enc.obs(i, snap);
        c.obs[k][i].forEach((want, f) => {
          assert.ok(Math.abs(got[f] - want) <= 2e-4 * Math.max(1, Math.abs(want)), `step ${k} agent ${i} feature ${f}: ${got[f]} vs ${want}`);
        });
      });
      const rec = enc.step(policy);
      assert.deepEqual(rec.executed, c.executed[k], `step ${k} executed`);
      assert.ok(Math.abs(rec.missAfter - c.miss_m[k]) <= 1e-3 * Math.max(1, c.miss_m[k]), `step ${k} miss`);
    }
  });
});

test('a head-on pass with nobody moving collides; the AI avoids it', () => {
  const spec = {
    agents: [{ capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.6, ledger: 0, silent: false },
      { capability: 'autonomous', purpose: 'commercial', fuel: 0.7, ledger: 0, silent: false }],
    m0_m: 8, p0_m: 5, sigma0_m: 1200, sigma_min_m: 100,
  };
  const out = createEncounter(spec).run(policy);
  assert.equal(out.collision, false);
  assert.ok(out.steps.some((s) => s.dv.some((d) => d > 0)));
});

import { working, priorityReason } from '../js/liveEnv.js';

test('the working shown for a step reproduces the simulator numbers', () => {
  let checked = 0;
  for (const c of cases) {
    const enc = createEncounter(c);
    const spec = { ...c };
    for (let k = 0; k < STEPS; k += 1) {
      const s = enc.step(policy);
      const w = working(spec, s);
      assert.ok(Math.abs(w.sigma - s.sigma) < 1e-6, 'sigma');
      assert.ok(Math.abs(w.pc - s.pc) <= 1e-12 + 1e-9 * s.pc, 'pc');
      assert.equal(w.dangerous, s.danger, 'danger');
      assert.ok(Math.abs(w.missAfter - s.missAfter) < 1e-6, `miss after step ${k}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test('the priority reason names the same yielder as the safety layer', () => {
  for (const c of cases) {
    const enc = createEncounter(c);
    const snap = enc.snapshot();
    const pr = priorityReason(c.agents[0], c.agents[1]);
    const y = snap.iYields.indexOf(true);
    assert.equal(pr.yielder, y < 0 ? null : y);
    assert.ok(pr.reason.length > 0);
  }
});
