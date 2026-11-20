"""Prepare deterministic, synthetic-only APF3 inference history.

This module is deliberately separate from model training and inference. It
validates the canonical commercial export, then delegates feature formulas to
``prepare_dataset._feature_values`` and stock reconstruction to
``prepare_dataset._historical_stock``.
"""
import csv
import hashlib
import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo

try:
    from .prepare_dataset import (
        CALENDAR_TIMEZONE,
        HORIZON,
        SIMULATION_END,
        SIMULATION_START,
        _date_range,
        _feature_values,
        _historical_stock,
    )
    from .train_apf3 import FEATURES
except ImportError:
    from prepare_dataset import CALENDAR_TIMEZONE, HORIZON, SIMULATION_END, SIMULATION_START, _date_range, _feature_values, _historical_stock
    from train_apf3 import FEATURES


HISTORY_STATUS = {
    "SUFFICIENT_HISTORY",
    "INSUFFICIENT_HISTORY",
    "MISSING_OBSERVATIONS",
    "INVALID_STOCK_HISTORY",
    "INVALID_PRODUCT_METADATA",
}
REQUIRED_FILES = (
    "products.csv",
    "sales.csv",
    "sale_items.csv",
    "daily_product_sales.csv",
    "inventory_movements.csv",
    "simulation_manifest.json",
)


class CanonicalDataError(ValueError):
    """Raised when a canonical source cannot be trusted for preparation."""


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def _read_source(source_dir):
    root = Path(source_dir)
    missing = [name for name in REQUIRED_FILES if not (root / name).exists()]
    if missing:
        raise CanonicalDataError(f"Missing canonical files: {', '.join(missing)}")
    manifest = json.loads((root / "simulation_manifest.json").read_text(encoding="utf-8"))
    if manifest.get("source") != "SYNTHETIC":
        raise CanonicalDataError("Only SYNTHETIC canonical sources are accepted")
    if manifest.get("simulation_start") != SIMULATION_START.isoformat() or manifest.get("simulation_end") != SIMULATION_END.isoformat():
        raise CanonicalDataError("Unexpected synthetic calendar period")
    for name, expected_hash in manifest.get("sha256", {}).items():
        path = root / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise CanonicalDataError(f"Synthetic provenance hash mismatch: {name}")
    return {
        "products": _read_csv(root / "products.csv"),
        "sales": _read_csv(root / "sales.csv"),
        "sale_items": _read_csv(root / "sale_items.csv"),
        "daily_product_sales": _read_csv(root / "daily_product_sales.csv"),
        "inventory_movements": _read_csv(root / "inventory_movements.csv"),
        "manifest": manifest,
    }


def _parse_calendar_date(value, field):
    text = str(value)
    try:
        parsed = date.fromisoformat(text)
    except ValueError as error:
        raise CanonicalDataError(f"Invalid calendar date in {field}: {value}") from error
    if parsed.isoformat() != text[:10] or len(text) not in {10}:
        raise CanonicalDataError(f"Calendar date must be YYYY-MM-DD in {field}: {value}")
    return parsed


def _parse_timestamp(value, field):
    try:
        parsed = datetime.fromisoformat(str(value))
        if parsed.tzinfo is None:
            raise ValueError("timezone required")
        return parsed.astimezone(ZoneInfo(CALENDAR_TIMEZONE))
    except (TypeError, ValueError) as error:
        raise CanonicalDataError(f"Invalid timezone-aware timestamp in {field}: {value}") from error


def _parse_uuid(value, field):
    try:
        return str(UUID(str(value)))
    except (AttributeError, ValueError) as error:
        raise CanonicalDataError(f"Invalid product identifier in {field}: {value}") from error


def _positive_int(value, field):
    try:
        parsed = int(str(value))
    except (TypeError, ValueError) as error:
        raise CanonicalDataError(f"Invalid integer in {field}: {value}") from error
    if parsed <= 0:
        raise CanonicalDataError(f"Quantity must be positive in {field}")
    return parsed


def _nonnegative_int(value, field):
    try:
        parsed = int(str(value))
    except (TypeError, ValueError) as error:
        raise CanonicalDataError(f"Invalid integer in {field}: {value}") from error
    if parsed < 0:
        raise CanonicalDataError(f"Quantity must be nonnegative in {field}")
    return parsed


