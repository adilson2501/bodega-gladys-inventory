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

## Authentication limitation

The application intentionally exposes no public registration UI. Neon Auth is
currently beta and does not yet support fully restricted service-level sign-ups;
this is a known MVP technical limitation.
