// Property-based tests for the JS rules (fast-check). Seed is fixed and logged (PBT-08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { verdict } from '../js/rules.js';
import { pair, SEED } from './generators.mjs';

const opts = { seed: SEED, numRuns: 500 };
console.log(`fast-check seed: ${SEED} (set PBT_SEED to replay)`);

test('verdict is symmetric', () => {
  fc.assert(fc.property(pair, ({ decls, registry, balances }) => {
    const v1 = verdict(decls[0], decls[1], registry, balances);
    const v2 = verdict(decls[1], decls[0], registry, balances);
    return v1.yielder === v2.yielder && v1.stand_on === v2.stand_on && v1.rule === v2.rule;
  }), opts);
});

test('exactly one yielder unless both cannot move', () => {
  fc.assert(fc.property(pair, ({ decls, registry, balances }) => {
    const v = verdict(decls[0], decls[1], registry, balances);
    if (v.rule === 'R1') return v.yielder === null;
    return new Set([v.yielder, v.stand_on]).size === 2;
  }), opts);
});

test('debris never yields', () => {
  fc.assert(fc.property(pair, ({ decls, registry, balances }) => {
    const v = verdict(decls[0], decls[1], registry, balances);
    return v.yielder === null || registry[v.yielder].capability !== 'debris';
  }), opts);
});

test('unknown agent is rejected (fail closed)', () => {
  assert.throws(() => verdict({ agent_id: 'x' }, { agent_id: 'y' }, {}, {}));
});
