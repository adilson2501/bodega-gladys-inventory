import { connection } from "next/server";
import { asc, ilike, or } from "drizzle-orm";

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
  const searchPattern = `%${query}%`;
  const conditions = query
    ? or(
        ilike(products.name, searchPattern),
        ilike(products.category, searchPattern),
        ilike(products.barcode, searchPattern),
      )
    : undefined;

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
    .where(conditions)
    .orderBy(asc(products.name));

  const productList: ProductListItem[] = productRows;

  return <ProductsClient products={productList} searchQuery={query} />;
}
