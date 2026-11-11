import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { reportSanitizedError } from "./error-reporting.mjs";
import { assertNextMigrationPreflight, inspectStagingMigrationState } from "./staging-migration-state.mjs";
import { loadStagingDatabase } from "./staging-db.mjs";

const isDryRun = process.argv.includes("--dry-run");

async function runDirectStagingMigration() {
  const state = await inspectStagingMigrationState();
  assertNextMigrationPreflight(state);

  if (isDryRun) {
    console.log(JSON.stringify({ mode: "dry-run", status: state.status }, null, 2));
    return;
  }

  const { databaseUrl } = loadStagingDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const db = drizzle(pool);
  let primaryError;

  try {
    await migrate(db, {
      migrationsFolder: "./drizzle",
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    console.log("Migración directa de staging aplicada correctamente.");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await pool.end();
    } catch (cleanupError) {
      if (primaryError) {
        primaryError.cleanupErrors = [cleanupError];
      } else {
        throw cleanupError;
      }
    }
  }
}

runDirectStagingMigration().catch((error) => {
  reportSanitizedError(
    isDryRun ? "Preflight directo de staging fallido:" : "Migración directa de staging fallida:",
    error,
  );
  process.exitCode = 1;
});
