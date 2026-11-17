import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from prepare_dataset import prepare
from train import feature_row, wape, fit_product


def test_prepare_ignores_invalid_and_keeps_observed_zero_window():
    rows = [{"date": "2025-01-01T10:00:00Z", "product_id": "p", "quantity": "2", "actor_email": "private"}, {"date": "2025-01-03", "product_id": "p", "quantity": "1"}, {"date": "bad", "product_id": "p", "quantity": "9"}]
    result = prepare(rows)
    assert result == [{"date": "2025-01-01", "product_id": "p", "quantity": 2, "source": "REAL"}, {"date": "2025-01-02", "product_id": "p", "quantity": 0, "source": "REAL"}, {"date": "2025-01-03", "product_id": "p", "quantity": 1, "source": "REAL"}]
    assert all("actor_email" not in row for row in result)


def test_lag_features_only_use_previous_values():
    assert feature_row([1, 2, 3, 4, 5, 6, 7, 99], 7) == [7, 6, 1, 4, 0]


def test_evaluation_is_deterministic_and_wape_handles_zero():
    rows = [{"date": (date(2025, 1, 1) + timedelta(days=i)).isoformat(), "quantity": i % 4 + 1} for i in range(40)]
    assert wape([0, 0], [1, 2]) is None
    assert fit_product(rows) == fit_product(rows)
