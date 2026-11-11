"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { getInventoryActor } from "@/lib/auth/actor";
import { createRequestFingerprint } from "@/lib/inventory/idempotency";
import {
  calculateStockAdjustment,
  calculateResultingStock,
  movementInputSchema,
  MovementRuleError,
  stockAdjustmentInputSchema,
} from "@/lib/inventory/movement-rules";

export type MovementActionState = {
  error?: string;
  success?: string;
  resultingStock?: number;
  staleStock?: number;
} | null;

class StaleStockError extends Error {
  constructor(readonly currentStock: number) {
    super(
      `El stock cambió de ${currentStock}. Actualiza la pantalla y confirma nuevamente la operación.`,
    );
  }
}

class IdempotencyConflictError extends Error {
  constructor() {
    super("La clave de idempotencia ya fue usada con datos diferentes.");
  }
}

function getFormValue(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function getValidationError(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = error.issues;
    if (Array.isArray(issues) && issues[0]?.message) {
      return issues[0].message;
    }
  }

  return "Revisa los datos del movimiento.";
}

function pathsToRevalidate() {
  return ["/movimiento", "/", "/inventario", "/productos", "/historial", "/ajustar"];
}

async function getExistingMovement(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], key: string) {
  const rows = await tx
    .select({
      requestFingerprint: inventoryMovements.requestFingerprint,
      resultingStock: inventoryMovements.resultingStock,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.idempotencyKey, key));

  return rows[0];
}

function assertMatchingExistingMovement(
  existing: { requestFingerprint: string | null; resultingStock: number } | undefined,
  fingerprint: string,
) {
  if (!existing) return null;
  if (existing.requestFingerprint !== fingerprint) {
    throw new IdempotencyConflictError();
  }

  return { resultingStock: existing.resultingStock, duplicate: true };
}

export async function createMovement(
  _previousState: MovementActionState,
  formData: FormData,
): Promise<MovementActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { error: "Tu sesión terminó. Inicia sesión nuevamente." };
  }
  const actor = getInventoryActor(session);

  const result = movementInputSchema.safeParse({
    productId: getFormValue(formData, "productId"),
    type: getFormValue(formData, "type"),
    quantity: getFormValue(formData, "quantity"),
    reason: getFormValue(formData, "reason"),
    idempotencyKey: getFormValue(formData, "idempotencyKey"),
    expectedStock: getFormValue(formData, "expectedStock"),
  });

  if (!result.success) {
    return { error: getValidationError(result.error) };
  }

  const fingerprint = createRequestFingerprint({
    expectedStock: result.data.expectedStock,
    productId: result.data.productId,
    quantity: result.data.quantity,
    reason: result.data.reason,
    type: result.data.type,
  });

  try {
    const operation = await db.transaction(async (tx) => {
      const initialExisting = assertMatchingExistingMovement(
        await getExistingMovement(tx, result.data.idempotencyKey),
        fingerprint,
      );
      if (initialExisting) return initialExisting;

      const productRows = await tx
        .select({ id: products.id, currentStock: products.currentStock })
        .from(products)
        .where(eq(products.id, result.data.productId))
        .for("update");
      const product = productRows[0];
      if (!product) throw new MovementRuleError("No se encontró el producto seleccionado.");

      const lockedExisting = assertMatchingExistingMovement(
        await getExistingMovement(tx, result.data.idempotencyKey),
        fingerprint,
      );
      if (lockedExisting) return lockedExisting;

      if (product.currentStock !== result.data.expectedStock) {
        throw new StaleStockError(product.currentStock);
      }

      const resultingStock = calculateResultingStock(
        product.currentStock,
        result.data.type,
        result.data.quantity,
      );

      const inserted = await tx
        .insert(inventoryMovements)
        .values({
          productId: product.id,
          type: result.data.type,
          reason: result.data.reason,
          quantity: result.data.quantity,
          previousStock: product.currentStock,
          resultingStock,
          idempotencyKey: result.data.idempotencyKey,
          requestFingerprint: fingerprint,
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
        })
        .onConflictDoNothing()
        .returning({ resultingStock: inventoryMovements.resultingStock });

      if (inserted.length === 0) {
        const raced = assertMatchingExistingMovement(
          await getExistingMovement(tx, result.data.idempotencyKey),
          fingerprint,
        );
        if (!raced) throw new Error("No se pudo recuperar el movimiento idempotente.");
        return raced;
      }

      await tx
        .update(products)
        .set({ currentStock: resultingStock, updatedAt: new Date() })
        .where(eq(products.id, product.id));

      return { resultingStock, duplicate: false };
    });

    for (const path of pathsToRevalidate()) revalidatePath(path);
    return {
      success: operation.duplicate
        ? "Este movimiento ya estaba registrado; no se volvió a descontar ni sumar stock."
        : "Movimiento registrado correctamente.",
      resultingStock: operation.resultingStock,
    };
  } catch (error) {
    if (error instanceof StaleStockError) {
      return { error: error.message, staleStock: error.currentStock };
    }
    if (error instanceof MovementRuleError || error instanceof IdempotencyConflictError) {
      return { error: error.message };
    }
    return { error: "No se pudo registrar el movimiento. Inténtalo nuevamente." };
  }
}

