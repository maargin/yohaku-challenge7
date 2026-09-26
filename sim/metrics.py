"""Evaluation metrics."""


def gini(values):
    """Gini coefficient of non-negative burdens: 0 = perfectly equal, 1 = one agent carries everything."""
    xs = sorted(float(v) for v in values)
    if any(x < 0 for x in xs):
        raise ValueError("burdens must be non-negative")
    n, total = len(xs), sum(xs)
    if n == 0 or total == 0:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return max(0.0, min(1.0, (2.0 * cum) / (n * total) - (n + 1.0) / n))
