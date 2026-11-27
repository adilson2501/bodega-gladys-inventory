import { Pool } from "@neondatabase/serverless";

export class ProductionDatabaseSafetyError extends Error {}

function fail(message) {
  throw new ProductionDatabaseSafetyError(message);
}

export function normalizeHostname(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function readProductionConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  const expectedHost = normalizeHostname(env.PRODUCTION_NEON_ENDPOINT_HOST);
  const expectedEndpointId = String(env.PRODUCTION_NEON_ENDPOINT_ID ?? "").trim();

  if (!databaseUrl) fail("DATABASE_URL is required for Neon Production.");
  if (!expectedHost) fail("PRODUCTION_NEON_ENDPOINT_HOST is required.");
  if (!expectedEndpointId) fail("PRODUCTION_NEON_ENDPOINT_ID is required for identity verification.");
  if (expectedHost.includes("/") || expectedHost.includes(":")) {
    fail("PRODUCTION_NEON_ENDPOINT_HOST must be a hostname.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    fail("DATABASE_URL must use PostgreSQL.");
  }
  if (!/[?&]sslmode=require(?:&|$)/i.test(parsedUrl.search) && env.REQUIRE_SSL !== "false") {
    fail("DATABASE_URL must require SSL.");
  }
  if (normalizeHostname(parsedUrl.hostname) !== expectedHost) {
    fail("DATABASE_URL does not point to PRODUCTION_NEON_ENDPOINT_HOST.");
  }

  return {
    databaseUrl,
    expectedHost,
    expectedEndpointId,
    expectedDatabaseName: String(env.PRODUCTION_NEON_DATABASE_NAME ?? "").trim() || null,
  };
}

export async function verifyProductionDatabase({ env = process.env, poolFactory } = {}) {
  const config = readProductionConfig(env);
  const pool = (poolFactory ?? ((url) => new Pool({ connectionString: url, max: 1 })))(config.databaseUrl);
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query(`
      select
        current_database() as database_name,
        current_user as role_name,
        current_setting('transaction_read_only') as transaction_read_only,
        current_setting('neon.endpoint_id', true) as neon_endpoint_id,
        current_setting('neon.timeline_id', true) as neon_timeline_id
    `);
    const metadata = result.rows[0];

    if (metadata.transaction_read_only !== "on") fail("Production verification is not read-only.");
    const actualIdentity = metadata.neon_endpoint_id ?? metadata.neon_timeline_id;
    if (actualIdentity !== config.expectedEndpointId) {
      fail("Neon identity does not match PRODUCTION_NEON_ENDPOINT_ID.");
    }
    if (config.expectedDatabaseName && metadata.database_name !== config.expectedDatabaseName) {
      fail("Database name does not match PRODUCTION_NEON_DATABASE_NAME.");
    }

    return {
      database_name: metadata.database_name,
      role_name: metadata.role_name,
      endpoint_hostname: config.expectedHost,
      neon_endpoint_id: metadata.neon_endpoint_id ?? null,
      neon_timeline_id: metadata.neon_timeline_id ?? null,
      transaction_read_only: metadata.transaction_read_only,
    };
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyProductionDatabase()
    .then((metadata) => console.log(JSON.stringify({ ...metadata, identity_verified_against: "PRODUCTION_NEON_ENDPOINT_HOST" }, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Production verification failed.");
      process.exitCode = 1;
    });
}
