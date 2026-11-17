import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Pool } from "@neondatabase/serverless";

import { reportSanitizedError } from "./error-reporting.mjs";
import { migrationTags, inspectStagingMigrationState, readLocalMigration } from "./staging-migration-state.mjs";
import { loadStagingDatabase } from "./staging-db.mjs";

const targetTables = [
  "inventory_movements",
  "sale_items",
  "sales",
  "purchase_items",
  "purchases",
  "suppliers",
  "products",
];

const expectedForeignKeys = new Set([
  "inventory_movements_product_id_products_id_fk|inventory_movements|products",
  "inventory_movements_sale_id_sales_id_fk|inventory_movements|sales",
  "inventory_movements_purchase_id_purchases_id_fk|inventory_movements|purchases",
  "sale_items_sale_id_sales_id_fk|sale_items|sales",
  "sale_items_product_id_products_id_fk|sale_items|products",
  "purchase_items_purchase_id_purchases_id_fk|purchase_items|purchases",
  "purchase_items_product_id_products_id_fk|purchase_items|products",
  "purchases_supplier_id_suppliers_id_fk|purchases|suppliers",
]);

function fail(message) {
  throw new Error(message);
}

function normalizeHostname(value) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function assertStagingIdentity(metadata, expectedEndpoint, expectedIdentity) {
  if (metadata.transaction_read_only !== "off") {
    fail("La transacción de borrado no está en modo escritura esperado.");
  }

  const actualEndpoint = metadata.neon_endpoint_id ?? metadata.neon_timeline_id;
  if (!actualEndpoint || actualEndpoint !== expectedIdentity) {
    fail("La identidad Neon cambió o no pudo verificarse contra staging.");
  }

  if (metadata.endpoint_hostname !== expectedEndpoint) {
    fail("El hostname de la conexión no coincide con el endpoint staging autorizado.");
  }
}

async function readForeignKeys(client) {
  const result = await client.query(`
    select
      c.conname,
      source.relname as source_table,
      target.relname as target_table,
      c.convalidated
    from pg_constraint c
    join pg_class source on source.oid = c.conrelid
    join pg_namespace source_schema on source_schema.oid = source.relnamespace
    join pg_class target on target.oid = c.confrelid
    join pg_namespace target_schema on target_schema.oid = target.relnamespace
    where c.contype = 'f'
      and source_schema.nspname = 'public'
      and target_schema.nspname = 'public'
      and (source.relname = any($1::text[]) or target.relname = any($1::text[]))
    order by source.relname, c.conname
  `, [targetTables]);

  const actual = new Set(result.rows.map((row) => {
    if (!row.convalidated) {
      fail(`La FK ${row.conname} no está validada.`);
    }
    return `${row.conname}|${row.source_table}|${row.target_table}`;
  }));

  if (actual.size !== expectedForeignKeys.size || [...expectedForeignKeys].some((key) => !actual.has(key))) {
    fail("Las dependencias FK no coinciden exactamente con las esperadas; se cancela el reset.");
  }

  return result.rows.map(({ conname, source_table, target_table }) => ({
    constraint: conname,
    source_table,
    target_table,
  }));
}

async function readCounts(client) {
  const result = await client.query(`
    select table_name, table_rows
    from (
      select 'inventory_movements' as table_name, count(*)::bigint as table_rows from public.inventory_movements
      union all select 'sale_items', count(*)::bigint from public.sale_items
      union all select 'sales', count(*)::bigint from public.sales
      union all select 'purchase_items', count(*)::bigint from public.purchase_items
      union all select 'purchases', count(*)::bigint from public.purchases
      union all select 'suppliers', count(*)::bigint from public.suppliers
      union all select 'products', count(*)::bigint from public.products
    ) counts
    order by case table_name
      when 'inventory_movements' then 1
      when 'sale_items' then 2
      when 'sales' then 3
      when 'purchase_items' then 4
      when 'purchases' then 5
      when 'suppliers' then 6
      when 'products' then 7
    end
  `);

  return Object.fromEntries(result.rows.map(({ table_name, table_rows }) => [table_name, Number(table_rows)]));
}

