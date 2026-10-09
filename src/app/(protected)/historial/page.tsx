import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
import {
  movementReasonLabels,
  movementTypeLabels,
  type MovementReason,
  type MovementType,
} from "@/lib/inventory/movement-rules";

export const instant = false;

export default async function HistoryPage() {
  await connection();

  const movementRows = await db
    .select({
      id: inventoryMovements.id,
      productName: products.name,
      type: inventoryMovements.type,
      reason: inventoryMovements.reason,
      quantity: inventoryMovements.quantity,
      previousStock: inventoryMovements.previousStock,
      resultingStock: inventoryMovements.resultingStock,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .orderBy(desc(inventoryMovements.createdAt));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-emerald-700">Trazabilidad</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Historial</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Consulta las entradas y salidas registradas en tu bodega.
        </p>
      </section>

      {movementRows.length > 0 ? (
        <section className="space-y-3" aria-label="Historial de movimientos">
          {movementRows.map((movement) => (
            <article key={movement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${movement.type === "IN" ? "text-emerald-700" : "text-red-700"}`}>
                    {movementTypeLabels[movement.type as MovementType]} · {movement.productName}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {movement.type === "IN" ? "+" : "-"}{movement.quantity} unidades
                  </p>
                </div>
                <p className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {movementReasonLabels[movement.reason as MovementReason]}
                </p>
              </div>
              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:grid-cols-2">
                <p>Stock: {movement.previousStock} → {movement.resultingStock}</p>
                <p className="sm:text-right">{formatDate(movement.createdAt)}</p>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-950">No hay movimientos registrados.</h2>
          <p className="mt-2 text-sm text-slate-600">
            Las entradas y salidas aparecerán aquí después de registrarlas.
          </p>
        </section>
      )}
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
