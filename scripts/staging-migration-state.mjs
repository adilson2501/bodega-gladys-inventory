import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { withVerifiedStagingConnection } from "./staging-db.mjs";

export const migrationTags = {
  initial: "0000_volatile_shadow_king",
  target: "0001_sparkling_falcon",
  commercial: "0002_mysterious_peter_parker",
};

export const expectedTargetObjects = {
  columns: ["idempotency_key", "request_fingerprint"],
  index: "inventory_movements_idempotency_key_uidx",
  constraint: "inventory_movements_type_reason_valid",
};

export const expectedCommercialObjects = {
  tables: ["purchase_items", "purchases", "sale_items", "sales", "suppliers"],
  columns: {
    inventory_movements: ["actor_id", "actor_email", "sale_id", "purchase_id"],
    products: ["selling_price", "purchase_cost", "unit_of_measure", "is_active"],
  },
  enums: ["payment_method", "unit_of_measure"],
  indexes: [
    "purchase_items_purchase_id_idx",
    "purchases_idempotency_key_uidx",
    "purchases_created_at_idx",
    "sale_items_sale_id_idx",
    "sales_idempotency_key_uidx",
    "sales_created_at_idx",
    "suppliers_name_uidx",
  ],
  constraints: [
    "purchase_items_quantity_positive",
    "sale_items_quantity_positive",
    "purchase_items_purchase_id_purchases_id_fk",
    "purchase_items_product_id_products_id_fk",
    "purchases_supplier_id_suppliers_id_fk",
    "sale_items_sale_id_sales_id_fk",
    "sale_items_product_id_products_id_fk",
    "inventory_movements_sale_id_sales_id_fk",
    "inventory_movements_purchase_id_purchases_id_fk",
  ],
};

function fail(message) {
  throw new Error(message);
}

export function readLocalMigration(tag) {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries?.find(({ tag: entryTag }) => entryTag === tag);
  if (!entry) {
    fail(`El journal local no contiene ${tag}.`);
  }

  const sql = readFileSync(`drizzle/${tag}.sql`, "utf8");
  return {
    tag,
    hash: createHash("sha256").update(sql).digest("hex"),
    created_at: String(entry.when),
    sql,
  };
}

function inspectTargetSql(sql) {
  return {
    columns: expectedTargetObjects.columns.every((column) =>
      sql.includes(`ADD COLUMN "${column}"`),
    ),
    index: sql.includes(`CREATE UNIQUE INDEX "${expectedTargetObjects.index}"`),
    constraint: sql.includes(`ADD CONSTRAINT "${expectedTargetObjects.constraint}"`),
  };
}

function inspectCommercialSql(sql) {
  return {
    tables: expectedCommercialObjects.tables.every((table) => sql.includes(`CREATE TABLE "${table}"`)),
    columns: Object.entries(expectedCommercialObjects.columns).every(([table, columns]) =>
      columns.every((column) => sql.includes(`ALTER TABLE "${table}" ADD COLUMN "${column}"`)),
    ),
    enums: expectedCommercialObjects.enums.every((type) => sql.includes(`CREATE TYPE "public"."${type}"`)),
    indexes: expectedCommercialObjects.indexes.every((index) => sql.includes(`"${index}"`)),
    constraints: expectedCommercialObjects.constraints.every((constraint) => sql.includes(`"${constraint}"`)),
  };
}

function hasJournalEntry(rows, migration) {
  return rows.some(
    (row) => row.hash === migration.hash && String(row.created_at) === migration.created_at,
  );
}

function hasJournalConflict(rows, migration) {
  return rows.some(
    (row) => String(row.created_at) === migration.created_at && row.hash !== migration.hash,
  );
}

function classifyCommercialStatus({ journalAvailable, applied, conflict, objectsPresent, sqlValid }) {
  const objectValues = Object.values(objectsPresent);
  const objectCount = objectValues.filter(Boolean).length;
  if (!journalAvailable) return "UNKNOWN";
  if (!sqlValid || conflict) return "INCONSISTENT";
  if (applied && objectValues.every(Boolean)) return "APPLIED";
  if (applied) return "INCONSISTENT";
  if (objectCount === 0) return "NOT_APPLIED";
  if (objectCount < objectValues.length) return "PARTIALLY_APPLIED";
  return "INCONSISTENT";
}

