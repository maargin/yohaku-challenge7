// Example-based tests pinning key story scenarios for the JS rules (PBT-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from '../js/rules.js';

const reg = (id, op, capability, purpose = 'commercial') => ({ agent_id: id, operator: op, capability, purpose });
const decl = (r, fuel = 0.6, extra = {}) => ({ agent_id: r.agent_id, capability: r.capability, purpose: r.purpose, fuel, ...extra });
const run = (a, b, da, db, bals = {}) => verdict(da ?? decl(a), db ?? decl(b), { [a.agent_id]: a, [b.agent_id]: b }, bals);

test('debris cannot move: satellite yields (R2)', () => {
  const s = reg('sat', 'K', 'manoeuvrable');
  const d = reg('deb', 'L', 'debris', 'none');
  assert.equal(run(s, d, undefined, decl(d, 0)).yielder, 'sat');
});

test('crewed holds course (R3)', () => {
  const v = run(reg('station', 'SP', 'crewed', 'public_good'), reg('kst', 'K', 'autonomous'));
  assert.deepEqual([v.yielder, v.rule], ['kst', 'R3']);
});

test('low-fuel CubeSat protected (R4)', () => {
  const c = reg('cube', 'A', 'manoeuvrable', 'public_good');
  const k = reg('kst', 'K', 'autonomous');
  assert.deepEqual([run(c, k, decl(c, 0.12), decl(k, 0.8)).yielder], ['kst']);
});

test('false declaration: registry wins and is penalised', () => {
  const k = reg('kst', 'K', 'autonomous');
  const s = reg('sci', 'O', 'manoeuvrable', 'public_good');
  const v = run(k, s, decl(k, 0.7, { capability: 'crewed', purpose: 'public_good' }));
  assert.equal(v.yielder, 'kst');
  assert.deepEqual(v.penalties.map((p) => p.operator), ['K']);
});

test('silent counterpart treated as unable to move', () => {
  const s = reg('sci', 'O', 'manoeuvrable', 'public_good');
  const x = reg('opx', 'X', 'manoeuvrable');
  assert.equal(run(s, x, undefined, decl(x, 0.7, { silent: true })).yielder, 'sci');
});