def _validate_records(records, start, end):
    if records.get("manifest", {}).get("source") != "SYNTHETIC":
        raise CanonicalDataError("Only SYNTHETIC canonical manifests are accepted")
    products = records["products"]
    product_ids = []
    product_by_id = {}
    metadata_status = {}
    for row in products:
        product_id = _parse_uuid(row.get("id"), "products.id")
        if product_id in product_by_id:
            raise CanonicalDataError(f"Duplicate product: {product_id}")
        product_ids.append(product_id)
        product_by_id[product_id] = row
        if row.get("source") != "SYNTHETIC" or not row.get("category") or not row.get("unit_of_measure"):
            metadata_status[product_id] = "INVALID_PRODUCT_METADATA"

    expected_dates = _date_range(start, end)
    expected_keys = {(product_id, day) for product_id in product_ids for day in expected_dates}
    daily_by_key = {}
    for row in records["daily_product_sales"]:
        if row.get("source") != "SYNTHETIC":
            raise CanonicalDataError("Daily observations must be SYNTHETIC")
        product_id = _parse_uuid(row.get("product_id"), "daily_product_sales.product_id")
        if product_id not in product_by_id:
            raise CanonicalDataError(f"Unknown product reference in daily observations: {product_id}")
        day = _parse_calendar_date(row.get("date"), "daily_product_sales.date")
        key = (product_id, day)
        if key in daily_by_key:
            raise CanonicalDataError(f"Duplicate daily observation: {product_id} {day}")
        daily_by_key[key] = row
        completed = _nonnegative_int(row.get("completed_units"), "daily_product_sales.completed_units")
        potential = _nonnegative_int(row.get("potential_units"), "daily_product_sales.potential_units")
        unfulfilled = _nonnegative_int(row.get("unfulfilled_units"), "daily_product_sales.unfulfilled_units")
        if potential != completed + unfulfilled:
            raise CanonicalDataError(f"Demand arithmetic mismatch: {product_id} {day}")
    missing = expected_keys - set(daily_by_key)
    out_of_range = {key for key in daily_by_key if key not in expected_keys}
    if out_of_range:
        raise CanonicalDataError("Canonical daily observations contain dates outside the declared calendar")

    sale_by_id = {}
    for row in records["sales"]:
        if row.get("source") != "SYNTHETIC":
            raise CanonicalDataError("Sales must be SYNTHETIC")
        sale_id = row.get("id")
        if not sale_id or sale_id in sale_by_id:
            raise CanonicalDataError(f"Duplicate or missing sale id: {sale_id}")
        timestamp = _parse_timestamp(row.get("created_at"), "sales.created_at")
        if timestamp.date() < start or timestamp.date() > end:
            raise CanonicalDataError(f"Sale timestamp outside canonical calendar: {sale_id}")
        sale_by_id[sale_id] = timestamp

    sale_item_ids = set()
    sales_by_product_day = defaultdict(int)
    for row in records["sale_items"]:
        if row.get("source") != "SYNTHETIC":
            raise CanonicalDataError("Sale items must be SYNTHETIC")
        item_id = row.get("id")
        if not item_id or item_id in sale_item_ids:
            raise CanonicalDataError(f"Duplicate or missing sale item id: {item_id}")
        sale_item_ids.add(item_id)
        sale_id = row.get("sale_id")
        if sale_id not in sale_by_id:
            raise CanonicalDataError(f"Unknown sale reference: {sale_id}")
        product_id = _parse_uuid(row.get("product_id"), "sale_items.product_id")
        if product_id not in product_by_id:
            raise CanonicalDataError(f"Unknown product reference in sale item: {product_id}")
        quantity = _positive_int(row.get("quantity"), "sale_items.quantity")
        sales_by_product_day[(product_id, sale_by_id[sale_id].date())] += quantity

    for key, row in daily_by_key.items():
        if sales_by_product_day[key] != _nonnegative_int(row.get("completed_units"), "completed_units"):
            raise CanonicalDataError(f"Sales aggregation mismatch: {key[0]} {key[1]}")

    movement_ids = set()
    movements_by_product = defaultdict(list)
    for row in records["inventory_movements"]:
        if row.get("source") != "SYNTHETIC":
            raise CanonicalDataError("Inventory movements must be SYNTHETIC")
        movement_id = row.get("id")
        if not movement_id or movement_id in movement_ids:
            raise CanonicalDataError(f"Duplicate or missing movement id: {movement_id}")
        movement_ids.add(movement_id)
        product_id = _parse_uuid(row.get("product_id"), "inventory_movements.product_id")
        if product_id not in product_by_id:
            raise CanonicalDataError(f"Unknown product reference in movement: {product_id}")
        _positive_int(row.get("quantity"), "inventory_movements.quantity")
        previous = _nonnegative_int(row.get("previous_stock"), "inventory_movements.previous_stock")
        resulting = _nonnegative_int(row.get("resulting_stock"), "inventory_movements.resulting_stock")
        movement_date = _parse_timestamp(row.get("created_at"), "inventory_movements.created_at")
        if movement_date.date() < start or movement_date.date() > end:
            raise CanonicalDataError(f"Movement timestamp outside canonical calendar: {movement_id}")
        movements_by_product[product_id].append((movement_date, movement_id, previous, resulting, row))

    invalid_stock = set()
    for product_id, events in movements_by_product.items():
        ordered = sorted(events, key=lambda event: (event[0], event[1]))
        expected_previous = _nonnegative_int(product_by_id[product_id].get("initial_stock", 0), "products.initial_stock")
        for movement_date, _, previous, resulting, _ in ordered:
            if previous != expected_previous:
                invalid_stock.add(product_id)
            expected_previous = resulting
        if ordered and ordered[-1][3] != _nonnegative_int(product_by_id[product_id].get("current_stock"), "products.current_stock"):
            invalid_stock.add(product_id)
    for product_id, product in product_by_id.items():
        if not movements_by_product[product_id] and _nonnegative_int(product.get("current_stock"), "products.current_stock") != _nonnegative_int(product.get("initial_stock", 0), "products.initial_stock"):
            invalid_stock.add(product_id)

    return product_ids, product_by_id, metadata_status, daily_by_key, movements_by_product, invalid_stock