export async function adjustStock(
  _previousState: MovementActionState,
  formData: FormData,
): Promise<MovementActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { error: "Tu sesión terminó. Inicia sesión nuevamente." };
  }
  const actor = getInventoryActor(session);

  const result = stockAdjustmentInputSchema.safeParse({
    productId: getFormValue(formData, "productId"),
    actualStock: getFormValue(formData, "actualStock"),
    idempotencyKey: getFormValue(formData, "idempotencyKey"),
    expectedStock: getFormValue(formData, "expectedStock"),
  });

  if (!result.success) {
    return { error: getValidationError(result.error) };
  }

  const fingerprint = createRequestFingerprint({
    actualStock: result.data.actualStock,
    expectedStock: result.data.expectedStock,
    productId: result.data.productId,
  });

  try {
    const operation = await db.transaction(async (tx) => {
      const initialExisting = assertMatchingExistingMovement(
        await getExistingMovement(tx, result.data.idempotencyKey),
        fingerprint,
      );
      if (initialExisting) return initialExisting;

      const productRows = await tx
        .select({ id: products.id, currentStock: products.currentStock })
        .from(products)
        .where(eq(products.id, result.data.productId))
        .for("update");
      const product = productRows[0];
      if (!product) throw new MovementRuleError("No se encontró el producto seleccionado.");

      const lockedExisting = assertMatchingExistingMovement(
        await getExistingMovement(tx, result.data.idempotencyKey),
        fingerprint,
      );
      if (lockedExisting) return lockedExisting;

      if (product.currentStock !== result.data.expectedStock) {
        throw new StaleStockError(product.currentStock);
      }

      const adjustment = calculateStockAdjustment(product.currentStock, result.data.actualStock);
      const inserted = await tx
        .insert(inventoryMovements)
        .values({
          productId: product.id,
          type: adjustment.type,
          reason: "ADJUSTMENT",
          quantity: adjustment.quantity,
          previousStock: product.currentStock,
          resultingStock: adjustment.resultingStock,
          idempotencyKey: result.data.idempotencyKey,
          requestFingerprint: fingerprint,
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
        })
        .onConflictDoNothing()
        .returning({ resultingStock: inventoryMovements.resultingStock });

      if (inserted.length === 0) {
        const raced = assertMatchingExistingMovement(
          await getExistingMovement(tx, result.data.idempotencyKey),
          fingerprint,
        );
        if (!raced) throw new Error("No se pudo recuperar el ajuste idempotente.");
        return raced;
      }

      await tx
        .update(products)
        .set({ currentStock: adjustment.resultingStock, updatedAt: new Date() })
        .where(eq(products.id, product.id));

      return { resultingStock: adjustment.resultingStock, duplicate: false };
    });

    for (const path of pathsToRevalidate()) revalidatePath(path);
    return {
      success: operation.duplicate
        ? "Este ajuste ya estaba registrado; no se volvió a modificar el stock."
        : "Stock ajustado correctamente. El ajuste quedó registrado en el historial.",
      resultingStock: operation.resultingStock,
    };
  } catch (error) {
    if (error instanceof StaleStockError) {
      return { error: error.message, staleStock: error.currentStock };
    }
    if (error instanceof MovementRuleError || error instanceof IdempotencyConflictError) {
      return { error: error.message };
    }
    return { error: "No se pudo ajustar el stock. Inténtalo nuevamente." };
  }
}
