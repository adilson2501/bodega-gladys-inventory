import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { withVerifiedStagingConnection } from "./staging-db.mjs";

export const migrationTags = {
  initial: "0000_volatile_shadow_king",
  inventory: "0001_sparkling_falcon",
  commercial: "0002_mysterious_peter_parker",
  authorization: "0003_app-user-roles",
  integrity: "0004_familiar_rick_jones",
};

export const migrationOrder = Object.values(migrationTags);

export const migrationObjects = {
  [migrationTags.initial]: {
    tables: ["inventory_movements", "products"],
    constraints: [
      "inventory_movements_quantity_positive",
      "inventory_movements_previous_stock_non_negative",
      "inventory_movements_resulting_stock_non_negative",
      "inventory_movements_product_id_products_id_fk",
    ],
  },
  [migrationTags.inventory]: {
    columns: { inventory_movements: ["idempotency_key", "request_fingerprint"] },
    indexes: ["inventory_movements_idempotency_key_uidx"],
    constraints: ["inventory_movements_type_reason_valid"],
  },
  [migrationTags.commercial]: {
    tables: ["purchase_items", "purchases", "sale_items", "sales", "suppliers"],
    columns: {
      inventory_movements: ["actor_id", "actor_email", "sale_id", "purchase_id"],
      products: ["selling_price", "purchase_cost", "unit_of_measure", "is_active"],
    },
    enums: ["payment_method", "unit_of_measure"],
    indexes: [
      "purchase_items_purchase_id_idx", "purchases_idempotency_key_uidx", "purchases_created_at_idx",
      "sale_items_sale_id_idx", "sales_idempotency_key_uidx", "sales_created_at_idx", "suppliers_name_uidx",
    ],
    constraints: [
      "purchase_items_quantity_positive", "sale_items_quantity_positive",
      "purchase_items_purchase_id_purchases_id_fk", "purchase_items_product_id_products_id_fk",
      "purchases_supplier_id_suppliers_id_fk", "sale_items_sale_id_sales_id_fk",
      "sale_items_product_id_products_id_fk", "inventory_movements_sale_id_sales_id_fk",
      "inventory_movements_purchase_id_purchases_id_fk",
    ],
  },
  [migrationTags.authorization]: {
    tables: ["app_user_roles"],
    enums: ["app_role"],
  },
  [migrationTags.integrity]: {
    columns: { sales: ["request_fingerprint"], purchases: ["request_fingerprint"] },
    constraints: [
      "products_selling_price_non_negative", "products_purchase_cost_non_negative",
      "purchase_items_unit_cost_non_negative", "purchase_items_line_total_non_negative",
      "purchase_items_line_total_consistent", "purchases_subtotal_non_negative",
      "purchases_total_non_negative", "purchases_subtotal_matches_total",
      "sale_items_unit_price_non_negative", "sale_items_line_total_non_negative",
      "sale_items_line_total_consistent", "sales_subtotal_non_negative",
      "sales_total_non_negative", "sales_subtotal_matches_total",
    ],
  },
};

const monetaryConstraintNames = new Set(migrationObjects[migrationTags.integrity].constraints);

function fail(message) {
  throw new Error(message);
}

export function readLocalMigration(tag) {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries?.find(({ tag: entryTag }) => entryTag === tag);
  if (!entry) fail(`El journal local no contiene ${tag}.`);
  const sql = readFileSync(`drizzle/${tag}.sql`, "utf8");
  return { tag, hash: createHash("sha256").update(sql).digest("hex"), created_at: String(entry.when), sql };
}

export function readLocalMigrations() {
  return migrationOrder.map(readLocalMigration);
}

function expectedObjectEntries(objects) {
  return [
    ...(objects.tables ?? []).map((name) => ["table", name]),
    ...(objects.enums ?? []).map((name) => ["enum", name]),
    ...(objects.indexes ?? []).map((name) => ["index", name]),
    ...(objects.constraints ?? []).map((name) => ["constraint", name]),
    ...Object.entries(objects.columns ?? {}).flatMap(([table, columns]) => columns.map((name) => ["column", `${table}.${name}`])),
  ];
}

