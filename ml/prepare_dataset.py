"""Prepare product-day sales data and the reproducible APF3 dataset.

The original ``prepare`` helper remains compatible with the application export
workflow.  The APF3 path consumes the validated synthetic export only and does
not train a model.
"""
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict, Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

APF3_VERSION = "apf3-dataset-1.0"
SIMULATION_START = date(2026, 8, 1)
SIMULATION_END = date(2026, 10, 31)
CALENDAR_TIMEZONE = "America/Lima"
EXPECTED_PRODUCTS = 60
EXPECTED_DAYS = 92
HORIZON = 7
WARMUP_DAYS = 14
TRAIN_END = date(2026, 9, 20)
VALIDATION_START = date(2026, 10, 1)
VALIDATION_END = date(2026, 10, 9)
TEST_START = date(2026, 10, 16)
TEST_END = date(2026, 10, 24)

FEATURE_COLUMNS = [
    "category", "unit_of_measure", "lag_1", "lag_2", "lag_7",
    "rolling_mean_7", "rolling_mean_14", "rolling_std_7",
    "sales_frequency_7", "sales_frequency_14", "day_of_week", "month",
    "stock_available_eod", "historical_demand_class",
]
D1_OUTPUT_FILES = (
    "prepared_product_day.csv",
    "feature_target_dataset.csv",
    "ml_samples.csv",
    "eda_statistics.json",
    "temporal_split.json",
    "quality_report.json",
    "data_dictionary.json",
    "preprocessing_plan.json",
)
RAW_COLUMNS = [
    "date", "product_id", "category", "completed_units", "potential_units",
    "unfulfilled_units", "observation_status", "stockout_censored",
    "store_closed", "source",
]


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def _write_csv(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def _date(value):
    return date.fromisoformat(str(value)[:10])


def _int(value):
    return int(str(value))


def _json_write(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _date_range(start, end):
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def _validate_source(source):
    root = Path(source)
    required = ["products.csv", "daily_product_sales.csv", "daily_product_targets.csv", "sale_items.csv", "sales.csv", "inventory_movements.csv", "simulation_manifest.json"]
    missing = [name for name in required if not (root / name).exists()]
    if missing:
        raise ValueError(f"Missing canonical files: {', '.join(missing)}")
    manifest = json.loads((root / "simulation_manifest.json").read_text(encoding="utf-8"))
    if manifest.get("source") != "SYNTHETIC":
        raise ValueError("APF3 accepts only SYNTHETIC source data")
    if manifest.get("simulation_start") != SIMULATION_START.isoformat() or manifest.get("simulation_end") != SIMULATION_END.isoformat():
        raise ValueError("Unexpected simulation period")
    return root, manifest


def _historical_stock(movements, products, dates):
    by_product = defaultdict(list)
    for row in movements:
        by_product[row["product_id"]].append(row)
    result = {}
    for product in products:
        current = 0
        events = sorted(by_product[product], key=lambda row: (row["created_at"], row["id"]))
        event_index = 0
        for day in dates:
            while event_index < len(events) and _date(events[event_index]["created_at"]) <= day:
                current = _int(events[event_index]["resulting_stock"])
                event_index += 1
            result[(product, day)] = current
    return result


def _split_for_date(day):
    if SIMULATION_START + timedelta(days=WARMUP_DAYS) <= day <= TRAIN_END:
        return "train"
    if VALIDATION_START <= day <= VALIDATION_END:
        return "validation"
    if TEST_START <= day <= TEST_END:
        return "test"
    return "purged_or_warmup"


def _feature_values(values, index, stock, product, day, category, unit):
    history = values[:index]
    previous_7 = history[-7:]
    previous_14 = history[-14:]
    mean_14 = sum(previous_14) / 14
    demand_class = "zero" if mean_14 == 0 else "low" if mean_14 < 1 else "regular" if mean_14 < 3 else "high"
    return {
        "category": category,
        "unit_of_measure": unit,
        "lag_1": history[-1],
        "lag_2": history[-2],
        "lag_7": history[-7],
        "rolling_mean_7": round(sum(previous_7) / 7, 8),
        "rolling_mean_14": round(mean_14, 8),
        "rolling_std_7": round(math.sqrt(sum((value - sum(previous_7) / 7) ** 2 for value in previous_7) / 7), 8),
        "sales_frequency_7": sum(value > 0 for value in previous_7),
        "sales_frequency_14": sum(value > 0 for value in previous_14),
        "day_of_week": day.weekday(),
        "month": day.month,
        "stock_available_eod": int(stock[(product, day)] > 0),
        "historical_demand_class": demand_class,
    }


def prepare_apf3(source="ml/data/simulation-v1", output="ml/artifacts/apf3"):
    """Build APF3 artifacts from the immutable local simulation export."""
    root, manifest = _validate_source(source)
    products = _read_csv(root / "products.csv")
    daily = _read_csv(root / "daily_product_sales.csv")
    targets = _read_csv(root / "daily_product_targets.csv")
    sale_items = _read_csv(root / "sale_items.csv")
    sales = _read_csv(root / "sales.csv")
    movements = _read_csv(root / "inventory_movements.csv")
    product_ids = [row["id"] for row in products]
    dates = _date_range(SIMULATION_START, SIMULATION_END)
    expected_keys = {(product, day) for product in product_ids for day in dates}
    daily_by_key = {(row["product_id"], _date(row["date"])): row for row in daily}
    target_by_key = {(row["product_id"], _date(row["date"])): row for row in targets}
    quality_errors = []
    if len(products) != EXPECTED_PRODUCTS or len(set(product_ids)) != EXPECTED_PRODUCTS:
        quality_errors.append("product cardinality or uniqueness")
    if len({row["category"] for row in products}) != 9:
        quality_errors.append("category cardinality")
    if len(daily) != EXPECTED_PRODUCTS * EXPECTED_DAYS or set(daily_by_key) != expected_keys:
        quality_errors.append("product-day coverage")
    if len({key[1] for key in daily_by_key}) != EXPECTED_DAYS:
        quality_errors.append("calendar coverage")
    if any(row.get("source") != "SYNTHETIC" for row in products + daily + targets + sale_items + sales + movements):
        quality_errors.append("synthetic provenance")
    if any(_int(row["completed_units"]) < 0 or _int(row["potential_units"]) < 0 or _int(row["unfulfilled_units"]) < 0 for row in daily):
        quality_errors.append("negative daily quantities")
    if any(_int(row["potential_units"]) != _int(row["completed_units"]) + _int(row["unfulfilled_units"]) for row in daily):
        quality_errors.append("potential demand arithmetic")
    if any(_int(row["quantity"]) <= 0 for row in sale_items):
        quality_errors.append("invalid sale quantity")
    if any(row["product_id"] not in set(product_ids) for row in daily + sale_items + movements):
        quality_errors.append("invalid product reference")
    if any(_date(row["date"]) < SIMULATION_START or _date(row["date"]) > SIMULATION_END for row in daily + targets):
        quality_errors.append("invalid date")

    sale_day_by_id = {}
    for row in sales:
        try:
            sale_day_by_id[row["id"]] = datetime.fromisoformat(row["created_at"]).astimezone(ZoneInfo(CALENDAR_TIMEZONE)).date().isoformat()
        except (KeyError, TypeError, ValueError):
            quality_errors.append("invalid sale timestamp")
    sales_by_product_day = defaultdict(int)
    for item in sale_items:
        if item["sale_id"] not in sale_day_by_id:
            quality_errors.append("invalid sale reference")
            continue
        sales_by_product_day[(item["product_id"], sale_day_by_id[item["sale_id"]])] += _int(item["quantity"])
    for key, row in daily_by_key.items():
        if _int(row["completed_units"]) != sales_by_product_day[(key[0], key[1].isoformat())]:
            quality_errors.append(f"daily aggregation {key[0]} {key[1]}")
            break
    computed_targets = {}
    for product in product_ids:
        for index, day in enumerate(dates[:-HORIZON]):
            computed_targets[(product, day)] = sum(_int(daily_by_key[(product, dates[index + offset])]["completed_units"]) for offset in range(1, HORIZON + 1))
    if len(targets) != EXPECTED_PRODUCTS * (EXPECTED_DAYS - HORIZON):
        quality_errors.append("target coverage")
    for key, row in target_by_key.items():
        if row.get("target_status") != "COMPLETE" or _int(row["target_7d"]) != computed_targets.get(key, -1):
            quality_errors.append(f"target mismatch {key[0]} {key[1]}")
            break
    if quality_errors:
        raise ValueError("APF3 quality failure: " + "; ".join(sorted(set(quality_errors))))

    categories = {row["id"]: row["category"] for row in products}
    units = {row["id"]: row["unit_of_measure"] for row in products}
    stock = _historical_stock(movements, product_ids, dates)
    closed_dates = {day for day in dates if sum(_int(daily_by_key[(product, day)]["potential_units"]) for product in product_ids) == 0}
    raw_rows = []
    feature_rows = []
    values_by_product = {product: [_int(daily_by_key[(product, day)]["completed_units"]) for day in dates] for product in product_ids}
    for product in product_ids:
        for index, day in enumerate(dates):
            source_row = daily_by_key[(product, day)]
            raw_rows.append({
                "date": day.isoformat(), "product_id": product, "category": categories[product],
                "completed_units": _int(source_row["completed_units"]), "potential_units": _int(source_row["potential_units"]),
                "unfulfilled_units": _int(source_row["unfulfilled_units"]), "observation_status": source_row["observation_status"],
                "stockout_censored": int(_int(source_row["unfulfilled_units"]) > 0), "store_closed": int(day in closed_dates), "source": "SYNTHETIC",
            })
            if (product, day) not in target_by_key:
                continue
            usable = index >= WARMUP_DAYS
            feature = _feature_values(values_by_product[product], index, stock, product, day, categories[product], units[product]) if usable else {name: "" for name in FEATURE_COLUMNS}
            split = _split_for_date(day)
            feature_rows.append({
                **{"date": day.isoformat(), "product_id": product, "target_next_7d": computed_targets[(product, day)], "source": "SYNTHETIC", "usable_for_ml": int(usable and split != "purged_or_warmup"), "split": split, "exclusion_reason": "" if usable and split != "purged_or_warmup" else ("historical_warmup" if not usable else "temporal_purge")},
                **feature,
            })
    ml_rows = [row for row in feature_rows if row["usable_for_ml"] == 1]
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    _write_csv(out / "prepared_product_day.csv", raw_rows, RAW_COLUMNS)
    _write_csv(out / "feature_target_dataset.csv", feature_rows, ["date", "product_id", "target_next_7d", "source", "usable_for_ml", "split", "exclusion_reason"] + FEATURE_COLUMNS)
    _write_csv(out / "ml_samples.csv", ml_rows, ["date", "product_id", "target_next_7d", "source", "usable_for_ml", "split", "exclusion_reason"] + FEATURE_COLUMNS)

    train_rows = [row for row in ml_rows if row["split"] == "train"]
    target_values = [_int(row["target_next_7d"]) for row in train_rows]
    train_daily = [row for row in raw_rows if _date(row["date"]) <= TRAIN_END]
    category_totals = Counter()
    for row in train_daily:
        category_totals[row["category"]] += _int(row["completed_units"])
    weekday_totals = Counter()
    month_totals = Counter()
    all_month_totals = Counter()
    product_totals = Counter()
    for row in train_daily:
        day = _date(row["date"])
        weekday_totals[day.strftime("%A")] += _int(row["completed_units"])
        month_totals[day.strftime("%Y-%m")] += _int(row["completed_units"])
        product_totals[row["product_id"]] += _int(row["completed_units"])
    for row in raw_rows:
        all_month_totals[_date(row["date"]).strftime("%Y-%m")] += _int(row["completed_units"])
    ordered_targets = sorted(target_values)
    q1 = ordered_targets[len(ordered_targets) // 4]
    q3 = ordered_targets[(len(ordered_targets) * 3) // 4]
    iqr = q3 - q1
    target_outlier_count = sum(value < q1 - 1.5 * iqr or value > q3 + 1.5 * iqr for value in target_values)
    history_target_pairs = [(sum(values_by_product[row["product_id"]][max(0, dates.index(_date(row["date"])) - 7):dates.index(_date(row["date"]))]) / 7, _int(row["target_next_7d"])) for row in train_rows]
    chart_names = _write_eda_charts(out, train_daily, category_totals, history_target_pairs)
    eda = {
        "period": {"start": SIMULATION_START.isoformat(), "end": SIMULATION_END.isoformat(), "calendar_timezone": CALENDAR_TIMEZONE},
        "training_period_only": True,
        "daily_sales": {"rows": len(train_daily), "total_units": sum(_int(row["completed_units"]) for row in train_daily), "mean_product_day": sum(_int(row["completed_units"]) for row in train_daily) / len(train_daily), "zero_sales_product_days": sum(_int(row["completed_units"]) == 0 for row in train_daily)},
        "category_units": dict(sorted(category_totals.items())), "weekday_units": dict(sorted(weekday_totals.items())), "weekday_vs_weekend_units": {"weekday": sum(value for name, value in weekday_totals.items() if name not in {"Saturday", "Sunday"}), "weekend": sum(value for name, value in weekday_totals.items() if name in {"Saturday", "Sunday"})}, "month_units_training_only": dict(sorted(month_totals.items())), "month_units_all_period_descriptive_only": dict(sorted(all_month_totals.items())), "product_turnover_top5_training": [{"product_id": product, "completed_units": units} for product, units in product_totals.most_common(5)],
        "target_next_7d": {"count": len(target_values), "min": min(target_values), "max": max(target_values), "mean": sum(target_values) / len(target_values), "zero_targets": sum(value == 0 for value in target_values)},
        "target_outliers_training": {"q1": q1, "q3": q3, "iqr": iqr, "count_by_1_5_iqr": target_outlier_count},
        "stockouts": {"censored_product_days": sum(row["stockout_censored"] for row in raw_rows if _date(row["date"]) <= TRAIN_END), "all_period_censored_product_days": sum(row["stockout_censored"] for row in raw_rows)},
        "store_closure_dates": sorted(day.isoformat() for day in closed_dates),
        "recent_history_vs_target": {"pairs": len(history_target_pairs), "mean_recent_7d": sum(pair[0] for pair in history_target_pairs) / len(history_target_pairs), "mean_target": sum(pair[1] for pair in history_target_pairs) / len(history_target_pairs)},
        "charts": chart_names,
        "interpretations": ["Completed units are zero-inflated at the product-day level.", "Category and month totals reflect the seeded synthetic operating schedule, not real demand seasonality.", "Recent seven-day sales are descriptive predictors; correlation or model accuracy is intentionally not estimated in Phase D.1."],
    }
    _json_write(out / "eda_statistics.json", eda)
    split = {
        "strategy": "chronological product-day split with seven-day label-availability and target-window purges",
        "warmup_days": WARMUP_DAYS, "horizon_days": HORIZON,
        "train": {"start": (SIMULATION_START + timedelta(days=WARMUP_DAYS)).isoformat(), "end": TRAIN_END.isoformat(), "samples": len([row for row in ml_rows if row["split"] == "train"])},
        "validation": {"start": VALIDATION_START.isoformat(), "end": VALIDATION_END.isoformat(), "samples": len([row for row in ml_rows if row["split"] == "validation"])},
        "test": {"start": TEST_START.isoformat(), "end": TEST_END.isoformat(), "samples": len([row for row in ml_rows if row["split"] == "test"])},
        "purged_or_warmup_dates": sorted({row["date"] for row in feature_rows if row["split"] == "purged_or_warmup"}),
        "target_windows_do_not_overlap": True,
    }
    _json_write(out / "temporal_split.json", split)
    _json_write(out / "quality_report.json", {"valid": True, "source": "SYNTHETIC", "original_product_day_observations": len(raw_rows), "complete_labeled_observations": len(feature_rows), "usable_ml_samples": len(ml_rows), "missing_product_days": 0, "zero_sales_is_observed": True, "excluded_observations": {"historical_warmup": EXPECTED_PRODUCTS * WARMUP_DAYS, "target_horizon": EXPECTED_PRODUCTS * HORIZON, "temporal_purge": len(feature_rows) - len(ml_rows) - EXPECTED_PRODUCTS * WARMUP_DAYS}, "stockout_censored_observations_retained_as_flags": True, "errors": []})
    _json_write(out / "data_dictionary.json", {"raw_columns": {name: description for name, description in {"date": "Calendar cutoff date", "product_id": "Stable synthetic product identifier", "category": "Observable product category", "completed_units": "Completed sale units on the date", "potential_units": "Synthetic potential demand diagnostic, not used as a feature", "unfulfilled_units": "Potential demand not completed because of stock, diagnostic only", "observation_status": "Observed sale or observed zero status", "stockout_censored": "Flag derived from unfulfilled_units > 0", "store_closed": "Flag for dates with zero potential demand across products", "source": "Synthetic provenance"}.items()}, "feature_columns": {name: "Historical feature available at cutoff t" for name in FEATURE_COLUMNS}, "target_next_7d": "Completed sales units on t+1 through t+7 inclusive; excludes t"})
    _json_write(out / "preprocessing_plan.json", {"numerical": [name for name in FEATURE_COLUMNS if name not in {"category", "unit_of_measure", "historical_demand_class"}], "categorical": ["category", "unit_of_measure", "historical_demand_class"], "identifier": ["product_id"], "missing_values": "Fail quality checks for required raw fields; fit training-only imputers only if Phase D.2 introduces missing engineered features.", "scaling": "StandardScaler for numerical variables where the selected model requires it.", "encoding": "OneHotEncoder(handle_unknown='ignore') for categorical variables.", "outliers": "Inspect training-period IQR; do not clip without a model-specific decision."})
    input_hashes = {name: _sha256(root / name) for name in ["products.csv", "daily_product_sales.csv", "daily_product_targets.csv", "sale_items.csv", "sales.csv", "inventory_movements.csv", "simulation_manifest.json"]}
    metadata = {"dataset_version": APF3_VERSION, "source_manifest_batch_id": manifest["batch_id"], "source": "SYNTHETIC", "observation_unit": "one product per calendar day", "target": "completed sales units over t+1 through t+7", "calendar_timezone": CALENDAR_TIMEZONE, "input_sha256": input_hashes, "outputs": {name: _sha256(out / name) for name in D1_OUTPUT_FILES}}
    _json_write(out / "dataset_metadata.json", metadata)
    return {"output": str(out), "original_product_day_observations": len(raw_rows), "complete_labeled_observations": len(feature_rows), "usable_ml_samples": len(ml_rows), "feature_columns": FEATURE_COLUMNS, "split": split, "metadata": metadata}


def _write_eda_charts(output, train_rows, category_totals, history_target_pairs):
    """Write deterministic, training-only EDA charts without fitting models."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    names = ["daily_sales_distribution.png", "sales_by_category.png", "history_vs_target.png"]
    quantities = [_int(row["completed_units"]) for row in train_rows]
    figure, axis = plt.subplots(figsize=(8, 4.5))
    axis.hist(quantities, bins=range(0, max(quantities) + 2), color="#386cb0", edgecolor="white", align="left")
    axis.set(title="Training product-day completed sales", xlabel="Completed units", ylabel="Product-day observations")
    figure.tight_layout(); figure.savefig(output / names[0], dpi=140); plt.close(figure)

    figure, axis = plt.subplots(figsize=(9, 4.5))
    ordered = sorted(category_totals.items(), key=lambda item: (-item[1], item[0]))
    axis.bar([item[0] for item in ordered], [item[1] for item in ordered], color="#2ca25f")
    axis.tick_params(axis="x", rotation=35); axis.set(title="Training completed units by category", ylabel="Units")
    figure.tight_layout(); figure.savefig(output / names[1], dpi=140); plt.close(figure)

    figure, axis = plt.subplots(figsize=(6, 5))
    axis.scatter([pair[0] for pair in history_target_pairs], [pair[1] for pair in history_target_pairs], s=8, alpha=0.35, color="#de2d26")
    axis.set(title="Recent history versus next-seven-day target", xlabel="Mean completed units in prior 7 days", ylabel="Target units t+1...t+7")
    figure.tight_layout(); figure.savefig(output / names[2], dpi=140); plt.close(figure)
    return names


def prepare(rows, coverage_start=None, coverage_end=None):
    totals = defaultdict(int)
    seen = defaultdict(set)
    for row in rows:
        try:
            product = row["product_id"].strip()
            day = date.fromisoformat(row["date"][:10])
            quantity = int(row["quantity"])
        except (KeyError, TypeError, ValueError):
            continue
        if product and quantity > 0:
            totals[(product, day)] += quantity
            seen[product].add(day)
    result = []
    for product, days in sorted(seen.items()):
        start = date.fromisoformat(coverage_start) if coverage_start else min(days)
        end = date.fromisoformat(coverage_end) if coverage_end else max(days)
        if end < start:
            continue
        current = start
        while current <= end:
            # This interval is observed by contract; outside it we preserve missingness.
            result.append({"date": current.isoformat(), "product_id": product, "quantity": totals.get((product, current), 0), "source": "REAL"})
            current += timedelta(days=1)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--coverage-start")
    parser.add_argument("--coverage-end")
    parser.add_argument("--apf3", action="store_true")
    parser.add_argument("--source", default="ml/data/simulation-v1")
    parser.add_argument("--artifact-dir", default="ml/artifacts/apf3")
    args = parser.parse_args()
    if args.apf3:
        print(json.dumps(prepare_apf3(args.source, args.artifact_dir), indent=2, sort_keys=True))
        return
    if not args.input or not args.output:
        parser.error("--input and --output are required unless --apf3 is used")
    with open(args.input, newline="", encoding="utf-8") as stream:
        rows = prepare(csv.DictReader(stream), args.coverage_start, args.coverage_end)
    with open(args.output, "w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["date", "product_id", "quantity", "source"])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
