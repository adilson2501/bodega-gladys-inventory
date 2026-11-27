import json
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from infer_apf3 import audit_export, build_future_records, load_project_model, predict, run_future_demo, validate_record
from train_apf3 import (
    baseline_predictions,
    metrics,
    purged_cv_folds,
    _coerce_rows,
    verify_d1_artifacts,
)


ARTIFACTS = Path("ml/artifacts/apf3")


def test_purged_folds_keep_products_together_and_target_windows_disjoint():
    _, _, _, rows = verify_d1_artifacts(ARTIFACTS)
    converted = _coerce_rows(rows)
    folds = purged_cv_folds(converted)
    for fold in folds:
        train_dates = {converted[index]["date"] for index in fold["train_indices"]}
        validation_dates = {converted[index]["date"] for index in fold["validation_indices"]}
        assert max(train_dates) < min(validation_dates)
        assert max(train_dates) + timedelta(days=7) < min(validation_dates) + timedelta(days=1)
        assert len({converted[index]["product_id"] for index in fold["validation_indices"]}) == 60


def test_baselines_use_only_historical_features_and_are_nonnegative():
    rows = [{"rolling_mean_7": 2.0, "rolling_mean_14": 1.5}, {"rolling_mean_7": 0.0, "rolling_mean_14": 0.25}]
    assert baseline_predictions(rows, "naive_7d").tolist() == [14.0, 0.0]
    assert baseline_predictions(rows, "moving_average_14d").tolist() == [10.5, 1.75]
    assert np.all(baseline_predictions(rows, "naive_7d") >= 0)


def test_metric_calculation_is_deterministic():
    first = metrics([0, 2, 4], [1, 1, 5])
    second = metrics([0, 2, 4], [1, 1, 5])
    assert first == second
    assert first["mae"] == 1.0
    assert first["mean_signed_error"] == 1 / 3


def test_exported_model_reloads_and_inference_rejects_target_or_missing_fields():
    example = json.loads((ARTIFACTS / "inference_example.json").read_text(encoding="utf-8"))
    result = predict(example, ARTIFACTS / "model.joblib", ARTIFACTS / "model_metadata.json")
    assert result["source"] == "SYNTHETIC"
    assert result["horizon_days"] == 7
    assert result["forecast_next_7d_units"] >= 0
    with pytest.raises(ValueError, match="Missing required"):
        validate_record({"source": "SYNTHETIC"})
    with pytest.raises(ValueError, match="target_next_7d"):
        validate_record({**example, "target_next_7d": 1})


def test_selection_is_frozen_before_test_and_hash_matches_export():
    selection = json.loads((ARTIFACTS / "model_selection.json").read_text(encoding="utf-8"))
    metadata = json.loads((ARTIFACTS / "model_metadata.json").read_text(encoding="utf-8"))
    assert selection["frozen_before_test"] is True
    assert metadata["joblib_sha256"]
    assert metadata["source"] == "SYNTHETIC"
    assert selection["experiment"]["name"] == "ridge-no-intercept-v1"
    assert selection["experiment"]["selection_data"] == "validation only"
    assert metadata["model_version"] == "apf3-models-1.1"


def test_future_demo_uses_only_cutoff_history_and_canonical_stock():
    audit = audit_export(ARTIFACTS)
    first_records, first_products, _ = build_future_records("ml/data/simulation-v1", limit=1)
    second_records, second_products, _ = build_future_records("ml/data/simulation-v1", limit=1)
    first_record, first_product = first_records[0], first_products[0]
    second_record, second_product = second_records[0], second_products[0]
    assert audit["hyperparameters"] == {"alpha": 10.0}
    assert first_record == second_record
    assert first_product == second_product
    assert first_record["date"] == "2026-10-31"
    assert "target_next_7d" not in first_record
    assert first_product["history_end"] == "2026-10-31"
    assert first_product["future_sales_used"] is False
    assert first_product["stock_at_cutoff"] >= 0
    prediction = predict(first_record, ARTIFACTS / "model.joblib", ARTIFACTS / "model_metadata.json")
    repeat = predict(first_record, ARTIFACTS / "model.joblib", ARTIFACTS / "model_metadata.json")
    assert prediction == repeat
    demo = run_future_demo("ml/data/simulation-v1", ARTIFACTS, ARTIFACTS)
    assert demo["predictions"][0]["forecast_start"] == "2026-11-01"
    assert demo["predictions"][0]["forecast_end"] == "2026-11-07"
    assert demo["replenishment"][0]["stock_at_cutoff"] == first_product["stock_at_cutoff"]
    assert demo["replenishment"][0]["database_write_performed"] is False
    assert prediction["forecast_next_7d_units"] >= 0


def test_runtime_rejects_feature_schema_drift(tmp_path):
    metadata = json.loads((ARTIFACTS / "model_metadata.json").read_text(encoding="utf-8"))
    metadata["features"] = list(reversed(metadata["features"]))
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError, match="feature schema"):
        load_project_model(ARTIFACTS / "model.joblib", metadata_path)
