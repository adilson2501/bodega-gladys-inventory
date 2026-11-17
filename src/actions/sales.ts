"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { inventoryMovements, products, saleItems, sales } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { getInventoryActor } from "@/lib/auth/actor";
import { centsToMoney, parseMoneyToCents } from "@/lib/commercial/money";
import { saleInputSchema } from "@/lib/validations/commercial";

export type SaleActionState = { error?: string; success?: string; saleId?: string } | null;

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function validationError() {
  return { error: "Revisa los productos, cantidades y forma de pago." };
}

export async function createSale(_previousState: SaleActionState, formData: FormData): Promise<SaleActionState> {
  const { data: session } = await getAuth().getSession();
  const actor = getInventoryActor(session);
  if (!actor) return { error: "Tu sesión terminó. Inicia sesión nuevamente." };

  let items: unknown;
  try {
    items = JSON.parse(formValue(formData, "items"));
  } catch {
    return validationError();
  }

  const parsed = saleInputSchema.safeParse({
    paymentMethod: formValue(formData, "paymentMethod"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
    items,
  });
  if (!parsed.success) return validationError();
  if (new Set(parsed.data.items.map((item) => item.productId)).size !== parsed.data.items.length) {
    return { error: "No repitas un producto dentro de la misma venta." };
  }

  try {
    const operation = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: sales.id }).from(sales).where(eq(sales.idempotencyKey, parsed.data.idempotencyKey));
      if (existing[0]) return { id: existing[0].id, duplicate: true };

      const sortedItems = [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId));
      const lockedProducts = [];
      for (const item of sortedItems) {
        const rows = await tx.select().from(products).where(eq(products.id, item.productId)).for("update");
        const product = rows[0];
        if (!product || !product.isActive) throw new Error("Uno de los productos no está disponible.");
        if (product.currentStock < item.quantity) throw new Error(`Stock insuficiente para ${product.name}.`);
        lockedProducts.push({ item, product });
      }

      const totalCents = parsed.data.items.reduce(
        (total, item) => total + parseMoneyToCents(item.unitPrice) * item.quantity,
        0,
      );
      const inserted = await tx.insert(sales).values({
        paymentMethod: parsed.data.paymentMethod,
        subtotal: centsToMoney(totalCents),
        total: centsToMoney(totalCents),
        idempotencyKey: parsed.data.idempotencyKey,
        actorId: actor.id,
        actorEmail: actor.email,
      }).onConflictDoNothing({ target: sales.idempotencyKey }).returning({ id: sales.id });
      if (!inserted[0]) {
        const raced = await tx.select({ id: sales.id }).from(sales).where(eq(sales.idempotencyKey, parsed.data.idempotencyKey));
        if (!raced[0]) throw new Error("No se pudo recuperar la venta idempotente.");
        return { id: raced[0].id, duplicate: true };
      }

      for (const { item, product } of lockedProducts) {
        const price = centsToMoney(parseMoneyToCents(item.unitPrice));
        const lineTotal = centsToMoney(parseMoneyToCents(item.unitPrice) * item.quantity);
        const resultingStock = product.currentStock - item.quantity;
        await tx.insert(saleItems).values({
          saleId: inserted[0].id,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: price,
          lineTotal,
        });
        await tx.insert(inventoryMovements).values({
          productId: product.id,
          type: "OUT",
          reason: "SALE",
          quantity: item.quantity,
          previousStock: product.currentStock,
          resultingStock,
          idempotencyKey: `sale:${parsed.data.idempotencyKey}:${product.id}`,
          requestFingerprint: null,
          actorId: actor.id,
          actorEmail: actor.email,
          saleId: inserted[0].id,
        });
        await tx.update(products).set({ currentStock: resultingStock, updatedAt: new Date() }).where(eq(products.id, product.id));
      }
      return { id: inserted[0].id, duplicate: false };
    });

    revalidatePath("/");
    revalidatePath("/ventas");
    revalidatePath("/historial");
    revalidatePath("/inventario");
    return { success: operation.duplicate ? "Esta venta ya estaba registrada." : "Venta registrada correctamente.", saleId: operation.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la venta." };
  }
}
