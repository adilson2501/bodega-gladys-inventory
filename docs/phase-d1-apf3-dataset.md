# Phase D.1: APF3 Dataset Preparation and Validation

## Scope

This phase prepares, validates, and documents a machine-learning dataset for
seven-calendar-day product sales forecasting. It does not fit a model or export
a trained model. The source is the validated local synthetic export in
`ml/data/simulation-v1/`; no database connection is required.

## Dataset origin and observation unit

The source is the deterministic Phase B commercial simulation, version
`simulation-v1.1.0`, batch
`simulation-v1.1.0:42:2026-08-01:2026-10-31`. It contains 60 products, 9
categories, and the inclusive calendar period 2026-08-01 through 2026-10-31.
Every exported source row is marked `SYNTHETIC`. The observation unit is one
product per calendar day, giving 60 x 92 = 5,520 product-day observations.

Calendar dates are interpreted as the store calendar in `America/Lima`. The
canonical daily table is authoritative for product-day dates; source event
timestamps remain UTC and are not rewritten.

## Target contract

For cutoff date `t`, `target_next_7d` is completed sale units on dates `t+1`
through `t+7`, inclusive. Sales on `t` are excluded. A target is retained only
when all seven future calendar dates exist. The 5,100 source target rows were
independently recomputed from sale-item quantities and matched exactly.

## Quality results

- Product-day observations: 5,520.
- Complete labeled observations: 5,100.
- Missing product-day combinations: 0.
- Duplicate product-date combinations: 0.
- Invalid product references, dates, quantities, or provenance: 0.
- Stockout-censored observations: 2; retained as flags, not removed.
- Store closure dates: 2026-08-09, 2026-08-23, 2026-09-27, 2026-10-04.
- Zero sales are represented as observed product-days, not missing values.

The preparation fails closed on source integrity errors. It does not replace
missing observations with zero.

## Features

Features are calculated separately for each product and cutoff. The historical
windows are strictly before `t`:

- `lag_1`, `lag_2`, `lag_7`: completed units at `t-1`, `t-2`, and `t-7`.
- `rolling_mean_7`, `rolling_mean_14`: means over `t-7..t-1` and `t-14..t-1`.
- `rolling_std_7`: population standard deviation over `t-7..t-1`.
- `sales_frequency_7`, `sales_frequency_14`: count of positive-sales days in
  the corresponding prior windows.
- `day_of_week`, `month`: calendar features for `t`.
- `stock_available_eod`: historical closing-stock availability flag.
- `historical_demand_class`: deterministic class derived only from prior
  14-day completed units (`zero`, `low`, `regular`, or `high`).
- `category`, `unit_of_measure`: observable product metadata.

Potential demand and unfulfilled units are retained in the raw product-day
export for diagnostics but are not used as model features. Generator latent
variables are not used.

## Temporal design

The 14-day warm-up is required by the longest historical feature window. The
last seven calendar dates cannot be labeled. To prevent target-window overlap
and ensure labels are available before the next prediction period, the prepared
usable samples are:

| Partition | Cutoff dates | Product-day samples |
| --- | --- | ---: |
| Train | 2026-08-15 to 2026-09-20 | 2,220 |
| Validation | 2026-10-01 to 2026-10-09 | 540 |
| Test | 2026-10-16 to 2026-10-24 | 540 |

The dates 2026-09-21 to 2026-09-30 and 2026-10-10 to 2026-10-15 are purged.
The final test rows are prepared and labeled for later evaluation but were not
used for EDA decisions or preprocessing fitting. No random row split is used.

## EDA findings

EDA statistics and charts use training-period observations only. Training has
3,060 product-day rows, 896 completed units, a mean of 0.2928 units per
product-day, and 2,421 zero-sales product-days. The training target has mean
2.0590 units, range 0 to 10, and 762 zero targets. Training-period category,
weekday, monthly, stockout, and history-target summaries are in
`ml/artifacts/apf3/eda_statistics.json`.

Generated charts:

- `daily_sales_distribution.png`: the product-day distribution is strongly
  zero-inflated.
- `sales_by_category.png`: completed units differ across categories under the
  seeded synthetic operating schedule.
- `history_vs_target.png`: prior seven-day history is shown against the future
  seven-day target without estimating predictive performance in this phase.

These findings describe the synthetic generator and cannot establish
real-world demand behavior or predictive accuracy.

## Preprocessing plan

`preprocessing_plan.json` defines numerical and categorical columns. Phase D.2
should fit any imputer, scaler, or encoder on training rows only. The planned
categorical transformation is `OneHotEncoder(handle_unknown="ignore")`; a
`StandardScaler` is optional for model families that require scaling. The
identifier is retained for grouping and traceability, not treated as an
ordinal numeric measurement. No test-set feature selection or outlier clipping
is performed in Phase D.1.

## Reproduction

From the repository root, using the project-local environment:

```bash
.venv/bin/pip install -r ml/requirements.txt
.venv/bin/python -m ml.prepare_dataset --apf3 \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3
.venv/bin/python -m ml.validate_simulation --output ml/data/simulation-v1
.venv/bin/pytest ml/tests
```

`dataset_metadata.json` records the APF3 version, source batch, source SHA-256
hashes, output hashes, calendar timezone, and target contract. The output is
local-only and preserves `SYNTHETIC` provenance.

## Limitations

The source covers only 92 synthetic days and has no real customer, promotion,
holiday, price-response, or annual-seasonality evidence. Stockout censoring is
represented by two flagged product-days, but causal demand recovery is outside
this phase. No model performance metric is reported. Phase D.2 must treat the
test period as untouched until model selection and validation are complete.