function classifyStatus({
  journalAvailable,
  initialApplied,
  targetApplied,
  initialJournalConflict,
  targetJournalConflict,
  objectState,
  sqlDefinitionValid,
}) {
  const objectCount = Object.values(objectState).filter(Boolean).length;
  const allObjectsPresent = objectCount === 3;

  if (!journalAvailable) return "UNKNOWN";
  if (!sqlDefinitionValid || !initialApplied || initialJournalConflict || targetJournalConflict) {
    return "INCONSISTENT";
  }
  if (targetApplied && allObjectsPresent) return "APPLIED";
  if (targetApplied) return "INCONSISTENT";
  if (objectCount === 0) return "NOT_APPLIED";
  if (!allObjectsPresent) return "PARTIALLY_APPLIED";
  return "INCONSISTENT";
}

export function assertMigrationPreflight(report) {
  if (report.status !== "NOT_APPLIED") {
    throw new Error(`Preflight staging rechazado: estado ${report.status}.`);
  }
  if (!report.migration_0000.applied) {
    throw new Error("Preflight staging rechazado: 0000 no está aplicada.");
  }
  if (!report.migration_0001.sql_definition_valid) {
    throw new Error("Preflight staging rechazado: SQL local de 0001 no coincide con sus objetos esperados.");
  }
  if (report.migration_0001.journal_entry || report.migration_0001.all_objects_present) {
    throw new Error("Preflight staging rechazado: 0001 o sus objetos ya existen.");
  }
}

export function assertNextMigrationPreflight(report) {
  if (report.migration_0001_status !== "APPLIED") {
    throw new Error(`Preflight staging rechazado: 0001 está en estado ${report.migration_0001_status}.`);
  }
  if (report.status !== "NOT_APPLIED") {
    throw new Error(`Preflight staging rechazado: 0002 está en estado ${report.status}.`);
  }

  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const latestEntry = journal.entries?.at(-1);
  if (!latestEntry || latestEntry.tag === migrationTags.target) {
    throw new Error("No hay una migración posterior segura para aplicar.");
  }

  const latestMigration = readLocalMigration(latestEntry.tag);
  const exactEntry = report.remote_journal.some(
    (row) => row.hash === latestMigration.hash && String(row.created_at) === latestMigration.created_at,
  );
  const conflictingEntry = report.remote_journal.some(
    (row) => String(row.created_at) === latestMigration.created_at && row.hash !== latestMigration.hash,
  );
  if (exactEntry || conflictingEntry) {
    throw new Error(`Preflight staging rechazado: ${latestMigration.tag} ya está aplicada o es inconsistente.`);
  }
}

