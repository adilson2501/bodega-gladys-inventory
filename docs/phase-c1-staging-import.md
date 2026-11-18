# Phase C.1: safe staging-only simulation importer

## Scope

`scripts/import-simulation-staging.mjs` imports only the validated synthetic
batch into Neon staging. This implementation was not executed against Neon.
It does not import authentication tables, run migrations, delete data, or use
the staging reset script.

The importer rejects legacy manifests and requires the current batch identity,
SHA-256 hashes, exact record counts, `SYNTHETIC` provenance, the fixed 92-day
period, valid references, monetary totals, chronological stock movements, and
final balances before any database write is possible.

## Required configuration

Use a shell environment for the endpoint identities and keep credentials only in
`.env.staging.local`:

```bash
export STAGING_NEON_ENDPOINT_HOST='ep-<staging-endpoint>.neon.tech'
export PRODUCTION_NEON_ENDPOINT_HOST='ep-<production-endpoint>.neon.tech'
export STAGING_NEON_ENDPOINT_ID='<staging-neon-endpoint-id>'
export STAGING_NEON_DATABASE_NAME='<staging-database-name>'
```

`DATABASE_URL` is deliberately ignored. The existing `staging-db.mjs` loader
clears inherited `DATABASE_URL` and reads only `.env.staging.local`, then the
importer verifies that its hostname equals `STAGING_NEON_ENDPOINT_HOST` and is
not the known production endpoint. The endpoint ID is checked against Neon
metadata before reads and again inside the write transaction.

## Dry-run

Validate the complete local batch without connecting to a database:

```bash
npm run db:import:simulation:staging -- --dry-run
```

The command still requires the staging configuration above. It reports the
planned operation counts and always reports `writes: 0`. To explicitly inspect
existing staging records in a read-only transaction:

```bash
npm run db:import:simulation:staging -- --dry-run --inspect-database
```

The second form detects conflicts by deterministic product/supplier IDs,
transaction IDs, item IDs, and batch idempotency keys. It never writes.

## Import and reconciliation

The future write command requires both flags and should only be run after a
reviewed dry-run and an approved backup:

```bash
npm run db:import:simulation:staging -- --import --confirm-staging-import
```

It validates database identity, checks for conflicts, inserts master data,
purchases, purchase items, sales, sale items, and chronological movements in one
transaction, then reconciles final product stock before commit. Any error rolls
back the complete batch. Inserts do not use silent conflict handling.

Read-only reconciliation after an approved import:

```bash
npm run db:reconcile:simulation:staging
```

It reports batch counts, idempotency matches, and final stock. It does not repair,
delete, or update records. Safe cleanup is intentionally not automated; any
cleanup requires a separately reviewed, batch-specific procedure using the
deterministic idempotency prefix, never the global staging reset command.

## Database mapping and provenance

The importer maps CSV fields to the existing Drizzle tables and enums. Historical
transaction timestamps are preserved. Product and supplier master timestamps use
the deterministic simulation start timestamp because the catalog files do not
carry source master timestamps. `actor_id` and `actor_email` remain null. The
batch provenance is retained through deterministic idempotency keys prefixed by
`synthetic:<manifest.batch_id>` and request fingerprints on movements.

## Tests and recovery

Local safety tests use the generated files and mocked query clients:

```bash
npm run test:simulation-importer
```

They cover production/unknown endpoint rejection, missing configuration, bad
manifests, duplicate detection, references, money, stock, determinism, and
zero-write dry-runs. No test opens a Neon connection. If a real import fails,
the SQL transaction rolls back; do not retry until the conflict/error report and
database identity have been reviewed.
