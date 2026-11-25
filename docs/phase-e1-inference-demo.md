# Phase E.1: APF3 Inference Demonstration

## Scope

This phase audits the frozen APF3 export and executes one offline future
forecast. It does not retrain, change partitions, connect to Neon, create
purchases, or modify inventory.

All data and outputs are `SYNTHETIC`.

## Artifact audit

The audit verifies:

- `model.joblib` SHA-256 equals `model_metadata.json`:
  `df16e8be432bc58b826f6cf87c83a69998931de735d7d77eca89a3279cfb9d95`.
- Model family is Ridge Regression.
- Hyperparameter is `alpha=10.0`.
- Forecast horizon is seven days.
- Test period is 2026-10-16 through 2026-10-24.
- Frozen Ridge test MAE is `1.2984537784882764`.
- The pipeline contains the exported preprocessing transformer and Ridge
  estimator.
- Phase D.1 hashes, provenance, counts, and split metadata remain valid.

The model metadata SHA-256 is
`a65a8b83c04458829339371fa8058b63be034714163a7f47b9b6a8822ab6a745`.

## Future demonstration

The example cutoff is 2026-10-31. Features are calculated from canonical
history through that date only. No November sales or target is supplied to the
model.

The deterministic product selection chooses the highest completed historical
unit total among products with complete canonical history:

- Product: `6ce5d35d-c954-5f70-8e79-d1046a3b3475`
- Name: `Papas Lays clásica 45 g`
- Category: `Snacks`
- Cutoff: 2026-10-31
- Forecast horizon: 2026-11-01 through 2026-11-07
- Prediction: `5.783411543392288` units

The features use the same approved implementation as D.1: seven- and 14-day
historical windows, lags, frequency, calendar fields, historical demand class,
product metadata, and October 31 closing-stock availability.

## Informational inventory example

October 31 ledger stock for the selected product is 9 units. The canonical
product configuration has minimum stock 8 units. The recommendation is
informational only:

```text
target_stock = ceil(predicted_next_7d_units) + minimum_stock
              = ceil(5.7834) + 8
              = 14 units

recommended_purchase_units = max(0, target_stock - stock_at_cutoff)
                            = max(0, 14 - 9)
                            = 5 units
```

No November transaction is used. No purchase is created and no database or
stock record is changed.

## MVP relationship

```text
commercial sales records
  -> daily_product_sales.csv
  -> historical cutoff features
  -> exported Ridge pipeline
  -> seven-day prediction
  -> informational replenishment calculation
```

Existing source fields are mapped as follows:

- `products.id` -> `product_id`.
- `products.name` -> display-only product name.
- `products.category` and `products.unit_of_measure` -> categorical features.
- `daily_product_sales.completed_units` -> historical demand windows.
- `inventory_movements.resulting_stock` -> historical closing-stock flag and
  cutoff inventory.
- `products.minimum_stock` -> informational replenishment calculation.

The current Next.js application does not execute Ridge inference. The model,
feature construction, and replenishment calculation remain offline scripts.
No production inference API is claimed or implemented.

## Reproduction

```bash
.venv/bin/python -m ml.infer_apf3 \
  --future-demo \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3 \
  --output-dir ml/artifacts/apf3
```

The command writes:

- `future_inference_input.json`
- `future_inference_output.json`
- `replenishment_recommendation.json`
- `phase_e1_audit.json`

The prediction output identifies the model, version, horizon, product, date
range, synthetic provenance, and limitations. It is an estimate, not a
guaranteed future sale.

## Limitations

The model was trained on a 92-day synthetic simulation. The forecast cannot
establish real demand accuracy, financial savings, stockout reduction, or
generalization to Bodega Gladys customers. The replenishment calculation is a
transparent example, not an automated purchasing policy.
