import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { inventoryMovements, products } from "@/db/schema";
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
      .limit(3),
  ]);

  const attentionProducts = productRows
    .map((product) => ({ ...product, status: getStockStatus(product.currentStock, product.minimumStock) }))
    .filter((product) => product.status !== "NORMAL")
    .sort((first, second) => {
      if (first.status === second.status) return first.name.localeCompare(second.name);
      return first.status === "AGOTADO" ? -1 : 1;
    });
  const priorityProduct = attentionProducts[0];
  const visibleAttentionProducts = attentionProducts.slice(0, 3);

  return (
    <div className="space-y-5">
      <section>
        <p className="text-base font-semibold text-emerald-800">Inicio</p>
        <h1 className="mt-1 page-heading font-bold text-slate-950">Resumen de hoy</h1>
      </section>

      {productRows.length === 0 ? (
        <SetupCard />
      ) : (
        priorityProduct ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{priorityProduct.status === "AGOTADO" ? `${priorityProduct.name} está agotado.` : `${priorityProduct.name} necesita reposición.`} <Link href={`/movimiento?product=${encodeURIComponent(priorityProduct.id)}`} className="ml-1 underline">Registrar entrada</Link></p> : null
      )}

      {visibleAttentionProducts.length > 0 ? (
        <section className="space-y-3" aria-labelledby="attention-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-amber-800">Para revisar</p>
              <h2 id="attention-title" className="mt-1 text-2xl font-bold text-slate-950">
                Productos por reponer
              </h2>
            </div>
            <Link href="/inventario" className="text-base font-bold text-emerald-800 hover:text-emerald-950">
              Ver todos
            </Link>
          </div>

          <div className="space-y-2">
            {visibleAttentionProducts.map((product) => (
              <AttentionCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {productRows.length > 0 ? (
          <section aria-label="Acciones principales" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickAction
            href="/ventas"
            label="Nueva venta"
            description="Cobrar productos"
          />
          <QuickAction
            href="/compras"
            label="Nueva compra"
            description="Abastecer stock"
          />
          <QuickAction href="/productos" label="Productos" description="Catálogo y precios" />
          <QuickAction href="/movimiento" label="Registrar movimiento" description="Entrada o salida" />
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="recent-movements-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-slate-700">Actividad reciente</p>
            <h2 id="recent-movements-title" className="mt-1 text-2xl font-bold text-slate-950">
              Últimos movimientos
            </h2>
          </div>
          {movementRows.length > 0 ? (
            <Link href="/historial" className="text-base font-bold text-emerald-800 hover:text-emerald-950">
              Ver historial
            </Link>
          ) : null}
        </div>

        {movementRows.length > 0 ? (
          <div className="space-y-3">
            {movementRows.map((movement) => (
              <RecentMovementCard key={movement.id} movement={movement} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-base text-slate-700">
            Aún no hay movimientos registrados.
          </div>
        )}
      </section>
    </div>
  );
}

function SetupCard() {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <p className="text-lg font-bold">Comencemos agregando un producto.</p>
      <p className="mt-2 text-base leading-6">
        Cuando registres tus productos podrás controlar sus entradas, salidas y existencias.
      </p>
      <Link
        href="/productos"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800 sm:w-auto"
      >
        Agregar producto
      </Link>
    </section>
  );
}

function AttentionCard({
  product,
}: {
  product: {
    id: string;
    name: string;
    currentStock: number;
    minimumStock: number;
    status: StockStatus;
  };
}) {
  const isOutOfStock = product.status === "AGOTADO";

  return (
    <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold text-slate-950">{product.name}</h3>
          <p className="mt-1 text-base text-slate-700">
            Stock actual: <strong>{product.currentStock}</strong> · Mínimo: {product.minimumStock}
          </p>
        </div>
        <StatusBadge status={product.status} />
      </div>
      <Link
        href={`/movimiento?product=${encodeURIComponent(product.id)}`}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-700 px-4 text-base font-bold text-emerald-900 hover:bg-emerald-50"
      >
        {isOutOfStock ? "Registrar entrada" : "Reponer producto"}
      </Link>
    </article>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles = {
    AGOTADO: "bg-red-50 text-red-800",
    "STOCK BAJO": "bg-amber-50 text-amber-900",
    NORMAL: "bg-emerald-50 text-emerald-900",
  } satisfies Record<StockStatus, string>;

  return (
    <span className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${styles[status]}`}>
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
  const isEntry = type === "IN";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base font-bold ${isEntry ? "text-emerald-800" : "text-amber-900"}`}>
            {movementTypeLabels[type]}
          </p>
          <h3 className="mt-1 truncate text-lg font-bold text-slate-950">{movement.productName}</h3>
        </div>
        <p className="shrink-0 text-xl font-bold text-slate-950">
          {isEntry ? "+" : "-"}{movement.quantity}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-slate-600">
        <p>{movementReasonLabels[reason]}</p>
        <p>{formatDate(movement.createdAt)}</p>
      </div>
    </article>
  );
}

function QuickAction({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-24 flex-col items-start justify-center rounded-2xl border border-slate-300 bg-white px-5 text-left text-slate-900 shadow-sm transition hover:bg-slate-50"
    >
      <span className="text-lg font-bold">{label}</span>
      <span className="mt-1 text-sm text-slate-600">{description}</span>
    </Link>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
