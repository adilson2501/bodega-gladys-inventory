import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { PurchasesForm, type PurchaseProduct } from "@/components/purchases/purchases-form";
import { db } from "@/db";
import { products } from "@/db/schema";

export const instant = false;

export default async function PurchasesPage() {
  await connection();
  const productRows = await db
    .select({ id: products.id, name: products.name, barcode: products.barcode, purchaseCost: products.purchaseCost, unitOfMeasure: products.unitOfMeasure })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
  const purchaseProducts: PurchaseProduct[] = productRows;
  return <div><PurchasesForm products={purchaseProducts} /></div>;
}
