import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { products } from "@/db/schema";
import { SalesForm, type SaleProduct } from "@/components/sales/sales-form";

export const instant = false;

export default async function SalesPage() {
  await connection();
  const productRows = await db
    .select({ id: products.id, name: products.name, barcode: products.barcode, sellingPrice: products.sellingPrice, currentStock: products.currentStock, unitOfMeasure: products.unitOfMeasure })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
  const saleProducts: SaleProduct[] = productRows;
  return <div><SalesForm products={saleProducts} /></div>;
}