function objectPresence(objects, databaseObjects) {
  const collectionName = { table: "tables", enum: "enums", index: "indexes", constraint: "constraints", column: "columns" };
  return Object.fromEntries(expectedObjectEntries(objects).map(([kind, name]) => [name, databaseObjects[collectionName[kind]]?.has(name) ?? false]));
}

function isApplied(row, migration) {
  return row?.hash === migration.hash && String(row.created_at) === migration.created_at;
}

export function buildMigrationReport(localMigrations, remoteJournal, databaseObjects, journalAvailable = true) {
  const unknownJournalEntries = remoteJournal.filter((row) => !localMigrations.some((migration) => migration.hash === row.hash));
  const migrations = localMigrations.map((migration, index) => {
    const exact = remoteJournal.find((row) => isApplied(row, migration));
    const conflict = remoteJournal.some((row) => String(row.created_at) === migration.created_at && row.hash !== migration.hash);
    const objects = objectPresence(migrationObjects[migration.tag] ?? {}, databaseObjects);
    const objectValues = Object.values(objects);
    const objectCount = objectValues.filter(Boolean).length;
    let status = "UNKNOWN";
    if (journalAvailable) {
      if (conflict || (exact && objectCount !== objectValues.length) || (!exact && objectCount > 0)) status = "INCONSISTENT";
      else if (exact && objectValues.every(Boolean)) status = "APPLIED";
      else if (objectCount > 0) status = "PARTIALLY_APPLIED";
      else status = "NOT_APPLIED";
    }
    return {
      number: index,
      tag: migration.tag,
      journal_entry: Boolean(exact),
      journal_conflict: conflict,
      status,
      objects_present: objects,
      all_objects_present: objectValues.every(Boolean),
      pending: status === "NOT_APPLIED",
    };
  });

  const appliedIndexes = migrations.filter((migration) => migration.status === "APPLIED").map((migration) => migration.number);
  const remoteKnownIndexes = remoteJournal
    .map((row) => localMigrations.findIndex((migration) => migration.hash === row.hash))
    .filter((index) => index >= 0);
  const unexpectedRemoteOrder = remoteKnownIndexes.some((number, index) => number !== remoteKnownIndexes.slice().sort((a, b) => a - b)[index]);
  const unexpectedOrder = appliedIndexes.some((number, index) => number !== index) || unexpectedRemoteOrder;
  const blockers = [];
  if (!journalAvailable) blockers.push("No existe el journal de Drizzle en Staging.");
  if (unknownJournalEntries.length) blockers.push("El journal contiene hashes de migraciones desconocidas.");
  if (unexpectedOrder) blockers.push("Las migraciones aplicadas no respetan el orden local.");
  if (migrations.some((migration) => migration.status === "INCONSISTENT" || migration.status === "PARTIALLY_APPLIED")) blockers.push("Existe una migración inconsistente o parcialmente aplicada.");

  const next = migrations.find((migration) => migration.status === "NOT_APPLIED");
  const pending = migrations.filter((migration) => migration.pending).map((migration) => migration.tag);
  const allApplied = migrations.every((migration) => migration.status === "APPLIED");
  return {
    status: blockers.length ? "INCONSISTENT" : allApplied ? "APPLIED" : "PENDING",
    blockers,
    pending_migrations: pending,
    next_migration: next?.tag ?? null,
    unexpected_order: unexpectedOrder,
    unexpected_remote_order: unexpectedRemoteOrder,
    unknown_journal_entries: unknownJournalEntries,
    migrations,
    remote_journal: remoteJournal,
    // Compatibility fields used by existing operational scripts.
    migration_0001_status: migrations[1]?.status,
    migration_0002_status: migrations[2]?.status,
    migration_0003_status: migrations[3]?.status,
    migration_0004_status: migrations[4]?.status,
  };
}

function hasTable(capabilities, table) {
  return capabilities.tables.has(table);
}

function hasColumn(capabilities, table, column) {
  return capabilities.columns.get(table)?.has(column) ?? false;
}

function hasColumns(capabilities, table, columns) {
  return hasTable(capabilities, table) && columns.every((column) => hasColumn(capabilities, table, column));
}

