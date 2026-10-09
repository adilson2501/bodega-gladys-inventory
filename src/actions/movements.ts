"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import {
  calculateResultingStock,
  movementInputSchema,
  MovementRuleError,
} from "@/lib/inventory/movement-rules";

export type MovementActionState = {
  error?: string;
  success?: string;
} | null;

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

export async function createMovement(
  _previousState: MovementActionState,
  formData: FormData,
): Promise<MovementActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { error: "Tu sesión terminó. Inicia sesión nuevamente." };
  }

  const result = movementInputSchema.safeParse({
    productId: getFormValue(formData, "productId"),
    type: getFormValue(formData, "type"),
    quantity: getFormValue(formData, "quantity"),
    reason: getFormValue(formData, "reason"),
  });

  if (!result.success) {
    return { error: getValidationError(result.error) };
  }

  try {
    await db.transaction(async (tx) => {
      const productRows = await tx
        .select({ id: products.id, currentStock: products.currentStock })
        .from(products)
        .where(eq(products.id, result.data.productId))
        .for("update");

      const product = productRows[0];
      if (!product) {
        throw new MovementRuleError("No se encontró el producto seleccionado.");
      }

      const resultingStock = calculateResultingStock(
        product.currentStock,
        result.data.type,
        result.data.quantity,
      );

      await tx
        .update(products)
        .set({ currentStock: resultingStock, updatedAt: new Date() })
        .where(eq(products.id, product.id));

      await tx.insert(inventoryMovements).values({
        productId: product.id,
        type: result.data.type,
        reason: result.data.reason,
        quantity: result.data.quantity,
        previousStock: product.currentStock,
        resultingStock,
      });
    });

    revalidatePath("/movimiento");
    revalidatePath("/inventario");
    revalidatePath("/productos");
    revalidatePath("/historial");
    return { success: "Movimiento registrado correctamente." };
  } catch (error) {
    if (error instanceof MovementRuleError) {
      return { error: error.message };
    }

    return { error: "No se pudo registrar el movimiento. Inténtalo nuevamente." };
  }
}
