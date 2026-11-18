"""Generate and validate a deterministic local commercial simulation.

This module is deliberately isolated from the application and database. It uses
the Phase A catalog as its only product source and keeps potential demand separate
from completed sales so stockouts do not become fabricated revenue.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import shutil
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from simulation.phase_a_catalog import CATALOG, CATALOG_NAMESPACE
from simulation.phase_a_rules import CATEGORY_COUNT, PRODUCT_COUNT, SEED, SIMULATION_END, SIMULATION_START

GENERATOR_VERSION = "simulation-v1.1.0"
OUTPUT_DEFAULT = Path("ml/data/simulation-v1")
SOURCE = "SYNTHETIC"
PAYMENT_METHODS = ("CASH", "YAPE", "PLIN", "OTHER")
MOVEMENT_TYPES = ("IN", "OUT")
MOVEMENT_REASONS = ("PURCHASE", "SALE", "WASTE")
SUPPLIER_NAMES = (
    "Distribuidora Lima Norte", "Abarrotes El Mayorista", "Bebidas del Barrio",
    "Lácteos Santa Rosa", "Refrigerados San Miguel", "Limpieza Hogar Perú",
    "Snacks y Galletas Andinas", "Panadería La Esquina", "Comercial San Martín",
    "Provisiones Central",
)
SUPPLIER_SCHEDULES = ((0,), (1,), (2,), (3,), (4,), (5,), (0, 3), (1, 4), (2, 5), (4,))
PRICE_PROFILES = {
    "Abarrotes": ((380, 490), (420, 550), (850, 1050), (420, 550), (320, 420), (500, 650), (180, 250), (350, 480)),
    "Bebidas": ((180, 250), (350, 500), (350, 500), (300, 450), (550, 750), (450, 650), (250, 400)),
    "Lácteos": ((450, 600), (750, 950), (300, 450), (500, 700), (450, 650), (180, 300), (350, 500)),
    "Snacks": ((280, 400), (150, 250), (350, 550), (120, 220), (180, 300), (10, 20), (10, 30)),
    "Limpieza": ((550, 750), (650, 900), (380, 550), (300, 450), (80, 150), (100, 180), (450, 650)),
    "Cuidado personal": ((250, 400), (1300, 1800), (500, 750), (800, 1200), (750, 1100), (250, 400)),
    "Conservas": ((400, 550), (350, 500), (250, 380), (450, 650), (550, 800), (220, 350)),
    "Refrigerados": ((650, 850), (900, 1150), (650, 900), (1100, 1450), (750, 1000), (850, 1100)),
    "Panadería": ((20, 40), (50, 100), (250, 400), (180, 300), (250, 450), (30, 60)),
}
CATEGORY_FACTORS = {
    "Abarrotes": 1.05, "Bebidas": 1.30, "Lácteos": 0.95, "Snacks": 1.20,
    "Limpieza": 0.55, "Cuidado personal": 0.42, "Conservas": 0.52,
    "Refrigerados": 0.72, "Panadería": 0.92,
}
CLASS_FACTORS = {"HIGH": 1.0, "MEDIUM": 0.52, "LOW": 0.08}
CSV_HEADERS = {
    "products.csv": ["id", "name", "category", "unit_of_measure", "selling_price", "purchase_cost", "initial_stock", "current_stock", "minimum_stock", "source"],
    "suppliers.csv": ["id", "name", "phone", "contact", "is_active", "source"],
    "sales.csv": ["id", "payment_method", "subtotal", "total", "created_at", "source"],
    "sale_items.csv": ["id", "sale_id", "product_id", "product_name", "quantity", "unit_price", "line_total", "source"],
    "purchases.csv": ["id", "supplier_id", "supplier_name", "subtotal", "total", "created_at", "source"],
    "purchase_items.csv": ["id", "purchase_id", "product_id", "product_name", "quantity", "unit_cost", "line_total", "source"],
    "inventory_movements.csv": ["id", "product_id", "type", "reason", "quantity", "previous_stock", "resulting_stock", "sale_id", "purchase_id", "created_at", "source"],
    "event_ledger.csv": ["event_id", "event_type", "transaction_id", "event_date", "product_id", "quantity", "unit_amount_cents", "line_total_cents", "source"],
    "daily_product_sales.csv": ["date", "product_id", "completed_units", "potential_units", "unfulfilled_units", "observation_status", "source"],
    "daily_product_targets.csv": ["date", "product_id", "target_7d", "target_status", "source"],
}
DATA_FILES = {
    "products": "products.csv", "suppliers": "suppliers.csv", "sales": "sales.csv", "sale_items": "sale_items.csv",
    "purchases": "purchases.csv", "purchase_items": "purchase_items.csv", "inventory_movements": "inventory_movements.csv",
    "event_ledger": "event_ledger.csv", "daily_product_sales": "daily_product_sales.csv", "daily_product_targets": "daily_product_targets.csv",
}


def stable_id(kind: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"{CATALOG_NAMESPACE}/{GENERATOR_VERSION}/{kind}/{value}"))


def money(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


def parse_money(value: str) -> int:
    whole, fractional = value.split(".")
    if len(fractional) != 2:
        raise ValueError(f"Invalid two-decimal amount: {value}")
    return int(whole) * 100 + int(fractional)


def iso_timestamp(day: date, hour: int, minute: int) -> str:
    return datetime.combine(day, time(hour, minute), tzinfo=timezone.utc).isoformat()


def make_products() -> list[dict[str, object]]:
    category_indexes = Counter()
    rows = []
    for product in CATALOG:
        category_indexes[product.category] += 1
        profile = PRICE_PROFILES[product.category][category_indexes[product.category] - 1]
        cost_cents, sale_cents = profile
        rows.append({
            "id": product.id, "name": product.name, "category": product.category,
            "unit_of_measure": product.unit_of_measure, "selling_price": money(sale_cents),
            "purchase_cost": money(cost_cents), "initial_stock": 0, "current_stock": 0,
            "minimum_stock": product.minimum_stock, "source": SOURCE,
        })
    return rows


def make_suppliers() -> list[dict[str, object]]:
    return [{"id": stable_id("supplier", str(index)), "name": name, "phone": None, "contact": None, "is_active": True, "source": SOURCE} for index, name in enumerate(SUPPLIER_NAMES, 1)]


def base_demand(product: object) -> float:
    return CLASS_FACTORS[product.demand_class] * CATEGORY_FACTORS[product.category]


def demand_weight(product: object, day: date, rng: random.Random) -> float:
    weekend = 1.22 if day.weekday() >= 5 else 1.0
    weekday = {0: 0.92, 1: 0.96, 2: 1.0, 3: 1.02, 4: 1.10, 5: 1.22, 6: 0.92}[day.weekday()]
    month = {8: 1.0, 9: 0.94, 10: 1.08}[day.month]
    return max(0.001, base_demand(product) * weekend * weekday * month * rng.uniform(0.72, 1.28))


def daily_ticket_count(day: date, rng: random.Random) -> int:
    if day.weekday() == 6 and day.day in {9, 23}:
        return 0
    if day.weekday() == 6 and rng.random() < 0.22:
        return 0
    means = {0: 10.0, 1: 10.3, 2: 10.7, 3: 11.0, 4: 12.2, 5: 14.5, 6: 6.2}
    month_factor = {8: 1.0, 9: 0.94, 10: 1.08}[day.month]
    mean = means[day.weekday()] * month_factor
    if rng.random() < 0.08:
        return max(1, round(rng.gauss(mean * 0.45, 1.2)))
    return max(0, round(rng.gauss(mean, max(1.4, mean * 0.24))))


def choose_demand_items(products: list[dict[str, object]], catalog_by_id: dict[str, object], day: date, rng: random.Random, count: int) -> list[tuple[str, int]]:
    selected: list[tuple[str, int]] = []
    for _ in range(count):
        choices = [product for product in products if product["id"] not in {item[0] for item in selected}]
        if not choices:
            break
        product = rng.choices(choices, weights=[demand_weight(catalog_by_id[p["id"]], day, rng) for p in choices], k=1)[0]
        quantity = 1 if rng.random() < 0.86 else 2
        selected.append((product["id"], quantity))
    return selected


def append_purchase(purchases, purchase_items, movements, ledger, product_rows, suppliers, stock, quantities, day, sequence, supplier_index, timestamp_minute):
    if not quantities:
        return sequence
    supplier = suppliers[supplier_index % len(suppliers)]
    purchase_id = stable_id("purchase", str(sequence))
    created_at = iso_timestamp(day, 6, timestamp_minute)
    subtotal = 0
    for product_id, quantity in sorted(quantities):
        product = next(row for row in product_rows if row["id"] == product_id)
        unit_cost = parse_money(product["purchase_cost"])
        line_total = quantity * unit_cost
        subtotal += line_total
        item_id = stable_id("purchase-item", f"{sequence}/{product_id}")
        previous = stock[product_id]
        stock[product_id] += quantity
        purchase_items.append({"id": item_id, "purchase_id": purchase_id, "product_id": product_id, "product_name": product["name"], "quantity": quantity, "unit_cost": money(unit_cost), "line_total": money(line_total), "source": SOURCE})
        movements.append({"id": stable_id("movement", item_id), "product_id": product_id, "type": "IN", "reason": "PURCHASE", "quantity": quantity, "previous_stock": previous, "resulting_stock": stock[product_id], "sale_id": None, "purchase_id": purchase_id, "created_at": created_at, "source": SOURCE})
        ledger.append({"event_id": stable_id("ledger", item_id), "event_type": "PURCHASE_ITEM", "transaction_id": purchase_id, "event_date": day.isoformat(), "product_id": product_id, "quantity": quantity, "unit_amount_cents": unit_cost, "line_total_cents": line_total, "source": SOURCE})
    purchases.append({"id": purchase_id, "supplier_id": supplier["id"], "supplier_name": supplier["name"], "subtotal": money(subtotal), "total": money(subtotal), "created_at": created_at, "source": SOURCE})
    return sequence + 1


def append_waste(movements, ledger, stock, product_id, quantity, day, sequence, timestamp_minute):
    if stock[product_id] < quantity:
        return
    movement_id = stable_id("waste-movement", f"{sequence}/{product_id}")
    previous = stock[product_id]
    stock[product_id] -= quantity
    created_at = iso_timestamp(day, 20, timestamp_minute)
    movements.append({"id": movement_id, "product_id": product_id, "type": "OUT", "reason": "WASTE", "quantity": quantity, "previous_stock": previous, "resulting_stock": stock[product_id], "sale_id": None, "purchase_id": None, "created_at": created_at, "source": SOURCE})
    ledger.append({"event_id": stable_id("ledger", movement_id), "event_type": "WASTE", "transaction_id": movement_id, "event_date": day.isoformat(), "product_id": product_id, "quantity": quantity, "unit_amount_cents": 0, "line_total_cents": 0, "source": SOURCE})


def generate() -> dict[str, list[dict[str, object]]]:
    rng = random.Random(SEED)
    products = make_products()
    suppliers = make_suppliers()
    catalog_by_id = {product.id: product for product in CATALOG}
    product_by_id = {product["id"]: product for product in products}
    supplier_for_product = {product.id: (index - 1) % len(suppliers) for index, product in enumerate(CATALOG, 1)}
    stock = {product["id"]: 0 for product in products}
    sales, sale_items, purchases, purchase_items, movements, ledger = [], [], [], [], [], []
    daily_demand = defaultdict(lambda: {"potential": 0, "completed": 0, "unfulfilled": 0})
    stockout_products = defaultdict(set)
    purchase_sequence = 1
    opening = [(product["id"], catalog_by_id[product["id"]].initial_stock) for product in products]
    midpoint = len(opening) // 2
    purchase_sequence = append_purchase(purchases, purchase_items, movements, ledger, products, suppliers, stock, opening[:midpoint], SIMULATION_START, purchase_sequence, 0, 0)
    purchase_sequence = append_purchase(purchases, purchase_items, movements, ledger, products, suppliers, stock, opening[midpoint:], SIMULATION_START, purchase_sequence, 1, 15)
    sale_sequence = 1
    current = SIMULATION_START
    while current <= SIMULATION_END:
        # Each supplier has one or two delivery weekdays. Orders are only placed
        # on those days, which creates lead-time pressure without fake purchases.
        for supplier_index, schedule in enumerate(SUPPLIER_SCHEDULES):
            if current.weekday() not in schedule:
                continue
            candidates = []
            for product in products:
                if supplier_for_product[product["id"]] != supplier_index:
                    continue
                spec = catalog_by_id[product["id"]]
                expected = base_demand(spec) * (1.18 if current.weekday() >= 5 else 1.0)
                reorder_point = spec.minimum_stock
                if stock[product["id"]] <= reorder_point:
                    target = spec.minimum_stock + max(1, round(expected * 2.0))
                    candidates.append((product["id"], max(1, target - stock[product["id"]])))
            if candidates:
                purchase_sequence = append_purchase(purchases, purchase_items, movements, ledger, products, suppliers, stock, candidates, current, purchase_sequence, supplier_index, 20 + supplier_index)
        ticket_count = daily_ticket_count(current, rng)
        for ticket_index in range(ticket_count):
            item_count = 1 if rng.random() < 0.56 else (2 if rng.random() < 0.82 else 3)
            planned = choose_demand_items(products, catalog_by_id, current, rng, item_count)
            completed = []
            for product_id, quantity in planned:
                daily_demand[(current, product_id)]["potential"] += quantity
                available = min(quantity, stock[product_id])
                if available:
                    completed.append((product_id, available))
                    daily_demand[(current, product_id)]["completed"] += available
                    stock[product_id] -= available
                if available < quantity:
                    daily_demand[(current, product_id)]["unfulfilled"] += quantity - available
                    stockout_products[current].add(product_id)
            if not completed:
                continue
            sale_id = stable_id("sale", str(sale_sequence))
            elapsed = 35 + ticket_index * 7
            created_at = iso_timestamp(current, 8 + elapsed // 60, elapsed % 60)
            subtotal = 0
            for item_index, (product_id, quantity) in enumerate(completed, 1):
                product = product_by_id[product_id]
                unit_price = parse_money(product["selling_price"])
                line_total = quantity * unit_price
                subtotal += line_total
                item_id = stable_id("sale-item", f"{sale_sequence}/{item_index}")
                # The demand pass already decremented stock; movement records the
                # same transition using the pre-sale balance reconstructed here.
                previous = stock[product_id] + quantity
                sale_items.append({"id": item_id, "sale_id": sale_id, "product_id": product_id, "product_name": product["name"], "quantity": quantity, "unit_price": money(unit_price), "line_total": money(line_total), "source": SOURCE})
                movements.append({"id": stable_id("movement", item_id), "product_id": product_id, "type": "OUT", "reason": "SALE", "quantity": quantity, "previous_stock": previous, "resulting_stock": stock[product_id], "sale_id": sale_id, "purchase_id": None, "created_at": created_at, "source": SOURCE})
                ledger.append({"event_id": stable_id("ledger", item_id), "event_type": "SALE_ITEM", "transaction_id": sale_id, "event_date": current.isoformat(), "product_id": product_id, "quantity": quantity, "unit_amount_cents": unit_price, "line_total_cents": line_total, "source": SOURCE})
            sales.append({"id": sale_id, "payment_method": PAYMENT_METHODS[sale_sequence % len(PAYMENT_METHODS)], "subtotal": money(subtotal), "total": money(subtotal), "created_at": created_at, "source": SOURCE})
            sale_sequence += 1
        for product_id in sorted(stockout_products.get(current, set())):
            if catalog_by_id[product_id].category == "Refrigerados" and stock[product_id] > catalog_by_id[product_id].minimum_stock * 2 and rng.random() < 0.12:
                append_waste(movements, ledger, stock, product_id, 1, current, sale_sequence, 50)
        current += timedelta(days=1)
    for product in products:
        product["current_stock"] = stock[product["id"]]
    daily_rows, target_rows = [], []
    all_days = [SIMULATION_START + timedelta(days=i) for i in range((SIMULATION_END - SIMULATION_START).days + 1)]
    for day in all_days:
        open_day = any(key[0] == day and value["potential"] > 0 for key, value in daily_demand.items()) or day.weekday() != 6
        for product in products:
            record = daily_demand[(day, product["id"])]
            if day.weekday() == 6 and not open_day:
                status = "CLOSED"
            elif record["unfulfilled"] > 0:
                status = "STOCKOUT_CENSORED"
            elif record["completed"] > 0:
                status = "OBSERVED_SALE"
            else:
                status = "OBSERVED_ZERO"
            daily_rows.append({"date": day.isoformat(), "product_id": product["id"], "completed_units": record["completed"], "potential_units": record["potential"], "unfulfilled_units": record["unfulfilled"], "observation_status": status, "source": SOURCE})
    completed_lookup = {(row["date"], row["product_id"]): row["completed_units"] for row in daily_rows}
    for day in all_days[:-7]:
        for product in products:
            target = sum(completed_lookup[((day + timedelta(days=offset)).isoformat(), product["id"])] for offset in range(1, 8))
            target_rows.append({"date": day.isoformat(), "product_id": product["id"], "target_7d": target, "target_status": "COMPLETE", "source": SOURCE})
    ledger.sort(key=lambda row: (row["event_date"], row["event_type"], row["transaction_id"], row["product_id"]))
    return {"products": products, "suppliers": suppliers, "sales": sales, "sale_items": sale_items, "purchases": purchases, "purchase_items": purchase_items, "inventory_movements": movements, "event_ledger": ledger, "daily_product_sales": daily_rows, "daily_product_targets": target_rows}


def write_csv(path: Path, rows: list[dict[str, object]], headers: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def validate(data: dict[str, list[dict[str, object]]]) -> dict[str, object]:
    errors = []
    products = data["products"]
    product_ids = {row["id"] for row in products}
    supplier_ids = {row["id"] for row in data["suppliers"]}
    if len(products) != PRODUCT_COUNT or len(product_ids) != PRODUCT_COUNT: errors.append("catalog product count or IDs invalid")
    if len({row["category"] for row in products}) != CATEGORY_COUNT: errors.append("category count invalid")
    if not 8 <= len(supplier_ids) <= 12: errors.append("supplier count outside 8-12")
    if any(row.get("source") != SOURCE for rows in data.values() for row in rows): errors.append("non-synthetic provenance")
    for product in products:
        try:
            cost, price = parse_money(product["purchase_cost"]), parse_money(product["selling_price"])
            if cost <= 0 or price <= cost or product["unit_of_measure"] not in {"UNIT", "KG", "LITER", "BOX", "PACK"}: errors.append("invalid product price or unit")
        except (ValueError, TypeError): errors.append("invalid product money")
    sale_ids = {row["id"] for row in data["sales"]}; purchase_ids = {row["id"] for row in data["purchases"]}
    item_ids = {row["id"] for row in data["sale_items"]} | {row["id"] for row in data["purchase_items"]}
    movement_ids = {row["id"] for row in data["inventory_movements"]}
    if len(item_ids) != len(data["sale_items"]) + len(data["purchase_items"]): errors.append("duplicate item IDs")
    if len(movement_ids) != len(data["inventory_movements"]): errors.append("duplicate movement IDs")
    if len(data["event_ledger"]) != len(data["sale_items"]) + len(data["purchase_items"]) + sum(row["reason"] == "WASTE" for row in data["inventory_movements"]): errors.append("event ledger cardinality mismatch")
    for row in data["sales"]:
        items = [item for item in data["sale_items"] if item["sale_id"] == row["id"]]
        if len({item["product_id"] for item in items}) != len(items) or not items: errors.append("invalid sale item composition")
        if sum(parse_money(item["line_total"]) for item in items) != parse_money(row["total"]): errors.append("sale total mismatch")
        if row["payment_method"] not in PAYMENT_METHODS: errors.append("invalid payment method")
    for row in data["purchases"]:
        items = [item for item in data["purchase_items"] if item["purchase_id"] == row["id"]]
        if not items or row["supplier_id"] not in supplier_ids: errors.append("invalid purchase reference")
        if sum(parse_money(item["line_total"]) for item in items) != parse_money(row["total"]): errors.append("purchase total mismatch")
    if len(data["daily_product_sales"]) != PRODUCT_COUNT * 92 or len({(row["date"], row["product_id"]) for row in data["daily_product_sales"]}) != len(data["daily_product_sales"]): errors.append("product-day coverage invalid")
    if len(data["daily_product_targets"]) != PRODUCT_COUNT * 85: errors.append("seven-day target coverage invalid")
    target_cutoffs = {row["date"] for row in data["daily_product_targets"]}
    if any(row["date"] > (SIMULATION_END - timedelta(days=7)).isoformat() for row in data["daily_product_targets"]): errors.append("future-incomplete target")
    if len(target_cutoffs) != 85: errors.append("target cutoff dates invalid")
    movements_by_key = {(row["sale_id"] or row["purchase_id"], row["product_id"]): row for row in data["inventory_movements"] if row["reason"] != "WASTE"}
    for item in data["sale_items"]:
        movement = movements_by_key.get((item["sale_id"], item["product_id"]))
        if not movement or movement["type"] != "OUT" or movement["reason"] != "SALE" or movement["quantity"] != item["quantity"]: errors.append("sale movement mismatch")
    for item in data["purchase_items"]:
        movement = movements_by_key.get((item["purchase_id"], item["product_id"]))
        if not movement or movement["type"] != "IN" or movement["reason"] != "PURCHASE" or movement["quantity"] != item["quantity"]: errors.append("purchase movement mismatch")
    last_stock = defaultdict(int); previous_time = ""
    if [row["created_at"] for row in data["inventory_movements"]] != sorted(row["created_at"] for row in data["inventory_movements"]): errors.append("movement output is not chronological")
    for movement in data["inventory_movements"]:
        if not SIMULATION_START.isoformat() <= movement["created_at"][:10] <= SIMULATION_END.isoformat(): errors.append("movement outside date range")
        if movement["created_at"] < previous_time: errors.append("events not chronological")
        previous_time = movement["created_at"]
        expected = movement["previous_stock"] + (movement["quantity"] if movement["type"] == "IN" else -movement["quantity"])
        if movement["previous_stock"] != last_stock[movement["product_id"]] or movement["resulting_stock"] != expected or movement["resulting_stock"] < 0: errors.append("stock movement arithmetic mismatch")
        if movement["type"] not in MOVEMENT_TYPES or movement["reason"] not in MOVEMENT_REASONS or movement["quantity"] <= 0: errors.append("invalid movement")
        last_stock[movement["product_id"]] = movement["resulting_stock"]
    if not all(row["current_stock"] == last_stock[row["id"]] for row in products): errors.append("final stock reconciliation mismatch")
    if any(row["observation_status"] not in {"CLOSED", "OBSERVED_ZERO", "OBSERVED_SALE", "STOCKOUT_CENSORED"} for row in data["daily_product_sales"]): errors.append("invalid observation status")
    if errors: raise ValueError(json.dumps({"valid": False, "errors": errors}, indent=2))
    return {"valid": True, "errors": [], "products": len(products), "categories": len({row["category"] for row in products}), "suppliers": len(supplier_ids), "sales": len(sale_ids), "sale_items": len(data["sale_items"]), "purchases": len(purchase_ids), "purchase_items": len(data["purchase_items"]), "inventory_movements": len(data["inventory_movements"]), "daily_product_rows": len(data["daily_product_sales"]), "target_rows": len(data["daily_product_targets"]), "final_stock_reconciled": True, "source": SOURCE}


def diagnostics(data: dict[str, list[dict[str, object]]]) -> tuple[dict[str, object], dict[str, object]]:
    products = {row["id"]: row for row in data["products"]}; sales = data["sales"]
    by_sale = defaultdict(list)
    for row in data["sale_items"]: by_sale[row["sale_id"]].append(row)
    all_days = [SIMULATION_START + timedelta(days=i) for i in range((SIMULATION_END - SIMULATION_START).days + 1)]
    daily_tickets = Counter({day.isoformat(): 0 for day in all_days}); daily_tickets.update(row["created_at"][:10] for row in sales); daily_revenue = defaultdict(Decimal)
    for row in sales: daily_revenue[row["created_at"][:10]] += Decimal(row["total"])
    category = defaultdict(lambda: {"products": set(), "units": 0, "revenue": Decimal(0)})
    product_units = Counter()
    for row in data["sale_items"]:
        product = products[row["product_id"]]; category[product["category"]]["products"].add(row["product_id"]); category[product["category"]]["units"] += row["quantity"]; category[product["category"]]["revenue"] += Decimal(row["line_total"]); product_units[row["product_id"]] += row["quantity"]
    supplier_frequency = Counter(row["supplier_name"] for row in data["purchases"])
    zero_products = [product["name"] for product in products.values() if product["id"] not in product_units]
    warnings = []
    if len(set(daily_tickets.values())) == 1: warnings.append("daily_ticket_count_is_constant")
    if not zero_products: warnings.append("no_product_has_zero_sales")
    if len({row["created_at"][:10] for row in data["purchases"]}) > 0.90 * 92: warnings.append("purchases_occur_on_more_than_90_percent_of_days")
    if not any(row["unfulfilled_units"] > 0 for row in data["daily_product_sales"]): warnings.append("no_stockout_censored_observations")
    price_ranges = {}
    for category_name in sorted({row["category"] for row in products.values()}):
        rows = [Decimal(row["selling_price"]) for row in products.values() if row["category"] == category_name]
        price_ranges[category_name] = {"min_pen": str(min(rows)), "max_pen": str(max(rows))}
    sales_total = sum(Decimal(row["total"]) for row in sales)
    cogs = sum(Decimal(item["quantity"]) * Decimal(products[item["product_id"]]["purchase_cost"]) for item in data["sale_items"])
    diagnostics_report = {"warnings": warnings, "daily_ticket_counts": {"min": min(daily_tickets.values(), default=0), "max": max(daily_tickets.values(), default=0), "mean": round(sum(daily_tickets.values()) / 92, 4), "distribution": dict(sorted(Counter(daily_tickets.values()).items()))}, "weekly_sales": _period_stats(sales, lambda value: date.fromisoformat(value).isocalendar()[:2]), "monthly_sales": _period_stats(sales, lambda value: value[:7]), "average_ticket_pen": str((sales_total / len(sales)).quantize(Decimal("0.01"))) if sales else "0.00", "average_items_per_sale": round(sum(len(by_sale[row["id"]]) for row in sales) / len(sales), 4) if sales else 0, "price_ranges_by_category": price_ranges, "category_sales": {key: {"products": len(value["products"]), "units": value["units"], "revenue_pen": str(value["revenue"])} for key, value in sorted(category.items())}, "top_products": [{"name": products[key]["name"], "units": units} for key, units in product_units.most_common(10)], "bottom_products": [{"name": products[key]["name"], "units": units} for key, units in sorted(product_units.items(), key=lambda item: item[1])[:10]], "zero_sales_products": zero_products, "supplier_purchase_frequency": dict(sorted(supplier_frequency.items())), "sales_total_pen": str(sales_total), "purchases_total_pen": str(sum(Decimal(row["total"]) for row in data["purchases"])), "cogs_pen": str(cogs), "gross_profit_estimate_pen": str(sales_total - cogs)}
    opening_ids = {row["id"] for row in sorted(data["purchases"], key=lambda row: row["created_at"])[:2]}
    initial_cost = sum(Decimal(item["line_total"]) for item in data["purchase_items"] if item["purchase_id"] in opening_ids); final_cost = sum(Decimal(row["purchase_cost"]) * row["current_stock"] for row in data["products"]); final_retail = sum(Decimal(row["selling_price"]) * row["current_stock"] for row in data["products"])
    stockout_count = sum(row["unfulfilled_units"] > 0 for row in data["daily_product_sales"]); waste = [row for row in data["inventory_movements"] if row["reason"] == "WASTE"]
    stock_report = {"initial_inventory_cost_pen": str(initial_cost), "final_inventory_cost_pen": str(final_cost), "final_inventory_retail_pen": str(final_retail), "final_units": sum(row["current_stock"] for row in data["products"]), "stockout_censored_product_days": stockout_count, "waste_movements": len(waste), "waste_units": sum(row["quantity"] for row in waste), "final_stock_reconciled": True}
    return diagnostics_report, stock_report


def _period_stats(sales, key_function):
    grouped = defaultdict(lambda: {"sales": 0, "revenue_pen": Decimal(0)})
    for row in sales:
        key = str(key_function(row["created_at"][:10])); grouped[key]["sales"] += 1; grouped[key]["revenue_pen"] += Decimal(row["total"])
    return {key: {"sales": value["sales"], "revenue_pen": str(value["revenue_pen"])} for key, value in sorted(grouped.items())}


def write_output(output: Path, data: dict[str, list[dict[str, object]]]) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    for key, filename in DATA_FILES.items(): write_csv(output / filename, data[key], CSV_HEADERS[filename])
    summary = validate(data); commercial, stock = diagnostics(data)
    (output / "validation_summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "commercial_diagnostics.json").write_text(json.dumps(commercial, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "stock_reconciliation.json").write_text(json.dumps(stock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    files = sorted([*DATA_FILES.values(), "validation_summary.json", "commercial_diagnostics.json", "stock_reconciliation.json"])
    manifest = {"generator_version": GENERATOR_VERSION, "batch_id": f"{GENERATOR_VERSION}:{SEED}:{SIMULATION_START.isoformat()}:{SIMULATION_END.isoformat()}", "source": SOURCE, "seed": SEED, "simulation_start": SIMULATION_START.isoformat(), "simulation_end": SIMULATION_END.isoformat(), "catalog_namespace": CATALOG_NAMESPACE, "products": len(data["products"]), "categories": len({row["category"] for row in data["products"]}), "record_counts": {key: len(data[key]) for key in DATA_FILES}, "sha256": {filename: hashlib.sha256((output / filename).read_bytes()).hexdigest() for filename in files}}
    (output / "simulation_manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def load_output(output: Path) -> dict[str, list[dict[str, object]]]:
    result = {}
    for key, filename in DATA_FILES.items():
        with (output / filename).open(newline="", encoding="utf-8") as stream: result[key] = list(csv.DictReader(stream))
    numeric = {"quantity", "completed_units", "potential_units", "unfulfilled_units", "target_7d", "previous_stock", "resulting_stock", "unit_amount_cents", "line_total_cents", "initial_stock", "current_stock", "minimum_stock"}
    for rows in result.values():
        for row in rows:
            for key in numeric:
                if key in row and row[key] != "": row[key] = int(row[key])
    return result


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--output", type=Path, default=OUTPUT_DEFAULT); parser.add_argument("--validate-only", action="store_true"); args = parser.parse_args()
    if args.validate_only:
        data = load_output(args.output); summary = validate(data); commercial, stock = diagnostics(data)
        (args.output / "validation_summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (args.output / "commercial_diagnostics.json").write_text(json.dumps(commercial, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
        (args.output / "stock_reconciliation.json").write_text(json.dumps(stock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    else:
        if args.output.exists(): shutil.rmtree(args.output)
        summary = validate(generate()) if False else None
        data = generate(); write_output(args.output, data); summary = validate(data)
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__": main()