export function buildHistoricalPreflightReport({ checks, constraints }) {
  const availableChecks = checks.filter((check) => check.available !== false);
  const violations = availableChecks.filter((check) => check.count > 0);
  const unavailable = checks.filter((check) => check.available === false);
  const existingConstraintNames = new Set(constraints.map((constraint) => constraint.conname));
  const missingConstraints = [...monetaryConstraintNames].filter((name) => !existingConstraintNames.has(name));
  const unvalidatedConstraints = constraints.filter((constraint) => constraint.convalidated === false).map((constraint) => constraint.conname);
  return {
    status: violations.length || unvalidatedConstraints.length ? "BLOCKED" : unavailable.length || missingConstraints.length ? "INCOMPLETE" : "CLEAR",
    checks,
    blocking_findings: violations.map(({ name, count, example_ids }) => ({ name, count, example_ids })),
    unavailable_checks: unavailable.map(({ name, reason }) => ({ name, reason })),
    constraints,
    missing_constraints: missingConstraints,
    unvalidated_constraints: unvalidatedConstraints,
  };
}

async function violationQuery(client, name, sql, available = true, reason) {
  if (!available) return { name, available: false, reason, count: null, example_ids: [] };
  const result = await client.query(sql);
  const row = result.rows[0] ?? {};
  return { name, available: true, count: Number(row.count ?? 0), example_ids: row.example_ids ?? [] };
}

