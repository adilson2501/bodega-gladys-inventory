"""Generate a deterministic, synthetic-only APF3 Ridge forecast batch."""
import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

try:
    from .infer_apf3 import audit_export, load_project_model, predict_loaded
    from .prepare_dataset import HORIZON, SIMULATION_END
    from .prepare_history import prepare_history
    from .train_apf3 import FEATURES
except ImportError:
    from infer_apf3 import audit_export, load_project_model, predict_loaded
    from prepare_dataset import HORIZON, SIMULATION_END
    from prepare_history import prepare_history
    from train_apf3 import FEATURES


MODEL_VERSION = "apf3-models-1.0"
MODEL_FAMILY = "ridge"
SOURCE = "SYNTHETIC"
CONTRACT_VERSION = "2.0"
DETERMINISTIC_CREATED_AT = "2026-10-31T23:59:59+00:00"


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _manifest(source_dir):
    return json.loads((Path(source_dir) / "simulation_manifest.json").read_text(encoding="utf-8"))


def _dataset_hash(manifest):
    return hashlib.sha256(json.dumps(manifest["sha256"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _verify_model(model, metadata):
    if metadata.get("model_family") != MODEL_FAMILY:
        raise ValueError("Unexpected model family")
    if metadata.get("model_version") != MODEL_VERSION:
        raise ValueError("Unexpected model version")
    if metadata.get("source") != SOURCE:
        raise ValueError("Model provenance is not SYNTHETIC")
    if metadata.get("forecast_horizon_days") != HORIZON:
        raise ValueError("Unexpected forecast horizon")
    if metadata.get("features") != FEATURES:
        raise ValueError("Model feature schema is incompatible with APF3 preparation")
    if metadata.get("hyperparameters") != {"alpha": 10.0}:
        raise ValueError("Unexpected Ridge hyperparameters")
    if not hasattr(model, "named_steps") or set(model.named_steps) != {"preprocess", "model"}:
        raise ValueError("Exported model pipeline is incomplete")
    if getattr(model.named_steps["model"], "alpha", None) != 10.0:
        raise ValueError("Exported Ridge alpha is inconsistent")


def _row_status(eligibility):
    if eligibility == "SUFFICIENT_HISTORY":
        return "READY", None
    if eligibility == "INSUFFICIENT_HISTORY":
        return "INSUFFICIENT_HISTORY", eligibility
    return "ERROR", eligibility


def build_batch(source_dir="ml/data/simulation-v1", artifact_dir="ml/artifacts/apf3", cutoff=SIMULATION_END):
    """Build a contract-shaped batch without writing files or using a database."""
    if cutoff != SIMULATION_END:
        raise ValueError("This synthetic batch is fixed to the validated 2026-10-31 cutoff")
    artifact_root = Path(artifact_dir)
    model_path = artifact_root / "model.joblib"
    metadata_path = artifact_root / "model_metadata.json"
    audit = audit_export(artifact_root)
    model, metadata = load_project_model(model_path, metadata_path)
    _verify_model(model, metadata)

    prepared = prepare_history(source_dir, cutoff)
    manifest = _manifest(source_dir)
    dataset_hash = _dataset_hash(manifest)
    model_hash = metadata["joblib_sha256"]
    run_id = str(uuid5(NAMESPACE_URL, f"bodega-gladys/apf3/{MODEL_VERSION}/{cutoff.isoformat()}/{dataset_hash}/{model_hash}"))
    row_by_product = {row["product_id"]: row for row in prepared["rows"]}
    rows = []
    eligibility_rows = []
    predictions = {}
    for product_id in sorted(prepared["eligibility"]):
        eligibility = prepared["eligibility"][product_id]
        status, error_code = _row_status(eligibility)
        forecast_units = None
        if status == "READY":
            prediction = predict_loaded(row_by_product[product_id], model, metadata)
            forecast_units = prediction["forecast_next_7d_units"]
            if not isinstance(forecast_units, (int, float)):
                raise ValueError(f"Invalid prediction type for product {product_id}")
            predictions[product_id] = forecast_units
        rows.append({"product_id": product_id, "forecast_units": forecast_units, "status": status, **({"error_code": error_code} if error_code else {})})
        eligibility_rows.append({"product_id": product_id, "eligibility_status": eligibility, "forecast_status": status, "reason": error_code})

    forecast_start = cutoff.fromordinal(cutoff.toordinal() + 1)
    forecast_end = cutoff.fromordinal(cutoff.toordinal() + HORIZON)
    batch = {
        "schema_version": CONTRACT_VERSION,
        "run_id": run_id,
        "model_family": MODEL_FAMILY,
        "model_version": MODEL_VERSION,
        "source": SOURCE,
        "provenance": {"source": SOURCE, "verification": "synthetic-manifest"},
        "created_at": DETERMINISTIC_CREATED_AT,
        "cutoff_date": cutoff.isoformat(),
        "forecast_start": forecast_start.isoformat(),
        "forecast_end": forecast_end.isoformat(),
        "horizon_days": HORIZON,
        "input_hash": None,
        "artifact_hash": model_hash,
        "rows": rows,
    }
    generation = {
        "batch_file": "forecast_batch.json",
        "contract_version": CONTRACT_VERSION,
        "created_at_policy": "fixed to cutoff day at 23:59:59 UTC for reproducibility",
        "cutoff_date": cutoff.isoformat(),
        "dataset_hash": dataset_hash,
        "manifest_batch_id": manifest["batch_id"],
        "manifest_sha256": manifest["sha256"],
        "model_artifact": str(model_path),
        "model_sha256": model_hash,
        "model_version": MODEL_VERSION,
        "source": SOURCE,
        "feature_schema": FEATURES,
        "future_sales_used": False,
    }
    validation = {
        "python_validation": "PASSED",
        "model_audit": audit,
        "feature_schema_match": True,
        "source": SOURCE,
        "future_sales_used": False,
        "prediction_count": len(predictions),
        "row_count": len(rows),
        "nonnegative_finite_predictions": all(value >= 0 and value == value and value != float("inf") for value in predictions.values()),
    }
    return batch, eligibility_rows, validation, generation


def generate_batch(source_dir="ml/data/simulation-v1", artifact_dir="ml/artifacts/apf3", output_dir="ml/artifacts/apf3/forecast-batch", cutoff=SIMULATION_END):
    batch, eligibility, validation, generation = build_batch(source_dir, artifact_dir, cutoff)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    _write_json(output / "forecast_batch.json", batch)
    _write_json(output / "eligibility_report.json", {"source": SOURCE, "cutoff_date": cutoff.isoformat(), "products": eligibility})
    _write_json(output / "validation_report.json", validation)
    _write_json(output / "generation_metadata.json", generation)
    return {"output_dir": str(output), "batch": batch, "eligibility": eligibility, "validation": validation, "generation": generation}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="ml/data/simulation-v1")
    parser.add_argument("--artifact-dir", default="ml/artifacts/apf3")
    parser.add_argument("--output-dir", default="ml/artifacts/apf3/forecast-batch")
    args = parser.parse_args()
    result = generate_batch(args.source, args.artifact_dir, args.output_dir)
    print(json.dumps({"output_dir": result["output_dir"], "validation": result["validation"], "product_count": len(result["batch"]["rows"])}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
