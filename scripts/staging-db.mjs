import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";

const stagingEnvPath = ".env.staging.local";
const trustedExpectedEndpoint = process.env.STAGING_NEON_ENDPOINT_HOST?.trim();

function fail(message) {
  throw new Error(message);
}

function normalizeHostname(value) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function loadStagingDatabase() {
  // This value must come from the caller, never from the staging env file.
  delete process.env.DATABASE_URL;

  if (!trustedExpectedEndpoint) {
    fail("STAGING_NEON_ENDPOINT_HOST es obligatorio y debe venir del entorno de ejecución.");
  }

  const expectedEndpoint = normalizeHostname(trustedExpectedEndpoint);
  if (!expectedEndpoint || expectedEndpoint.includes("/") || expectedEndpoint.includes(":")) {
    fail("STAGING_NEON_ENDPOINT_HOST debe ser un hostname, no una URL ni una cadena de conexión.");
  }

  const loaded = config({ path: stagingEnvPath, override: true });
  if (loaded.error) {
    fail("No existe .env.staging.local o no se puede leer.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("DATABASE_URL no está definido en .env.staging.local.");
  }

  let endpointHostname;
  try {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
      fail("DATABASE_URL no usa un protocolo PostgreSQL válido.");
    }
    endpointHostname = normalizeHostname(parsedUrl.hostname);
  } catch {
    fail("DATABASE_URL no es una URL PostgreSQL válida.");
  }

  if (endpointHostname !== expectedEndpoint) {
    fail("El endpoint de DATABASE_URL no coincide con STAGING_NEON_ENDPOINT_HOST.");
  }

  return { databaseUrl, endpointHostname };
}

export async function withVerifiedStagingConnection(callback) {
  const staging = loadStagingDatabase();
  const pool = new Pool({ connectionString: staging.databaseUrl });
  let client;
  let transactionStarted = false;
  let primaryError;

  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    transactionStarted = true;

    const result = await client.query(`
      select
        current_database() as database_name,
        current_user as role_name,
        current_setting('transaction_read_only') as transaction_read_only,
        current_setting('neon.timeline_id', true) as neon_timeline_id,
        current_setting('neon.endpoint_id', true) as neon_endpoint_id
    `);

    const metadata = result.rows[0];
    if (metadata.transaction_read_only !== "on") {
      fail("La conexión no está en modo read-only.");
    }

    return await callback({ client, ...staging, metadata });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];

    if (client) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        client.release();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (cleanupErrors.length && primaryError) {
      primaryError.cleanupErrors = cleanupErrors;
    } else if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Falló la limpieza de la conexión staging.");
    }
  }
}
