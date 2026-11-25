import argparse
import csv
import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

try:
    from .prepare_dataset import (
        SIMULATION_END,
        SIMULATION_START,
        _date_range,
        _feature_values,
        _historical_stock,
    )
    from .train_apf3 import (
        FEATURES,
        NUMERIC_FEATURES,
        verify_d1_artifacts,
    )
except ImportError:
    from prepare_dataset import (
        SIMULATION_END,
        SIMULATION_START,
        _date_range,
        _feature_values,
        _historical_stock,
    )
    from train_apf3 import (
        FEATURES,
        NUMERIC_FEATURES,
        verify_d1_artifacts,
    )


MAX_PRODUCTS = 20


def _read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _write_json(path, value):
    Path(path).write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _validate_limit(limit):
    """Accept only integer limits between 1 and 20."""
    if (
        isinstance(limit, bool)
        or not isinstance(limit, int)
        or not 1 <= limit <= MAX_PRODUCTS
    ):
        raise ValueError(
            f"limit must be an integer between 1 and {MAX_PRODUCTS}"
        )


def validate_record(record):
    """Validate one feature record before model inference."""
    if not isinstance(record, dict):
        raise ValueError("Input must be one JSON object")

    missing = [
        name
        for name in FEATURES + ["date", "source"]
        if name not in record
    ]

    if missing:
        raise ValueError(
            f"Missing required fields: {', '.join(missing)}"
        )

    if record["source"] != "SYNTHETIC":
        raise ValueError(
            "Only SYNTHETIC inference records are accepted"
        )

    try:
        date.fromisoformat(str(record["date"]))
    except ValueError as error:
        raise ValueError(
            "date must be ISO YYYY-MM-DD"
        ) from error

    for name in NUMERIC_FEATURES:
        value = record[name]

        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not np.isfinite(value)
        ):
            raise ValueError(
                f"Numeric feature is invalid: {name}"
            )

    for name in [
        "product_id",
        "category",
        "unit_of_measure",
        "historical_demand_class",
    ]:
        if (
            not isinstance(record[name], str)
            or not record[name].strip()
        ):
            raise ValueError(
                f"Categorical feature is invalid: {name}"
            )

    if "target_next_7d" in record:
        raise ValueError(
            "target_next_7d is not an accepted inference input"
        )

    return record


def load_project_model(
    model_path="ml/artifacts/apf3/model.joblib",
    metadata_path="ml/artifacts/apf3/model_metadata.json",
):
    """Load the model only if its SHA256 matches the metadata."""
    model_path = Path(model_path)
    metadata = _read_json(metadata_path)

    expected_hash = metadata.get("joblib_sha256")
    actual_hash = hashlib.sha256(
        model_path.read_bytes()
    ).hexdigest()

    if not expected_hash or actual_hash != expected_hash:
        raise ValueError(
            "Model artifact hash does not match generated metadata"
        )

    return joblib.load(model_path), metadata


def predict(
    record,
    model_path="ml/artifacts/apf3/model.joblib",
    metadata_path="ml/artifacts/apf3/model_metadata.json",
):
    """Generate one prediction."""
    record = validate_record(record)

    model, metadata = load_project_model(
        model_path,
        metadata_path,
    )

    features = pd.DataFrame(
        [{name: record[name] for name in FEATURES}],
        columns=FEATURES,
    )

    forecast = max(
        0.0,
        float(model.predict(features)[0]),
    )

    if not math.isfinite(forecast):
        raise ValueError(
            "Model generated a non-finite prediction"
        )

    return {
        "product_id": record["product_id"],
        "cutoff_date": record["date"],
        "forecast_next_7d_units": forecast,
        "model": metadata["model_family"],
        "model_version": metadata["model_version"],
        "horizon_days": metadata["forecast_horizon_days"],
        "source": metadata["source"],
    }


def _read_csv(path):
    with open(
        path,
        newline="",
        encoding="utf-8",
    ) as stream:
        return list(csv.DictReader(stream))


