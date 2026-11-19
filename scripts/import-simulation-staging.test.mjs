import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertSafeRuntimeConfig,
  buildImportPlan,
  detectConflicts,
  loadDataset,
  importToStaging,
  reconcileDatabase,
  runDryRun,
  validateDataset,
} from "./import-simulation-staging.mjs";

const output = "ml/data/simulation-v1";
const env = { STAGING_NEON_ENDPOINT_HOST: "ep-staging.neon.tech", PRODUCTION_NEON_ENDPOINT_HOST: "ep-production.neon.tech", STAGING_NEON_ENDPOINT_ID: "staging-id" };

test("rejects a known production endpoint", () => {
  assert.throws(() => assertSafeRuntimeConfig({ env, databaseUrl: "postgresql://u:p@ep-production.neon.tech/db?sslmode=require" }), /production endpoint/);
});

test("rejects an unknown endpoint", () => {
  assert.throws(() => assertSafeRuntimeConfig({ env, databaseUrl: "postgresql://u:p@ep-unknown.neon.tech/db?sslmode=require" }), /does not point/);
});

test("rejects missing staging configuration", () => {
  assert.throws(() => assertSafeRuntimeConfig({ env: {} }), /STAGING_NEON_ENDPOINT_HOST/);
});

test("rejects an invalid manifest hash in a copied fixture", () => {
  const directory = mkdtempSync(join(tmpdir(), "simulation-import-"));
  try {
    cpSync(output, directory, { recursive: true });
    const manifestPath = join(directory, "simulation_manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.source = "REAL";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => loadDataset(directory), /SYNTHETIC/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects invalid references, money, and stock", () => {
  const dataset = loadDataset(output);
  const invalidReference = structuredClone(dataset);
  invalidReference.tables.sale_items[0].product_id = "00000000-0000-0000-0000-000000000000";
  assert.throws(() => validateDataset(invalidReference), /Dataset validation failed/);
  const invalidMoney = structuredClone(dataset);
  invalidMoney.tables.sale_items[0].line_total = "0.01";
  assert.throws(() => validateDataset(invalidMoney), /Dataset validation failed/);
  const invalidStock = structuredClone(dataset);
  invalidStock.tables.inventory_movements[0].previous_stock = "999";
  assert.throws(() => validateDataset(invalidStock), /Dataset validation failed/);
});

test("builds deterministic import plans and detects duplicate batches", async () => {
  const dataset = loadDataset(output);
  const first = buildImportPlan(dataset);
  const second = buildImportPlan(dataset);
  assert.deepEqual(first, second);
  let queries = 0;
  const conflicts = await detectConflicts({ query: async () => { queries += 1; return { rows: queries === 1 ? [{ id: first.products[0].id }] : [] }; } }, first);
  assert.ok(conflicts.length > 0);
});

test("dry-run reports zero writes without a database client", async () => {
  const dataset = loadDataset(output);
  const report = await runDryRun(dataset);
  assert.equal(report.writes, 0);
  assert.equal(report.operations.products, 60);
  assert.deepEqual(report.conflicts, []);
});

function reconciliationClient(dataset, { timestampMismatch = false } = {}) {
  const plan = buildImportPlan(dataset);
  const moneyTotal = (rows) => (rows.reduce((sum, row) => sum + Number(row.total), 0)).toFixed(2);
  return {
    async query(sql) {
      const tableMatch = /public\."([^"]+)"/.exec(sql);
      if (sql.startsWith("select count(*)") && tableMatch) return { rows: [{ count: plan[tableMatch[1]].length }] };
      if (sql.startsWith("select *") && tableMatch) {
        const table = tableMatch[1];
        const rows = structuredClone(plan[table]);
        if (table === "products") {
          for (const row of rows) {
            row.current_stock = Number(dataset.tables.products.find((source) => source.id === row.id).current_stock);
            row.updated_at = `${dataset.manifest.simulation_end}T23:59:59.999Z`;
          }
        }
        if (timestampMismatch && table === "inventory_movements") rows[0].created_at = "2026-08-01T06:00:01.000Z";
        return { rows };
      }
      if (sql.includes("from public.sales where id")) return { rows: [{ count: plan.sales.length, total: moneyTotal(plan.sales), first_created_at: plan.sales[0].created_at, last_created_at: plan.sales.at(-1).created_at }] };
      if (sql.includes("from public.purchases where id")) return { rows: [{ count: plan.purchases.length, total: moneyTotal(plan.purchases), first_created_at: plan.purchases[0].created_at, last_created_at: plan.purchases.at(-1).created_at }] };
      if (sql.startsWith("select id, product_id")) return { rows: structuredClone(plan.inventory_movements) };
      if (sql.startsWith("select id, current_stock")) return { rows: plan.products.map((row) => ({ id: row.id, current_stock: Number(dataset.tables.products.find((source) => source.id === row.id).current_stock) })) };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

test("reconciliation does not report its own inserted batch as conflicts", async () => {
  const dataset = loadDataset(output);
  const report = await reconcileDatabase(reconciliationClient(dataset), dataset);
  assert.deepEqual(report.conflicts, []);
  assert.equal(report.records_match, true);
  assert.equal(report.valid, true, JSON.stringify(report));
});

test("reconciliation uses exact cents and detects historical timestamp changes", async () => {
  const dataset = loadDataset(output);
  const precise = await reconcileDatabase(reconciliationClient(dataset), dataset);
  assert.equal(precise.monetary_totals.sales.expected, precise.monetary_totals.sales.actual);
  assert.equal(precise.monetary_totals.purchases.expected, precise.monetary_totals.purchases.actual);
  const changed = await reconcileDatabase(reconciliationClient(dataset, { timestampMismatch: true }), dataset);
  assert.equal(changed.historical_timestamps, false);
  assert.equal(changed.valid, false);
});

test("validation failure rolls back the atomic import", async () => {
  const dataset = loadDataset(output);
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === "select current_database() as database_name, current_setting('transaction_read_only') as transaction_read_only, current_setting('neon.endpoint_id', true) as neon_endpoint_id, current_setting('neon.timeline_id', true) as neon_timeline_id") return { rows: [{ database_name: "staging", transaction_read_only: "off", neon_endpoint_id: "staging-id" }] };
      if (sql.startsWith("select id from public.")) return { rows: [] };
      if (sql.includes("from public.sales where id") || sql.includes("from public.purchases where id")) return { rows: [{ count: 0, total: "0.00" }] };
      if (sql.startsWith("select count(*)")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, end: async () => {} };
  await assert.rejects(() => importToStaging(dataset, { config: { databaseUrl: "postgresql://staging", endpointId: "staging-id", databaseName: "staging" }, poolFactory: () => pool }), /Post-insert reconciliation failed/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.includes("COMMIT"), false);
});
