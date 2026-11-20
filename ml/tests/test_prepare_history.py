import copy
import json
from datetime import date
from pathlib import Path
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parents[1]))

import pytest

from prepare_history import CanonicalDataError, _validate_records, prepare_history, prepare_history_records


SOURCE = "ml/data/simulation-v1"
PRODUCT_ID = "6ce5d35d-c954-5f70-8e79-d1046a3b3475"


def _source_records():
    root = Path(SOURCE)
    read = lambda name: list(__import__("csv").DictReader((root / name).open(newline="", encoding="utf-8")))
    return {"products": read("products.csv"), "sales": read("sales.csv"), "sale_items": read("sale_items.csv"), "daily_product_sales": read("daily_product_sales.csv"), "inventory_movements": read("inventory_movements.csv"), "manifest": json.loads((root / "simulation_manifest.json").read_text(encoding="utf-8"))}


def _validated(records):
    return _validate_records(records, date(2026, 8, 1), date(2026, 10, 31))


def test_reconstructed_features_match_existing_apf3_demo():
    result = prepare_history(SOURCE, date(2026, 10, 31), PRODUCT_ID)
    row = result["rows"][0]
    expected = json.loads(Path("ml/artifacts/apf3/future_inference_input.json").read_text(encoding="utf-8"))
    for name in result["features"]:
        if isinstance(expected[name], float):
            assert row[name] == pytest.approx(expected[name], abs=1e-8)
        else:
            assert row[name] == expected[name]
    assert result["eligibility"][PRODUCT_ID] == "SUFFICIENT_HISTORY"


def test_zero_sales_days_are_observed_not_fabricated():
    result = prepare_history(SOURCE, date(2026, 10, 31), PRODUCT_ID)
    records = _source_records()
    product_days = [row for row in records["daily_product_sales"] if row["product_id"] == PRODUCT_ID and row["completed_units"] == "0"]
    assert product_days
    assert result["rows"][0]["rolling_mean_14"] == pytest.approx(0.71428571, abs=1e-8)


def test_missing_calendar_observation_is_rejected():
    records = _source_records()
    records["daily_product_sales"] = [row for row in records["daily_product_sales"] if not (row["product_id"] == PRODUCT_ID and row["date"] == "2026-10-30")]
    result = prepare_history_records(records, date(2026, 10, 31), PRODUCT_ID)
    assert result["eligibility"][PRODUCT_ID] == "MISSING_OBSERVATIONS"
    assert result["rows"] == []


def test_incomplete_history_is_reported_without_features():
    result = prepare_history(SOURCE, date(2026, 8, 10), PRODUCT_ID)
    assert result["eligibility"][PRODUCT_ID] == "INSUFFICIENT_HISTORY"
    assert result["rows"] == []


def test_invalid_product_reference_and_stock_consistency_fail():
    records = _source_records()
    records["sale_items"][0]["product_id"] = "00000000-0000-4000-8000-000000000099"
    with pytest.raises(CanonicalDataError, match="Unknown product reference"):
        _validated(records)

    records = _source_records()
    records["inventory_movements"][0]["previous_stock"] = "99"
    result = prepare_history_records(records, date(2026, 10, 31), records["inventory_movements"][0]["product_id"])
    assert result["eligibility"][records["inventory_movements"][0]["product_id"]] == "INVALID_STOCK_HISTORY"


def test_cutoff_does_not_use_future_dates_and_output_is_deterministic():
    first = prepare_history(SOURCE, date(2026, 10, 24))
    second = prepare_history(SOURCE, date(2026, 10, 24))
    assert first == second
    assert all(row["date"] == "2026-10-24" for row in first["rows"])
    assert first["history_end"] == "2026-10-24"


def test_future_changes_do_not_change_features_before_cutoff():
    original = _source_records()
    altered = copy.deepcopy(original)
    target_day = "2026-10-25"
    target_product = PRODUCT_ID
    daily = next(row for row in altered["daily_product_sales"] if row["product_id"] == target_product and row["date"] == target_day)
    daily["completed_units"] = str(int(daily["completed_units"]) + 1)
    daily["potential_units"] = str(int(daily["potential_units"]) + 1)
    sale_ids = {
        row["id"]
        for row in altered["sales"]
        if datetime.fromisoformat(row["created_at"]).astimezone(ZoneInfo("America/Lima")).date().isoformat() == target_day
    }
    item = next(row for row in altered["sale_items"] if row["product_id"] == target_product and row["sale_id"] in sale_ids)
    item["quantity"] = str(int(item["quantity"]) + 1)
    before = prepare_history_records(original, date(2026, 10, 24), target_product)
    after = prepare_history_records(altered, date(2026, 10, 24), target_product)
    assert before["rows"] == after["rows"]


def test_synthetic_provenance_is_required():
    records = _source_records()
    records["manifest"]["source"] = "REAL"
    with pytest.raises(CanonicalDataError, match="SYNTHETIC"):
        _validated(records)
