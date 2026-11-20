import { eq, desc } from "drizzle-orm";
import { connection } from "next/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { products, saleItems, sales } from "@/db/schema";
import { AuthorizationError, requirePermission } from "@/lib/auth/authorization";

/** Dataset export for ML: deliberately excludes actor/user fields. */
export async function GET() {
  await connection();
  try {
    await requirePermission("exports:ml");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const rows = await db.select({ date: sales.createdAt, productId: saleItems.productId, quantity: saleItems.quantity })
    .from(saleItems).innerJoin(sales, eq(saleItems.saleId, sales.id)).innerJoin(products, eq(saleItems.productId, products.id)).orderBy(desc(sales.createdAt));
  const escape = (value: string | number | Date | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const body = rows.map((row) => [row.date.toISOString(), row.productId, row.quantity, "REAL"].map(escape).join(","));
  return new NextResponse(["date,product_id,quantity,source", ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ventas-ml.csv" } });
}
