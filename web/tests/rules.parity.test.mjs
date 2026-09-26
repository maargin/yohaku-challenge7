// Oracle test: the JS rules must give exactly the Python verdict for every generated case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdict } from '../js/rules.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/rules_cases.json', import.meta.url), 'utf8'));

test(`JS rules match Python on ${fixture.cases.length} cases (seed ${fixture.seed})`, () => {
  for (const c of fixture.cases) {
    const registry = Object.fromEntries(Object.entries(c.registry).map(([k, r]) => [k, { agent_id: k, ...r }]));
    const v = verdict(c.decls[0], c.decls[1], registry, c.balances);
    const got = {
      yielder: v.yielder, stand_on: v.stand_on, rule: v.rule,
      penalties: v.penalties.map((p) => p.operator).sort(),
    };
    assert.deepEqual(got, c.expected, `case ${c.id}`);
  }
});
