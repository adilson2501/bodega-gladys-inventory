import { asc } from "drizzle-orm";
import { connection } from "next/server";

import { StockAdjustmentForm, type AdjustmentProduct } from "@/components/adjustments/stock-adjustment-form";
import { db } from "@/db";
import { products } from "@/db/schema";

export const instant = false;

export default async function StockAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  await connection();
  const { product } = await searchParams;

  const productRows = await db
    .select({ id: products.id, name: products.name, currentStock: products.currentStock })
    .from(products)
    .orderBy(asc(products.name));

  const productList: AdjustmentProduct[] = productRows;

  return (
    <StockAdjustmentForm
      products={productList}
      initialProductId={typeof product === "string" ? product : undefined}
    />
  );
}
