"""Train, evaluate, and export the Phase D.2 APF3 forecasting models.

This module consumes only the frozen Phase D.1 artifacts. It never regenerates
the commercial simulation and never connects to a database.
"""
import argparse
import csv
import hashlib
import json
import platform
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
try:
    from .apf3_contract import CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES
except ImportError:
    from apf3_contract import CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES

SEED = 42
HORIZON = 7
MODEL_VERSION = "apf3-models-1.1"
TRAIN_START, TRAIN_END = date(2026, 8, 15), date(2026, 9, 20)
VALIDATION_START, VALIDATION_END = date(2026, 10, 1), date(2026, 10, 9)
TEST_START, TEST_END = date(2026, 10, 16), date(2026, 10, 24)
REQUIRED_ROW_FIELDS = {"date", "product_id", "target_next_7d", "source", "split", *FEATURES}
EXPERIMENT_VERSION = "ridge-no-intercept-v1"


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def _write_csv(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def _read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _as_date(value):
    return date.fromisoformat(str(value)[:10])


def verify_d1_artifacts(artifact_dir="ml/artifacts/apf3"):
    root = Path(artifact_dir)
    required = ["ml_samples.csv", "feature_target_dataset.csv", "temporal_split.json", "preprocessing_plan.json", "data_dictionary.json", "quality_report.json", "dataset_metadata.json"]
    missing = [name for name in required if not (root / name).exists()]
    if missing:
        raise ValueError(f"Missing D.1 artifacts: {', '.join(missing)}")
    metadata = _read_json(root / "dataset_metadata.json")
    if metadata.get("source") != "SYNTHETIC":
        raise ValueError("D.2 accepts only SYNTHETIC data")
    if metadata.get("target") != "completed sales units over t+1 through t+7":
        raise ValueError("Unexpected target contract")
    for name, expected_hash in metadata.get("outputs", {}).items():
        path = root / name
        if not path.exists() or _sha256(path) != expected_hash:
            raise ValueError(f"D.1 hash mismatch: {name}")
    quality = _read_json(root / "quality_report.json")
    if not quality.get("valid") or quality.get("usable_ml_samples") != 3300:
        raise ValueError("D.1 quality report is not approved")
    split = _read_json(root / "temporal_split.json")
    expected = {
        "train": ("2026-08-15", "2026-09-20", 2220),
        "validation": ("2026-10-01", "2026-10-09", 540),
        "test": ("2026-10-16", "2026-10-24", 540),
    }
    for name, (start, end, count) in expected.items():
        actual = split[name]
        if (actual["start"], actual["end"], actual["samples"]) != (start, end, count):
            raise ValueError(f"D.1 split mismatch for {name}")
    rows = _read_csv(root / "ml_samples.csv")
    if len(rows) != 3300 or any(row.get("source") != "SYNTHETIC" for row in rows):
        raise ValueError("Unexpected D.1 sample count or provenance")
    if any(set(row) < REQUIRED_ROW_FIELDS for row in rows):
        raise ValueError("D.1 sample schema is incomplete")
    for row in rows:
        if row["split"] not in expected or not (row["date"] >= expected[row["split"]][0] and row["date"] <= expected[row["split"]][1]):
            raise ValueError("D.1 sample membership is outside the frozen split")
    return root, metadata, split, rows


def _coerce_rows(rows):
    result = []
    for row in rows:
        converted = dict(row)
        converted["date"] = _as_date(row["date"])
        converted["target_next_7d"] = float(row["target_next_7d"])
        for name in NUMERIC_FEATURES:
            converted[name] = float(row[name])
        result.append(converted)
    return sorted(result, key=lambda row: (row["date"], row["product_id"]))


def rows_for_split(rows, split):
    return [row for row in rows if row["split"] == split]


def _matrix(rows):
    return pd.DataFrame([{name: row[name] for name in FEATURES} for row in rows], columns=FEATURES)


def _target(rows):
    return np.asarray([row["target_next_7d"] for row in rows], dtype=float)


def _pipeline(model, scale_numeric):
    numeric_steps = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", Pipeline(numeric_steps), NUMERIC_FEATURES),
            ("categorical", Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]), CATEGORICAL_FEATURES),
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )
    return Pipeline([("preprocess", preprocessor), ("model", model)])


