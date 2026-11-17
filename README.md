# Bodega Gladys Inventory

Foundation for the Bodega Gladys university MVP. The application uses Next.js,
TypeScript, Tailwind CSS, PostgreSQL on Neon and Drizzle ORM.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and configure the values locally.

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

After configuring `DATABASE_URL` for the approved Neon `main` branch, apply it
with:

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
