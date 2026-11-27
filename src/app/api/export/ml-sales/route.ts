import { and, desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { products, saleItems, sales } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { parseExportOrigin } from "@/lib/provenance/origin";

/** Dataset export for ML: deliberately excludes actor/user fields. */
export async function GET(request: Request = new Request("http://localhost")) {
  await connection();
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let origin: "REAL" | "SYNTHETIC";
  try {
    origin = parseExportOrigin(new URL(request.url).searchParams.get("origin"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Origen inválido." }, { status: 400 });
  }
  const rows = await db.select({ date: sales.createdAt, productId: saleItems.productId, quantity: saleItems.quantity, origin: sales.origin, sourceBatchId: sales.sourceBatchId })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(and(eq(sales.origin, origin), eq(saleItems.origin, origin), eq(products.origin, origin)))
    .orderBy(desc(sales.createdAt));
  const escape = (value: string | number | Date | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const body = rows.map((row) => [row.date.toISOString(), row.productId, row.quantity, row.origin, row.sourceBatchId].map(escape).join(","));
  return new NextResponse(["date,product_id,quantity,source,source_batch_id", ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=ventas-ml-${origin.toLowerCase()}.csv` } });
}
