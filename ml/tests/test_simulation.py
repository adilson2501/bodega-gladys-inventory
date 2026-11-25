import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[2]))
from ml.simulate_commercial import generate, validate, write_output


class SimulationTest(unittest.TestCase):
    def test_generation_is_deterministic(self):
        first = generate()
        second = generate()
        self.assertEqual(first, second)

    def test_catalog_and_date_contract(self):
        data = generate()
        self.assertEqual(len(data["products"]), 60)
        self.assertEqual(len({row["category"] for row in data["products"]}), 9)
        self.assertNotIn("Frutas y verduras", {row["category"] for row in data["products"]})
        self.assertEqual({row["source"] for rows in data.values() for row in rows}, {"SYNTHETIC"})
        dates = [row["created_at"][:10] for key in ("sales", "purchases") for row in data[key]]
        self.assertGreaterEqual(min(dates), "2026-08-01")
        self.assertLessEqual(max(dates), "2026-10-31")

    def test_financial_and_stock_reconciliation(self):
        data = generate()
        summary = validate(data)
        self.assertTrue(summary["valid"])
        self.assertGreater(summary["sales"], 0)
        self.assertGreater(summary["purchases"], 0)
        waste_count = sum(row["reason"] == "WASTE" for row in data["inventory_movements"])
        self.assertEqual(summary["inventory_movements"], summary["sale_items"] + summary["purchase_items"] + waste_count)
        self.assertTrue(summary["final_stock_reconciled"])

    def test_variable_activity_prices_and_product_day_contract(self):
        data = generate()
        counts = {}
        for row in data["sales"]:
            counts[row["created_at"][:10]] = counts.get(row["created_at"][:10], 0) + 1
        self.assertGreater(len(set(counts.values())), 1)
        self.assertTrue(all(float(row["selling_price"]) > float(row["purchase_cost"]) > 0 for row in data["products"]))
        self.assertEqual(len(data["daily_product_sales"]), 60 * 92)
        self.assertEqual(len(data["daily_product_targets"]), 60 * 85)
        self.assertGreater(sum(row["unfulfilled_units"] for row in data["daily_product_sales"]), 0)
        self.assertEqual(len({row["id"] for row in data["suppliers"]}), 10)

    def test_output_hashes_repeat(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "simulation-v1"
            first = write_output(path, generate())
            hashes = {name: hashlib.sha256((path / name).read_bytes()).hexdigest() for name in first["sha256"]}
            second = write_output(path, generate())
            self.assertEqual(first, second)
            self.assertEqual(hashes, second["sha256"])


if __name__ == "__main__":
    unittest.main()
