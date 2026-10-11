"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { type InventorySummary } from "@/lib/inventory/inventory-summary";
import { getStockStatus, type StockStatus } from "@/lib/inventory/stock-status";

export type InventoryListItem = {
  id: string;
  name: string;
  category: string | null;
  currentStock: number;
  minimumStock: number;
};

type InventoryClientProps = {
  products: InventoryListItem[];
  summary: InventorySummary;
};

type StatusFilter = "TODOS" | "POR_REPONER";

const filters: { value: StatusFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "POR_REPONER", label: "Por reponer" },
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
            product.name.toLocaleLowerCase().includes(normalizedQuery) ||
            product.category?.toLocaleLowerCase().includes(normalizedQuery);

          return (
            matchesSearch &&
            (selectedStatus === "TODOS" || needsRestock(product.currentStock, product.minimumStock))
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
    <div className="space-y-6">
      <section>
        <p className="text-base font-semibold text-emerald-800">Stock</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Revisa qué falta</h1>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Mira primero los productos que necesitan una reposición.
        </p>
      </section>

      {productsNeedingRestock > 0 ? (
        <section
          aria-label="Alerta de reposición"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
        >
          <p className="text-lg font-bold">Hay {productsNeedingRestock} producto{productsNeedingRestock === 1 ? "" : "s"} por reponer.</p>
          <p className="mt-2 text-base leading-6">
            {summary.agotados > 0 && summary.stockBajo > 0
              ? `${summary.agotados} agotado${summary.agotados === 1 ? "" : "s"} y ${summary.stockBajo} con stock bajo.`
              : summary.agotados > 0
                ? `${summary.agotados} producto${summary.agotados === 1 ? " está agotado" : "s están agotados"}.`
                : "Tienen pocas unidades disponibles."}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setSelectedStatus("POR_REPONER")}
              className="min-h-12 rounded-xl bg-amber-800 px-5 text-base font-bold text-white hover:bg-amber-900"
            >
              Ver productos por reponer
            </button>
            <Link
              href="/movimiento"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-800 px-5 text-base font-bold text-amber-950 hover:bg-amber-100"
            >
              Registrar una entrada
            </Link>
          </div>
        </section>
      ) : products.length > 0 ? (
        <section aria-label="Inventario al día" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <p className="text-lg font-bold">Todo está en orden.</p>
          <p className="mt-2 text-base leading-6">No hay productos que necesiten reposición por ahora.</p>
        </section>
      ) : null}

      <section aria-label="Resumen de inventario" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total de productos" value={summary.total} />
        <SummaryCard label="Por reponer" value={productsNeedingRestock} tone="warning" />
        <SummaryCard label="Stock suficiente" value={summary.normal} tone="success" />
      </section>

      <section className="space-y-3" aria-label="Filtros de inventario">
        <label htmlFor="inventory-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="inventory-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar producto"
          className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por estado">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selectedStatus === filter.value}
              onClick={() => setSelectedStatus(filter.value)}
              className={`min-h-12 shrink-0 rounded-xl px-5 text-base font-bold transition ${
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
          <h2 className="text-xl font-bold text-slate-950">
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
        <p className="rounded-xl bg-slate-100 px-4 py-4 text-base text-slate-700">
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
  tone?: "default" | "warning" | "success";
}) {
  const styles = {
    default: "border-slate-200 bg-white text-slate-950",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };

  return (
    <article className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${styles[tone]}`}>
      <p className="text-sm leading-5">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </article>
  );
}

function InventoryCard({ product }: { product: InventoryListItem }) {
  const status = getStockStatus(product.currentStock, product.minimumStock);
  const requiresRestock = needsRestock(product.currentStock, product.minimumStock);
  const restockMessage = getRestockMessage(product, status);

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${requiresRestock ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-slate-950">{product.name}</h2>
          <p className="mt-1 text-base text-slate-600">{product.category || "Sin categoría"}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-sm text-slate-600">Stock actual</p>
          <p className="mt-1 text-4xl font-bold text-slate-950">{product.currentStock}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Stock mínimo</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{product.minimumStock}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {requiresRestock ? (
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-base font-semibold text-amber-950">{restockMessage}</p>
            <Link
              href={`/movimiento?product=${encodeURIComponent(product.id)}`}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 text-base font-bold text-white hover:bg-emerald-800"
            >
              Registrar una entrada
            </Link>
          </div>
        ) : null}
        <Link
          href={`/ajustar?product=${encodeURIComponent(product.id)}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-bold text-slate-800 hover:bg-slate-50"
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
    <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${styles[status]}`}>
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
