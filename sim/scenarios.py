"""ESA Kelvins conjunction data -> encounter geometry (B2).

Dataset: ESA Kelvins Collision Avoidance Challenge, CC-BY-4.0, Zenodo 10.5281/zenodo.4463683
(Uriot et al. 2022). Whole events are bootstrap-resampled, so miss distance and the shrinking
uncertainty stay consistent with each other (per-column fits do not).
"""
import math

import numpy as np

REQUIRED = ("event_id", "time_to_tca", "miss_distance", "relative_speed",
            "t_sigma_r", "t_sigma_t", "c_sigma_r", "c_sigma_t")


def load_kelvins(path):
    import pandas as pd
    df = pd.read_csv(path, usecols=lambda c: c in REQUIRED)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Kelvins file is missing columns: {missing}")
    return df.dropna(subset=list(REQUIRED))


def _combined_sigma(row):
    return math.sqrt(row["t_sigma_r"] ** 2 + row["t_sigma_t"] ** 2 + row["c_sigma_r"] ** 2 + row["c_sigma_t"] ** 2)


def event_table(df):
    """One row per event: miss at the last CDM, uncertainty at the first and last CDM."""
    rows = []
    for event_id, g in df.groupby("event_id", sort=True):
        g = g.sort_values("time_to_tca", ascending=False)
        first, last = g.iloc[0], g.iloc[-1]
        s0, s1 = _combined_sigma(first), _combined_sigma(last)
        if not (s0 > 0 and s1 > 0):
            continue
        rows.append({
            "event_id": int(event_id),
            "miss0_m": float(last["miss_distance"]),
            "sigma0_m": float(max(s0, s1)),
            "sigma_min_m": float(min(s0, s1)),
            "rel_speed_ms": float(last["relative_speed"]),
        })
    return rows


def sample_encounters(events, n, seed, max_miss_m=5000.0):
    """Bootstrap-resample n whole events (with replacement), restricted to close ones."""
    pool = [e for e in events if e["miss0_m"] <= max_miss_m]
    if not pool:
        raise ValueError("no events within max_miss_m")
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(pool), size=n)
    return [dict(pool[i]) for i in idx]
