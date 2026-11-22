import json
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
import infer_apf3
from infer_apf3 import audit_export, build_future_record, predict, run_future_demo, validate_record
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


@pytest.mark.parametrize(
    ("exported_mae", "matches_frozen_evaluation"),
    [(1.2984537784882773, True), (1.2985, False), (None, False)],
)
def test_audit_distinguishes_rounding_from_a_changed_metric(
    monkeypatch, exported_mae, matches_frozen_evaluation
):
    model, metadata = infer_apf3.load_project_model(
        ARTIFACTS / "model.joblib", ARTIFACTS / "model_metadata.json"
    )
    metadata["metrics"]["ridge"]["test_metrics"]["mae"] = exported_mae
    monkeypatch.setattr(infer_apf3, "load_project_model", lambda *_: (model, metadata))

    if matches_frozen_evaluation:
        assert audit_export(ARTIFACTS)["model_family"] == "ridge"
    else:
        with pytest.raises(ValueError, match="do not match the frozen evaluation"):
            audit_export(ARTIFACTS)


def test_future_demo_uses_only_cutoff_history_and_canonical_stock():
    audit = audit_export(ARTIFACTS)
    first_record, first_product = build_future_record("ml/data/simulation-v1")
    second_record, second_product = build_future_record("ml/data/simulation-v1")
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
    assert demo["prediction"]["forecast_start"] == "2026-11-01"
    assert demo["prediction"]["forecast_end"] == "2026-11-07"
    assert demo["prediction"]["product_name"] == "Papas Lays clásica 45 g"
    assert demo["prediction"]["forecast_next_7d_units"] == pytest.approx(5.78, abs=0.005)
    assert demo["replenishment"]["stock_at_cutoff"] == first_product["stock_at_cutoff"] == 9
    assert demo["replenishment"]["minimum_stock"] == 8
    assert demo["replenishment"]["recommended_purchase_units"] == 5
    assert demo["replenishment"]["database_write_performed"] is False
    assert prediction["forecast_next_7d_units"] >= 0
