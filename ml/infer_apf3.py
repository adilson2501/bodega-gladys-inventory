"""Offline inference for the project-generated APF3 model artifact."""
import argparse
import hashlib
import json
import math
import csv
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

try:
    from .prepare_dataset import SIMULATION_END, SIMULATION_START, _date_range, _feature_values, _historical_stock
    from .train_apf3 import FEATURES, NUMERIC_FEATURES, verify_d1_artifacts
except ImportError:
    from prepare_dataset import SIMULATION_END, SIMULATION_START, _date_range, _feature_values, _historical_stock
    from train_apf3 import FEATURES, NUMERIC_FEATURES, verify_d1_artifacts


def _read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def validate_record(record):
    if not isinstance(record, dict):
        raise ValueError("Input must be one JSON object")
    missing = [name for name in FEATURES + ["date", "source"] if name not in record]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")
    if record["source"] != "SYNTHETIC":
        raise ValueError("Only SYNTHETIC inference records are accepted")
    try:
        date.fromisoformat(str(record["date"]))
    except ValueError as error:
        raise ValueError("date must be ISO YYYY-MM-DD") from error
    for name in NUMERIC_FEATURES:
        if isinstance(record[name], bool) or not isinstance(record[name], (int, float)) or not np.isfinite(record[name]):
            raise ValueError(f"Numeric feature is invalid: {name}")
    for name in ["product_id", "category", "unit_of_measure", "historical_demand_class"]:
        if not isinstance(record[name], str) or not record[name].strip():
            raise ValueError(f"Categorical feature is invalid: {name}")
    if "target_next_7d" in record:
        raise ValueError("target_next_7d is not an accepted inference input")
    return record


def load_project_model(model_path="ml/artifacts/apf3/model.joblib", metadata_path="ml/artifacts/apf3/model_metadata.json"):
    model_path = Path(model_path)
    metadata = _read_json(metadata_path)
    expected_hash = metadata.get("joblib_sha256")
    actual_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()
    if not expected_hash or actual_hash != expected_hash:
        raise ValueError("Model artifact hash does not match generated metadata")
    return joblib.load(model_path), metadata


def predict_loaded(record, model, metadata):
    record = validate_record(record)
    features = pd.DataFrame([{name: record[name] for name in FEATURES}], columns=FEATURES)
    raw_forecast = float(model.predict(features)[0])
    if not np.isfinite(raw_forecast):
        raise ValueError("Model prediction is not finite")
    forecast = max(0.0, raw_forecast)
    return {
        "product_id": record["product_id"],
        "cutoff_date": record["date"],
        "forecast_next_7d_units": forecast,
        "model": metadata["model_family"],
        "model_version": metadata["model_version"],
        "horizon_days": metadata["forecast_horizon_days"],
        "source": metadata["source"],
    }


def predict(record, model_path="ml/artifacts/apf3/model.joblib", metadata_path="ml/artifacts/apf3/model_metadata.json"):
    model, metadata = load_project_model(model_path, metadata_path)
    return predict_loaded(record, model, metadata)


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def audit_export(artifact_dir="ml/artifacts/apf3"):
    """Verify the model export, D.1 hashes, schema, and frozen metrics."""
    root, d1_metadata, split_metadata, _ = verify_d1_artifacts(artifact_dir)
    model, metadata = load_project_model(root / "model.joblib", root / "model_metadata.json")
    if metadata.get("model_family") != "ridge" or metadata.get("hyperparameters") != {"alpha": 10.0}:
        raise ValueError("Exported model selection metadata is inconsistent")
    if metadata.get("forecast_horizon_days") != 7 or metadata.get("source") != "SYNTHETIC":
        raise ValueError("Exported model contract is inconsistent")
    if metadata.get("test_period") != {"start": "2026-10-16", "end": "2026-10-24"}:
        raise ValueError("Exported test period is inconsistent")
    if metadata.get("metrics", {}).get("ridge", {}).get("test_metrics", {}).get("mae") != 1.2984537784882764:
        raise ValueError("Exported test metrics do not match the frozen evaluation")
    if not hasattr(model, "named_steps") or set(model.named_steps) != {"preprocess", "model"}:
        raise ValueError("Exported preprocessing pipeline is incomplete")
    if model.named_steps["model"].alpha != 10.0:
        raise ValueError("Exported Ridge alpha is inconsistent")
    return {"artifact_dir": str(root), "model_sha256": metadata["joblib_sha256"], "dataset_hash": metadata["dataset_hash"], "model_family": metadata["model_family"], "hyperparameters": metadata["hyperparameters"], "training_period": metadata["training_period"], "validation_period": metadata["validation_period"], "test_period": metadata["test_period"], "source": metadata["source"], "d1_source_batch_id": d1_metadata["source_manifest_batch_id"], "split": split_metadata}


