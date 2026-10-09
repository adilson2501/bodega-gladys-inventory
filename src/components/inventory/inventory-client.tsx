"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  matchesInventoryStatus,
  type InventorySummary,
} from "@/lib/inventory/inventory-summary";
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

type StatusFilter = "TODOS" | StockStatus;

const filters: { value: StatusFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "STOCK BAJO", label: "Stock bajo" },
  { value: "AGOTADO", label: "Agotados" },
  { value: "NORMAL", label: "Normal" },
];

export function InventoryClient({ products, summary }: InventoryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("TODOS");
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch =
          !normalizedQuery ||
          product.name.toLocaleLowerCase().includes(normalizedQuery) ||
          product.category?.toLocaleLowerCase().includes(normalizedQuery);

        return (
          matchesSearch &&
          matchesInventoryStatus(product.currentStock, product.minimumStock, selectedStatus)
        );
      }),
    [normalizedQuery, products, selectedStatus],
  );

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-emerald-700">Operación</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Inventario</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Consulta rápidamente las existencias y detecta los productos que necesitan atención.
        </p>
      </section>

      <section aria-label="Resumen de inventario" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total de productos" value={summary.total} />
        <SummaryCard label="Stock bajo" value={summary.stockBajo} tone="warning" />
        <SummaryCard label="Agotados" value={summary.agotados} tone="danger" />
        <SummaryCard label="Normal" value={summary.normal} tone="success" />
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
          placeholder="Buscar por nombre o categoría"
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por estado">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selectedStatus === filter.value}
              onClick={() => setSelectedStatus(filter.value)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                selectedStatus === filter.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {visibleProducts.length > 0 ? (
        <section className="space-y-3" aria-label="Lista de inventario">
          {visibleProducts.map((product) => (
            <InventoryCard key={product.id} product={product} />
          ))}
        </section>
      ) : (
        <EmptyInventoryState
          hasProducts={products.length > 0}
          hasSearch={Boolean(normalizedQuery)}
          selectedStatus={selectedStatus}
        />
      )}

      {products.length > 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          El stock se actualiza mediante movimientos.
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
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const valueStyles = {
    default: "text-slate-950",
    warning: "text-amber-700",
    danger: "text-red-700",
    success: "text-emerald-700",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs leading-5 text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${valueStyles[tone]}`}>{value}</p>
    </article>
  );
}

function InventoryCard({ product }: { product: InventoryListItem }) {
  const status = getStockStatus(product.currentStock, product.minimumStock);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-950">{product.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{product.category || "Sin categoría"}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">Stock actual</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{product.currentStock}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Stock mínimo</p>
          <p className="mt-1 text-xl font-semibold text-slate-700">{product.minimumStock}</p>
        </div>
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
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function EmptyInventoryState({
  hasProducts,
  hasSearch,
  selectedStatus,
}: {
  hasProducts: boolean;
  hasSearch: boolean;
  selectedStatus: StatusFilter;
}) {
  if (!hasProducts) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
        <h2 className="text-lg font-semibold text-slate-950">No hay productos registrados.</h2>
        <p className="mt-2 text-sm text-slate-600">Registra tu primer producto para comenzar.</p>
        <Link
          href="/productos"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Ir a Productos
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="text-lg font-semibold text-slate-950">No hay productos para mostrar.</h2>
      <p className="mt-2 text-sm text-slate-600">
        {hasSearch
          ? "Prueba con otro nombre o categoría."
          : `No hay productos con estado ${selectedStatus === "TODOS" ? "seleccionado" : selectedStatus}.`}
      </p>
    </section>
  );
}
