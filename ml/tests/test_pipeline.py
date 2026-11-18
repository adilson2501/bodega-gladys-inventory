import sys
from datetime import date, timedelta
from pathlib import Path
import csv
import json
import math
import tempfile

sys.path.insert(0, str(Path(__file__).parents[1]))
from prepare_dataset import prepare, prepare_apf3
from train import feature_row, wape, fit_product


def test_prepare_ignores_invalid_and_keeps_observed_zero_window():
    rows = [{"date": "2026-08-01T10:00:00Z", "product_id": "p", "quantity": "2", "actor_email": "private"}, {"date": "2026-08-03", "product_id": "p", "quantity": "1"}, {"date": "bad", "product_id": "p", "quantity": "9"}]
    result = prepare(rows)
    assert result == [{"date": "2026-08-01", "product_id": "p", "quantity": 2, "source": "REAL"}, {"date": "2026-08-02", "product_id": "p", "quantity": 0, "source": "REAL"}, {"date": "2026-08-03", "product_id": "p", "quantity": 1, "source": "REAL"}]
    assert all("actor_email" not in row for row in result)


def test_lag_features_only_use_previous_values():
    assert feature_row([1, 2, 3, 4, 5, 6, 7, 99], 7) == [7, 6, 1, 4, 0]


def test_evaluation_is_deterministic_and_wape_handles_zero():
    rows = [{"date": (date(2026, 8, 1) + timedelta(days=i)).isoformat(), "quantity": i % 4 + 1} for i in range(40)]
    assert wape([0, 0], [1, 2]) is None
    assert fit_product(rows) == fit_product(rows)


def _read(path):
    with open(path, newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def test_apf3_target_is_t_plus_one_through_t_plus_seven_and_preserves_zero():
    with tempfile.TemporaryDirectory() as directory:
        result = prepare_apf3("ml/data/simulation-v1", directory)
        raw = _read(Path(directory) / "prepared_product_day.csv")
        features = _read(Path(directory) / "feature_target_dataset.csv")
        product = raw[0]["product_id"]
        by_date = {row["date"]: row for row in raw if row["product_id"] == product}
        target = next(row for row in features if row["product_id"] == product and row["date"] == "2026-08-15")
        expected = sum(int(by_date[(date(2026, 8, 15) + timedelta(days=offset)).isoformat()]["completed_units"]) for offset in range(1, 8))
        assert int(target["target_next_7d"]) == expected
        assert any(row["completed_units"] == "0" and row["observation_status"] == "OBSERVED_ZERO" for row in raw)
        assert result["usable_ml_samples"] == 3300


def test_apf3_features_do_not_use_future_dates_and_partition_is_chronological():
    with tempfile.TemporaryDirectory() as directory:
        prepare_apf3("ml/data/simulation-v1", directory)
        rows = _read(Path(directory) / "ml_samples.csv")
        raw = _read(Path(directory) / "prepared_product_day.csv")
        by_key = {(row["product_id"], row["date"]): row for row in raw}
        for row in rows:
            cutoff = date.fromisoformat(row["date"])
            history = [by_key[(row["product_id"], (cutoff - timedelta(days=offset)).isoformat())]["completed_units"] for offset in range(1, 8)]
            history_14 = [int(by_key[(row["product_id"], (cutoff - timedelta(days=offset)).isoformat())]["completed_units"]) for offset in range(1, 15)]
            assert float(row["lag_1"]) == int(history[0])
            assert float(row["lag_7"]) == int(history[-1])
            assert math.isclose(float(row["rolling_mean_14"]), sum(history_14) / 14, rel_tol=0, abs_tol=1e-8)
        split = json.loads((Path(directory) / "temporal_split.json").read_text(encoding="utf-8"))
        assert split["train"]["end"] < split["validation"]["start"] < split["test"]["start"]
        assert split["target_windows_do_not_overlap"] is True
        windows = {}
        for row in rows:
            cutoff = date.fromisoformat(row["date"])
            windows.setdefault(row["split"], set()).update(cutoff + timedelta(days=offset) for offset in range(1, 8))
        assert windows["train"].isdisjoint(windows["validation"])
        assert windows["validation"].isdisjoint(windows["test"])


def test_apf3_output_is_deterministic_and_synthetic():
    with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
        prepare_apf3("ml/data/simulation-v1", first)
        prepare_apf3("ml/data/simulation-v1", second)
        first_files = sorted(path.name for path in Path(first).iterdir())
        second_files = sorted(path.name for path in Path(second).iterdir())
        assert first_files == second_files
        for name in first_files:
            assert (Path(first) / name).read_bytes() == (Path(second) / name).read_bytes()
        quality = json.loads((Path(first) / "quality_report.json").read_text(encoding="utf-8"))
        assert quality["valid"] is True
        assert quality["missing_product_days"] == 0
        assert quality["stockout_censored_observations_retained_as_flags"] is True
