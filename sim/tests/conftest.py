"""Reproducible Hypothesis profile; the seed is set in pytest.ini and printed on every run (PBT-08)."""
import os

from hypothesis import HealthCheck, settings

settings.register_profile(
    "ci",
    max_examples=int(os.environ.get("PBT_EXAMPLES", "200")),
    deadline=None,
    print_blob=True,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile("ci")


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    seed = config.getoption("hypothesis_seed", default=None)
    terminalreporter.write_line(f"hypothesis seed: {seed} (replay with --hypothesis-seed={seed})")
