import { spawnSync } from "node:child_process";

import { reportSanitizedError, sanitizeText } from "./error-reporting.mjs";
import { inspectStagingMigrationState } from "./staging-migration-state.mjs";
import { loadStagingDatabase } from "./staging-db.mjs";

async function run() {
  const state = await inspectStagingMigrationState();
  if (state.status !== "APPLIED" || state.migration_0001_status !== "APPLIED") {
    throw new Error(`Pruebas de integración rechazadas: migraciones 0001/0002 no están aplicadas (${state.migration_0001_status}/${state.status}).`);
  }

  const { databaseUrl } = loadStagingDatabase();
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    ["--no-install", "vitest", "run", "--config", "vitest.integration.config.mts"],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    },
  );
  const secrets = [databaseUrl, new URL(databaseUrl).password];

  if (result.stdout) process.stdout.write(sanitizeText(result.stdout, secrets));
  if (result.stderr) process.stderr.write(sanitizeText(result.stderr, secrets));
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Las pruebas de integración terminaron con status=${result.status ?? "null"}.`);
  }
}

run().catch((error) => {
  reportSanitizedError("Pruebas de integración staging fallidas:", error);
  process.exitCode = 1;
});
