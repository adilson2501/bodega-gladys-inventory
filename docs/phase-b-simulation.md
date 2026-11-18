# Phase B.1: deterministic commercial simulator

## Scope and safety

`ml/simulate_commercial.py` creates only local files. It does not import the
database client, open a network connection, call server actions, run migrations,
or insert records. It reuses `simulation/phase_a_catalog.py` and
`simulation/phase_a_rules.py` as its only catalog and date configuration.

Every output row has `source=SYNTHETIC`. The data is an artificial workload for
testing and APF3 experimentation; it is not a record of actual Bodega Gladys
sales.

## Reproduce and validate

From the repository root:

```bash
python3 -m ml.simulate_commercial --output ml/data/simulation-v1
python3 -m ml.validate_simulation --output ml/data/simulation-v1
python3 -m unittest ml.tests.test_simulation
```

The generator removes and recreates only the requested local output directory.
It uses seed `42`, fixed UUIDv5 identifiers, fixed UTC timestamps, stable CSV
headers/order, and version `simulation-v1.1.0`. The manifest includes SHA-256
hashes for canonical CSV and report files. Repeating the command with unchanged
Phase A configuration produces identical output bytes and hashes.

## Rules

- Period is inclusive: `2026-08-01` through `2026-10-31`.
- There are 60 products, 9 categories, and 10 synthetic suppliers.
- Two opening purchase documents establish every Phase A initial-stock quantity;
  there is no undocumented opening stock.
- The catalog has packaged groceries, beverages, dairy, snacks, canned foods,
  cleaning, hygiene, refrigerated products, and bakery products. It does not use
  loose fruit or vegetable weights; all quantities remain integers.
- Ticket counts are sampled from a seeded operating schedule: Monday-Thursday
  have lower traffic, Friday/Saturday have higher traffic, and some Sundays are
  closed (including two scheduled closures in this simulation window). Monthly
  factors and bounded normal noise create variable activity.
- Product selection uses high, medium, low, and intermittent demand classes plus
  category, weekday, weekend, month, and bounded random effects. Completed sales
  are never fabricated when stock is unavailable.
- Each supplier has one or two delivery weekdays. Replenishment uses a minimum
  stock reorder point, supplier schedule, safety quantity, and product-specific
  demand. This can create stockout-censored demand without negative stock.
- Refrigerated waste may be emitted only when a product has excess stock and the
  seeded waste condition occurs; it uses the schema's `OUT/WASTE` reason.
- Purchases are processed before same-day sales. Each item creates exactly one
  `IN/PURCHASE` or `OUT/SALE` movement with previous/resulting stock.
- Supported values follow Drizzle: `UNIT`, `KG`, `LITER`, `BOX`, `PACK`; payment
  methods are `CASH`, `YAPE`, `PLIN`, `OTHER`.
- Money is calculated as integer cents internally and exported with two decimal
  places. There are no discounts, taxes, customers, actors, or personal data.

## Output files

`ml/data/simulation-v1/` contains products, suppliers, sales, sale items,
purchases, purchase items, inventory movements, the authoritative item-level
`event_ledger.csv`, a complete 60 x 92 `daily_product_sales.csv` table,
`daily_product_targets.csv` with only complete seven-day targets,
`commercial_diagnostics.json`, `stock_reconciliation.json`,
`simulation_manifest.json`, and `validation_summary.json`. Daily completed sales
are derived from event records; potential and unfulfilled demand are kept
separate from revenue.

## Validation

Validation fails with a non-zero exception on invalid counts, IDs, dates,
quantities, prices, supplier/product references, payment or movement enums,
totals, movement links, stock arithmetic, negative stock, final stock
reconciliation, ledger cardinality, provenance, product-day coverage, or target
coverage. Commercial diagnostics report warnings separately; they do not enforce
arbitrary sales or purchase targets.

## APF3 and limitations

The output supports future product-day observations and a seven-day-ahead target.
`completed_units` is actual recorded sales, `potential_units` is modeled demand,
and `unfulfilled_units` marks stockout-censored observations. Target rows use
`t+1` through `t+7` completed units and stop seven days before the period end.
Features must exclude target columns and any future dates. Chronological train/test
evaluation belongs to the later ML phase; this phase does not train a model.
Ninety-two synthetic days provide limited temporal evidence only and cannot
establish predictive accuracy or annual seasonality.

Prices and costs are synthetic presentation-based assumptions, not verified market
prices. The simulator uses explicit cost/sale bands by category and presentation:
low-priced candy and bakery units, mid-priced beverages/snacks/essentials,
higher-priced oil, canned foods, hygiene, and refrigerated packs. Selling prices
are always above purchase costs and exported with two decimal places. The output
is not actual Bodega Gladys business evidence.
