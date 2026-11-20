# Forecast Data Contract

## Purpose

The version `2.0` contract is an interchange format for a validated offline
forecast run. It is not an inference endpoint and it does not authorize
purchases or inventory changes.

Each run contains one Ridge model identity, one cutoff, one seven-calendar-day
horizon, and at most one row per product. `forecast_units` is finite and
nonnegative. Rows with `INSUFFICIENT_HISTORY`, `ERROR`, or
`MISSING_FORECAST` must not contain a prediction.

## Provenance

`SYNTHETIC` requires evidence from the synthetic manifest and is never
operational. `REAL` requires an authenticated export, both input and artifact
SHA-256 hashes, and verification by a trusted application boundary. A parser
must not treat `source: REAL` in an untrusted JSON document as proof of real
data; callers must explicitly pass trusted provenance after independently
checking the export.

The current contract supports Ridge `apf3-models-1.0`. Model artifacts remain
offline inputs and are not loaded by Next.js or by an HTTP request.

## Security boundaries

- Forecast display is read-only.
- Inference and training run outside HTTP requests.
- The contract contains no database credentials.
- Forecast rows never create purchases or inventory movements.
- Synthetic rows must remain visibly and logically separate from operational
  rows.
- Unknown product IDs, duplicate rows, invalid dates, unsupported versions,
  invalid hashes, and invalid numeric values are rejected.

## Migration considerations

The existing `forecast.json` parser and `/predicciones` page remain unchanged
in this phase. A future migration can convert an offline output into this
contract, validate it, and publish it as a versioned run. Database persistence
should use append-only runs and rows, with one explicitly published valid run;
that migration is intentionally not included here.

## ML.3 requirements

ML.3 must provide independently verified real-data export provenance, feature
construction for all APF3 inputs, product identity checks, cutoff and stock
consistency checks, and an atomic publication mechanism. It must preserve the
no-write display boundary and retain failed or stale runs for auditability.
