"""Example tests for the Kelvins scenario loader (E1)."""
import pandas as pd
import pytest

from sim.scenarios import event_table, sample_encounters


def frame():
    rows = []
    for eid, (m_first, m_last) in {1: (900.0, 800.0), 2: (12000.0, 11000.0)}.items():
        for tca, miss, s in ((6.0, m_first, 400.0), (2.0, m_last, 150.0)):
            rows.append({"event_id": eid, "time_to_tca": tca, "miss_distance": miss, "relative_speed": 12000.0,
                         "t_sigma_r": s, "t_sigma_t": s, "c_sigma_r": s, "c_sigma_t": s})
    return pd.DataFrame(rows)


def test_event_table_uses_last_cdm_miss_and_shrinking_sigma():
    ev = {e["event_id"]: e for e in event_table(frame())}
    assert ev[1]["miss0_m"] == 800.0
    assert ev[1]["sigma0_m"] == pytest.approx(800.0) and ev[1]["sigma_min_m"] == pytest.approx(300.0)


def test_sampling_keeps_close_events_and_is_reproducible():
    events = event_table(frame())
    a = sample_encounters(events, 20, seed=3)
    assert all(e["event_id"] == 1 for e in a)
    assert a == sample_encounters(events, 20, seed=3)


def test_no_close_events_raises():
    with pytest.raises(ValueError):
        sample_encounters(event_table(frame()), 5, seed=1, max_miss_m=10.0)
