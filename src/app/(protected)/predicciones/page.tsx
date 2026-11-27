import { asc, and, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { PredictionsClient } from "@/components/predictions/predictions-client";

export const instant = false;

export default async function PredictionsPage() {
  await connection();
  const productRows = await db.select({ id: products.id, name: products.name }).from(products).where(and(eq(products.origin, "SYNTHETIC"), eq(products.isActive, true))).orderBy(asc(products.name));
  return <PredictionsClient products={productRows} cutoffDate="2026-10-31" />;
}
