"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { type InventorySummary } from "@/lib/inventory/inventory-summary";
import { getStockStatus, type StockStatus } from "@/lib/inventory/stock-status";
import { productMatchesQuery } from "@/lib/products/search";

export type InventoryListItem = {
  id: string;
  name: string;
  category: string | null;
  barcode: string | null;
  currentStock: number;
  minimumStock: number;
};

type InventoryClientProps = {
  products: InventoryListItem[];
  summary: InventorySummary;
};

type StatusFilter = "TODOS" | "POR_REPONER" | "AGOTADO";

const filters: { value: StatusFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "POR_REPONER", label: "Por reponer" },
  { value: "AGOTADO", label: "Agotados" },
];

export function InventoryClient({ products, summary }: InventoryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("TODOS");
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const productsNeedingRestock = summary.agotados + summary.stockBajo;
  const visibleProducts = useMemo(
    () =>
      products
        .filter((product) => {
          const matchesSearch =
            !normalizedQuery ||
            productMatchesQuery(product, normalizedQuery);

          return (
            matchesSearch &&
            (selectedStatus === "TODOS" || (selectedStatus === "POR_REPONER" && needsRestock(product.currentStock, product.minimumStock)) || getStockStatus(product.currentStock, product.minimumStock) === selectedStatus)
          );
        })
        .sort((firstProduct, secondProduct) => {
          const statusDifference =
            statusPriority(getStockStatus(firstProduct.currentStock, firstProduct.minimumStock)) -
            statusPriority(getStockStatus(secondProduct.currentStock, secondProduct.minimumStock));

          return statusDifference || firstProduct.name.localeCompare(secondProduct.name);
        }),
    [normalizedQuery, products, selectedStatus],
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section>
        <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Stock</h1>
      </section>

      {productsNeedingRestock > 0 ? (
        <section
          aria-label="Alerta de reposición"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        >
          <p className="text-sm font-bold">Hay {productsNeedingRestock} producto{productsNeedingRestock === 1 ? "" : "s"} por reponer.</p>
          <p className="mt-0.5 text-[13px] leading-5">
            {summary.agotados > 0 && summary.stockBajo > 0
              ? `${summary.agotados} agotado${summary.agotados === 1 ? "" : "s"} y ${summary.stockBajo} con stock bajo.`
              : summary.agotados > 0
                ? `${summary.agotados} producto${summary.agotados === 1 ? " está agotado" : "s están agotados"}.`
                : "Tienen pocas unidades disponibles."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedStatus("POR_REPONER")}
              className="min-h-10 rounded-lg bg-amber-800 px-3 text-sm font-bold text-white hover:bg-amber-900"
            >
              Ver productos por reponer
            </button>
            <Link
              href="/movimiento"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-800 px-3 text-sm font-bold text-amber-950 hover:bg-amber-100"
            >
              Registrar una entrada
            </Link>
          </div>
        </section>
      ) : products.length > 0 ? (
        <section aria-label="Inventario al día" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950">
          <p className="text-sm font-bold">Todo está en orden.</p>
          <p className="mt-0.5 text-[13px] leading-5">No hay productos que necesiten reposición por ahora.</p>
        </section>
      ) : null}

      <section aria-label="Resumen de inventario" className="grid grid-cols-3 gap-2">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Por reponer" value={productsNeedingRestock} tone="warning" />
        <SummaryCard label="Agotados" value={summary.agotados} tone="danger" />
      </section>

      <section className="space-y-2" aria-label="Filtros de inventario">
        <label htmlFor="inventory-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="inventory-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar producto"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por estado">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selectedStatus === filter.value}
              onClick={() => setSelectedStatus(filter.value)}
                className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold transition ${
                selectedStatus === filter.value
                  ? "bg-emerald-800 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {visibleProducts.length > 0 ? (
        <section id="inventory-list" className="space-y-3" aria-label="Lista de inventario">
          <h2 className="text-[15px] font-bold text-slate-950">
            {selectedStatus === "POR_REPONER" ? "Productos por reponer" : "Todos los productos"}
          </h2>
          {visibleProducts.map((product) => (
            <InventoryCard key={product.id} product={product} />
          ))}
        </section>
      ) : (
        <EmptyInventoryState
          hasProducts={products.length > 0}
          hasSearch={Boolean(normalizedQuery)}
        />
      )}

      {products.length > 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-700">
          El stock cambia cuando registras una entrada o salida.
        </p>
      ) : null}
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
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const styles = {
    default: "border-slate-200 bg-white text-slate-950",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <article className={`rounded-lg border px-2 py-2 shadow-sm sm:px-3 ${styles[tone]}`}>
      <p className="truncate text-[12px] leading-4">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
    </article>
  );
}

function InventoryCard({ product }: { product: InventoryListItem }) {
  const status = getStockStatus(product.currentStock, product.minimumStock);
  const requiresRestock = needsRestock(product.currentStock, product.minimumStock);
  const restockMessage = getRestockMessage(product, status);

  return (
    <article className={`surface px-3 py-2.5 sm:p-3 ${requiresRestock ? "border-amber-300" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-950">{product.name}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{product.category || "Sin categoría"}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-2 grid grid-cols-2 divide-x divide-slate-200 rounded-lg bg-slate-50 px-2 py-2">
        <div>
          <p className="text-[11px] text-slate-600">Stock actual</p>
            <p className="mt-0.5 text-lg font-bold text-slate-950">{product.currentStock}</p>
        </div>
        <div className="pl-3">
          <p className="text-[11px] text-slate-600">Stock mínimo</p>
            <p className="mt-0.5 text-base font-bold text-slate-800">{product.minimumStock}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {requiresRestock ? (
          <Link href={`/movimiento?product=${encodeURIComponent(product.id)}`} title={restockMessage} className="inline-flex min-h-9 items-center rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800">Registrar entrada</Link>
        ) : null}
        <Link
          href={`/ajustar?product=${encodeURIComponent(product.id)}`}
          className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
        >
          Ajustar stock contado
        </Link>
      </div>
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
    <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function EmptyInventoryState({
  hasProducts,
  hasSearch,
}: {
  hasProducts: boolean;
  hasSearch: boolean;
}) {
  if (!hasProducts) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
        <h2 className="text-xl font-bold text-slate-950">No hay productos registrados.</h2>
        <p className="mt-2 text-base leading-7 text-slate-700">Agrega un producto para comenzar a revisar el stock.</p>
        <Link
          href="/productos"
          className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800"
        >
          Ir a Productos
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="text-xl font-bold text-slate-950">No hay productos para mostrar.</h2>
      <p className="mt-2 text-base leading-7 text-slate-700">
        {hasSearch
          ? "Prueba con otro nombre o categoría."
          : "No hay productos que necesiten reposición."}
      </p>
    </section>
  );
}

function needsRestock(currentStock: number, minimumStock: number) {
  return getStockStatus(currentStock, minimumStock) !== "NORMAL";
}

function statusPriority(status: StockStatus) {
  const priorities = {
    AGOTADO: 0,
    "STOCK BAJO": 1,
    NORMAL: 2,
  } satisfies Record<StockStatus, number>;

  return priorities[status];
}

function getRestockMessage(product: InventoryListItem, status: StockStatus) {
  if (status === "AGOTADO") {
    return "No quedan unidades. Registra una entrada cuando repongas este producto.";
  }

  if (product.currentStock === product.minimumStock) {
    return "Llegó al stock mínimo. Conviene reponerlo pronto.";
  }

  return `Faltan ${product.minimumStock - product.currentStock} unidades para llegar al stock mínimo.`;
}