def audit_export(artifact_dir="ml/artifacts/apf3"):
    """Verify the model export, D.1 hashes, schema, and frozen metrics."""
    root, d1_metadata, split_metadata, _ = verify_d1_artifacts(
        artifact_dir
    )

    model, metadata = load_project_model(
        root / "model.joblib",
        root / "model_metadata.json",
    )

    if (
        metadata.get("model_family") != "ridge"
        or metadata.get("hyperparameters") != {"alpha": 10.0}
    ):
        raise ValueError(
            "Exported model selection metadata is inconsistent"
        )

    if (
        metadata.get("forecast_horizon_days") != 7
        or metadata.get("source") != "SYNTHETIC"
    ):
        raise ValueError(
            "Exported model contract is inconsistent"
        )

    if metadata.get("test_period") != {
        "start": "2026-10-16",
        "end": "2026-10-24",
    }:
        raise ValueError(
            "Exported test period is inconsistent"
        )

    exported_mae = (
        metadata.get("metrics", {})
        .get("ridge", {})
        .get("test_metrics", {})
        .get("mae")
    )

    if exported_mae is None or not math.isclose(
        exported_mae,
        1.2984537784882764,
        rel_tol=1e-9,
        abs_tol=1e-12,
    ):
        raise ValueError(
            "Exported test metrics do not match the frozen evaluation"
        )

    if (
        not hasattr(model, "named_steps")
        or set(model.named_steps) != {"preprocess", "model"}
    ):
        raise ValueError(
            "Exported preprocessing pipeline is incomplete"
        )

    if model.named_steps["model"].alpha != 10.0:
        raise ValueError(
            "Exported Ridge alpha is inconsistent"
        )

    return {
        "artifact_dir": str(root),
        "model_sha256": metadata["joblib_sha256"],
        "dataset_hash": metadata["dataset_hash"],
        "model_family": metadata["model_family"],
        "hyperparameters": metadata["hyperparameters"],
        "training_period": metadata["training_period"],
        "validation_period": metadata["validation_period"],
        "test_period": metadata["test_period"],
        "source": metadata["source"],
        "d1_source_batch_id": (
            d1_metadata["source_manifest_batch_id"]
        ),
        "split": split_metadata,
    }


def build_future_records(
    source_dir="ml/data/simulation-v1",
    cutoff=SIMULATION_END,
    limit=20,
):
    """Build inference features for the top eligible products."""
    _validate_limit(limit)

    if cutoff != SIMULATION_END:
        raise ValueError(
            "The canonical source ends at 2026-10-31; "
            "another cutoff requires a new validated source."
        )

    root = Path(source_dir)

    products = _read_csv(root / "products.csv")
    daily = _read_csv(root / "daily_product_sales.csv")
    movements = _read_csv(root / "inventory_movements.csv")

    if any(
        row.get("source") != "SYNTHETIC"
        for row in products + daily + movements
    ):
        raise ValueError(
            "Future demonstration requires SYNTHETIC source rows"
        )

    dates = _date_range(SIMULATION_START, cutoff)

    product_ids = [
        row["id"]
        for row in products
    ]

    if len(product_ids) != len(set(product_ids)):
        raise ValueError(
            "Duplicate product IDs in canonical source"
        )

    daily_by_key = {
        (
            row["product_id"],
            date.fromisoformat(row["date"]),
        ): row
        for row in daily
    }

    if len(daily_by_key) != len(daily):
        raise ValueError(
            "Duplicate product-day records in canonical history"
        )

    expected_keys = {
        (product_id, day)
        for product_id in product_ids
        for day in dates
    }

    if set(daily_by_key) != expected_keys:
        raise ValueError(
            "Canonical daily history is incomplete"
        )

    stock = _historical_stock(
        movements,
        product_ids,
        dates,
    )

    totals = {
        product_id: sum(
            int(
                daily_by_key[
                    (product_id, day)
                ]["completed_units"]
            )
            for day in dates
        )
        for product_id in product_ids
    }

    # Priorizar los productos con mayor volumen histórico de ventas.
    ranked_ids = sorted(
        product_ids,
        key=lambda product_id: (
            totals[product_id],
            product_id,
        ),
        reverse=True,
    )

    products_by_id = {
        product["id"]: product
        for product in products
    }

    records = []
    product_details = []
    excluded = []

    for product_id in ranked_ids:
        if len(records) >= limit:
            break

        product = products_by_id[product_id]

        try:
            stock_at_cutoff = stock[
                (product_id, cutoff)
            ]

            if stock_at_cutoff != int(
                product["current_stock"]
            ):
                raise ValueError(
                    "Ledger stock does not match canonical product stock"
                )

            values = [
                int(
                    daily_by_key[
                        (product_id, day)
                    ]["completed_units"]
                )
                for day in dates
            ]

            features = _feature_values(
                values,
                len(values) - 1,
                stock,
                product_id,
                cutoff,
                product["category"],
                product["unit_of_measure"],
            )

            record = {
                "date": cutoff.isoformat(),
                "source": "SYNTHETIC",
                "product_id": product_id,
                **features,
            }

            records.append(record)

            product_details.append({
                "product_id": product_id,
                "product_name": product["name"],
                "category": product["category"],
                "minimum_stock": int(
                    product["minimum_stock"]
                ),
                "stock_at_cutoff": stock_at_cutoff,
                "historical_sales_units": totals[product_id],
                "history_start": SIMULATION_START.isoformat(),
                "history_end": cutoff.isoformat(),
                "future_sales_used": False,
            })

        except (
            ValueError,
            KeyError,
            TypeError,
            IndexError,
        ) as error:
            excluded.append({
                "product_id": product_id,
                "product_name": product["name"],
                "reason": str(error),
            })

    if not records:
        raise ValueError(
            "No eligible products for future inference"
        )

    if len(records) != len(product_details):
        raise ValueError(
            "Inference records and product details are misaligned"
        )

    return records, product_details, excluded


