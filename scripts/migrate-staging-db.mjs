import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { reportSanitizedError, sanitizeText } from "./error-reporting.mjs";
import { withVerifiedStagingConnection } from "./staging-db.mjs";

const initialMigrationTag = "0000_volatile_shadow_king";

function fail(message) {
  throw new Error(message);
}

function readInitialMigration() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries?.find(({ tag }) => tag === initialMigrationTag);
  if (!entry) {
    fail("El journal local no contiene la migración 0000 esperada.");
  }

  const sql = readFileSync(`drizzle/${initialMigrationTag}.sql`);
  return {
    hash: createHash("sha256").update(sql).digest("hex"),
    createdAt: String(entry.when),
  };
}

async function verifyInitialMigration(client) {
  const migration = readInitialMigration();
  const tableResult = await client.query(`
    select to_regclass('drizzle.__drizzle_migrations') as migration_table
  `);

  if (!tableResult.rows[0].migration_table) {
    fail("No existe la tabla de journal de Drizzle en staging.");
  }

  const appliedResult = await client.query(
    `
      select 1
      from drizzle.__drizzle_migrations
      where hash = $1 and created_at = $2
      limit 1
    `,
    [migration.hash, migration.createdAt],
  );

  if (appliedResult.rowCount !== 1) {
    fail("La migración 0000 no figura como aplicada en staging.");
  }
}

let verifiedDatabaseUrl;

await withVerifiedStagingConnection(async ({ client, databaseUrl }) => {
  await verifyInitialMigration(client);
  verifiedDatabaseUrl = databaseUrl;
}).then(() => {
  // Drizzle config loads .env.local by default; this explicit value wins over it.
  process.env.DATABASE_URL = verifiedDatabaseUrl;

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["--no-install", "drizzle-kit", "migrate"], {
    env: process.env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const secrets = [verifiedDatabaseUrl, new URL(verifiedDatabaseUrl).password];
  if (result.stdout) {
    process.stdout.write(sanitizeText(result.stdout, secrets));
  }
  if (result.stderr) {
    process.stderr.write(sanitizeText(result.stderr, secrets));
  }

  if (result.error) {
    fail(`No se pudo iniciar Drizzle: ${sanitizeText(result.error.message, secrets)}`);
  }
  if (result.status !== 0) {
    fail(`Drizzle terminó con status=${result.status ?? "null"}, signal=${result.signal ?? "none"}.`);
  }
}).catch((error) => {
  reportSanitizedError("Migración de staging no ejecutada o fallida:", error, [verifiedDatabaseUrl]);
  process.exitCode = 1;
});