def make_model(model_name, params=None):
    params = params or {}
    if model_name == "ridge":
        return _pipeline(Ridge(random_state=SEED, **params), scale_numeric=True)
    if model_name == "ridge_no_intercept":
        return _pipeline(Ridge(random_state=SEED, fit_intercept=False, **params), scale_numeric=True)
    if model_name == "random_forest":
        return _pipeline(RandomForestRegressor(random_state=SEED, n_jobs=1, **params), scale_numeric=False)
    raise ValueError(f"Unknown model: {model_name}")


def baseline_predictions(rows, kind):
    """Return a nonnegative seven-day forecast from history strictly before t."""
    if kind not in {"naive_7d", "moving_average_14d"}:
        raise ValueError(f"Unknown baseline: {kind}")
    result = []
    for row in rows:
        if kind == "naive_7d":
            value = 7 * row["rolling_mean_7"]
        else:
            value = 7 * row["rolling_mean_14"]
        result.append(max(0.0, float(value)))
    return np.asarray(result)


def metrics(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.maximum(0.0, np.asarray(predicted, dtype=float))
    denominator = float(np.abs(actual).sum())
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
        "r2": float(r2_score(actual, predicted)) if len(actual) > 1 and np.unique(actual).size > 1 else None,
        "wape": float(np.abs(actual - predicted).sum() / denominator) if denominator else None,
        "mean_signed_error": float(np.mean(predicted - actual)),
        "count": int(len(actual)),
    }


def purged_cv_folds(rows):
    """Two expanding folds; train labels end at least seven days before validation cutoff."""
    dates = sorted({row["date"] for row in rows})
    specifications = [(date(2026, 9, 6), date(2026, 9, 12)), (date(2026, 9, 13), date(2026, 9, 19))]
    folds = []
    for validation_start, validation_end in specifications:
        train_end = validation_start - timedelta(days=8)
        train = [index for index, row in enumerate(rows) if row["date"] <= train_end]
        validation = [index for index, row in enumerate(rows) if validation_start <= row["date"] <= validation_end]
        if not train or not validation or max(rows[index]["date"] for index in train) >= validation_start - timedelta(days=7):
            raise ValueError("Purged CV fold violates target availability")
        train_target_end = max(rows[index]["date"] for index in train) + timedelta(days=HORIZON)
        validation_target_start = min(rows[index]["date"] for index in validation) + timedelta(days=1)
        if train_target_end >= validation_target_start:
            raise ValueError("Purged CV target windows overlap")
        folds.append({"train_indices": train, "validation_indices": validation, "train_end": train_end.isoformat(), "validation_start": validation_start.isoformat(), "validation_end": validation_end.isoformat()})
    if dates != sorted(dates):
        raise ValueError("CV dates are not chronological")
    return folds


def tune_model(model_name, rows, grid):
    folds = purged_cv_folds(rows)
    results = []
    for params in grid:
        fold_scores = []
        for fold in folds:
            train = [rows[index] for index in fold["train_indices"]]
            validation = [rows[index] for index in fold["validation_indices"]]
            model = make_model(model_name, params)
            model.fit(_matrix(train), _target(train))
            fold_scores.append(metrics(_target(validation), model.predict(_matrix(validation))))
        results.append({"params": params, "fold_mae": [score["mae"] for score in fold_scores], "mean_cv_mae": float(np.mean([score["mae"] for score in fold_scores])), "mean_cv_rmse": float(np.mean([score["rmse"] for score in fold_scores]))})
    return min(results, key=lambda result: (result["mean_cv_mae"], json.dumps(result["params"], sort_keys=True))), results, folds