def predict_many(
    records,
    model_path="ml/artifacts/apf3/model.joblib",
    metadata_path="ml/artifacts/apf3/model_metadata.json",
):
    """Predict multiple products using one loaded model."""
    if not isinstance(records, list):
        raise ValueError(
            "Records must be provided as a list"
        )

    if not records:
        raise ValueError(
            "At least one inference record is required"
        )

    if len(records) > MAX_PRODUCTS:
        raise ValueError(
            f"A maximum of {MAX_PRODUCTS} products can be predicted"
        )

    validated_records = [
        validate_record(record)
        for record in records
    ]

    product_ids = [
        record["product_id"]
        for record in validated_records
    ]

    if len(product_ids) != len(set(product_ids)):
        raise ValueError(
            "Duplicate product IDs in inference records"
        )

    model, metadata = load_project_model(
        model_path,
        metadata_path,
    )

    features = pd.DataFrame(
        [
            {
                name: record[name]
                for name in FEATURES
            }
            for record in validated_records
        ],
        columns=FEATURES,
    )

    forecasts = np.maximum(
        0.0,
        model.predict(features).astype(float),
    )

    if len(forecasts) != len(validated_records):
        raise ValueError(
            "Prediction count does not match input records"
        )

    if not np.isfinite(forecasts).all():
        raise ValueError(
            "Model generated non-finite predictions"
        )

    results = []

    for record, forecast in zip(
        validated_records,
        forecasts,
    ):
        results.append({
            "product_id": record["product_id"],
            "cutoff_date": record["date"],
            "forecast_next_7d_units": float(forecast),
            "model": metadata["model_family"],
            "model_version": metadata["model_version"],
            "horizon_days": metadata["forecast_horizon_days"],
            "source": metadata["source"],
        })

    return results


