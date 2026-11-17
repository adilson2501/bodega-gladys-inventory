"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { inventoryMovements, products, purchaseItems, purchases, suppliers } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { getInventoryActor } from "@/lib/auth/actor";
import { centsToMoney, parseMoneyToCents } from "@/lib/commercial/money";
import { purchaseInputSchema } from "@/lib/validations/commercial";

export type PurchaseActionState = { error?: string; success?: string; purchaseId?: string } | null;

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createPurchase(_previousState: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  const { data: session } = await getAuth().getSession();
  const actor = getInventoryActor(session);
  if (!actor) return { error: "Tu sesión terminó. Inicia sesión nuevamente." };

  let items: unknown;
  try {
    items = JSON.parse(formValue(formData, "items"));
  } catch {
    return { error: "Agrega al menos un producto a la compra." };
  }
  const parsed = purchaseInputSchema.safeParse({ supplierName: formValue(formData, "supplierName"), idempotencyKey: formValue(formData, "idempotencyKey"), items });
  if (!parsed.success) return { error: "Revisa el proveedor, cantidades y costos." };
  if (new Set(parsed.data.items.map((item) => item.productId)).size !== parsed.data.items.length) return { error: "No repitas un producto dentro de la misma compra." };

  try {
    const operation = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: purchases.id }).from(purchases).where(eq(purchases.idempotencyKey, parsed.data.idempotencyKey));
      if (existing[0]) return { id: existing[0].id, duplicate: true };

      const supplierRows = await tx.select().from(suppliers).where(eq(suppliers.name, parsed.data.supplierName));
      let supplier = supplierRows[0];
      if (!supplier) {
        const insertedSupplier = await tx.insert(suppliers).values({ name: parsed.data.supplierName }).onConflictDoNothing({ target: suppliers.name }).returning();
        supplier = insertedSupplier[0] ?? (await tx.select().from(suppliers).where(eq(suppliers.name, parsed.data.supplierName)))[0];
      }

      const sortedItems = [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId));
      const lockedProducts = [];
      for (const item of sortedItems) {
        const rows = await tx.select().from(products).where(eq(products.id, item.productId)).for("update");
        if (!rows[0]) throw new Error("Uno de los productos no existe.");
        lockedProducts.push({ item, product: rows[0] });
      }
      const totalCents = parsed.data.items.reduce((total, item) => total + parseMoneyToCents(item.unitCost) * item.quantity, 0);
      const inserted = await tx.insert(purchases).values({
        supplierId: supplier?.id ?? null,
        supplierName: parsed.data.supplierName,
        subtotal: centsToMoney(totalCents),
        total: centsToMoney(totalCents),
        idempotencyKey: parsed.data.idempotencyKey,
        actorId: actor.id,
        actorEmail: actor.email,
      }).onConflictDoNothing({ target: purchases.idempotencyKey }).returning({ id: purchases.id });
      if (!inserted[0]) {
        const raced = await tx.select({ id: purchases.id }).from(purchases).where(eq(purchases.idempotencyKey, parsed.data.idempotencyKey));
        if (!raced[0]) throw new Error("No se pudo recuperar la compra idempotente.");
        return { id: raced[0].id, duplicate: true };
      }
      for (const { item, product } of lockedProducts) {
        const cost = centsToMoney(parseMoneyToCents(item.unitCost));
        const lineTotal = centsToMoney(parseMoneyToCents(item.unitCost) * item.quantity);
        const resultingStock = product.currentStock + item.quantity;
        await tx.insert(purchaseItems).values({ purchaseId: inserted[0].id, productId: product.id, productName: product.name, quantity: item.quantity, unitCost: cost, lineTotal });
        await tx.insert(inventoryMovements).values({
          productId: product.id,
          type: "IN",
          reason: "PURCHASE",
          quantity: item.quantity,
          previousStock: product.currentStock,
          resultingStock,
          idempotencyKey: `purchase:${parsed.data.idempotencyKey}:${product.id}`,
          requestFingerprint: null,
          actorId: actor.id,
          actorEmail: actor.email,
          purchaseId: inserted[0].id,
        });
        await tx.update(products).set({ currentStock: resultingStock, purchaseCost: cost, updatedAt: new Date() }).where(eq(products.id, product.id));
      }
      return { id: inserted[0].id, duplicate: false };
    });
    revalidatePath("/");
    revalidatePath("/compras");
    revalidatePath("/historial");
    revalidatePath("/inventario");
    return { success: operation.duplicate ? "Esta compra ya estaba registrada." : "Compra registrada correctamente.", purchaseId: operation.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la compra." };
  }
}
