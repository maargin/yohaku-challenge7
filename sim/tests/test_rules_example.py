"""Example-based tests pinning the story scenarios for the Who-Yields rules (O1)."""
from sim.domain import Declaration, RegistryEntry
from sim.rules import verdict


def reg(aid, op, cap, pur="commercial"):
    return RegistryEntry(aid, op, cap, pur)


def decl(r, fuel=0.6, **over):
    return Declaration(r.agent_id, over.get("capability", r.capability), over.get("purpose", r.purpose), fuel,
                       over.get("silent", False))


def run(ra, rb, da=None, db=None, bals=None):
    return verdict(da or decl(ra), db or decl(rb), {ra.agent_id: ra, rb.agent_id: rb}, bals or {})


def test_debris_never_yields_satellite_moves():
    s, d = reg("sat", "K", "manoeuvrable"), reg("deb", "L", "debris", "none")
    v = run(s, d, db=decl(d, fuel=0.0))
    assert (v.yielder, v.stand_on, v.rule) == ("sat", "deb", "R2")


def test_both_debris_escalates():
    d1, d2 = reg("deb-1", "L", "debris", "none"), reg("deb-2", "M", "debris", "none")
    v = run(d1, d2)
    assert v.yielder is None and v.rule == "R1" and v.escalate == "BOTH_NM"


def test_crewed_holds_course():
    c, k = reg("station", "SP", "crewed", "public_good"), reg("kst", "K", "autonomous")
    v = run(c, k)
    assert (v.yielder, v.rule) == ("kst", "R3")


def test_both_crewed_escalates_with_proposal():
    a, b = reg("iss", "A", "crewed", "public_good"), reg("css", "B", "crewed", "public_good")
    v = run(a, b)
    assert v.rule == "R3b" and v.escalate == "BOTH_CREWED" and v.yielder in ("iss", "css")


def test_low_fuel_cubesat_protected():
    cube, kst = reg("cube", "Amara", "manoeuvrable", "public_good"), reg("kst", "K", "autonomous")
    v = run(cube, kst, da=decl(cube, fuel=0.12), db=decl(kst, fuel=0.8))
    assert (v.yielder, v.rule) == ("kst", "R4")


def test_low_fuel_boundary_is_strict():
    a, b = reg("a-1", "A", "manoeuvrable"), reg("b-1", "B", "manoeuvrable")
    v = run(a, b, da=decl(a, fuel=0.2), db=decl(b, fuel=0.9))
    assert v.rule != "R4"


def test_free_rider_yields():
    a, b = reg("a-1", "Rider", "manoeuvrable"), reg("b-1", "Good", "manoeuvrable")
    v = run(a, b, bals={"Rider": -3.0, "Good": 0.0})
    assert (v.yielder, v.rule) == ("a-1", "R5")


def test_autonomous_yields_first():
    a, m = reg("auto", "A", "autonomous"), reg("man", "B", "manoeuvrable")
    assert run(a, m).yielder == "auto"


def test_commercial_yields_to_public_good():
    p, c = reg("pub", "A", "manoeuvrable", "public_good"), reg("com", "B", "manoeuvrable", "commercial")
    v = run(p, c)
    assert (v.yielder, v.rule) == ("com", "R7")


def test_tiebreak_fuel_then_ledger_then_id():
    a, b = reg("a-1", "A", "manoeuvrable", "none"), reg("b-1", "B", "manoeuvrable", "none")
    assert run(a, b, da=decl(a, 0.9), db=decl(b, 0.5)).rule == "R8a"
    assert run(a, b, da=decl(a, 0.9), db=decl(b, 0.5)).yielder == "a-1"
    v = run(a, b, da=decl(a, 0.6), db=decl(b, 0.6), bals={"A": 2.0, "B": 0.0})
    assert (v.yielder, v.rule) == ("b-1", "R8b")
    v = run(a, b, da=decl(a, 0.6), db=decl(b, 0.6))
    assert (v.yielder, v.rule) == ("a-1", "R8c")


def test_silent_counterpart_treated_as_unable_to_move():
    s, x = reg("sci", "O", "manoeuvrable", "public_good"), reg("opx", "X", "manoeuvrable")
    v = run(s, x, db=decl(x, silent=True))
    assert (v.yielder, v.rule) == ("sci", "R2")


def test_false_declaration_registry_wins_and_is_penalised():
    k, s = reg("kst", "K", "autonomous"), reg("sci", "O", "manoeuvrable", "public_good")
    v = run(k, s, da=decl(k, capability="crewed", purpose="public_good"))
    assert v.yielder == "kst"
    assert [p.kind for p in v.penalties] == ["FALSE_DECLARATION"]
    assert dict(v.penalties[0].evidence)["declared_capability"] == "crewed"
