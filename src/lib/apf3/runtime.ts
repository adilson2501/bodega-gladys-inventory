import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { inventoryMovements, products, saleItems, sales } from "@/db/schema";
import { APF3_CUTOFF, buildApf3Record } from "@/lib/apf3/features";
export { APF3_CUTOFF, buildApf3Record } from "@/lib/apf3/features";

const MODEL_VERSION = "apf3-models-1.1";
const INFERENCE_TIMEOUT_MS = 30_000;


async function invokePython(record: Record<string, unknown>) {
  const serviceUrl = process.env.APF3_SERVICE_URL ?? "http://127.0.0.1:8000";
  const secret = process.env.APF3_INTERNAL_SECRET;
  if (!secret) throw new Error("APF3_INTERNAL_SECRET is required.");

  const response = await fetch(new URL("/predict", serviceUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "x-apf3-internal-secret": secret },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
  });
  const body = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { payload = { detail: body }; }
  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null && "detail" in payload ? String(payload.detail) : "Unknown inference error";
    throw new Error(`APF3 service error (${response.status}): ${detail}`);
  }
  return payload as { forecast_next_7d_units: number; model_version: string; model: string; horizon_days: number; source: string; product_id: string; cutoff_date: string };
}

export async function modelFingerprint() {
  const artifact = await readFile(join(process.cwd(), "ml/artifacts/apf3/model.joblib"));
  return createHash("sha256").update(artifact).digest("hex");
}

export async function createPrediction(productId: string, cutoff: string) {
  if (cutoff !== APF3_CUTOFF) throw new Error(`La fecha de corte soportada es ${APF3_CUTOFF}.`);
  const [product] = await db.select({ id: products.id, name: products.name, category: products.category, unitOfMeasure: products.unitOfMeasure }).from(products).where(and(eq(products.id, productId), eq(products.origin, "SYNTHETIC"))).limit(1);
  if (!product) throw new Error("Producto sintético no encontrado.");
  const saleRows = await db.select({ productId: saleItems.productId, quantity: saleItems.quantity, date: sales.createdAt }).from(saleItems).innerJoin(sales, eq(saleItems.saleId, sales.id)).where(and(eq(saleItems.productId, productId), eq(saleItems.origin, "SYNTHETIC"), eq(sales.origin, "SYNTHETIC"), lte(sales.createdAt, new Date(`${cutoff}T23:59:59.999Z`)))).orderBy(asc(sales.createdAt));
  const movementRows = await db.select({ productId: inventoryMovements.productId, resultingStock: inventoryMovements.resultingStock, date: inventoryMovements.createdAt }).from(inventoryMovements).where(and(eq(inventoryMovements.productId, productId), eq(inventoryMovements.origin, "SYNTHETIC"), lte(inventoryMovements.createdAt, new Date(`${cutoff}T23:59:59.999Z`)))).orderBy(asc(inventoryMovements.createdAt));
  const record = buildApf3Record(product, saleRows, movementRows, cutoff);
  return { product, record, prediction: await invokePython(record), modelHash: await modelFingerprint(), modelVersion: MODEL_VERSION };
}
