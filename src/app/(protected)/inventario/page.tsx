import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { InventoryClient, type InventoryListItem } from "@/components/inventory/inventory-client";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getInventorySummary } from "@/lib/inventory/inventory-summary";

export const instant = false;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ adjustment?: string | string[] }>;
}) {
  await connection();
  const { adjustment } = await searchParams;

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      barcode: products.barcode,
      currentStock: products.currentStock,
      minimumStock: products.minimumStock,
    })
    .from(products)
    .orderBy(asc(products.name));

  const productList: InventoryListItem[] = productRows;

  return (
    <InventoryClient
      products={productList}
      summary={getInventorySummary(productList)}
      showAdjustmentSuccess={adjustment === "success"}
    />
  );
}
