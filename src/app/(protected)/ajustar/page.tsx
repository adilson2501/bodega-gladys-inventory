import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { StockAdjustmentForm, type AdjustmentProduct } from "@/components/adjustments/stock-adjustment-form";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requirePermission } from "@/lib/auth/authorization";

export const instant = false;

export default async function StockAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  await connection();
  try {
    await requirePermission("inventory:adjust");
  } catch {
    redirect("/");
  }
  const { product } = await searchParams;

  const productRows = await db
    .select({ id: products.id, name: products.name, currentStock: products.currentStock })
    .from(products)
    .orderBy(asc(products.name));

  const productList: AdjustmentProduct[] = productRows;
  const initialProductId = typeof product === "string" ? product : undefined;

  return (
    <StockAdjustmentForm
      key={initialProductId ?? "no-product"}
      products={productList}
      initialProductId={initialProductId}
    />
  );
}
