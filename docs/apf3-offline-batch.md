# APF3 Offline Ridge Batch

## Command

The deterministic synthetic batch is generated offline with:

```bash
.venv/bin/python -m ml.generate_forecast_batch
```

Outputs are written to `ml/artifacts/apf3/forecast-batch/`:

- `forecast_batch.json`: contract v2.0 batch.
- `eligibility_report.json`: product-level ML.3 eligibility and reasons.
- `validation_report.json`: Python validation and model audit.
- `generation_metadata.json`: manifest hashes, model hash, feature schema and
  deterministic timestamp policy.

The command never connects to Neon, writes inventory, creates purchases or
replaces training artifacts.

## Contract compatibility

The batch uses the exact ML.2 structure: run metadata plus `rows`. Each row has
`product_id`, `forecast_units`, `status` and optional `error_code`.

- Eligible products are `READY` with a finite nonnegative forecast.
- Insufficient history is `INSUFFICIENT_HISTORY` with no prediction.
- Missing observations, invalid stock and invalid metadata are `ERROR` with
  the detailed ML.3 status in `error_code` and the eligibility report.
- The complete batch is `SYNTHETIC` and uses
  `provenance.verification = synthetic-manifest`.
- `input_hash` remains `null` for synthetic data as required by ML.2.
- `artifact_hash` contains the verified SHA-256 of `model.joblib`.

The generated JSON is validated by the actual TypeScript Zod parser through
`tests/forecast-batch-contract.test.ts` when the local batch exists.

## Integrity and determinism

Before prediction the batch runs `audit_export`, verifies the model hash,
Ridge family, version, alpha, horizon, preprocessing pipeline and exact APF3
feature schema. `run_id` is derived from the cutoff, model hash and manifest
dataset hash. `created_at` is fixed to `2026-10-31T23:59:59+00:00`; no wall
clock value enters the batch.

The cutoff is `2026-10-31`, with forecast dates `2026-11-01` through
`2026-11-07`. Negative outputs are clamped to zero by the existing inference
policy; non-finite outputs are rejected.

## Current limitations

The result is a synthetic demonstration, not a production forecast. It has no
Neon persistence, no real-data provenance, no live staleness publication and no
automatic purchasing behavior. ML.5 must define the reviewed publication path,
read-only application consumption and future Neon persistence without allowing
the UI to execute inference or writes.
