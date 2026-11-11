import { randomUUID } from "node:crypto";

import { and, asc, eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({
    getSession: async () => ({ data: { user: { id: "staging-integration-user" } } }),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createMovement } from "../../src/actions/movements";
import { createPurchase } from "../../src/actions/purchases";
import { createSale } from "../../src/actions/sales";
import { GET as exportSales } from "../../src/app/api/export/sales/route";
import { db as actionDb } from "../../src/db";
import { inventoryMovements, products, purchaseItems, purchases, saleItems, sales, suppliers } from "../../src/db/schema";

const runId = randomUUID();
const productNamePrefix = `staging-integration-${runId}`;
const disposableProductIds = new Set<string>();
const disposableSaleIds = new Set<string>();
const disposablePurchaseIds = new Set<string>();
const disposableSupplierNames = new Set<string>();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL debe ser cargado por el comando staging antes de importar el test.");
}

const setupPool = new Pool({ connectionString: databaseUrl, max: 1 });
const setupDb = drizzle(setupPool);

function movementForm(input: {
  productId: string;
  type: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  expectedStock: number;
}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) formData.set(key, String(value));
  return formData;
}

async function createDisposableProduct(currentStock = 10) {
  const [product] = await setupDb
    .insert(products)
    .values({
      name: `${productNamePrefix}-${randomUUID()}`,
      currentStock,
      minimumStock: 0,
    })
    .returning({ id: products.id });

  disposableProductIds.add(product.id);
  return product.id;
}

async function createCommercialProduct(currentStock = 10) {
  const [product] = await setupDb.insert(products).values({
    name: `${productNamePrefix}-${randomUUID()}`,
    currentStock,
    minimumStock: 0,
    sellingPrice: "3.50",
    purchaseCost: "2.10",
    unitOfMeasure: "UNIT",
    isActive: true,
  }).returning({ id: products.id });
  disposableProductIds.add(product.id);
  return product.id;
}

function saleForm(items: unknown[], idempotencyKey = randomUUID()) {
  const formData = new FormData();
  formData.set("paymentMethod", "CASH");
  formData.set("idempotencyKey", idempotencyKey);
  formData.set("items", JSON.stringify(items));
  return formData;
}

function purchaseForm(items: unknown[], supplierName = `${productNamePrefix}-proveedor`, idempotencyKey = randomUUID()) {
  disposableSupplierNames.add(supplierName);
  const formData = new FormData();
  formData.set("supplierName", supplierName);
  formData.set("idempotencyKey", idempotencyKey);
  formData.set("items", JSON.stringify(items));
  return formData;
}

async function getProduct(productId: string) {
  const rows = await setupDb
    .select({ currentStock: products.currentStock })
    .from(products)
    .where(eq(products.id, productId));
  return rows[0];
}

async function getMovements(productId: string) {
  return setupDb
    .select({
      type: inventoryMovements.type,
      reason: inventoryMovements.reason,
      quantity: inventoryMovements.quantity,
      previousStock: inventoryMovements.previousStock,
      resultingStock: inventoryMovements.resultingStock,
      idempotencyKey: inventoryMovements.idempotencyKey,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.productId, productId))
    .orderBy(asc(inventoryMovements.createdAt));
}

