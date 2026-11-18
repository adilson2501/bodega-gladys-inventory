/**
 * Fail-closed importer for the Phase B synthetic batch.
 *
 * This file never falls back to DATABASE_URL. A write requires explicit staging
 * identity, --import, and --confirm-staging-import. The default operational path
 * is --dry-run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";

import { loadStagingDatabase } from "./staging-db.mjs";

export const EXPECTED_COUNTS = {
  products: 60,
  suppliers: 10,
  sales: 931,
  sale_items: 1441,
  purchases: 132,
  purchase_items: 411,
  inventory_movements: 1852,
  event_ledger: 1852,
  daily_product_sales: 5520,
  daily_product_targets: 5100,
};

const TABLE_FILES = {
  products: "products.csv",
  suppliers: "suppliers.csv",
  sales: "sales.csv",
  sale_items: "sale_items.csv",
  purchases: "purchases.csv",
  purchase_items: "purchase_items.csv",
  inventory_movements: "inventory_movements.csv",
  event_ledger: "event_ledger.csv",
  daily_product_sales: "daily_product_sales.csv",
  daily_product_targets: "daily_product_targets.csv",
};
const CONFIGURED_TABLES = ["products", "suppliers", "sales", "sale_items", "purchases", "purchase_items", "inventory_movements"];
const INSERT_COLUMNS = {
  products: ["id", "name", "category", "barcode", "selling_price", "purchase_cost", "unit_of_measure", "is_active", "current_stock", "minimum_stock", "created_at", "updated_at"],
  suppliers: ["id", "name", "phone", "contact", "is_active", "created_at"],
  purchases: ["id", "supplier_id", "supplier_name", "subtotal", "total", "idempotency_key", "actor_id", "actor_email", "created_at"],
  purchase_items: ["id", "purchase_id", "product_id", "product_name", "quantity", "unit_cost", "line_total"],
  sales: ["id", "payment_method", "subtotal", "total", "idempotency_key", "actor_id", "actor_email", "created_at"],
  sale_items: ["id", "sale_id", "product_id", "product_name", "quantity", "unit_price", "line_total"],
  inventory_movements: ["id", "product_id", "type", "reason", "quantity", "previous_stock", "resulting_stock", "idempotency_key", "request_fingerprint", "actor_id", "actor_email", "sale_id", "purchase_id", "created_at"],
};
const PAYMENT_METHODS = new Set(["CASH", "YAPE", "PLIN", "OTHER"]);
const UNITS = new Set(["UNIT", "KG", "LITER", "BOX", "PACK"]);
const MOVEMENT_TYPES = new Set(["IN", "OUT"]);
const MOVEMENT_REASONS = new Set(["PURCHASE", "SALE", "WASTE"]);

export class ImportSafetyError extends Error {}

function fail(message) {
  throw new ImportSafetyError(message);
}

export function normalizeHostname(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

export function assertSafeRuntimeConfig({ env = process.env, databaseUrl } = {}) {
  const stagingHost = normalizeHostname(env.STAGING_NEON_ENDPOINT_HOST);
  const productionHost = normalizeHostname(env.PRODUCTION_NEON_ENDPOINT_HOST);
  if (!stagingHost) fail("STAGING_NEON_ENDPOINT_HOST is required.");
  if (!productionHost) fail("PRODUCTION_NEON_ENDPOINT_HOST is required for fail-closed protection.");
  if (stagingHost === productionHost) fail("The staging endpoint cannot equal the production endpoint.");
  if (stagingHost.includes("/") || stagingHost.includes(":")) fail("STAGING_NEON_ENDPOINT_HOST must be a hostname.");
  if (!env.STAGING_NEON_ENDPOINT_ID) fail("STAGING_NEON_ENDPOINT_ID is required for database identity verification.");
  if (!databaseUrl) return { stagingHost, productionHost };
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("The staging DATABASE_URL is not a valid URL.");
  }
  if (!/[?&]sslmode=require(?:&|$)/i.test(parsed.search) && env.REQUIRE_SSL !== "false") fail("The staging DATABASE_URL must require SSL.");
  const actualHost = normalizeHostname(parsed.hostname);
  if (actualHost === productionHost) fail("DATABASE_URL points to the known production endpoint.");
  if (actualHost !== stagingHost) fail("DATABASE_URL does not point to STAGING_NEON_ENDPOINT_HOST.");
  return { stagingHost, productionHost, actualHost };
}

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, "").trimEnd().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const parseLine = (line) => {
    const fields = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { field += '"'; index += 1; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (character === "," && !quoted) { fields.push(field); field = ""; continue; }
      field += character;
    }
    fields.push(field);
    return fields;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index], value])));
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function parseMoney(value) {
  if (!/^\d+\.\d{2}$/.test(String(value))) fail(`Invalid monetary precision: ${value}`);
  const [whole, cents] = String(value).split(".");
  return Number(whole) * 100 + Number(cents);
}

function parseDatabaseMoney(value) {
  const text = String(value ?? "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2] && match[2].length > 2 && /[^0]/.test(match[2].slice(2)))) fail(`Invalid database monetary value: ${text}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").slice(0, 2).padEnd(2, "0"));
}

function timestampInstant(value) {
  const instant = new Date(value).getTime();
  if (!Number.isFinite(instant)) fail(`Invalid timestamp: ${value}`);
  return instant;
}

function sameTimestamp(actual, expected) {
  return timestampInstant(actual) === timestampInstant(expected);
}

const MONEY_COLUMNS = new Set(["selling_price", "purchase_cost", "subtotal", "total", "unit_cost", "unit_price", "line_total"]);

function sameDatabaseValue(actual, expected, column) {
  if (MONEY_COLUMNS.has(column)) return parseDatabaseMoney(actual) === parseMoney(String(expected));
  if (column === "created_at" || column === "updated_at") return sameTimestamp(actual, expected);
  if (actual == null || expected == null) return actual == null && expected == null;
  return String(actual) === String(expected);
}

function rowsMatchExpected(actualRows, expectedRows, columns) {
  if (actualRows.length !== expectedRows.length) return false;
  const actualById = new Map(actualRows.map((row) => [String(row.id), row]));
  return expectedRows.every((expected) => {
    const actual = actualById.get(String(expected.id));
    return actual && columns.every((column) => sameDatabaseValue(actual[column], expected[column], column));
  });
}

export function loadDataset(outputDirectory) {
  const output = resolve(outputDirectory);
  const manifestPath = resolve(output, "simulation_manifest.json");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { fail("simulation_manifest.json is missing or invalid."); }
  if (manifest.source !== "SYNTHETIC") fail("The importer accepts only SYNTHETIC batches.");
  if (manifest.simulation_start !== "2026-08-01" || manifest.simulation_end !== "2026-10-31") fail("The batch date range is not the approved 92-day period.");
  if (!manifest.batch_id || !manifest.generator_version) fail("The manifest has no immutable batch identity.");
  if (manifest.record_counts && Object.keys(EXPECTED_COUNTS).some((key) => manifest.record_counts[key] !== EXPECTED_COUNTS[key] || Object.keys(manifest.record_counts).length !== Object.keys(EXPECTED_COUNTS).length)) fail("Manifest record counts do not match the approved batch.");
  if (!manifest.record_counts) fail("Manifest record_counts is required; legacy batches are rejected.");
  const tables = {};
  for (const [key, filename] of Object.entries(TABLE_FILES)) {
    const path = resolve(output, filename);
    if (!manifest.sha256?.[filename] || hashFile(path) !== manifest.sha256[filename]) fail(`SHA-256 mismatch for ${filename}.`);
    tables[key] = parseCsv(readFileSync(path, "utf8"));
  }
  for (const [key, count] of Object.entries(EXPECTED_COUNTS)) if (tables[key].length !== count) fail(`${key} has ${tables[key].length} rows; expected ${count}.`);
  const reportFiles = ["commercial_diagnostics.json", "stock_reconciliation.json", "validation_summary.json"];
  for (const filename of reportFiles) if (!manifest.sha256?.[filename] || hashFile(resolve(output, filename)) !== manifest.sha256[filename]) fail(`SHA-256 mismatch for ${filename}.`);
  validateDataset({ manifest, tables });
  return { output, manifest, tables };
}

export function validateDataset({ manifest, tables }) {
  const errors = [];
  const products = tables.products;
  const productIds = new Set(products.map((row) => row.id));
  const supplierIds = new Set(tables.suppliers.map((row) => row.id));
  const saleIds = new Set(tables.sales.map((row) => row.id));
  const purchaseIds = new Set(tables.purchases.map((row) => row.id));
  const dateStart = manifest.simulation_start;
  const dateEnd = manifest.simulation_end;
  const dateOk = (value) => value >= dateStart && value <= dateEnd;
  const unique = (rows, key) => new Set(rows.map((row) => row[key])).size === rows.length;
  if (Object.values(tables).some((rows) => rows.some((row) => row.source !== "SYNTHETIC"))) errors.push("non-synthetic row provenance");
  if (!unique(products, "id") || products.length !== 60) errors.push("invalid product identifiers");
  if (!unique(tables.suppliers, "id") || tables.suppliers.length !== 10) errors.push("invalid supplier identifiers");
  if (!unique(tables.sales, "id") || !unique(tables.purchases, "id")) errors.push("duplicate transaction identifiers");
  for (const row of products) {
    try { if (parseMoney(row.selling_price) <= parseMoney(row.purchase_cost) || !UNITS.has(row.unit_of_measure)) errors.push(`invalid product pricing/unit ${row.id}`); } catch { errors.push(`invalid product pricing ${row.id}`); }
  }
  const checkTransaction = (rows, itemRows, itemKey, totalKey, idKey) => {
    for (const row of rows) {
      if (!dateOk(row.created_at.slice(0, 10))) errors.push(`transaction outside period ${row[idKey]}`);
      const items = itemRows.filter((item) => item[itemKey] === row[idKey]);
      if (!items.length || new Set(items.map((item) => item.product_id)).size !== items.length) errors.push(`invalid item composition ${row[idKey]}`);
      const total = items.reduce((sum, item) => sum + parseMoney(item.line_total), 0);
      if (total !== parseMoney(row[totalKey])) errors.push(`monetary mismatch ${row[idKey]}`);
    }
  };
  checkTransaction(tables.sales, tables.sale_items, "sale_id", "total", "id");
  checkTransaction(tables.purchases, tables.purchase_items, "purchase_id", "total", "id");
  if (tables.sales.some((row) => !PAYMENT_METHODS.has(row.payment_method))) errors.push("invalid payment method");
  if (tables.purchases.some((row) => !supplierIds.has(row.supplier_id))) errors.push("invalid supplier reference");
  for (const item of [...tables.sale_items, ...tables.purchase_items]) if (!productIds.has(item.product_id) || Number(item.quantity) <= 0 || !Number.isInteger(Number(item.quantity))) errors.push(`invalid item reference/quantity ${item.id}`);
  const movementKeys = new Set();
  const stock = new Map(products.map((row) => [row.id, 0]));
  const movements = [...tables.inventory_movements].sort((a, b) => `${a.created_at}${a.id}`.localeCompare(`${b.created_at}${b.id}`));
  for (const movement of movements) {
    if (!dateOk(movement.created_at.slice(0, 10)) || !MOVEMENT_TYPES.has(movement.type) || !MOVEMENT_REASONS.has(movement.reason) || Number(movement.quantity) <= 0) errors.push(`invalid movement ${movement.id}`);
    const key = `${movement.sale_id || movement.purchase_id || movement.id}:${movement.product_id}`;
    if (movement.reason !== "WASTE" && movementKeys.has(key)) errors.push(`duplicate movement link ${key}`);
    movementKeys.add(key);
    if (!stock.has(movement.product_id) || Number(movement.previous_stock) !== stock.get(movement.product_id)) errors.push(`movement previous stock mismatch ${movement.id}`);
    const expected = Number(movement.previous_stock) + (movement.type === "IN" ? Number(movement.quantity) : -Number(movement.quantity));
    if (Number(movement.resulting_stock) !== expected || expected < 0) errors.push(`movement resulting stock mismatch ${movement.id}`);
    stock.set(movement.product_id, expected);
  }
  for (const product of products) if (Number(product.current_stock) !== stock.get(product.id)) errors.push(`final stock mismatch ${product.id}`);
  if (tables.daily_product_sales.length !== 60 * 92 || tables.daily_product_targets.length !== 60 * 85) errors.push("product-day coverage mismatch");
  if (tables.daily_product_targets.some((row) => row.date > "2026-10-24" || row.target_status !== "COMPLETE")) errors.push("incomplete future target");
  if (tables.inventory_movements.length !== manifest.record_counts.inventory_movements) errors.push("movement count mismatch");
  if (errors.length) fail(`Dataset validation failed:\n${errors.join("\n")}`);
  return { valid: true, productIds, supplierIds, saleIds, purchaseIds };
}

export function buildImportPlan(dataset) {
  const { tables, manifest } = dataset;
  const batchKey = `synthetic:${manifest.batch_id}`;
  const timestamp = `${manifest.simulation_start}T00:00:00.000Z`;
  return {
    batchKey,
    products: tables.products.map((row) => ({ id: row.id, name: row.name, category: row.category, barcode: null, selling_price: row.selling_price, purchase_cost: row.purchase_cost, unit_of_measure: row.unit_of_measure, is_active: true, current_stock: 0, minimum_stock: Number(row.minimum_stock), created_at: timestamp, updated_at: timestamp })),
    suppliers: tables.suppliers.map((row) => ({ id: row.id, name: row.name, phone: null, contact: null, is_active: true, created_at: timestamp })),
    purchases: tables.purchases.map((row) => ({ ...row, idempotency_key: `${batchKey}:purchase:${row.id}`, actor_id: null, actor_email: null })),
    purchase_items: tables.purchase_items,
    sales: tables.sales.map((row) => ({ ...row, idempotency_key: `${batchKey}:sale:${row.id}`, actor_id: null, actor_email: null })),
    sale_items: tables.sale_items,
    inventory_movements: tables.inventory_movements.map((row) => ({ ...row, sale_id: row.sale_id || null, purchase_id: row.purchase_id || null, idempotency_key: `${batchKey}:movement:${row.id}`, request_fingerprint: createHash("sha256").update(JSON.stringify(row)).digest("hex"), actor_id: null, actor_email: null })),
  };
}

export async function detectConflicts(client, plan) {
  const conflicts = [];
  for (const [table, rows, key] of [["products", plan.products, "id"], ["suppliers", plan.suppliers, "id"], ["sales", plan.sales, "idempotency_key"], ["purchases", plan.purchases, "idempotency_key"], ["inventory_movements", plan.inventory_movements, "idempotency_key"], ["sale_items", plan.sale_items, "id"], ["purchase_items", plan.purchase_items, "id"]]) {
    const cast = key === "id" ? "uuid[]" : "text[]";
    const result = await client.query(`select ${key} from public."${table}" where ${key} = any($1::${cast}) limit 20`, [rows.map((row) => String(row[key]))]);
    if (result.rows.length) conflicts.push({ table, rows: result.rows.map((row) => row[key]) });
  }
  return conflicts;
}

async function assertDatabaseIdentity(client, config, writeTransaction = false) {
  if (writeTransaction) await client.query("BEGIN");
  else await client.query("BEGIN READ ONLY");
  const result = await client.query("select current_database() as database_name, current_setting('transaction_read_only') as transaction_read_only, current_setting('neon.endpoint_id', true) as neon_endpoint_id, current_setting('neon.timeline_id', true) as neon_timeline_id");
  const row = result.rows[0];
  if (!writeTransaction && row.transaction_read_only !== "on") fail("Identity check was not read-only.");
  if (writeTransaction && row.transaction_read_only !== "off") fail("Import transaction is not writable as expected.");
  const actualIdentity = row.neon_endpoint_id || row.neon_timeline_id;
  if (actualIdentity !== config.endpointId) fail("Neon identity does not match STAGING_NEON_ENDPOINT_ID.");
  if (config.databaseName && row.database_name !== config.databaseName) fail("Database name does not match STAGING_NEON_DATABASE_NAME.");
  return row;
}

async function loadSafeConfig() {
  assertSafeRuntimeConfig();
  const staging = loadStagingDatabase();
  const safe = assertSafeRuntimeConfig({ databaseUrl: staging.databaseUrl });
  return { ...staging, ...safe, endpointId: process.env.STAGING_NEON_ENDPOINT_ID, databaseName: process.env.STAGING_NEON_DATABASE_NAME };
}

export async function runDryRun(dataset, { client = null } = {}) {
  const plan = buildImportPlan(dataset);
  const conflicts = client ? await detectConflicts(client, plan) : [];
  return { mode: "dry-run", writes: 0, conflicts, operations: Object.fromEntries(CONFIGURED_TABLES.map((table) => [table, plan[table].length])), batch_id: dataset.manifest.batch_id };
}

async function insertRows(client, table, columns, rows) {
  const maxRowsPerStatement = Math.max(1, Math.floor(65535 / columns.length));
  for (let offset = 0; offset < rows.length; offset += maxRowsPerStatement) {
    const batch = rows.slice(offset, offset + maxRowsPerStatement);
    const values = batch.flatMap((row) => columns.map((column) => row[column]));
    const placeholders = batch.map((_, rowIndex) => `(${columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`).join(", ");
    await client.query(`insert into public."${table}" (${columns.map((column) => `"${column}"`).join(", ")}) values ${placeholders}`, values);
  }
}

export async function importToStaging(dataset, { config, poolFactory = (url) => new Pool({ connectionString: url, max: 1 }) } = {}) {
  if (!config) fail("A verified staging configuration is required.");
  const pool = poolFactory(config.databaseUrl);
  const client = await pool.connect();
  try {
    await assertDatabaseIdentity(client, config, true);
    const plan = buildImportPlan(dataset);
    const conflicts = await detectConflicts(client, plan);
    if (conflicts.length) fail(`Existing staging records conflict with this batch: ${JSON.stringify(conflicts)}`);
    for (const table of CONFIGURED_TABLES) await insertRows(client, table, INSERT_COLUMNS[table], plan[table]);
    for (const product of dataset.tables.products) await client.query("update public.products set current_stock = $1, updated_at = $2 where id = $3", [Number(product.current_stock), `${dataset.manifest.simulation_end}T23:59:59.999Z`, product.id]);
    const reconciliation = await reconcileDatabase(client, dataset);
    if (!reconciliation.valid) fail(`Post-insert reconciliation failed: ${JSON.stringify(reconciliation)}`);
    await client.query("COMMIT");
    return { mode: "import", writes: Object.fromEntries(CONFIGURED_TABLES.map((table) => [table, plan[table].length])), batch_id: dataset.manifest.batch_id, reconciliation };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function reconcileDatabase(client, dataset) {
  const plan = buildImportPlan(dataset);
  // Records from this batch are expected to exist after insertion; they are not conflicts.
  // Duplicate protection is exclusively the pre-insert detectConflicts check.
  const report = { batch_id: dataset.manifest.batch_id, valid: true, counts: {}, conflicts: [], records_match: true, monetary_totals: {}, historical_timestamps: true, movement_sequence: true, provenance: true, final_stock: [] };
  for (const table of CONFIGURED_TABLES) {
    const rows = plan[table];
    const expectedRows = table === "products"
      ? rows.map((row) => ({ ...row, current_stock: Number(dataset.tables.products.find((source) => source.id === row.id).current_stock), updated_at: `${dataset.manifest.simulation_end}T23:59:59.999Z` }))
      : rows;
    const key = table === "sales" || table === "purchases" || table === "inventory_movements" ? "idempotency_key" : "id";
    const cast = key === "id" ? "uuid[]" : "text[]";
    const result = await client.query(`select count(*)::int as count from public."${table}" where ${key} = any($1::${cast})`, [rows.map((row) => String(row[key]))]);
    report.counts[table] = { expected: rows.length, actual: result.rows[0].count };
    if (Number(result.rows[0].count) !== rows.length) report.valid = false;
    const records = await client.query(`select * from public."${table}" where ${key} = any($1::${cast})`, [rows.map((row) => String(row[key]))]);
    if (!rowsMatchExpected(records.rows, expectedRows, INSERT_COLUMNS[table])) report.records_match = false;
    if (INSERT_COLUMNS[table].includes("created_at")) {
      const actualById = new Map(records.rows.map((row) => [String(row.id), row]));
      for (const expected of expectedRows) {
        const actual = actualById.get(String(expected.id));
        if (actual && !sameTimestamp(actual.created_at, expected.created_at)) report.historical_timestamps = false;
      }
    }
  }
  if (!report.records_match) report.valid = false;
  const saleTotals = await client.query("select count(*)::int as count, coalesce(sum(total), 0)::numeric(12,2) as total, min(created_at) as first_created_at, max(created_at) as last_created_at from public.sales where id = any($1::uuid[])", [plan.sales.map((row) => row.id)]);
  const purchaseTotals = await client.query("select count(*)::int as count, coalesce(sum(total), 0)::numeric(12,2) as total, min(created_at) as first_created_at, max(created_at) as last_created_at from public.purchases where id = any($1::uuid[])", [plan.purchases.map((row) => row.id)]);
  report.monetary_totals = { sales: { expected: plan.sales.reduce((sum, row) => sum + parseMoney(row.total), 0), actual: parseDatabaseMoney(saleTotals.rows[0].total) }, purchases: { expected: plan.purchases.reduce((sum, row) => sum + parseMoney(row.total), 0), actual: parseDatabaseMoney(purchaseTotals.rows[0].total) } };
  if (report.monetary_totals.sales.expected !== report.monetary_totals.sales.actual || report.monetary_totals.purchases.expected !== report.monetary_totals.purchases.actual) report.valid = false;
  const movementResult = await client.query("select id, product_id, type, reason, quantity, previous_stock, resulting_stock, sale_id, purchase_id, created_at, idempotency_key from public.inventory_movements where id = any($1::uuid[]) order by created_at, id", [plan.inventory_movements.map((row) => row.id)]);
  const expectedMovements = new Map(plan.inventory_movements.map((row) => [row.id, row]));
  if (movementResult.rows.length !== plan.inventory_movements.length) report.movement_sequence = false;
  for (const row of movementResult.rows) {
    const expected = expectedMovements.get(row.id);
    if (!expected || row.product_id !== expected.product_id || row.type !== expected.type || row.reason !== expected.reason || Number(row.quantity) !== Number(expected.quantity) || Number(row.previous_stock) !== Number(expected.previous_stock) || Number(row.resulting_stock) !== Number(expected.resulting_stock) || row.idempotency_key !== expected.idempotency_key) report.movement_sequence = false;
    if (expected && !sameTimestamp(row.created_at, expected.created_at)) report.historical_timestamps = false;
  }
  if (!report.movement_sequence || !report.historical_timestamps) report.valid = false;
  const stock = await client.query("select id, current_stock from public.products where id = any($1::uuid[]) order by id", [plan.products.map((row) => row.id)]);
  report.final_stock = stock.rows;
  if (stock.rows.length !== plan.products.length || stock.rows.some((row) => Number(row.current_stock) !== Number(dataset.tables.products.find((product) => product.id === row.id)?.current_stock))) report.valid = false;
  if (report.conflicts.length) report.provenance = false;
  if (!report.provenance) report.valid = false;
  return report;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "ml/data/simulation-v1";
  if (args.has("--import") && !args.has("--confirm-staging-import")) fail("Write mode requires --confirm-staging-import.");
  if (!args.has("--dry-run") && !args.has("--import") && !args.has("--reconcile")) fail("Choose --dry-run, --import, or --reconcile.");
  const dataset = loadDataset(output);
  const config = await loadSafeConfig();
  if (args.has("--dry-run") && !args.has("--inspect-database")) console.log(JSON.stringify(await runDryRun(dataset), null, 2));
  else {
    const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await assertDatabaseIdentity(client, config, false);
      await client.query("ROLLBACK");
      if (args.has("--dry-run")) {
        await client.query("BEGIN READ ONLY");
        const report = await runDryRun(dataset, { client });
        await client.query("ROLLBACK");
        console.log(JSON.stringify(report, null, 2));
      } else if (args.has("--reconcile")) {
        await client.query("BEGIN READ ONLY");
        const report = await reconcileDatabase(client, dataset);
        await client.query("ROLLBACK");
        console.log(JSON.stringify(report, null, 2));
      }
      else console.log(JSON.stringify(await importToStaging(dataset, { config }), null, 2));
    } finally { client.release(); await pool.end(); }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