def run_future_demo(
    source_dir="ml/data/simulation-v1",
    artifact_dir="ml/artifacts/apf3",
    output_dir="ml/artifacts/apf3",
    limit=20,
):
    """Generate and export batch forecasts and replenishment suggestions."""
    _validate_limit(limit)

    audit = audit_export(artifact_dir)

    records, products, excluded = build_future_records(
        source_dir=source_dir,
        limit=limit,
    )

    predictions = predict_many(
        records,
        Path(artifact_dir) / "model.joblib",
        Path(artifact_dir) / "model_metadata.json",
    )

    if len(predictions) != len(products):
        raise ValueError(
            "Predictions and product details are misaligned"
        )

    forecast_start = SIMULATION_END + timedelta(days=1)

    forecast_end = (
        forecast_start
        + timedelta(
            days=predictions[0]["horizon_days"] - 1
        )
    )

    enriched_predictions = []
    recommendations = []

    for prediction, product in zip(
        predictions,
        products,
    ):
        if prediction["product_id"] != product["product_id"]:
            raise ValueError(
                "Prediction product does not match product details"
            )

        forecast_units = prediction[
            "forecast_next_7d_units"
        ]

        prediction.update({
            "product_name": product["product_name"],
            "category": product["category"],
            "forecast_start": forecast_start.isoformat(),
            "forecast_end": forecast_end.isoformat(),
            "limitations": (
                "Synthetic offline estimate; not a guaranteed "
                "future sale and not a production decision."
            ),
        })

        target_stock = (
            math.ceil(forecast_units)
            + product["minimum_stock"]
        )

        recommendation = {
            "product_id": product["product_id"],
            "product_name": product["product_name"],
            "cutoff_date": prediction["cutoff_date"],
            "stock_at_cutoff": product["stock_at_cutoff"],
            "minimum_stock": product["minimum_stock"],
            "predicted_next_7d_units": forecast_units,
            "target_stock_units": target_stock,
            "recommended_purchase_units": max(
                0,
                target_stock - product["stock_at_cutoff"],
            ),
            "formula": (
                "max(0, ceil(predicted_next_7d_units) "
                "+ minimum_stock - stock_at_cutoff)"
            ),
            "informational_only": True,
            "database_write_performed": False,
            "source": "SYNTHETIC",
        }

        enriched_predictions.append(prediction)
        recommendations.append(recommendation)

    if len(enriched_predictions) != len(recommendations):
        raise ValueError(
            "Prediction and recommendation counts do not match"
        )

    output = Path(output_dir)
    output.mkdir(
        parents=True,
        exist_ok=True,
    )

    inference_output = {
        "source": "SYNTHETIC",
        "model": "ridge",
        "model_version": predictions[0]["model_version"],
        "cutoff_date": SIMULATION_END.isoformat(),
        "forecast_start": forecast_start.isoformat(),
        "forecast_end": forecast_end.isoformat(),
        "horizon_days": 7,
        "requested_products": limit,
        "generated_predictions": len(enriched_predictions),
        "predictions": enriched_predictions,
        "limitations": (
            "Synthetic offline estimates; not guaranteed future sales "
            "and not production decisions."
        ),
    }

    replenishment_output = {
        "source": "SYNTHETIC",
        "cutoff_date": SIMULATION_END.isoformat(),
        "informational_only": True,
        "database_write_performed": False,
        "recommendations": recommendations,
    }

    _write_json(
        output / "future_inference_input.json",
        {
            "source": "SYNTHETIC",
            "cutoff_date": SIMULATION_END.isoformat(),
            "records": [
                {
                    **record,
                    **product,
                }
                for record, product in zip(
                    records,
                    products,
                )
            ],
        },
    )

    _write_json(
        output / "future_inference_output.json",
        inference_output,
    )

    _write_json(
        output / "replenishment_recommendation.json",
        replenishment_output,
    )

    _write_json(
        output / "phase_e1_audit.json",
        {
            "audit": audit,
            "input": {
                "cutoff": SIMULATION_END.isoformat(),
                "requested_products": limit,
                "generated_products": len(records),
                "excluded_products": excluded,
                "future_sales_used": False,
            },
            "outputs": {
                "future_inference_output": (
                    "future_inference_output.json"
                ),
                "replenishment_recommendation": (
                    "replenishment_recommendation.json"
                ),
            },
        },
    )

    return {
        "audit": audit,
        "requested_products": limit,
        "generated_predictions": len(enriched_predictions),
        "predictions": enriched_predictions,
        "replenishment": recommendations,
        "excluded_products": excluded,
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--model",
        default="ml/artifacts/apf3/model.joblib",
    )

    parser.add_argument(
        "--metadata",
        default="ml/artifacts/apf3/model_metadata.json",
    )

    parser.add_argument(
        "--input",
        help="JSON file containing one feature record",
    )

    parser.add_argument(
        "--future-demo",
        action="store_true",
        help=(
            "Build and execute the 2026-10-31 "
            "canonical future demonstration"
        ),
    )

    parser.add_argument(
        "--source",
        default="ml/data/simulation-v1",
    )

    parser.add_argument(
        "--artifact-dir",
        default="ml/artifacts/apf3",
    )

    parser.add_argument(
        "--output-dir",
        default="ml/artifacts/apf3",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum number of eligible products to predict (1-20)",
    )

    args = parser.parse_args()

    if args.future_demo:
        result = run_future_demo(
            args.source,
            args.artifact_dir,
            args.output_dir,
            args.limit,
        )

        print(
            json.dumps(
                result,
                indent=2,
                sort_keys=True,
            )
        )
        return

    if not args.input:
        parser.error(
            "--input is required unless --future-demo is used"
        )

    record = _read_json(args.input)

    print(
        json.dumps(
            predict(
                record,
                args.model,
                args.metadata,
            ),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
