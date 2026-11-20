"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { inventoryMovements, products, saleItems, sales } from "@/db/schema";
import {
  getAuthorizationErrorMessage,
  requirePermission,
  type CurrentActor,
} from "@/lib/auth/authorization";
import { addCents, centsToMoney, multiplyCents, parseMoneyToCents } from "@/lib/commercial/money";
import { createCommercialFingerprint } from "@/lib/inventory/idempotency";
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
  let actor: CurrentActor;
  try {
    actor = await requirePermission("sales:create");
  } catch (error) {
    return { error: getAuthorizationErrorMessage(error) };
  }

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
      const fingerprint = createCommercialFingerprint({ type: "sale", paymentMethod: parsed.data.paymentMethod, items: parsed.data.items });
      const existing = await tx.select({ id: sales.id, requestFingerprint: sales.requestFingerprint }).from(sales).where(eq(sales.idempotencyKey, parsed.data.idempotencyKey));
      if (existing[0]) {
        if (existing[0].requestFingerprint && existing[0].requestFingerprint !== fingerprint) throw new Error("La clave de idempotencia ya fue utilizada con otra venta.");
        return { id: existing[0].id, duplicate: true };
      }

      const sortedItems = [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId));
      const lockedProducts = [];
      for (const item of sortedItems) {
        const rows = await tx.select().from(products).where(eq(products.id, item.productId)).for("update");
        const product = rows[0];
        if (!product || !product.isActive) throw new Error("Uno de los productos no está disponible.");
        if (product.currentStock < item.quantity) throw new Error(`Stock insuficiente para ${product.name}.`);
        const submittedCents = parseMoneyToCents(item.unitPrice);
        const catalogCents = parseMoneyToCents(product.sellingPrice);
        if (catalogCents <= 0) throw new Error(`El producto ${product.name} no tiene un precio de venta válido.`);
        if (submittedCents !== catalogCents) throw new Error(`El precio de ${product.name} cambió. Actualiza la venta e inténtalo de nuevo.`);
        lockedProducts.push({ item, product });
      }

      const totalCents = lockedProducts.reduce((total, { item, product }) => addCents(total, multiplyCents(parseMoneyToCents(product.sellingPrice), item.quantity)), 0);
      const inserted = await tx.insert(sales).values({
        paymentMethod: parsed.data.paymentMethod,
        subtotal: centsToMoney(totalCents),
        total: centsToMoney(totalCents),
        idempotencyKey: parsed.data.idempotencyKey,
        requestFingerprint: fingerprint,
        actorId: actor.id,
        actorEmail: actor.email,
      }).onConflictDoNothing({ target: sales.idempotencyKey }).returning({ id: sales.id });
      if (!inserted[0]) {
        const raced = await tx.select({ id: sales.id, requestFingerprint: sales.requestFingerprint }).from(sales).where(eq(sales.idempotencyKey, parsed.data.idempotencyKey));
        if (!raced[0]) throw new Error("No se pudo recuperar la venta idempotente.");
        if (raced[0].requestFingerprint && raced[0].requestFingerprint !== fingerprint) throw new Error("La clave de idempotencia ya fue utilizada con otra venta.");
        return { id: raced[0].id, duplicate: true };
      }

      for (const { item, product } of lockedProducts) {
        const priceCents = parseMoneyToCents(product.sellingPrice);
        const price = centsToMoney(priceCents);
        const lineTotal = centsToMoney(multiplyCents(priceCents, item.quantity));
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