def prepare_history_records(records, cutoff=SIMULATION_END, product_id=None):
    """Prepare APF3 features from already loaded canonical synthetic records."""
    start = _parse_calendar_date(records["manifest"]["simulation_start"], "manifest.simulation_start")
    end = _parse_calendar_date(records["manifest"]["simulation_end"], "manifest.simulation_end")
    if cutoff < start or cutoff > end:
        raise CanonicalDataError("Cutoff must be inside the canonical calendar")
    product_ids, product_by_id, metadata_status, daily_by_key, movements_by_product, invalid_stock = _validate_records(records, start, end)
    if product_id is not None:
        product_id = _parse_uuid(product_id, "product_id")
        if product_id not in product_by_id:
            raise CanonicalDataError(f"Unknown product_id: {product_id}")
        selected = [product_id]
    else:
        selected = sorted(product_ids)

    dates = _date_range(start, cutoff)
    history_index = len(dates) - 1
    stock_rows = [
        {"product_id": product_id, "created_at": event[0].isoformat(), "id": event[1], "resulting_stock": str(event[3])}
        for product_id, events in movements_by_product.items()
        for event in events
    ]
    stock = _historical_stock(stock_rows, product_ids, dates)
    rows = []
    eligibility = {}
    for current_product_id in selected:
        status = metadata_status.get(current_product_id)
        if status is None and current_product_id in invalid_stock:
            status = "INVALID_STOCK_HISTORY"
        if status is None and history_index < 14:
            status = "INSUFFICIENT_HISTORY"
        if status is None:
            for day in dates:
                if (current_product_id, day) not in daily_by_key:
                    status = "MISSING_OBSERVATIONS"
                    break
        if status is None:
            status = "SUFFICIENT_HISTORY"
            values = [_nonnegative_int(daily_by_key[(current_product_id, day)].get("completed_units"), "completed_units") for day in dates]
            product = product_by_id[current_product_id]
            features = _feature_values(
                values,
                history_index,
                stock,
                current_product_id,
                cutoff,
                product["category"],
                product["unit_of_measure"],
            )
            rows.append({"date": cutoff.isoformat(), "product_id": current_product_id, "source": "SYNTHETIC", **features})
        eligibility[current_product_id] = status

    return {
        "source": "SYNTHETIC",
        "calendar_timezone": CALENDAR_TIMEZONE,
        "history_start": start.isoformat(),
        "history_end": cutoff.isoformat(),
        "cutoff_date": cutoff.isoformat(),
        "horizon_days": HORIZON,
        "features": list(FEATURES),
        "eligibility": eligibility,
        "rows": sorted(rows, key=lambda row: row["product_id"]),
    }


def prepare_history(source_dir="ml/data/simulation-v1", cutoff=SIMULATION_END, product_id=None):
    """Return APF3 feature rows and per-product eligibility from synthetic history."""
    return prepare_history_records(_read_source(source_dir), cutoff, product_id)


if __name__ == "__main__":
    result = prepare_history()
    print(json.dumps(result, indent=2, sort_keys=True))
