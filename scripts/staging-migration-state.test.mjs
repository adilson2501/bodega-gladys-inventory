import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHistoricalPreflightReport,
  buildMigrationReport,
  migrationObjects,
  migrationOrder,
  readLocalMigrations,
  runHistoricalPreflight,
} from "./staging-migration-state.mjs";
import { assertReadOnlyMetadata, validateStagingEndpoint } from "./staging-db.mjs";

function objectSetFor(tags) {
  const databaseObjects = {
    tables: new Set(),
    enums: new Set(),
    indexes: new Set(),
    constraints: new Set(),
    columns: new Set(),
  };
  for (const tag of tags) {
    const objects = migrationObjects[tag];
    for (const table of objects.tables ?? []) databaseObjects.tables.add(table);
    for (const name of objects.enums ?? []) databaseObjects.enums.add(name);
    for (const name of objects.indexes ?? []) databaseObjects.indexes.add(name);
    for (const name of objects.constraints ?? []) databaseObjects.constraints.add(name);
    for (const [table, columns] of Object.entries(objects.columns ?? {})) {
      for (const column of columns) databaseObjects.columns.add(`${table}.${column}`);
    }
  }
  return databaseObjects;
}

function journalFor(local, tags) {
  return tags.map((tag) => {
    const migration = local.find((entry) => entry.tag === tag);
    return { id: migrationOrder.indexOf(tag), hash: migration.hash, created_at: migration.created_at };
  });
}

test("detecta 0003 pendiente después de 0000-0002", () => {
  const local = readLocalMigrations();
  const report = buildMigrationReport(local, journalFor(local, migrationOrder.slice(0, 3)), objectSetFor(migrationOrder.slice(0, 3)));
  assert.equal(report.next_migration, migrationOrder[3]);
  assert.deepEqual(report.pending_migrations, migrationOrder.slice(3));
  assert.equal(report.migration_0003_status, "NOT_APPLIED");
});

test("detecta 0004 pendiente después de aplicar 0003", () => {
  const local = readLocalMigrations();
  const report = buildMigrationReport(local, journalFor(local, migrationOrder.slice(0, 4)), objectSetFor(migrationOrder.slice(0, 4)));
  assert.equal(report.next_migration, migrationOrder[4]);
  assert.equal(report.migration_0003_status, "APPLIED");
  assert.equal(report.migration_0004_status, "NOT_APPLIED");
});

test("reconoce las cinco migraciones aplicadas", () => {
  const local = readLocalMigrations();
  const report = buildMigrationReport(local, journalFor(local, migrationOrder), objectSetFor(migrationOrder));
  assert.equal(report.status, "APPLIED");
  assert.deepEqual(report.pending_migrations, []);
});

test("rechaza journal con orden inesperado", () => {
  const local = readLocalMigrations();
  const report = buildMigrationReport(local, journalFor(local, [migrationOrder[0], migrationOrder[2], migrationOrder[1]]), objectSetFor(migrationOrder.slice(0, 3)));
  assert.equal(report.unexpected_order, true);
  assert.equal(report.status, "INCONSISTENT");
});

test("detecta objetos faltantes como migración parcial", () => {
  const local = readLocalMigrations();
  const partialObjects = objectSetFor(migrationOrder);
  partialObjects.constraints.delete("sales_total_non_negative");
  const report = buildMigrationReport(local, journalFor(local, migrationOrder), partialObjects);
  assert.equal(report.migration_0004_status, "INCONSISTENT");
  assert.match(report.blockers.join(" "), /inconsistente/);
});

test("reporta violaciones históricas y constraints no validados", () => {
  const report = buildHistoricalPreflightReport({
    checks: [
      { name: "negative_money", available: true, count: 2, example_ids: ["p-1"] },
      { name: "fingerprints", available: false, count: null, example_ids: [], reason: "columna ausente" },
    ],
    capabilities: {},
    constraints: [{ conname: "sales_total_non_negative", convalidated: false }],
  });
  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(report.blocking_findings[0].example_ids, ["p-1"]);
  assert.equal(report.unvalidated_constraints[0], "sales_total_non_negative");
  assert.match(report.unavailable_checks[0].reason, /ausente/);
});

test("no consulta request_fingerprint antes de 0004", async () => {
  const capabilities = {
    tables: new Set(["products", "sales", "purchases", "inventory_movements"]),
    columns: new Map([
      ["products", new Set(["selling_price", "purchase_cost", "current_stock", "minimum_stock"])],
      ["sales", new Set(["id", "subtotal", "total", "idempotency_key"])],
      ["purchases", new Set(["id", "subtotal", "total", "idempotency_key"])],
      ["inventory_movements", new Set(["id", "idempotency_key", "quantity", "previous_stock", "resulting_stock", "type", "reason"])],
    ]),
  };
  const queries = [];
  const report = await runHistoricalPreflight({
    async query(sql) {
      queries.push(sql);
      assert.equal(sql.includes("request_fingerprint"), false);
      return { rows: [{ count: "0", example_ids: [] }] };
    },
  }, capabilities, []);
  assert.ok(report.unavailable_checks.some(({ name }) => name === "conflicting_sales_fingerprints"));
  assert.ok(queries.length > 0);
});

test("valida endpoint y modo read-only sin conectarse", () => {
  assert.throws(() => validateStagingEndpoint({
    expectedEndpoint: "ep-staging.neon.tech",
    productionEndpoint: "ep-production.neon.tech",
    databaseUrl: "postgresql://user:secret@ep-production.neon.tech/db",
  }), /Production/);
  assert.throws(() => validateStagingEndpoint({
    expectedEndpoint: "ep-staging.neon.tech",
    databaseUrl: "postgresql://user:secret@ep-other.neon.tech/db",
  }), /no coincide/);
  assert.throws(() => assertReadOnlyMetadata({ transaction_read_only: "off" }), /read-only/);
  assert.doesNotThrow(() => assertReadOnlyMetadata({ transaction_read_only: "on" }));
});
