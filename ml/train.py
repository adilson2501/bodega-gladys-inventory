"""Entrena/evalúa modelos temporales y escribe un artefacto consumible por Next.js."""
import argparse
import csv
import json
import random
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

SEED = 42
FEATURE_SCHEMA = ["lag_1", "lag_2", "lag_7", "rolling_7", "day_of_week"]


def wape(actual, predicted):
    denominator = sum(abs(value) for value in actual)
    return float(sum(abs(a - p) for a, p in zip(actual, predicted)) / denominator) if denominator else None


def feature_row(values, index):
    if index < 7:
        return None
    previous = values[:index]
    return [previous[-1], previous[-2], previous[-7], sum(previous[-7:]) / 7, (index % 7)]


def fit_product(rows):
    rows = sorted(rows, key=lambda row: row["date"])
    values = [int(row["quantity"]) for row in rows]
    dates = [row["date"] for row in rows]
    usable = [(i, feature_row(values, i)) for i in range(len(values)) if feature_row(values, i) is not None]
    if len(usable) < 14:
        return {"status": "INSUFFICIENT_HISTORY", "forecast": [0] * 7, "metrics": None}
    split = max(1, int(len(usable) * 0.8))
    train, test = usable[:split], usable[split:]
    model = RandomForestRegressor(n_estimators=100, random_state=SEED, n_jobs=1, min_samples_leaf=1)
    model.fit([row[1] for row in train], [values[row[0]] for row in train])
    actual = [values[index] for index, _ in test]
    naive = [values[index - 1] for index, _ in test]
    moving = [sum(values[index - 7:index]) / 7 for index, _ in test]
    random_forest = [max(0, float(value)) for value in model.predict([row[1] for row in test])]
    metrics = {
        "naive": {"mae": mean_absolute_error(actual, naive), "wape": wape(actual, naive)},
        "moving_average_7": {"mae": mean_absolute_error(actual, moving), "wape": wape(actual, moving)},
        "random_forest": {"mae": mean_absolute_error(actual, random_forest), "wape": wape(actual, random_forest)},
        "evaluation_start": dates[test[0][0]] if test else None,
        "evaluation_end": dates[test[-1][0]] if test else None,
    }
    history = values[:]
    forecast = []
    for step in range(7):
        features = feature_row(history, len(history))
        prediction = max(0, float(model.predict([features])[0]))
        forecast.append(prediction)
        history.append(prediction)
    return {"status": "OK", "forecast": forecast, "metrics": metrics}


def synthetic_rows():
    random.seed(SEED)
    start = date(2025, 1, 1)
    rows = []
    for product, base in [("00000000-0000-4000-8000-000000000001", 8), ("00000000-0000-4000-8000-000000000002", 3)]:
        for offset in range(70):
            rows.append({"date": (start + timedelta(days=offset)).isoformat(), "product_id": product, "quantity": max(0, base + (offset % 7 == 2) * 3 + random.randint(0, 2)), "source": "SYNTHETIC"})
    return rows


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as stream:
        result = []
        for row in csv.DictReader(stream):
            try:
                quantity = int(row["quantity"])
                date.fromisoformat(row["date"][:10])
                if row["product_id"].strip() and quantity >= 0:
                    result.append({"date": row["date"][:10], "product_id": row["product_id"].strip(), "quantity": quantity, "source": row.get("source", "REAL")})
            except (KeyError, TypeError, ValueError):
                continue
        return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="ml/data/daily_sales.csv")
    parser.add_argument("--artifact", default="ml/artifacts/forecast.json")
    parser.add_argument("--metrics", default="ml/artifacts/metrics.json")
    parser.add_argument("--synthetic", action="store_true")
    args = parser.parse_args()
    rows = synthetic_rows() if args.synthetic else read_rows(args.input)
    grouped = {}
    for row in rows:
        grouped.setdefault(row["product_id"], []).append(row)
    results = {product: fit_product(product_rows) for product, product_rows in sorted(grouped.items())}
    source = "SYNTHETIC" if args.synthetic else "REAL"
    all_dates = [row["date"] for row in rows]
    artifact = {
        "schema_version": "1.0", "generated_at": datetime.now(timezone.utc).isoformat(), "source": source,
        "model_type": "RandomForestRegressor + naive + moving_average_7", "training_date_start": min(all_dates) if all_dates else None, "training_date_end": max(all_dates) if all_dates else None,
        "evaluation_method": "80/20 chronological split; no shuffling; lag/rolling values strictly prior to target",
        "feature_schema": FEATURE_SCHEMA,
        "rows": [{"product_id": product, "forecast_7d": round(sum(result["forecast"]), 4), "status": "DEMO" if args.synthetic else result["status"], "model": "RandomForestRegressor" if result["status"] == "OK" else "fallback: insufficient history"} for product, result in results.items()],
    }
    metrics = {"source": source, "seed": SEED, "feature_schema": FEATURE_SCHEMA, "products": {product: result["metrics"] for product, result in results.items()}, "honest_interpretation": "Synthetic metrics are demonstration only; low-demand WAPE can be unstable."}
    Path(args.artifact).parent.mkdir(parents=True, exist_ok=True)
    Path(args.metrics).parent.mkdir(parents=True, exist_ok=True)
    Path(args.artifact).write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    Path(args.metrics).write_text(json.dumps(metrics, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