export async function runHistoricalPreflight(client, capabilities, constraints) {
  const checks = [];
  checks.push(await violationQuery(client, "products_negative_money", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.products WHERE selling_price < 0 OR purchase_cost < 0 LIMIT 5) v`, hasColumns(capabilities, "products", ["selling_price", "purchase_cost"]), "columnas monetarias de products ausentes"));
  checks.push(await violationQuery(client, "sales_inconsistent_totals", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.sales WHERE subtotal < 0 OR total < 0 OR subtotal <> total LIMIT 5) v`, hasColumns(capabilities, "sales", ["subtotal", "total"]), "columnas de sales ausentes"));
  checks.push(await violationQuery(client, "purchases_inconsistent_totals", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.purchases WHERE subtotal < 0 OR total < 0 OR subtotal <> total LIMIT 5) v`, hasColumns(capabilities, "purchases", ["subtotal", "total"]), "columnas de purchases ausentes"));
  checks.push(await violationQuery(client, "sale_items_inconsistent_lines", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.sale_items WHERE unit_price < 0 OR line_total < 0 OR line_total <> unit_price * quantity LIMIT 5) v`, hasColumns(capabilities, "sale_items", ["unit_price", "line_total", "quantity"]), "columnas de sale_items ausentes"));
  checks.push(await violationQuery(client, "purchase_items_inconsistent_lines", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.purchase_items WHERE unit_cost < 0 OR line_total < 0 OR line_total <> unit_cost * quantity LIMIT 5) v`, hasColumns(capabilities, "purchase_items", ["unit_cost", "line_total", "quantity"]), "columnas de purchase_items ausentes"));
  checks.push(await violationQuery(client, "duplicate_sales_idempotency_keys", `SELECT count(*)::bigint AS count, COALESCE(json_agg(idempotency_key), '[]') AS example_ids FROM (SELECT idempotency_key FROM public.sales GROUP BY idempotency_key HAVING count(*) > 1 LIMIT 5) v`, hasColumns(capabilities, "sales", ["idempotency_key"]), "idempotency_key de sales ausente"));
  checks.push(await violationQuery(client, "duplicate_purchases_idempotency_keys", `SELECT count(*)::bigint AS count, COALESCE(json_agg(idempotency_key), '[]') AS example_ids FROM (SELECT idempotency_key FROM public.purchases GROUP BY idempotency_key HAVING count(*) > 1 LIMIT 5) v`, hasColumns(capabilities, "purchases", ["idempotency_key"]), "idempotency_key de purchases ausente"));
  checks.push(await violationQuery(client, "duplicate_movement_idempotency_keys", `SELECT count(*)::bigint AS count, COALESCE(json_agg(idempotency_key), '[]') AS example_ids FROM (SELECT idempotency_key FROM public.inventory_movements WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING count(*) > 1 LIMIT 5) v`, hasColumns(capabilities, "inventory_movements", ["idempotency_key"]), "idempotency_key de inventory_movements ausente"));
  checks.push(await violationQuery(client, "inventory_negative_stock", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.products WHERE current_stock < 0 OR minimum_stock < 0 LIMIT 5) v`, hasTable(capabilities, "products"), "products no existe"));
  checks.push(await violationQuery(client, "inventory_invalid_movements", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.inventory_movements WHERE quantity <= 0 OR previous_stock < 0 OR resulting_stock < 0 LIMIT 5) v`, hasTable(capabilities, "inventory_movements"), "inventory_movements no existe"));
  checks.push(await violationQuery(client, "inventory_movement_stock_arithmetic", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.inventory_movements WHERE (type = 'IN' AND resulting_stock <> previous_stock + quantity) OR (type = 'OUT' AND resulting_stock <> previous_stock - quantity) LIMIT 5) v`, hasColumns(capabilities, "inventory_movements", ["type", "resulting_stock", "previous_stock", "quantity"]), "columnas de inventory_movements ausentes"));
  checks.push(await violationQuery(client, "orphan_sale_movements", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT m.id FROM public.inventory_movements m LEFT JOIN public.sales s ON s.id = m.sale_id WHERE m.sale_id IS NOT NULL AND s.id IS NULL LIMIT 5) v`, hasColumns(capabilities, "inventory_movements", ["sale_id"]) && hasTable(capabilities, "sales"), "relación de ventas ausente"));
  checks.push(await violationQuery(client, "orphan_purchase_movements", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT m.id FROM public.inventory_movements m LEFT JOIN public.purchases p ON p.id = m.purchase_id WHERE m.purchase_id IS NOT NULL AND p.id IS NULL LIMIT 5) v`, hasColumns(capabilities, "inventory_movements", ["purchase_id"]) && hasTable(capabilities, "purchases"), "relación de compras ausente"));
  checks.push(await violationQuery(client, "movement_with_two_documents", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.inventory_movements WHERE sale_id IS NOT NULL AND purchase_id IS NOT NULL LIMIT 5) v`, hasColumns(capabilities, "inventory_movements", ["sale_id", "purchase_id"]), "relaciones comerciales ausentes"));
  checks.push(await violationQuery(client, "products_latest_movement_stock_mismatch", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT p.id FROM public.products p JOIN (SELECT DISTINCT ON (product_id) product_id, resulting_stock FROM public.inventory_movements ORDER BY product_id, created_at DESC, id DESC) m ON m.product_id = p.id WHERE p.current_stock <> m.resulting_stock LIMIT 5) v`, hasTable(capabilities, "products") && hasTable(capabilities, "inventory_movements"), "products o inventory_movements no existe"));

  const salesFingerprintAvailable = hasColumn(capabilities, "sales", "request_fingerprint");
  const purchasesFingerprintAvailable = hasColumn(capabilities, "purchases", "request_fingerprint");
  checks.push(await violationQuery(client, "conflicting_sales_fingerprints", `SELECT count(*)::bigint AS count, COALESCE(json_agg(idempotency_key), '[]') AS example_ids FROM (SELECT idempotency_key FROM public.sales WHERE request_fingerprint IS NOT NULL GROUP BY idempotency_key HAVING count(DISTINCT request_fingerprint) > 1 LIMIT 5) v`, salesFingerprintAvailable, "request_fingerprint no existe en sales"));
  checks.push(await violationQuery(client, "conflicting_purchase_fingerprints", `SELECT count(*)::bigint AS count, COALESCE(json_agg(idempotency_key), '[]') AS example_ids FROM (SELECT idempotency_key FROM public.purchases WHERE request_fingerprint IS NOT NULL GROUP BY idempotency_key HAVING count(DISTINCT request_fingerprint) > 1 LIMIT 5) v`, purchasesFingerprintAvailable, "request_fingerprint no existe en purchases"));
  checks.push(await violationQuery(client, "monetary_overflow", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.products WHERE selling_price > 99999999.99 OR purchase_cost > 99999999.99 LIMIT 5) v`, hasColumns(capabilities, "products", ["selling_price", "purchase_cost"]), "columnas monetarias de products ausentes"));
  checks.push(await violationQuery(client, "inventory_type_reason_mismatch", `SELECT count(*)::bigint AS count, COALESCE(json_agg(id), '[]') AS example_ids FROM (SELECT id FROM public.inventory_movements WHERE (type = 'IN' AND reason NOT IN ('PURCHASE', 'ADJUSTMENT', 'OTHER')) OR (type = 'OUT' AND reason NOT IN ('SALE', 'ADJUSTMENT', 'WASTE', 'OTHER')) LIMIT 5) v`, hasTable(capabilities, "inventory_movements"), "inventory_movements no existe"));
  return buildHistoricalPreflightReport({ checks, capabilities, constraints });
}

async function readCapabilities(client) {
  const tables = new Set((await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map(({ table_name }) => table_name));
  const columnRows = (await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`)).rows;
  const columns = new Map();
  for (const row of columnRows) columns.set(row.table_name, new Set([...(columns.get(row.table_name) ?? []), row.column_name]));
  const enums = new Set((await client.query(`SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'`)).rows.map(({ typname }) => typname));
  const indexes = new Set((await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map(({ indexname }) => indexname));
  const constraints = (await client.query(`SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`)).rows;
  return { tables, columns, enums, indexes, constraints };
}

