# Bodega Gladys Inventory

Foundation for the Bodega Gladys university MVP. The application uses Next.js,
TypeScript, Tailwind CSS, PostgreSQL on Neon and Drizzle ORM.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and configure `DATABASE_URL` with the
   approved Neon Production endpoint. Set the matching
   `PRODUCTION_NEON_ENDPOINT_HOST` and `PRODUCTION_NEON_ENDPOINT_ID` values.

3. Run the development server:

```bash
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Database

Generate a versioned migration from the Drizzle schema:

```bash
npm run db:generate
```

After configuring `DATABASE_URL` for the approved Neon Production `main` branch,
verify the connection without writing data:

```bash
npm run db:verify:production
```

The verification is read-only and fails closed when the URL hostname or Neon
endpoint identity does not match the configured Production identity. Applying
an existing migration remains an explicit, separately reviewed operation:

```bash
npm run db:migrate
```

Never commit `.env.local` or any credential.

### Staging migration preflight

Staging migrations require an endpoint hostname supplied independently of
`.env.staging.local`. The preflight is read-only and must report `NOT_APPLIED`
before a migration can be attempted:

```bash
STAGING_NEON_ENDPOINT_HOST='ep-<staging-endpoint>.neon.tech' npm run db:migrate:staging:preflight
```

After reviewing the preflight output, the direct staging migration command is:

```bash
STAGING_NEON_ENDPOINT_HOST='ep-<staging-endpoint>.neon.tech' npm run db:migrate:staging:direct
```

The direct command was designed for staging only. It is not a replacement for
`npm run db:migrate`, and it must not be run until the read-only preflight has
passed. Never put `STAGING_NEON_ENDPOINT_HOST` or database credentials in a
committed file.

### Staging integration tests

The integration suite is opt-in. It first requires migration `0001` to be
reported as `APPLIED`, then creates uniquely named disposable products and
cleans their movements and products after each test:

```bash
STAGING_NEON_ENDPOINT_HOST='ep-<staging-endpoint>.neon.tech' npm run db:test:staging
```

The normal `npm test` command does not run this suite.

### Synthetic simulation data

The simulator and validator remain local-only and preserve `SYNTHETIC` provenance
in their generated files. The database importer is intentionally staging-only;
it must not be pointed at Production. The current Production schema has no
persisted provenance until `drizzle/0003_great_kang.sql` is reviewed and applied.
That migration adds `REAL`, `SYNTHETIC`, and `UNCLASSIFIED`, preserves historical
rows as `UNCLASSIFIED`, and protects cross-origin references and stock changes.
Synthetic imports into Production remain disabled until the migration and its
preflight have been separately approved.

## Authentication limitation

The application intentionally exposes no public registration UI. Neon Auth is
currently beta and does not yet support fully restricted service-level sign-ups;
this is a known MVP technical limitation.

## Pronóstico ML (APF3)

La página protegida `/predicciones` muestra el artefacto offline validado en `ml/artifacts/forecast.json`. Para reproducir el flujo con datos reales, inicia la aplicación con una sesión autenticada y ejecuta:

```bash
mkdir -p ml/data
curl -L -o ml/data/ventas.csv http://localhost:3000/api/export/ml-sales
python ml/prepare_dataset.py --input ml/data/ventas.csv --output ml/data/daily_sales.csv
python ml/train.py --input ml/data/daily_sales.csv --artifact ml/artifacts/forecast.json --metrics ml/artifacts/metrics.json
npm run ml:test
```

Consulta `ml/README.md` y `docs/APF3-ML.md` para supuestos, métricas, límites y el modo sintético claramente marcado como DEMO.

La especificación vigente de catálogo y reglas de simulación de Fase A está en
`docs/phase-a-simulation.md`. Su periodo es exclusivamente del 1 de agosto al 31
de octubre de 2026; aún no contiene transacciones generadas.

### Inferencia APF3 en runtime

`/api/predictions` llama al servicio FastAPI privado de APF3. Requiere aplicar
manualmente `drizzle/0004_apf3_prediction_audits.sql` y preparar Python:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r ml/requirements.txt -r python/requirements.txt
export APF3_INTERNAL_SECRET='local-only-secret'
uvicorn python.app:app --host 127.0.0.1 --port 8000

# En otra terminal, con la misma variable APF3_INTERNAL_SECRET:
npm run dev
```

Solo acepta productos `SYNTHETIC` y el corte `2026-10-31`. Cada intento guarda
features, salida, hash SHA-256, versión, origen y estado. No se ejecutan
migraciones automáticamente. En Vercel, el binding `APF3_SERVICE_URL` conecta
Next.js con el servicio Python sin una ruta pública. `APF3_INTERNAL_SECRET`
debe configurarse en ambos servicios y nunca en el navegador.

La simulación comercial local de Fase B, sus comandos y validaciones están
documentados en `docs/phase-b-simulation.md`.
