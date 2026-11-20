import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { connection } from "next/server";

import { db } from "@/db";
import { AuthorizationError, requirePermission } from "@/lib/auth/authorization";
import { products, saleItems, sales } from "@/db/schema";

export async function GET() {
  await connection();
  try {
    await requirePermission("exports:sales");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const rows = await db.select({ saleId: sales.id, saleDate: sales.createdAt, paymentMethod: sales.paymentMethod, actorId: sales.actorId, actorEmail: sales.actorEmail, productId: saleItems.productId, productName: saleItems.productName, quantity: saleItems.quantity, unitPrice: saleItems.unitPrice, lineTotal: saleItems.lineTotal }).from(saleItems).innerJoin(sales, eq(saleItems.saleId, sales.id)).innerJoin(products, eq(saleItems.productId, products.id)).orderBy(desc(sales.createdAt));
  const escape = (value: string | number | Date | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["sale_id", "date", "product_id", "product", "quantity", "unit_price", "line_total", "payment_method", "actor_id", "actor_email", "source"].join(",");
  const body = rows.map((row) => [row.saleId, row.saleDate.toISOString(), row.productId, row.productName, row.quantity, row.unitPrice, row.lineTotal, row.paymentMethod, row.actorId, row.actorEmail, "SALE"].map(escape).join(","));
  return new NextResponse([header, ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ventas-historico.csv" } });
}