def _model_grids():
    return {
        "ridge": [{"alpha": alpha} for alpha in (0.1, 1.0, 10.0, 100.0)],
        "random_forest": [
            {"n_estimators": estimators, "max_depth": depth, "min_samples_leaf": leaf, "max_features": max_features}
            for estimators in (100, 200)
            for depth in (None, 8)
            for leaf in (1, 3)
            for max_features in (0.7,)
        ],
    }


def _fit_and_score(model_name, params, train, validation):
    model = make_model(model_name, params)
    model.fit(_matrix(train), _target(train))
    return model, {
        "train": metrics(_target(train), model.predict(_matrix(train))),
        "validation": metrics(_target(validation), model.predict(_matrix(validation))),
    }


def _plot_results(output, predictions, selected_name, feature_importance):
    test = predictions[selected_name]["test"]
    actual = np.asarray(test["actual"])
    predicted = np.asarray(test["predicted"])
    figure, axis = plt.subplots(figsize=(6, 5))
    axis.scatter(actual, predicted, s=12, alpha=0.45)
    axis.plot([actual.min(), actual.max()], [actual.min(), actual.max()], color="black", linestyle="--")
    axis.set(title=f"{selected_name}: predicted vs actual", xlabel="Actual seven-day units", ylabel="Predicted seven-day units")
    figure.tight_layout(); figure.savefig(output / "predicted_vs_actual.png", dpi=140); plt.close(figure)

    figure, axis = plt.subplots(figsize=(7, 4.5))
    axis.hist(np.asarray(test["predicted"]) - actual, bins=20, color="#756bb1", edgecolor="white")
    axis.set(title=f"{selected_name}: test residuals", xlabel="Prediction minus actual", ylabel="Observations")
    figure.tight_layout(); figure.savefig(output / "residual_distribution.png", dpi=140); plt.close(figure)

    names = list(predictions)
    figure, axis = plt.subplots(figsize=(8, 4.5))
    axis.bar(names, [predictions[name]["validation_metrics"]["mae"] for name in names], color="#2ca25f")
    axis.set(title="Validation MAE comparison", ylabel="MAE in units")
    figure.tight_layout(); figure.savefig(output / "model_comparison.png", dpi=140); plt.close(figure)

    figure, axis = plt.subplots(figsize=(8, 5))
    top = feature_importance[:20]
    axis.barh([item["feature"] for item in reversed(top)], [item["importance"] for item in reversed(top)], color="#de2d26")
    axis.set(title=f"{selected_name}: transformed feature importance", xlabel="Importance")
    figure.tight_layout(); figure.savefig(output / "feature_importance.png", dpi=140); plt.close(figure)
    return ["predicted_vs_actual.png", "residual_distribution.png", "model_comparison.png", "feature_importance.png"]


def _feature_importance(model):
    estimator = model.named_steps["model"]
    names = model.named_steps["preprocess"].get_feature_names_out()
    if hasattr(estimator, "coef_"):
        values = np.abs(estimator.coef_)
    else:
        values = estimator.feature_importances_
    order = np.argsort(values)[::-1]
    return [{"feature": str(names[index]), "importance": float(values[index])} for index in order[:20]]


