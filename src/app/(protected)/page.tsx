import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
import { getInventorySummary } from "@/lib/inventory/inventory-summary";
import { getStockStatus, type StockStatus } from "@/lib/inventory/stock-status";
import {
  movementReasonLabels,
  movementTypeLabels,
  type MovementReason,
  type MovementType,
} from "@/lib/inventory/movement-rules";

export const instant = false;

export default async function HomePage() {
  await connection();

  const [productRows, movementRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        currentStock: products.currentStock,
        minimumStock: products.minimumStock,
      })
      .from(products)
      .orderBy(asc(products.name)),
    db
      .select({
        id: inventoryMovements.id,
        productName: products.name,
        type: inventoryMovements.type,
        reason: inventoryMovements.reason,
        quantity: inventoryMovements.quantity,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(5),
  ]);

  const summary = getInventorySummary(productRows);
  const attentionProducts = productRows
    .map((product) => ({ ...product, status: getStockStatus(product.currentStock, product.minimumStock) }))
    .filter((product) => product.status !== "NORMAL")
    .sort((first, second) => {
      if (first.status === second.status) return first.name.localeCompare(second.name);
      return first.status === "AGOTADO" ? -1 : 1;
    });

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-emerald-700">Inicio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Resumen de inventario
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Lo más importante de tu bodega, en un solo lugar.
        </p>
      </section>

      <section aria-label="Resumen de inventario" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total de productos" value={summary.total} />
        <SummaryCard label="Stock bajo" value={summary.stockBajo} tone="warning" />
        <SummaryCard label="Agotados" value={summary.agotados} tone="danger" />
      </section>

      {productRows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <h2 className="text-lg font-semibold text-slate-950">No hay productos registrados.</h2>
          <p className="mt-2 text-sm text-slate-600">
            Registra tu primer producto para comenzar a controlar tu inventario.
          </p>
          <Link
            href="/productos"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Ir a Productos
          </Link>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="attention-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-700">Seguimiento</p>
            <h2 id="attention-title" className="mt-1 text-xl font-semibold text-slate-950">
              Requieren atención
            </h2>
          </div>
          <Link href="/inventario" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            Ver inventario
          </Link>
        </div>

        {attentionProducts.length > 0 ? (
          <div className="space-y-3">
            {attentionProducts.map((product) => (
              <AttentionCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-800">
            El inventario no tiene alertas de stock.
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="recent-movements-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Actividad</p>
            <h2 id="recent-movements-title" className="mt-1 text-xl font-semibold text-slate-950">
              Movimientos recientes
            </h2>
          </div>
          <Link href="/historial" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            Ver historial
          </Link>
        </div>

        {movementRows.length > 0 ? (
          <div className="space-y-3">
            {movementRows.map((movement) => (
              <RecentMovementCard key={movement.id} movement={movement} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-600">
            Aún no hay movimientos registrados.
          </div>
        )}
      </section>

      <section aria-label="Acciones rápidas" className="grid gap-3 sm:grid-cols-3">
        <QuickAction href="/movimiento" label="Registrar movimiento" primary />
        <QuickAction href="/inventario" label="Ver inventario" />
        <QuickAction href="/productos" label="Productos" />
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const valueStyles = {
    default: "text-slate-950",
    warning: "text-amber-700",
    danger: "text-red-700",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs leading-5 text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${valueStyles[tone]}`}>{value}</p>
    </article>
  );
}

function AttentionCard({
  product,
}: {
  product: {
    name: string;
    currentStock: number;
    minimumStock: number;
    status: StockStatus;
  };
}) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-slate-950">{product.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Actual: <strong className="text-slate-800">{product.currentStock}</strong> · Mínimo: {product.minimumStock}
        </p>
      </div>
      <StatusBadge status={product.status} />
    </article>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles = {
    AGOTADO: "bg-red-50 text-red-700",
    "STOCK BAJO": "bg-amber-50 text-amber-800",
    NORMAL: "bg-emerald-50 text-emerald-800",
  } satisfies Record<StockStatus, string>;

  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function RecentMovementCard({
  movement,
}: {
  movement: {
    productName: string;
    type: string;
    reason: string;
    quantity: number;
    createdAt: Date;
  };
}) {
  const type = movement.type as MovementType;
  const reason = movement.reason as MovementReason;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-sm font-semibold ${type === "IN" ? "text-emerald-700" : "text-red-700"}`}>
        {movementTypeLabels[type]} · {movement.productName}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-lg font-bold text-slate-950">
          {type === "IN" ? "+" : "-"}{movement.quantity} · {movementReasonLabels[reason]}
        </p>
        <p className="shrink-0 text-xs text-slate-500">{formatDate(movement.createdAt)}</p>
      </div>
    </article>
  );
}

function QuickAction({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-12 items-center justify-center rounded-xl px-4 text-center text-sm font-semibold transition ${
        primary
          ? "bg-emerald-700 text-white hover:bg-emerald-800"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
