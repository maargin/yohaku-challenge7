"""Shared Hypothesis generators for domain objects (PBT-07)."""
from hypothesis import strategies as st

from sim.domain import CAPABILITIES, PURPOSES, Declaration, RegistryEntry
from sim.handshake import MESSAGE_TYPES, Message

agent_ids = st.from_regex(r"[a-z]{2,4}-[0-9]{1,4}", fullmatch=True)
operators = st.sampled_from(["Kestrel", "Ocean Science", "Amara Univ", "Northwind", "Legacy Launch", "Station Partners"])
fuel = st.one_of(st.sampled_from([0.0, 0.19999, 0.2, 0.20001, 1.0]), st.floats(0.0, 1.0, allow_nan=False))
balance = st.one_of(st.sampled_from([-3.0, -2.9999, -3.0001, 0.0, 0.5]), st.floats(-10.0, 10.0, allow_nan=False))


@st.composite
def registry_entry(draw, agent_id):
    return RegistryEntry(agent_id, draw(operators), draw(st.sampled_from(CAPABILITIES)),
                         draw(st.sampled_from(PURPOSES)), draw(st.booleans()))


@st.composite
def declaration(draw, reg, honest=None):
    honest = draw(st.booleans()) if honest is None else honest
    cap = reg.capability if honest else draw(st.sampled_from(CAPABILITIES))
    pur = reg.purpose if honest else draw(st.sampled_from(PURPOSES))
    return Declaration(reg.agent_id, cap, pur, draw(fuel), silent=draw(st.booleans()))


@st.composite
def pair(draw, honest=None):
    """(decl_a, decl_b, registry, balances) for two distinct agents."""
    ida = draw(agent_ids)
    idb = draw(agent_ids.filter(lambda x: x != ida))
    ra, rb = draw(registry_entry(ida)), draw(registry_entry(idb))
    da, db = draw(declaration(ra, honest)), draw(declaration(rb, honest))
    bals = {ra.operator: draw(balance), rb.operator: draw(balance)}
    return da, db, {ida: ra, idb: rb}, bals


@st.composite
def messages(draw, agents=("sat-a", "sat-b"), max_size=30):
    n = draw(st.integers(0, max_size))
    out = []
    for i in range(n):
        frm = draw(st.sampled_from(agents))
        to = agents[1] if frm == agents[0] else agents[0]
        mid = draw(st.sampled_from([f"m{i}", f"m{max(0, i - 1)}"]))   # duplicates on purpose
        out.append(Message(mid, float(-240 + 10 * (i % 24)), frm, to, draw(st.sampled_from(MESSAGE_TYPES)), "x"))
    return out


encounter = st.fixed_dictionaries({
    "miss_m": st.floats(0.0, 5000.0, allow_nan=False),
    "sigma_m": st.floats(50.0, 2000.0, allow_nan=False),
})
