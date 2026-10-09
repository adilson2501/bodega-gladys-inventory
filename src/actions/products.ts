"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { products } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import {
  productIdSchema,
  productInputSchema,
} from "@/lib/validations/product";

export type ProductActionState = {
  error?: string;
  success?: string;
} | null;

async function isAuthenticated() {
  const { data: session } = await getAuth().getSession();
  return Boolean(session?.user);
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

  return "Revisa los datos del producto.";
}

export async function createProduct(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  if (!(await isAuthenticated())) {
    return { error: "Tu sesión terminó. Inicia sesión nuevamente." };
  }

  const result = productInputSchema.safeParse({
    name: getFormValue(formData, "name"),
    category: getFormValue(formData, "category"),
    barcode: getFormValue(formData, "barcode"),
    minimumStock: getFormValue(formData, "minimumStock"),
  });

  if (!result.success) {
    return { error: getValidationError(result.error) };
  }

  try {
    await db.insert(products).values({
      name: result.data.name,
      category: result.data.category,
      barcode: result.data.barcode,
      minimumStock: result.data.minimumStock,
      currentStock: 0,
    });

    revalidatePath("/productos");
    return { success: "Producto registrado correctamente." };
  } catch {
    return { error: "No se pudo guardar el producto. Inténtalo nuevamente." };
  }
}

export async function updateProduct(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  if (!(await isAuthenticated())) {
    return { error: "Tu sesión terminó. Inicia sesión nuevamente." };
  }

  const productId = productIdSchema.safeParse(getFormValue(formData, "id"));
  const result = productInputSchema.safeParse({
    name: getFormValue(formData, "name"),
    category: getFormValue(formData, "category"),
    barcode: getFormValue(formData, "barcode"),
    minimumStock: getFormValue(formData, "minimumStock"),
  });

  if (!productId.success || !result.success) {
    return {
      error: !productId.success
        ? "El producto no es válido."
        : getValidationError(result.error),
    };
  }

  try {
    const updatedProducts = await db
      .update(products)
      .set({
        name: result.data.name,
        category: result.data.category,
        barcode: result.data.barcode,
        minimumStock: result.data.minimumStock,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId.data))
      .returning({ id: products.id });

    if (updatedProducts.length === 0) {
      return { error: "No se encontró el producto." };
    }

    revalidatePath("/productos");
    return { success: "Producto actualizado correctamente." };
  } catch {
    return { error: "No se pudo actualizar el producto. Inténtalo nuevamente." };
  }
}
