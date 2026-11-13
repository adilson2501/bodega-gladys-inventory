import { asc, desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { PurchasesForm, type PurchaseProduct } from "@/components/purchases/purchases-form";
import { db } from "@/db";
import { products, purchaseItems, purchases } from "@/db/schema";

export const instant = false;

export default async function PurchasesPage() {
  await connection();
  const [productRows, purchaseRows, itemRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, purchaseCost: products.purchaseCost, unitOfMeasure: products.unitOfMeasure }).from(products).where(eq(products.isActive, true)).orderBy(asc(products.name)),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(20),
    db.select().from(purchaseItems),
  ]);
  const purchaseProducts: PurchaseProduct[] = productRows;
  return <div className="space-y-6"><PurchasesForm products={purchaseProducts} /><section className="space-y-2"><h2 className="text-[16px] font-bold text-slate-950">Historial de compras</h2>{purchaseRows.length === 0 ? <p className="rounded-lg bg-white p-3 text-sm text-slate-700">Todavía no hay compras.</p> : purchaseRows.map((purchase) => <article key={purchase.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Compra {purchase.id.slice(0, 8)}</p><p className="text-[12px] text-slate-600">{purchase.supplierName} · {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(purchase.createdAt)}</p></div><strong className="text-sm">S/ {purchase.total}</strong></div><ul className="mt-2 space-y-1 text-[13px] text-slate-700">{itemRows.filter((item) => item.purchaseId === purchase.id).map((item) => <li key={item.id}>{item.quantity} × {item.productName} · S/ {item.lineTotal}</li>)}</ul><p className="mt-2 text-[12px] text-slate-500">Responsable: {purchase.actorEmail ?? "No disponible"}</p></article>)}</section></div>;
}
