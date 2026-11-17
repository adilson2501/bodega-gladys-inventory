"""Transforma exportación de ventas en producto-día sin datos personales."""
import argparse
import csv
from collections import defaultdict
from datetime import date, timedelta


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
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--coverage-start")
    parser.add_argument("--coverage-end")
    args = parser.parse_args()
    with open(args.input, newline="", encoding="utf-8") as stream:
        rows = prepare(csv.DictReader(stream), args.coverage_start, args.coverage_end)
    with open(args.output, "w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["date", "product_id", "quantity", "source"])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
