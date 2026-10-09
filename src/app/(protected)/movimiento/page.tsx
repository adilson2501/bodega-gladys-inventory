import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { MovementForm, type MovementProduct } from "@/components/movements/movement-form";
import { db } from "@/db";
import { products } from "@/db/schema";

export const instant = false;

export default async function MovementPage() {
  await connection();

  const productRows = await db
    .select({ id: products.id, name: products.name, currentStock: products.currentStock })
    .from(products)
    .orderBy(asc(products.name));

  const productList: MovementProduct[] = productRows;

  return <MovementForm products={productList} />;
}
