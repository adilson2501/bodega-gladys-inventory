import { connection } from "next/server";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";

import { MovementForm, type MovementProduct } from "@/components/movements/movement-form";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requirePermission } from "@/lib/auth/authorization";

export const instant = false;

export default async function MovementPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  await connection();
  try {
    await requirePermission("inventory:movement");
  } catch {
    redirect("/");
  }
  const { product } = await searchParams;

  const productRows = await db
    .select({ id: products.id, name: products.name, barcode: products.barcode, currentStock: products.currentStock })
    .from(products)
    .orderBy(asc(products.name));

  const productList: MovementProduct[] = productRows;

  return <MovementForm products={productList} initialProductId={typeof product === "string" ? product : undefined} />;
}
