// Shared fast-check generators for domain objects (PBT-07).
import fc from 'fast-check';

export const CAPABILITIES = ['debris', 'manoeuvrable', 'autonomous', 'crewed'];
export const PURPOSES = ['public_good', 'commercial', 'none'];

const fuel = fc.oneof(fc.constantFrom(0, 0.19999, 0.2, 0.20001, 1), fc.double({ min: 0, max: 1, noNaN: true }));
const balance = fc.oneof(fc.constantFrom(-3, -2.9999, -3.0001, 0), fc.double({ min: -10, max: 10, noNaN: true }));

export const pair = fc
  .record({
    ids: fc.uniqueArray(fc.stringMatching(/^[a-z]{2,4}-[0-9]{1,3}$/), { minLength: 2, maxLength: 2 }),
    ops: fc.uniqueArray(fc.constantFrom('K', 'O', 'A', 'N', 'L'), { minLength: 2, maxLength: 2 }),
    caps: fc.tuple(fc.constantFrom(...CAPABILITIES), fc.constantFrom(...CAPABILITIES)),
    purs: fc.tuple(fc.constantFrom(...PURPOSES), fc.constantFrom(...PURPOSES)),
    fuels: fc.tuple(fuel, fuel),
    silent: fc.tuple(fc.boolean(), fc.boolean()),
    bals: fc.tuple(balance, balance),
  })
  .map(({ ids, ops, caps, purs, fuels, silent, bals }) => {
    const registry = {};
    const decls = ids.map((id, i) => {
      registry[id] = { agent_id: id, operator: ops[i], capability: caps[i], purpose: purs[i] };
      return { agent_id: id, capability: caps[i], purpose: purs[i], fuel: fuels[i], silent: silent[i] };
    });
    return { decls, registry, balances: { [ops[0]]: bals[0], [ops[1]]: bals[1] } };
  });

export const SEED = Number(process.env.PBT_SEED ?? 20260927);
