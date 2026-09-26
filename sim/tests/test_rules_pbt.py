"""Property-based tests for the Who-Yields rules (PBT-03 invariants)."""
from dataclasses import replace

from hypothesis import given

from sim.rules import verdict
from sim.tests.strategies import pair


@given(pair())
def test_symmetric(p):
    da, db, registry, bals = p
    v1, v2 = verdict(da, db, registry, bals), verdict(db, da, registry, bals)
    assert (v1.yielder, v1.stand_on, v1.rule) == (v2.yielder, v2.stand_on, v2.rule)


@given(pair())
def test_exactly_one_yielder_unless_both_stuck(p):
    da, db, registry, bals = p
    v = verdict(da, db, registry, bals)
    if v.rule == "R1":
        assert v.yielder is None and v.stand_on is None
    else:
        assert {v.yielder, v.stand_on} == {da.agent_id, db.agent_id}


@given(pair())
def test_debris_never_yields(p):
    da, db, registry, bals = p
    v = verdict(da, db, registry, bals)
    if v.yielder is not None:
        assert registry[v.yielder].capability != "debris"


@given(pair())
def test_registry_wins_over_declaration(p):
    """Changing only the declared class/purpose never changes the verdict."""
    da, db, registry, bals = p
    ra = registry[da.agent_id]
    honest = replace(da, capability=ra.capability, purpose=ra.purpose)
    v1, v2 = verdict(da, db, registry, bals), verdict(honest, db, registry, bals)
    assert (v1.yielder, v1.rule) == (v2.yielder, v2.rule)


@given(pair())
def test_false_declaration_always_penalised(p):
    da, db, registry, bals = p
    v = verdict(da, db, registry, bals)
    liars = {registry[d.agent_id].operator for d in (da, db)
             if (d.capability, d.purpose) != (registry[d.agent_id].capability, registry[d.agent_id].purpose)}
    assert {pen.operator for pen in v.penalties} == liars


@given(pair())
def test_deterministic(p):
    da, db, registry, bals = p
    assert verdict(da, db, registry, bals) == verdict(da, db, registry, bals)
