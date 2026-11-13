import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { products } from "@/db/schema";

import {
  ProductsClient,
  type ProductListItem,
} from "@/components/products/products-client";

export const instant = false;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await connection();

  const query = ((await searchParams).q ?? "").trim();
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
       barcode: products.barcode,
       sellingPrice: products.sellingPrice,
       purchaseCost: products.purchaseCost,
       unitOfMeasure: products.unitOfMeasure,
       isActive: products.isActive,
      currentStock: products.currentStock,
      minimumStock: products.minimumStock,
    })
    .from(products)
    .orderBy(asc(products.name));

  const productList: ProductListItem[] = productRows;

  return <ProductsClient products={productList} searchQuery={query} />;
}