async function cleanupDisposableProducts() {
  const ids = [...disposableProductIds];
  if (ids.length === 0) return;

  try {
    for (const productId of ids) {
      await setupDb.delete(inventoryMovements).where(eq(inventoryMovements.productId, productId));
      const relatedSales = await setupDb.select({ id: saleItems.saleId }).from(saleItems).where(eq(saleItems.productId, productId));
      for (const sale of relatedSales) {
        disposableSaleIds.add(sale.id);
      }
      const relatedPurchases = await setupDb.select({ id: purchaseItems.purchaseId }).from(purchaseItems).where(eq(purchaseItems.productId, productId));
      for (const purchase of relatedPurchases) {
        disposablePurchaseIds.add(purchase.id);
      }
    }
    for (const saleId of disposableSaleIds) {
      await setupDb.delete(inventoryMovements).where(eq(inventoryMovements.saleId, saleId));
      await setupDb.delete(saleItems).where(eq(saleItems.saleId, saleId));
      await setupDb.delete(sales).where(eq(sales.id, saleId));
      disposableSaleIds.delete(saleId);
    }
    for (const purchaseId of disposablePurchaseIds) {
      await setupDb.delete(inventoryMovements).where(eq(inventoryMovements.purchaseId, purchaseId));
      await setupDb.delete(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
      await setupDb.delete(purchases).where(eq(purchases.id, purchaseId));
      disposablePurchaseIds.delete(purchaseId);
    }
    for (const productId of ids) {
      await setupDb
        .delete(products)
        .where(and(eq(products.id, productId), like(products.name, `${productNamePrefix}-%`)));
      disposableProductIds.delete(productId);
    }
    for (const supplierName of disposableSupplierNames) {
      await setupDb.delete(suppliers).where(eq(suppliers.name, supplierName));
      disposableSupplierNames.delete(supplierName);
    }
  } catch (error) {
    throw new Error(
      `No se pudo limpiar productos de integración. IDs para recuperación manual: ${ids.join(", ")}`,
      { cause: error },
    );
  }
}

beforeAll(async () => {
  await setupPool.query("select 1");
});

beforeEach(async () => {
  await cleanupDisposableProducts();
});

afterEach(async () => {
  await cleanupDisposableProducts();
});

afterAll(async () => {
  try {
    await cleanupDisposableProducts();
  } finally {
    await setupPool.end();
    await (actionDb.$client as Pool).end();
  }
});

describe("Inventory Increment 1A en staging", () => {
  it("registra una entrada y conserva stock e historial", async () => {
    const productId = await createDisposableProduct();
    const result = await createMovement(null, movementForm({
      productId,
      type: "IN",
      quantity: 3,
      reason: "PURCHASE",
      idempotencyKey: randomUUID(),
      expectedStock: 10,
    }));

    expect(result).toMatchObject({ success: expect.any(String), resultingStock: 13 });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 13 });
    await expect(getMovements(productId)).resolves.toEqual([{
      type: "IN",
      reason: "PURCHASE",
      quantity: 3,
      previousStock: 10,
      resultingStock: 13,
      idempotencyKey: expect.any(String),
    }]);
  });

  it("registra una salida sin permitir stock negativo", async () => {
    const productId = await createDisposableProduct();
    const result = await createMovement(null, movementForm({
      productId,
      type: "OUT",
      quantity: 4,
      reason: "SALE",
      idempotencyKey: randomUUID(),
      expectedStock: 10,
    }));

    expect(result).toMatchObject({ success: expect.any(String), resultingStock: 6 });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 6 });
    await expect(getMovements(productId)).resolves.toEqual([{
      type: "OUT",
      reason: "SALE",
      quantity: 4,
      previousStock: 10,
      resultingStock: 6,
      idempotencyKey: expect.any(String),
    }]);
  });

  it("hace idempotente una repetición exacta", async () => {
    const productId = await createDisposableProduct();
    const idempotencyKey = randomUUID();
    const input = { productId, type: "IN", quantity: 2, reason: "OTHER", idempotencyKey, expectedStock: 10 };

    const first = await createMovement(null, movementForm(input));
    const duplicate = await createMovement(null, movementForm(input));

    expect(first).toMatchObject({ success: expect.any(String), resultingStock: 12 });
    expect(duplicate).toMatchObject({ success: expect.stringContaining("ya estaba registrado"), resultingStock: 12 });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 12 });
    await expect(getMovements(productId)).resolves.toHaveLength(1);
  });

  it("rechaza la misma clave con un payload diferente", async () => {
    const productId = await createDisposableProduct();
    const idempotencyKey = randomUUID();
    const first = await createMovement(null, movementForm({
      productId, type: "IN", quantity: 2, reason: "PURCHASE", idempotencyKey, expectedStock: 10,
    }));
    const conflict = await createMovement(null, movementForm({
      productId, type: "IN", quantity: 3, reason: "PURCHASE", idempotencyKey, expectedStock: 12,
    }));

    expect(first).toMatchObject({ success: expect.any(String), resultingStock: 12 });
    expect(conflict).toEqual({ error: "La clave de idempotencia ya fue usada con datos diferentes." });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 12 });
    await expect(getMovements(productId)).resolves.toHaveLength(1);
  });

  it("rechaza un expectedStock obsoleto sin escribir historial", async () => {
    const productId = await createDisposableProduct();
    const result = await createMovement(null, movementForm({
      productId, type: "OUT", quantity: 1, reason: "SALE", idempotencyKey: randomUUID(), expectedStock: 9,
    }));

    expect(result).toMatchObject({ error: expect.stringContaining("stock cambió"), staleStock: 10 });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 10 });
    await expect(getMovements(productId)).resolves.toHaveLength(0);
  });

  it("serializa solicitudes concurrentes con expectedStock igual", async () => {
    const productId = await createDisposableProduct();
    const results = await Promise.all([
      createMovement(null, movementForm({
        productId, type: "IN", quantity: 1, reason: "PURCHASE", idempotencyKey: randomUUID(), expectedStock: 10,
      })),
      createMovement(null, movementForm({
        productId, type: "IN", quantity: 1, reason: "PURCHASE", idempotencyKey: randomUUID(), expectedStock: 10,
      })),
    ]);

    expect(results.filter((result) => result?.success)).toHaveLength(1);
    expect(results.filter((result) => result?.staleStock === 11)).toHaveLength(1);
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 11 });
    await expect(getMovements(productId)).resolves.toEqual([{
      type: "IN",
      reason: "PURCHASE",
      quantity: 1,
      previousStock: 10,
      resultingStock: 11,
      idempotencyKey: expect.any(String),
    }]);
  });

  it.each([
    ["IN", "SALE"],
    ["IN", "WASTE"],
    ["OUT", "PURCHASE"],
  ])("rechaza la combinación %s/%s antes de escribir", async (type, reason) => {
    const productId = await createDisposableProduct();
    const result = await createMovement(null, movementForm({
      productId, type, quantity: 1, reason, idempotencyKey: randomUUID(), expectedStock: 10,
    }));

    expect(result).toEqual({ error: "El motivo no es válido para el tipo de movimiento seleccionado." });
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 10 });
    await expect(getMovements(productId)).resolves.toHaveLength(0);
  });

  it("preserva campos comerciales del producto", async () => {
    const productId = await createCommercialProduct();
    const product = await setupDb.select({ sellingPrice: products.sellingPrice, purchaseCost: products.purchaseCost, unitOfMeasure: products.unitOfMeasure, isActive: products.isActive }).from(products).where(eq(products.id, productId));

    expect(product[0]).toEqual({ sellingPrice: "3.50", purchaseCost: "2.10", unitOfMeasure: "UNIT", isActive: true });
  });

  it("registra una venta de varios productos con movimientos enlazados y actor", async () => {
    const firstProductId = await createCommercialProduct(10);
    const secondProductId = await createCommercialProduct(8);
    const result = await createSale(null, saleForm([
      { productId: firstProductId, quantity: 2, unitPrice: "3.50" },
      { productId: secondProductId, quantity: 1, unitPrice: "5.00" },
    ]));
    expect(result?.saleId).toBeDefined();
    disposableSaleIds.add(result!.saleId!);

    await expect(getProduct(firstProductId)).resolves.toEqual({ currentStock: 8 });
    await expect(getProduct(secondProductId)).resolves.toEqual({ currentStock: 7 });
    const movementRows = await setupDb.select({ saleId: inventoryMovements.saleId, actorId: inventoryMovements.actorId, reason: inventoryMovements.reason }).from(inventoryMovements).where(eq(inventoryMovements.saleId, result!.saleId!));
    expect(movementRows).toHaveLength(2);
    expect(movementRows.every((row) => row.reason === "SALE" && row.actorId === "staging-integration-user")).toBe(true);
    const items = await setupDb.select().from(saleItems).where(eq(saleItems.saleId, result!.saleId!));
    expect(items).toHaveLength(2);
  });

  it("hace idempotente una venta y rechaza stock insuficiente", async () => {
    const productId = await createCommercialProduct(3);
    const key = randomUUID();
    const input = [{ productId, quantity: 2, unitPrice: "3.50" }];
    const first = await createSale(null, saleForm(input, key));
    expect(first?.saleId).toBeDefined();
    disposableSaleIds.add(first!.saleId!);
    const duplicate = await createSale(null, saleForm(input, key));
    const insufficient = await createSale(null, saleForm([{ productId, quantity: 2, unitPrice: "3.50" }]));

    expect(duplicate?.saleId).toBe(first?.saleId);
    expect(insufficient?.error).toContain("Stock insuficiente");
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 1 });
  });

  it("serializa ventas concurrentes y solo confirma las que tienen stock", async () => {
    const productId = await createCommercialProduct(5);
    const results = await Promise.all([
      createSale(null, saleForm([{ productId, quantity: 4, unitPrice: "3.50" }])),
      createSale(null, saleForm([{ productId, quantity: 4, unitPrice: "3.50" }])),
    ]);
    const successful = results.filter((result) => result?.saleId);
    expect(successful).toHaveLength(1);
    disposableSaleIds.add(successful[0]!.saleId!);
    expect(results.filter((result) => result?.error).length).toBe(1);
    await expect(getProduct(productId)).resolves.toEqual({ currentStock: 1 });
  });

  it("registra una compra de varios productos, aumenta stock y enlaza movimientos", async () => {
    const firstProductId = await createCommercialProduct(2);
    const secondProductId = await createCommercialProduct(4);
    const result = await createPurchase(null, purchaseForm([
      { productId: firstProductId, quantity: 5, unitCost: "2.10" },
      { productId: secondProductId, quantity: 3, unitCost: "1.25" },
    ]));
    expect(result?.purchaseId).toBeDefined();
    disposablePurchaseIds.add(result!.purchaseId!);

    await expect(getProduct(firstProductId)).resolves.toEqual({ currentStock: 7 });
    await expect(getProduct(secondProductId)).resolves.toEqual({ currentStock: 7 });
    const movementRows = await setupDb.select({ purchaseId: inventoryMovements.purchaseId, actorId: inventoryMovements.actorId, reason: inventoryMovements.reason }).from(inventoryMovements).where(eq(inventoryMovements.purchaseId, result!.purchaseId!));
    expect(movementRows).toHaveLength(2);
    expect(movementRows.every((row) => row.reason === "PURCHASE" && row.actorId === "staging-integration-user")).toBe(true);
    await expect(setupDb.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, result!.purchaseId!))).resolves.toHaveLength(2);
  });

  it("exporta ventas con datos trazables", async () => {
    const productId = await createCommercialProduct();
    const result = await createSale(null, saleForm([{ productId, quantity: 1, unitPrice: "3.50" }]));
    expect(result?.saleId).toBeDefined();
    disposableSaleIds.add(result!.saleId!);

    const response = await exportSales();
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(csv).toContain("sale_id,date,product_id,product,quantity,unit_price,line_total,payment_method,actor_id,actor_email,source");
    expect(csv).toContain(`${result!.saleId}`);
    expect(csv).toContain('"SALE"');
  });
});
