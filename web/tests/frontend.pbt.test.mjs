// Property-based tests for the frontend's pure logic (PBT-02/03/07/08). Seed fixed and logged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { validate, DataError } from '../js/validate.js';
import { clampIndex, effectiveSteps, needsDecision } from '../js/playbackCore.js';
import { bars, isBalanced, openingBalances } from '../js/ledgerMath.js';
import { linkStyle } from '../js/threads.js';
import { SEED } from './generators.mjs';

const opts = { seed: SEED, numRuns: 300 };
const episodes = JSON.parse(readFileSync(new URL('../data/episodes.json', import.meta.url), 'utf8'));

test('committed data files pass the browser validators', () => {
  for (const kind of ['objects', 'episodes', 'socrates_top', 'policy', 'testvec', 'explanations', 'results']) {
    const data = JSON.parse(readFileSync(new URL(`../data/${kind}.json`, import.meta.url), 'utf8'));
    assert.doesNotThrow(() => validate(kind, data), kind);
  }
});

test('JSON round-trip of any episode keeps it valid (PBT-02)', () => {
  fc.assert(fc.property(fc.constantFrom(...episodes), (ep) => {
    const again = JSON.parse(JSON.stringify(ep));
    validate('episodes', [again]);
    return JSON.stringify(again) === JSON.stringify(ep);
  }), opts);
});

test('corrupting a step field is always rejected (fail closed)', () => {
  const fields = ['pc', 'miss_m', 'sigma_m', 't_min'];
  const bad = fc.oneof(fc.constant(Number.NaN), fc.constant(-1), fc.constant('x'), fc.constant(null), fc.constant(1e9));
  fc.assert(fc.property(fc.constantFrom(...episodes), fc.constantFrom(...fields), bad, (ep, field, value) => {
    const copy = structuredClone(ep);
    if (field === 'pc' && value === 1e9) value = 2;
    if (field === 'miss_m' && value === 1e9) value = -5;
    if (field === 'sigma_m' && value === 1e9) value = 0;
    if (field === 't_min' && (value === -1 || value === 1e9)) value = 5;
    copy.steps[0][field] = value;
    try { validate('episodes', [copy]); return false; } catch (e) { return e instanceof DataError; }
  }), opts);
});

test('a branch replaces only the steps after the decision (invariant)', () => {
  const withBranch = episodes.filter((e) => e.steps.some(needsDecision));
  assert.ok(withBranch.length > 0);
  fc.assert(fc.property(fc.constantFrom(...withBranch), fc.constantFrom('approve', 'override', 'stop'), (ep, choice) => {
    const index = ep.steps.findIndex(needsDecision);
    const played = effectiveSteps(ep, { index, choice });
    return played.length === ep.steps.length
      && JSON.stringify(played.slice(0, index + 1)) === JSON.stringify(ep.steps.slice(0, index + 1));
  }), opts);
});

test('clampIndex stays in range', () => {
  fc.assert(fc.property(fc.double({ noNaN: false }), fc.integer({ min: 0, max: 50 }), (i, n) => {
    const c = clampIndex(i, n);
    return n === 0 ? c === 0 : c >= 0 && c <= n - 1 && Number.isInteger(c);
  }), opts);
});

test('ledger bars: widths within [0, 50]% and sorted; opening balances are zero-sum', () => {
  const bal = fc.dictionary(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), fc.double({ min: -20, max: 20, noNaN: true }), { minKeys: 1, maxKeys: 8 });
  fc.assert(fc.property(bal, (b) => {
    const rows = bars(b);
    const inRange = rows.every((r) => r.widthPct >= 0 && r.widthPct <= 50 + 1e-9);
    const sorted = rows.every((r, k) => k === 0 || rows[k - 1].value >= r.value);
    const agents = Object.entries(b).map(([operator, ledger]) => ({ operator, ledger }));
    return inRange && sorted && isBalanced(openingBalances(agents), 1e-6);
  }), opts);
});

test('risk links get stronger as Pc rises and fade when over', () => {
  fc.assert(fc.property(fc.double({ min: 1e-12, max: 1, noNaN: true }), fc.double({ min: 1e-12, max: 1, noNaN: true }), (a, b) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const sl = linkStyle(lo);
    const sh = linkStyle(hi);
    const over = linkStyle(hi, { over: true });
    return sh.stroke >= sl.stroke && sh.risk >= sl.risk && over.stroke <= sh.stroke && over.risk === 0;
  }), opts);
});
