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
    <div className="space-y-4 sm:space-y-5">
      <h1 className="text-[18px] font-bold leading-6 tracking-tight text-slate-950">Inicio</h1>

      {productRows.length > 0 ? (
        <section aria-label="Acciones principales" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickAction href="/ventas" label="Nueva venta" />
          <QuickAction href="/compras" label="Nueva compra" />
          <QuickAction href="/productos" label="Productos" />
          <QuickAction href="/movimiento" label="Movimiento" />
        </section>
      ) : null}

      {productRows.length === 0 ? (
        <SetupCard />
      ) : (
        priorityProduct ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold leading-5 text-amber-950">{priorityProduct.status === "AGOTADO" ? `${priorityProduct.name} está agotado.` : `${priorityProduct.name} necesita reposición.`} <Link href={`/movimiento?product=${encodeURIComponent(priorityProduct.id)}`} className="ml-1 whitespace-nowrap underline">Registrar entrada</Link></p> : null
      )}

      {visibleAttentionProducts.length > 0 ? (
        <section className="space-y-2" aria-labelledby="attention-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="attention-title" className="text-[15px] font-bold leading-5 text-slate-950">
              Productos por reponer
            </h2>
            <Link href="/inventario" className="shrink-0 text-[13px] font-bold text-emerald-800 hover:text-emerald-950">
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

      <section className="space-y-2" aria-labelledby="recent-movements-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-movements-title" className="text-[15px] font-bold leading-5 text-slate-950">
            Últimos movimientos
          </h2>
          {movementRows.length > 0 ? (
            <Link href="/historial" className="shrink-0 text-[13px] font-bold text-emerald-800 hover:text-emerald-950">
              Ver historial
            </Link>
          ) : null}
        </div>

        {movementRows.length > 0 ? (
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {movementRows.map((movement) => (
              <RecentMovementRow key={movement.id} movement={movement} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4 text-[13px] text-slate-700">
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
      <p className="text-[15px] font-bold">Comencemos agregando un producto.</p>
      <p className="mt-1 text-[13px] leading-5">
        Cuando registres tus productos podrás controlar sus entradas, salidas y existencias.
      </p>
      <Link
        href="/productos"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto"
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
    <article className="rounded-lg border border-amber-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-950">{product.name}</h3>
          <p className="mt-0.5 text-[13px] text-slate-700">
            Stock actual: <strong>{product.currentStock}</strong> · Mínimo: {product.minimumStock}
          </p>
        </div>
        <StatusBadge status={product.status} />
      </div>
      <Link
        href={`/movimiento?product=${encodeURIComponent(product.id)}`}
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-emerald-700 px-3 text-[13px] font-bold text-emerald-900 hover:bg-emerald-50"
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
    <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function RecentMovementRow({
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
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 first:rounded-t-lg last:rounded-b-lg">
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-slate-950">{movement.productName}</h3>
        <p className="truncate text-[12px] leading-4 text-slate-600">
          <span className={isEntry ? "text-emerald-800" : "text-amber-900"}>{movementTypeLabels[type]}</span>
          <span aria-hidden="true"> · </span>{movementReasonLabels[reason]} · {formatDate(movement.createdAt)}
        </p>
      </div>
      <p className={`text-sm font-bold ${isEntry ? "text-emerald-800" : "text-amber-900"}`}>
        {isEntry ? "+" : "-"}{movement.quantity}
      </p>
    </article>
  );
}

function ActionIcon({ label }: { label: string }) {
  const paths = {
    "Nueva venta": <path d="M4 5h16v14H4zM8 9h8M8 13h5" />,
    "Nueva compra": <path d="M4 6h16M6 6v13h12V6M9 10h6M9 14h4" />,
    Productos: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z M8 8h8M8 12h8M8 16h5" />,
    Movimiento: <path d="M5 7h14M5 12h14M5 17h14M8 4 5 7l3 3M16 14l3 3-3 3" />,
  } as const;

  return <svg aria-hidden="true" className="h-4 w-4 text-emerald-700" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[label as keyof typeof paths]}</svg>;
}

function QuickAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 text-left text-[14px] font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 sm:min-h-16 sm:px-4"
    >
      <ActionIcon label={label} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