export async function inspectStagingMigrationState() {
  const initialMigration = readLocalMigration(migrationTags.initial);
  const targetMigration = readLocalMigration(migrationTags.target);
  const commercialMigration = readLocalMigration(migrationTags.commercial);
  const sqlDefinitionState = inspectTargetSql(targetMigration.sql);
  const commercialSqlDefinitionState = inspectCommercialSql(commercialMigration.sql);

  return withVerifiedStagingConnection(async ({ client, endpointHostname, metadata }) => {
    const tableResult = await client.query(`
      select to_regclass('drizzle.__drizzle_migrations') as migration_table
    `);
    const journalAvailable = Boolean(tableResult.rows[0].migration_table);
    const journalRows = journalAvailable
      ? (await client.query(`
          select id, hash, created_at
          from drizzle.__drizzle_migrations
          order by created_at, id
        `)).rows
      : [];

    const columns = (await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inventory_movements'
        and column_name = any($1::text[])
      order by column_name
    `, [expectedTargetObjects.columns])).rows;

    const indexes = (await client.query(`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'inventory_movements'
        and indexname = $1
    `, [expectedTargetObjects.index])).rows;

    const constraints = (await client.query(`
      select c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'inventory_movements'
        and c.conname = $1
    `, [expectedTargetObjects.constraint])).rows;

    const commercialTables = (await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])
    `, [expectedCommercialObjects.tables])).rows;
    const commercialColumns = (await client.query(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
        and column_name = any($2::text[])
    `, [Object.keys(expectedCommercialObjects.columns), Object.values(expectedCommercialObjects.columns).flat()])).rows;
    const commercialTypes = (await client.query(`
      select typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = any($1::text[]) and t.typtype = 'e'
    `, [expectedCommercialObjects.enums])).rows;
    const commercialIndexes = (await client.query(`
      select indexname
      from pg_indexes
      where schemaname = 'public' and indexname = any($1::text[])
    `, [expectedCommercialObjects.indexes])).rows;
    const commercialConstraints = (await client.query(`
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and c.conname = any($1::text[])
    `, [expectedCommercialObjects.constraints])).rows;

    const objectState = {
      idempotency_key: columns.some(({ column_name }) => column_name === "idempotency_key"),
      request_fingerprint: columns.some(({ column_name }) => column_name === "request_fingerprint"),
      idempotency_index: indexes.length === 1,
      type_reason_constraint: constraints.length === 1,
    };
    const targetObjectsPresent = Object.values(objectState).every(Boolean);
    const targetApplied = hasJournalEntry(journalRows, targetMigration);
    const initialApplied = hasJournalEntry(journalRows, initialMigration);
    const initialJournalConflict = hasJournalConflict(journalRows, initialMigration);
    const targetJournalConflict = hasJournalConflict(journalRows, targetMigration);
    const commercialApplied = hasJournalEntry(journalRows, commercialMigration);
    const commercialJournalConflict = hasJournalConflict(journalRows, commercialMigration);
    const commercialObjectState = {
      tables: expectedCommercialObjects.tables.every((table) => commercialTables.some((row) => row.table_name === table)),
      columns: Object.entries(expectedCommercialObjects.columns).every(([table, columns]) =>
        columns.every((column) => commercialColumns.some((row) => row.table_name === table && row.column_name === column)),
      ),
      enums: expectedCommercialObjects.enums.every((type) => commercialTypes.some((row) => row.typname === type)),
      indexes: expectedCommercialObjects.indexes.every((index) => commercialIndexes.some((row) => row.indexname === index)),
      constraints: expectedCommercialObjects.constraints.every((constraint) => commercialConstraints.some((row) => row.conname === constraint)),
    };
    const commercialStatus = classifyCommercialStatus({
      journalAvailable,
      applied: commercialApplied,
      conflict: commercialJournalConflict,
      objectsPresent: commercialObjectState,
      sqlValid: Object.values(commercialSqlDefinitionState).every(Boolean),
    });
    const status = classifyStatus({
      journalAvailable,
      initialApplied,
      targetApplied,
      initialJournalConflict,
      targetJournalConflict,
      objectState: {
        columns: objectState.idempotency_key && objectState.request_fingerprint,
        index: objectState.idempotency_index,
        constraint: objectState.type_reason_constraint,
      },
      sqlDefinitionValid: Object.values(sqlDefinitionState).every(Boolean),
    });

    return {
      status: commercialStatus,
      migration_0001_status: status,
      connection: {
        database_name: metadata.database_name,
        role_name: metadata.role_name,
        endpoint_hostname: endpointHostname,
        transaction_read_only: metadata.transaction_read_only,
        neon_timeline_id: metadata.neon_timeline_id ?? null,
        neon_endpoint_id: metadata.neon_endpoint_id ?? null,
      },
      local_migrations: [initialMigration, targetMigration, commercialMigration].map(({ tag, hash, created_at }) => ({
        tag,
        hash,
        created_at,
      })),
      remote_journal: journalRows,
      migration_0000: { applied: initialApplied, journal_conflict: initialJournalConflict },
      migration_0001: {
        journal_entry: targetApplied,
        journal_conflict: targetJournalConflict,
        sql_objects_expected: expectedTargetObjects,
        sql_definition_valid: sqlDefinitionState,
        objects_present: objectState,
        all_objects_present: targetObjectsPresent,
      },
      migration_0002: {
        journal_entry: commercialApplied,
        journal_conflict: commercialJournalConflict,
        sql_objects_expected: expectedCommercialObjects,
        sql_definition_valid: commercialSqlDefinitionState,
        objects_present: commercialObjectState,
        all_objects_present: Object.values(commercialObjectState).every(Boolean),
      },
    };
  });
}