def build_future_record(source_dir="ml/data/simulation-v1", cutoff=SIMULATION_END, product_id=None):
    """Build inference features from canonical history through the cutoff only."""
    if cutoff != SIMULATION_END:
        raise ValueError("The canonical source ends at 2026-10-31; another cutoff requires a new validated source.")
    root = Path(source_dir)
    products = _read_csv(root / "products.csv")
    daily = _read_csv(root / "daily_product_sales.csv")
    movements = _read_csv(root / "inventory_movements.csv")
    if any(row.get("source") != "SYNTHETIC" for row in products + daily + movements):
        raise ValueError("Future demonstration requires SYNTHETIC source rows")
    dates = _date_range(SIMULATION_START, cutoff)
    product_ids = [row["id"] for row in products]
    daily_by_key = {(row["product_id"], date.fromisoformat(row["date"])): row for row in daily}
    expected_keys = {(product, day) for product in product_ids for day in dates}
    if set(daily_by_key) != expected_keys:
        raise ValueError("Canonical daily history is incomplete")
    if product_id is None:
        totals = {product: sum(int(daily_by_key[(product, day)]["completed_units"]) for day in dates) for product in product_ids}
        product_id = max(product_ids, key=lambda product: (totals[product], product))
    if product_id not in product_ids:
        raise ValueError("Unknown product_id")
    product = next(row for row in products if row["id"] == product_id)
    values = [int(daily_by_key[(product_id, day)]["completed_units"]) for day in dates]
    stock = _historical_stock(movements, product_ids, dates)
    stock_at_cutoff = stock[(product_id, cutoff)]
    if stock_at_cutoff != int(product["current_stock"]):
        raise ValueError("Ledger stock does not match canonical product stock")
    features = _feature_values(values, len(values) - 1, stock, product_id, cutoff, product["category"], product["unit_of_measure"])
    record = {"date": cutoff.isoformat(), "source": "SYNTHETIC", "product_id": product_id, **features}
    return record, {"product_id": product_id, "product_name": product["name"], "category": product["category"], "minimum_stock": int(product["minimum_stock"]), "stock_at_cutoff": stock_at_cutoff, "history_start": SIMULATION_START.isoformat(), "history_end": cutoff.isoformat(), "future_sales_used": False}


def run_future_demo(source_dir="ml/data/simulation-v1", artifact_dir="ml/artifacts/apf3", output_dir="ml/artifacts/apf3"):
    audit = audit_export(artifact_dir)
    record, product = build_future_record(source_dir)
    result = predict(record, Path(artifact_dir) / "model.joblib", Path(artifact_dir) / "model_metadata.json")
    forecast_start = date.fromisoformat(result["cutoff_date"]) + timedelta(days=1)
    forecast_end = forecast_start + timedelta(days=result["horizon_days"] - 1)
    result.update({"product_name": product["product_name"], "forecast_start": forecast_start.isoformat(), "forecast_end": forecast_end.isoformat(), "limitations": "Synthetic offline estimate; not a guaranteed future sale and not a production decision."})
    forecast_units = result["forecast_next_7d_units"]
    target_stock = math.ceil(forecast_units) + product["minimum_stock"]
    recommendation = {"product_id": product["product_id"], "product_name": product["product_name"], "cutoff_date": result["cutoff_date"], "stock_at_cutoff": product["stock_at_cutoff"], "minimum_stock": product["minimum_stock"], "predicted_next_7d_units": forecast_units, "target_stock_units": target_stock, "recommended_purchase_units": max(0, target_stock - product["stock_at_cutoff"]), "formula": "max(0, ceil(predicted_next_7d_units) + minimum_stock - stock_at_cutoff)", "informational_only": True, "database_write_performed": False, "source": "SYNTHETIC"}
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    _write_json(output / "future_inference_input.json", {**record, **product})
    _write_json(output / "future_inference_output.json", result)
    _write_json(output / "replenishment_recommendation.json", recommendation)
    _write_json(output / "phase_e1_audit.json", {"audit": audit, "input": {"product": product, "cutoff": record["date"], "future_sales_used": False}, "outputs": {"future_inference_output": "future_inference_output.json", "replenishment_recommendation": "replenishment_recommendation.json"}})
    return {"audit": audit, "input": record, "product": product, "prediction": result, "replenishment": recommendation}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="ml/artifacts/apf3/model.joblib")
    parser.add_argument("--metadata", default="ml/artifacts/apf3/model_metadata.json")
    parser.add_argument("--input", help="JSON file containing one feature record")
    parser.add_argument("--future-demo", action="store_true", help="Build and execute the 2026-10-31 canonical future demonstration")
    parser.add_argument("--source", default="ml/data/simulation-v1")
    parser.add_argument("--artifact-dir", default="ml/artifacts/apf3")
    parser.add_argument("--output-dir", default="ml/artifacts/apf3")
    args = parser.parse_args()
    if args.future_demo:
        print(json.dumps(run_future_demo(args.source, args.artifact_dir, args.output_dir), indent=2, sort_keys=True))
        return
    if not args.input:
        parser.error("--input is required unless --future-demo is used")
    record = _read_json(args.input)
    print(json.dumps(predict(record, args.model, args.metadata), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
