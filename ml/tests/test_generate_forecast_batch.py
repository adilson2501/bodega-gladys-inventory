import json
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1]))

import pytest

from generate_forecast_batch import MODEL_VERSION, _row_status, build_batch
from infer_apf3 import load_project_model, predict_loaded
from prepare_history import prepare_history


SOURCE = "ml/data/simulation-v1"
ARTIFACTS = Path("ml/artifacts/apf3")


def test_batch_is_contract_shaped_and_uses_all_eligible_products():
    batch, eligibility, validation, generation = build_batch(SOURCE, ARTIFACTS, date(2026, 10, 31))
    assert batch["schema_version"] == "2.0"
    assert batch["model_version"] == MODEL_VERSION
    assert batch["source"] == "SYNTHETIC"
    assert batch["cutoff_date"] == "2026-10-31"
    assert batch["forecast_start"] == "2026-11-01"
    assert batch["forecast_end"] == "2026-11-07"
    assert len(batch["rows"]) == 60
    assert len(eligibility) == 60
    assert all(row["status"] == "READY" and row["forecast_units"] >= 0 for row in batch["rows"])
    assert validation["feature_schema_match"] is True
    assert generation["future_sales_used"] is False


def test_batch_is_deterministic():
    first = build_batch(SOURCE, ARTIFACTS, date(2026, 10, 31))
    second = build_batch(SOURCE, ARTIFACTS, date(2026, 10, 31))
    assert first == second


def test_batch_rejects_unvalidated_cutoff():
    with pytest.raises(ValueError, match="fixed"):
        build_batch(SOURCE, ARTIFACTS, date(2026, 10, 30))


def test_model_hash_mismatch_is_rejected(tmp_path):
    metadata = json.loads((ARTIFACTS / "model_metadata.json").read_text(encoding="utf-8"))
    metadata["joblib_sha256"] = "0" * 64
    metadata_path = tmp_path / "model_metadata.json"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError, match="hash"):
        load_project_model(ARTIFACTS / "model.joblib", metadata_path)


def test_invalid_model_predictions_are_rejected_and_negative_values_are_clamped():
    row = prepare_history(SOURCE, date(2026, 10, 31), "6ce5d35d-c954-5f70-8e79-d1046a3b3475")["rows"][0]
    metadata = json.loads((ARTIFACTS / "model_metadata.json").read_text(encoding="utf-8"))

    class FakeModel:
        def __init__(self, value):
            self.value = value

        def predict(self, _features):
            return [self.value]

    with pytest.raises(ValueError, match="not finite"):
        predict_loaded(row, FakeModel(float("nan")), metadata)
    assert predict_loaded(row, FakeModel(-3.0), metadata)["forecast_next_7d_units"] == 0


def test_ineligible_statuses_map_without_fabricated_forecasts():
    assert _row_status("SUFFICIENT_HISTORY") == ("READY", None)
    assert _row_status("INSUFFICIENT_HISTORY") == ("INSUFFICIENT_HISTORY", "INSUFFICIENT_HISTORY")
    assert _row_status("MISSING_OBSERVATIONS") == ("ERROR", "MISSING_OBSERVATIONS")
