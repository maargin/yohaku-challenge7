// Run from the repo root:  node web-b/tests/rules.test.mjs
import assert from 'node:assert/strict';
import { whoYields, verifyBothSides } from '../js/rules.js';

const sat = (over) => ({ id: 1, name: 'A', class: 'manoeuvrable', fuel: 0.5, ledger: 0, purpose: 'commercial', ...over });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

console.log('ladder rungs');

test('1: debris holds, the other moves', () => {
  const v = whoYields(sat({ id: 1, name: 'SAT' }), sat({ id: 2, name: 'JUNK', class: 'debris' }));
  assert.equal(v.rule, 1); assert.equal(v.mover, 1);
});

test('1: silent counterpart treated as non-manoeuvrable', () => {
  const v = whoYields(sat({ id: 1 }), sat({ id: 2, silent: true }));
  assert.equal(v.rule, 1); assert.equal(v.mover, 1);
});

test('1: two debris objects -> nobody can move, escalate', () => {
  const v = whoYields(sat({ id: 1, class: 'debris' }), sat({ id: 2, class: 'debris' }));
  assert.equal(v.mover, null); assert.equal(v.escalate, true);
});

test('2: crewed has priority', () => {
  const v = whoYields(sat({ id: 1, class: 'crewed' }), sat({ id: 2 }));
  assert.equal(v.rule, 2); assert.equal(v.mover, 2);
});

test('3: low fuel gets a break', () => {
  const v = whoYields(sat({ id: 1, fuel: 0.05 }), sat({ id: 2, fuel: 0.6 }));
  assert.equal(v.rule, 3); assert.equal(v.mover, 2);
});

test('4: science outranks commercial', () => {
  const v = whoYields(sat({ id: 1, purpose: 'science' }), sat({ id: 2, purpose: 'commercial' }));
  assert.equal(v.rule, 4); assert.equal(v.mover, 2);
});

test('4: skipped when purpose is not declared, falls to rule 5', () => {
  const v = whoYields(sat({ id: 1, purpose: undefined, fuel: 0.3 }), sat({ id: 2, purpose: undefined, fuel: 0.8 }));
  assert.equal(v.trace[3].state, 'skipped'); assert.equal(v.rule, 5); assert.equal(v.mover, 2);
});

test('5: larger fuel margin yields', () => {
  const v = whoYields(sat({ id: 1, fuel: 0.41 }), sat({ id: 2, fuel: 0.79 }));
  assert.equal(v.rule, 5); assert.equal(v.mover, 2);
});

test('6: lower ledger balance yields', () => {
  const v = whoYields(sat({ id: 1, ledger: 3 }), sat({ id: 2, ledger: -7 }));
  assert.equal(v.rule, 6); assert.equal(v.mover, 2);
});

test('7: lower id moves when everything else ties', () => {
  const v = whoYields(sat({ id: 9 }), sat({ id: 4 }));
  assert.equal(v.rule, 7); assert.equal(v.mover, 4);
});

console.log('dummy episodes');

test('aeolus-2019: STARLINK-44 moves on rule 4', () => {
  const v = whoYields(
    { id: 43600, name: 'AEOLUS', class: 'manoeuvrable', fuel: 0.62, ledger: 3, purpose: 'science' },
    { id: 44235, name: 'STARLINK-44', class: 'autonomous', fuel: 0.88, ledger: -7, purpose: 'commercial' });
  assert.equal(v.mover, 44235); assert.equal(v.rule, 4);
});

test('iss-debris-07: ISS moves on rule 1', () => {
  const v = whoYields(
    { id: 25544, name: 'ISS (ZARYA)', class: 'crewed', fuel: 0.55, ledger: 2 },
    { id: 99001, name: 'FRAGMENT 99001', class: 'debris', fuel: 0, ledger: 0 });
  assert.equal(v.mover, 25544); assert.equal(v.rule, 1);
});

console.log('determinism');

test('10,000 random pairs: both sides always reach the same verdict', () => {
  const classes = ['debris', 'manoeuvrable', 'autonomous', 'crewed'];
  const purposes = ['science', 'commercial', 'public-good', undefined];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const rand = (id) => ({
    id, name: `S${id}`, class: pick(classes),
    fuel: rnd() < 0.1 ? undefined : Math.round(rnd() * 10) / 10,
    ledger: rnd() < 0.1 ? undefined : Math.floor(rnd() * 7) - 3,
    purpose: pick(purposes), silent: rnd() < 0.05
  });
  for (let i = 0; i < 10000; i++) {
    const { match } = verifyBothSides(rand(i * 2 + 1), rand(i * 2 + 2));
    assert.equal(match, true, `mismatch on pair ${i}`);
  }
});

console.log(`\n${passed} passed`);