def train_apf3(artifact_dir="ml/artifacts/apf3", output_dir="ml/artifacts/apf3"):
    root, d1_metadata, split_metadata, raw_rows = verify_d1_artifacts(artifact_dir)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = _coerce_rows(raw_rows)
    train = rows_for_split(rows, "train")
    validation = rows_for_split(rows, "validation")
    test = rows_for_split(rows, "test")
    grids = _model_grids()
    tuning = {}
    selected_params = {}
    for name in ("ridge", "random_forest"):
        best, all_results, folds = tune_model(name, train, grids[name])
        tuning[name] = {"search_space": grids[name], "best": best, "all_results": all_results, "folds": folds}
        selected_params[name] = best["params"]
    fitted = {}
    prediction_records = {}
    for name in ("ridge", "random_forest"):
        model, scores = _fit_and_score(name, selected_params[name], train, validation)
        fitted[name] = model
        prediction_records[name] = {"validation_metrics": scores["validation"], "train_metrics": scores["train"], "validation": {"actual": _target(validation).tolist(), "predicted": np.maximum(0, model.predict(_matrix(validation))).tolist()}}
    experiment_params = selected_params["ridge"]
    experiment_model, experiment_scores = _fit_and_score("ridge_no_intercept", experiment_params, train, validation)
    fitted["ridge_no_intercept"] = experiment_model
    prediction_records["ridge_no_intercept"] = {
        "validation_metrics": experiment_scores["validation"],
        "train_metrics": experiment_scores["train"],
        "validation": {
            "actual": _target(validation).tolist(),
            "predicted": np.maximum(0, experiment_model.predict(_matrix(validation))).tolist(),
        },
        "experiment": {
            "name": EXPERIMENT_VERSION,
            "base_model": "ridge",
            "parameters": experiment_params,
            "change": "fit_intercept=False",
            "selection_data": "validation only",
        },
    }
    for name in ("naive_7d", "moving_average_14d"):
        validation_pred = baseline_predictions(validation, name)
        train_pred = baseline_predictions(train, name)
        prediction_records[name] = {"validation_metrics": metrics(_target(validation), validation_pred), "train_metrics": metrics(_target(train), train_pred), "validation": {"actual": _target(validation).tolist(), "predicted": validation_pred.tolist()}}
    ml_selection = min((name for name in ("ridge", "random_forest", "ridge_no_intercept")), key=lambda name: (prediction_records[name]["validation_metrics"]["mae"], name))
    strongest_baseline = min(("naive_7d", "moving_average_14d"), key=lambda name: prediction_records[name]["validation_metrics"]["mae"])
    selection = {"selected_model": ml_selection, "selected_hyperparameters": experiment_params if ml_selection == "ridge_no_intercept" else selected_params[ml_selection], "selection_criterion": "validation MAE among Ridge, Random Forest, and one pre-registered Ridge experiment", "selected_validation_mae": prediction_records[ml_selection]["validation_metrics"]["mae"], "strongest_baseline": strongest_baseline, "strongest_baseline_validation_mae": prediction_records[strongest_baseline]["validation_metrics"]["mae"], "selected_ml_beats_strongest_baseline": prediction_records[ml_selection]["validation_metrics"]["mae"] < prediction_records[strongest_baseline]["validation_metrics"]["mae"], "experiment": prediction_records["ridge_no_intercept"]["experiment"], "frozen_before_test": True}
    _write_json(Path(output_dir) / "model_selection.json", selection)
    _write_json(Path(output_dir) / "tuning_results.json", tuning)

    # Freeze selection before touching test, then fit the exported model on
    # train plus validation so its test score describes the shipped artifact.
    combined = train + validation
    export_model = make_model(ml_selection, selection["selected_hyperparameters"])
    export_model.fit(_matrix(combined), _target(combined))
    model_path = output / "model.joblib"
    joblib.dump(export_model, model_path)

    # Test predictions are intentionally computed only after validation-only
    # model selection has been persisted. The selected score uses export_model.
    for name in ("ridge", "random_forest", "ridge_no_intercept"):
        test_pred = np.maximum(0, fitted[name].predict(_matrix(test)))
        prediction_records[name]["test_metrics"] = metrics(_target(test), test_pred)
        prediction_records[name]["test"] = {"actual": _target(test).tolist(), "predicted": test_pred.tolist()}
    selected_test_pred = np.maximum(0, export_model.predict(_matrix(test)))
    prediction_records[ml_selection]["test_metrics"] = metrics(_target(test), selected_test_pred)
    prediction_records[ml_selection]["test"] = {"actual": _target(test).tolist(), "predicted": selected_test_pred.tolist()}
    for name in ("naive_7d", "moving_average_14d"):
        test_pred = baseline_predictions(test, name)
        prediction_records[name]["test_metrics"] = metrics(_target(test), test_pred)
        prediction_records[name]["test"] = {"actual": _target(test).tolist(), "predicted": test_pred.tolist()}

    selected_train_model = fitted[ml_selection]
    importance = _feature_importance(selected_train_model)
    charts = _plot_results(Path(output_dir), prediction_records, ml_selection, importance)
    errors = []
    selected_test = prediction_records[ml_selection]["test"]
    for index in np.argsort(np.abs(np.asarray(selected_test["actual"]) - np.asarray(selected_test["predicted"])))[::-1][:3]:
        row = test[int(index)]
        actual = float(selected_test["actual"][index]); predicted = float(selected_test["predicted"][index])
        errors.append({"product_id": row["product_id"], "cutoff_date": row["date"].isoformat(), "actual": actual, "predicted": predicted, "absolute_error": abs(actual - predicted), "plausible_explanation": "A short synthetic history and intermittent demand can make a seven-day aggregate change abruptly; this is descriptive, not causal evidence."})

    dataset_hash = hashlib.sha256(json.dumps({"input_sha256": d1_metadata["input_sha256"], "outputs": d1_metadata["outputs"]}, sort_keys=True).encode()).hexdigest()
    model_metadata = {"model_version": MODEL_VERSION, "model_family": ml_selection, "dataset_hash": dataset_hash, "dataset_version": d1_metadata["dataset_version"], "source": "SYNTHETIC", "training_period": {"start": TRAIN_START.isoformat(), "end": VALIDATION_END.isoformat(), "fit_rows": len(combined), "note": "Export refit uses frozen train plus validation after test evaluation."}, "validation_period": {"start": VALIDATION_START.isoformat(), "end": VALIDATION_END.isoformat()}, "test_period": {"start": TEST_START.isoformat(), "end": TEST_END.isoformat()}, "random_seed": SEED, "features": FEATURES, "numeric_features": NUMERIC_FEATURES, "categorical_features": CATEGORICAL_FEATURES, "hyperparameters": selection["selected_hyperparameters"], "forecast_horizon_days": HORIZON, "dependency_versions": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__}, "selection": selection, "metrics": {name: {key: value for key, value in result.items() if key.endswith("metrics")} for name, result in prediction_records.items()}, "feature_importance": importance, "charts": charts, "joblib_sha256": _sha256(model_path)}
    _write_json(output / "model_metadata.json", model_metadata)
    example_row = combined[0]
    _write_json(output / "inference_example.json", {"date": example_row["date"].isoformat(), "source": "SYNTHETIC", **{name: example_row[name] for name in FEATURES}})
    _write_json(output / "evaluation_metrics.json", {"source": "SYNTHETIC", "models": {name: {"train": value["train_metrics"], "validation": value["validation_metrics"], "test": value["test_metrics"]} for name, value in prediction_records.items()}, "selected_model": ml_selection, "selection": selection})
    _write_json(output / "error_analysis.json", {"selected_model": ml_selection, "top_test_errors": errors, "overfitting": {name: {"train_mae": value["train_metrics"]["mae"], "validation_mae": value["validation_metrics"]["mae"], "test_mae": value["test_metrics"]["mae"]} for name, value in prediction_records.items()}})
    columns = ["split", "product_id", "date", "actual", "predicted"]
    prediction_rows = []
    for name, value in prediction_records.items():
        for split_name, split_rows in (("validation", validation), ("test", test)):
            for row, actual, predicted in zip(split_rows, value[split_name]["actual"], value[split_name]["predicted"]):
                prediction_rows.append({"split": split_name, "product_id": row["product_id"], "date": row["date"].isoformat(), "actual": actual, "predicted": predicted, "model": name})
    _write_csv(output / "predictions.csv", prediction_rows, columns + ["model"])
    return {"selected_model": ml_selection, "selection": selection, "metrics": prediction_records, "model_path": str(model_path), "charts": charts, "errors": errors}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", default="ml/artifacts/apf3")
    parser.add_argument("--output-dir", default="ml/artifacts/apf3")
    args = parser.parse_args()
    print(json.dumps(train_apf3(args.artifact_dir, args.output_dir), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