function assertMigrationApplied(state) {
  if (
    state.status !== "APPLIED" ||
    state.migration_0001_status !== "APPLIED" ||
    !state.migration_0002.journal_entry ||
    !state.migration_0002.all_objects_present
  ) {
    fail("El estado de migraciones no es APPLIED para 0001/0002; se cancela el reset.");
  }
}

async function confirmDeletion() {
  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(
      "Escribe BORRAR DATOS COMERCIALES STAGING para confirmar la eliminación permanente: ",
    );
    return answer.trim() === "BORRAR DATOS COMERCIALES STAGING";
  } finally {
    readline.close();
  }
}

async function run() {
  const state = await inspectStagingMigrationState();
  assertMigrationApplied(state);

  const expectedEndpoint = normalizeHostname(process.env.STAGING_NEON_ENDPOINT_HOST ?? "");
  if (!expectedEndpoint || state.connection.endpoint_hostname !== expectedEndpoint) {
    fail("La identidad de staging no coincide con STAGING_NEON_ENDPOINT_HOST.");
  }

  const commercialMigration = readLocalMigration(migrationTags.commercial);
  const { databaseUrl } = loadStagingDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let client;
  let transactionStarted = false;
  let primaryError;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const identityResult = await client.query(`
      select
        current_database() as database_name,
        current_user as role_name,
        current_setting('transaction_read_only') as transaction_read_only,
        current_setting('neon.endpoint_id', true) as neon_endpoint_id,
        current_setting('neon.timeline_id', true) as neon_timeline_id
    `);
    const metadata = { ...identityResult.rows[0], endpoint_hostname: state.connection.endpoint_hostname };
    assertStagingIdentity(
      metadata,
      expectedEndpoint,
      state.connection.neon_endpoint_id ?? state.connection.neon_timeline_id,
    );

    const journalResult = await client.query(`
      select 1
      from drizzle.__drizzle_migrations
      where hash = $1 and created_at = $2
      limit 1
    `, [commercialMigration.hash, commercialMigration.created_at]);
    if (journalResult.rowCount !== 1) {
      fail("La migración 0002 no está aplicada en la conexión que se va a modificar.");
    }

    const dependencies = await readForeignKeys(client);
    const beforeCounts = await readCounts(client);
    console.log(JSON.stringify({
      database_name: metadata.database_name,
      role_name: metadata.role_name,
      endpoint_hostname: expectedEndpoint,
      neon_endpoint_id: metadata.neon_endpoint_id ?? null,
      neon_timeline_id: metadata.neon_timeline_id ?? null,
      migration_0002: "APPLIED",
      dependencies,
      before_counts: beforeCounts,
      auth_tables_targeted: false,
      migration_journal_targeted: false,
    }, null, 2));

    if (!(await confirmDeletion())) {
      fail("Confirmación no recibida; no se eliminó ningún registro.");
    }

    for (const table of targetTables) {
      await client.query(`delete from public."${table}"`);
    }

    const afterCounts = await readCounts(client);
    if (Object.values(afterCounts).some((count) => count !== 0)) {
      fail("La verificación dentro de la transacción detectó registros restantes.");
    }

    await client.query("COMMIT");
    transactionStarted = false;
    console.log(JSON.stringify({
      after_counts: afterCounts,
      auth_preserved: true,
      migrations_preserved: true,
    }, null, 2));
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (client) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (error) {
          if (primaryError) {
            primaryError.cleanupErrors = [...(primaryError.cleanupErrors ?? []), error];
          }
        }
      }
      client.release();
    }
    await pool.end();
  }
}

run().catch((error) => {
  reportSanitizedError("Reset comercial de staging fallido:", error);
  process.exitCode = 1;
});
