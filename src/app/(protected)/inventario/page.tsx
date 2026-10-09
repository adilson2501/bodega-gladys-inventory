import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { InventoryClient, type InventoryListItem } from "@/components/inventory/inventory-client";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getInventorySummary } from "@/lib/inventory/inventory-summary";

export const instant = false;

export default async function InventoryPage() {
  await connection();

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      currentStock: products.currentStock,
      minimumStock: products.minimumStock,
    })
    .from(products)
    .orderBy(asc(products.name));

  const productList: InventoryListItem[] = productRows;

  return <InventoryClient products={productList} summary={getInventorySummary(productList)} />;
}