export async function inspectStagingMigrationState() {
  const localMigrations = readLocalMigrations();
  return withVerifiedStagingConnection(async ({ client, endpointHostname, metadata }) => {
    const journalTable = await client.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table`);
    const journalAvailable = Boolean(journalTable.rows[0]?.migration_table);
    const remoteJournal = journalAvailable ? (await client.query(`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id`)).rows : [];
    const capabilities = await readCapabilities(client);
    const migrationReport = buildMigrationReport(localMigrations, remoteJournal, {
      tables: capabilities.tables,
      columns: new Set([...capabilities.columns].flatMap(([table, columns]) => [...columns].map((column) => `${table}.${column}`))),
      enums: capabilities.enums,
      indexes: capabilities.indexes,
      constraints: new Set(capabilities.constraints.map(({ conname }) => conname)),
    }, journalAvailable);
    const historical = await runHistoricalPreflight(client, capabilities, capabilities.constraints.filter(({ conname }) => monetaryConstraintNames.has(conname)));
    return {
      ...migrationReport,
      connection: {
        database_name: metadata.database_name,
        role_name: metadata.role_name,
        endpoint_hostname: endpointHostname,
        transaction_read_only: metadata.transaction_read_only,
        neon_timeline_id: metadata.neon_timeline_id ?? null,
        neon_endpoint_id: metadata.neon_endpoint_id ?? null,
      },
      journal_available: journalAvailable,
      historical_preflight: historical,
      capabilities: {
        tables: [...capabilities.tables].sort(),
        columns: Object.fromEntries([...capabilities.columns].map(([table, columns]) => [table, [...columns].sort()])),
        monetary_constraints: historical.constraints,
      },
      local_migrations: localMigrations.map(({ tag, hash, created_at }) => ({ tag, hash, created_at })),
    };
  });
}

export function assertMigrationPreflight(report) {
  if (report.status !== "PENDING" || report.next_migration !== migrationTags.authorization) {
    throw new Error(`Preflight staging rechazado: estado ${report.status}, siguiente ${report.next_migration ?? "ninguna"}.`);
  }
  if (report.historical_preflight?.status === "BLOCKED") throw new Error("Preflight staging rechazado: hay hallazgos históricos bloqueantes.");
}

export function assertNextMigrationPreflight(report) {
  if (report.status !== "PENDING" || !report.next_migration) throw new Error(`Preflight staging rechazado: estado ${report.status}.`);
  if (report.historical_preflight?.status === "BLOCKED") throw new Error("Preflight staging rechazado: hay hallazgos históricos bloqueantes.");
}
