"""Illustrative encounter physics (BR-5). Not operational: linearised, no real covariance."""
import math

HARD_BODY_RADIUS_M = 20.0
HORIZON_MIN = 240.0
ALONG_TRACK_GAIN = 3.0      # along-track drift ~ 3 * dv * t (Clohessy-Wiltshire secular term)
ENCOUNTER_PROJECTION = 0.6  # share of the along-track shift that lands in the encounter plane


def pc(miss_m, sigma_m, radius_m=HARD_BODY_RADIUS_M):
    """Small-object 2D Gaussian approximation, clipped to [0, 1]."""
    if sigma_m <= 0:
        raise ValueError("sigma must be positive")
    s2 = sigma_m * sigma_m
    value = (radius_m * radius_m) / (2.0 * s2) * math.exp(-(miss_m * miss_m) / (2.0 * s2))
    return max(0.0, min(1.0, value))


def sigma_at(t_min, sigma0_m, sigma_min_m, horizon_min=HORIZON_MIN):
    """Uncertainty shrinks linearly as closest approach nears (t_min <= 0)."""
    frac = max(0.0, min(1.0, -t_min / horizon_min))
    return sigma_min_m + (sigma0_m - sigma_min_m) * frac


def separation_gain_m(dv_ms, lead_min):
    """Extra miss distance at closest approach from an along-track burn lead_min before it."""
    return ALONG_TRACK_GAIN * dv_ms * lead_min * 60.0 * ENCOUNTER_PROJECTION


def miss_after(miss0_m, burns):
    """burns: iterable of (dv_ms, lead_min). Shifts add in quadrature with the original miss."""
    shift = sum(separation_gain_m(dv, lead) for dv, lead in burns)
    return math.hypot(miss0_m, shift)
