import { asc, desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { products, saleItems, sales } from "@/db/schema";
import { SalesForm, type SaleProduct } from "@/components/sales/sales-form";
import { paymentLabels } from "@/lib/validations/commercial";

export const instant = false;

export default async function SalesPage() {
  await connection();
  const [productRows, saleRows, itemRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, barcode: products.barcode, sellingPrice: products.sellingPrice, currentStock: products.currentStock, unitOfMeasure: products.unitOfMeasure }).from(products).where(eq(products.isActive, true)).orderBy(asc(products.name)),
    db.select().from(sales).orderBy(desc(sales.createdAt)).limit(20),
    db.select().from(saleItems),
  ]);
  const saleProducts: SaleProduct[] = productRows;
  return <div className="space-y-6"><SalesForm products={saleProducts} /><section className="space-y-2"><h2 className="text-[16px] font-bold text-slate-950">Historial de ventas</h2>{saleRows.length === 0 ? <p className="rounded-lg bg-white p-3 text-sm text-slate-700">Todavía no hay ventas.</p> : saleRows.map((sale) => <article key={sale.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Venta {sale.id.slice(0, 8)}</p><p className="text-[12px] text-slate-600">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(sale.createdAt)} · {paymentLabels[sale.paymentMethod]}</p></div><strong className="text-sm">S/ {sale.total}</strong></div><ul className="mt-2 space-y-1 text-[13px] text-slate-700">{itemRows.filter((item) => item.saleId === sale.id).map((item) => <li key={item.id}>{item.quantity} × {item.productName} · S/ {item.lineTotal}</li>)}</ul><p className="mt-2 text-[12px] text-slate-500">Responsable: {sale.actorEmail ?? "No disponible"}</p></article>)}</section></div>;
}
