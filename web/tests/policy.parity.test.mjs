// Round-trip/oracle test: the browser forward pass must match the Python/torch logits (PBT-02/05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import fc from 'fast-check';
import { forward, parity, softmax } from '../js/policy.js';
import { SEED } from './generators.mjs';

const dir = new URL('../data/', import.meta.url);
const have = existsSync(new URL('policy.json', dir)) && existsSync(new URL('testvec.json', dir));

test('policy parity with torch (max error < 1e-4)', { skip: !have && 'policy not exported yet' }, () => {
  const policy = JSON.parse(readFileSync(new URL('policy.json', dir), 'utf8'));
  const testvec = JSON.parse(readFileSync(new URL('testvec.json', dir), 'utf8'));
  const err = parity(policy, testvec);
  console.log(`policy parity max error: ${err}`);
  assert.ok(err < 1e-4);
});

test('softmax is a probability distribution', () => {
  fc.assert(fc.property(fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 1, maxLength: 10 }), (xs) => {
    const p = softmax(xs);
    const s = p.reduce((a, b) => a + b, 0);
    return Math.abs(s - 1) < 1e-9 && p.every((v) => v >= 0 && v <= 1);
  }), { seed: SEED, numRuns: 300 });
});

test('forward pass of a tiny known network', () => {
  const policy = { obs_mean: [0, 0], obs_std: [1, 1], layers: [{ W: [[1, 0], [0, 1]], b: [0, 0] }, { W: [[1, 1]], b: [0.5] }] };
  const [y] = forward(policy, [0, 0]);
  assert.equal(y, 0.5);
});
