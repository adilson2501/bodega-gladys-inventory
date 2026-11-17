"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  movementReasonLabels,
  movementTypeLabels,
  type MovementReason,
  type MovementType,
} from "@/lib/inventory/movement-rules";
import { paymentLabels, paymentMethodValues } from "@/lib/validations/commercial";

export type HistoryMovement = {
  id: string;
  productName: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  createdAt: string;
  actorEmail: string | null;
  source: "Venta" | "Compra" | "Manual";
};

export type HistorySale = {
  id: string;
  paymentMethod: (typeof paymentMethodValues)[number];
  total: string;
  createdAt: string;
  actorEmail: string | null;
  items: { id: string; productName: string; quantity: number; unitPrice: string; lineTotal: string }[];
};

export type HistoryPurchase = {
  id: string;
  supplierName: string | null;
  total: string;
  createdAt: string;
  actorEmail: string | null;
  items: { id: string; productName: string; quantity: number; unitCost: string; lineTotal: string }[];
};

type HistoryFilter = "TODOS" | "HOY" | "SEMANA" | "ENTRADAS" | "SALIDAS";

const filters: { value: HistoryFilter; label: string }[] = [
  { value: "TODOS", label: "Todo" },
  { value: "HOY", label: "Hoy" },
  { value: "SEMANA", label: "Esta semana" },
  { value: "ENTRADAS", label: "Entradas" },
  { value: "SALIDAS", label: "Salidas" },
];

export function HistoryClient({ movements, sales, purchases }: { movements: HistoryMovement[]; sales: HistorySale[]; purchases: HistoryPurchase[] }) {
  const [activeView, setActiveView] = useState<"MOVEMENTS" | "SALES" | "PURCHASES">("MOVEMENTS");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<HistoryFilter>("TODOS");
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleMovements = useMemo(
    () =>
      movements.filter((movement) => {
        const matchesSearch =
          !normalizedQuery || movement.productName.toLocaleLowerCase().includes(normalizedQuery);

        return matchesSearch && matchesHistoryFilter(movement, selectedFilter);
      }),
    [movements, normalizedQuery, selectedFilter],
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section>
        <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Historial</h1>
      </section>

      <nav className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-1" aria-label="Tipo de historial">
        {([ ["MOVEMENTS", "Movimientos"], ["SALES", "Ventas"], ["PURCHASES", "Compras"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={activeView === value} onClick={() => setActiveView(value)} className={`min-h-10 rounded-md px-2 text-[13px] font-bold ${activeView === value ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600"}`}>{label}</button>)}
      </nav>

      {activeView === "MOVEMENTS" && movements.length > 0 ? (
        <>
          <section className="space-y-2" aria-label="Buscar y filtrar movimientos">
            <label htmlFor="history-search" className="sr-only">
              Buscar por producto
            </label>
            <input
              id="history-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar producto"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            />
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar movimientos">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={selectedFilter === filter.value}
                  onClick={() => setSelectedFilter(filter.value)}
                    className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold transition ${
                    selectedFilter === filter.value
                      ? "bg-emerald-800 text-white"
                      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          {visibleMovements.length > 0 ? (
            <section className="space-y-2" aria-label="Lista de movimientos">
              <p className="text-[13px] text-slate-700">
                {visibleMovements.length === 1
                  ? "1 movimiento encontrado"
                  : `${visibleMovements.length} movimientos encontrados`}
              </p>
              {visibleMovements.map((movement) => (
                <MovementCard key={movement.id} movement={movement} />
              ))}
            </section>
          ) : (
            <EmptyFilteredHistory hasSearch={Boolean(normalizedQuery)} />
          )}
        </>
      ) : activeView === "MOVEMENTS" ? (
        <EmptyHistory />
      ) : activeView === "SALES" ? <TransactionHistory type="sale" transactions={sales} /> : <TransactionHistory type="purchase" transactions={purchases} />}
    </div>
  );
}

function TransactionHistory(props: { type: "sale"; transactions: HistorySale[] } | { type: "purchase"; transactions: HistoryPurchase[] }) {
  return props.type === "sale" ? <SaleHistory transactions={props.transactions} /> : <PurchaseHistory transactions={props.transactions} />;
}

function SaleHistory({ transactions }: { transactions: HistorySale[] }) {
  if (transactions.length === 0) return <EmptyTransaction label="ventas" />;
  return <section className="space-y-2" aria-label="Historial de ventas">
    {transactions.map((transaction) => <details key={transaction.id} className="surface group px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">Venta {transaction.id.slice(0, 8)}</p><p className="truncate text-[12px] text-slate-600">{formatDate(transaction.createdAt)} · {paymentLabels[transaction.paymentMethod]} · {transaction.items.length} productos</p></div><strong className="shrink-0 text-sm text-slate-950">S/ {transaction.total}</strong></summary>
      <div className="mt-2 border-t border-slate-200 pt-2 text-[13px] text-slate-700"><ul className="space-y-1">{transaction.items.map((item) => <li key={item.id}>{item.quantity} × {item.productName} · S/ {item.unitPrice} c/u · S/ {item.lineTotal}</li>)}</ul><p className="mt-2 text-[12px] text-slate-500">Responsable: {transaction.actorEmail ?? "No disponible"}</p></div>
    </details>)}
  </section>;
}

function PurchaseHistory({ transactions }: { transactions: HistoryPurchase[] }) {
  if (transactions.length === 0) return <EmptyTransaction label="compras" />;
  return <section className="space-y-2" aria-label="Historial de compras">
    {transactions.map((transaction) => <details key={transaction.id} className="surface group px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">Compra {transaction.id.slice(0, 8)}</p><p className="truncate text-[12px] text-slate-600">{formatDate(transaction.createdAt)} · {transaction.supplierName || "Sin proveedor"} · {transaction.items.length} productos</p></div><strong className="shrink-0 text-sm text-slate-950">S/ {transaction.total}</strong></summary>
      <div className="mt-2 border-t border-slate-200 pt-2 text-[13px] text-slate-700"><ul className="space-y-1">{transaction.items.map((item) => <li key={item.id}>{item.quantity} × {item.productName} · S/ {item.unitCost} c/u · S/ {item.lineTotal}</li>)}</ul><p className="mt-2 text-[12px] text-slate-500">Responsable: {transaction.actorEmail ?? "No disponible"}</p></div>
    </details>)}
  </section>;
}

function EmptyTransaction({ label }: { label: string }) {
  return <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center"><h2 className="text-lg font-bold text-slate-950">Aún no hay {label}.</h2><p className="mt-1 text-sm text-slate-700">Las operaciones registradas aparecerán aquí.</p></section>;
}

function MovementCard({ movement }: { movement: HistoryMovement }) {
  const isEntry = movement.type === "IN";

  return (
    <article className={`surface px-3 py-2.5 ${isEntry ? "border-emerald-200" : "border-amber-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
            <p className={`text-[12px] font-bold ${isEntry ? "text-emerald-800" : "text-amber-900"}`}>
            {movementTypeLabels[movement.type]}
          </p>
          <h2 className="mt-0.5 truncate text-base font-bold text-slate-950">{movement.productName}</h2>
        </div>
        <p className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold ${isEntry ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {isEntry ? "+" : "-"}{movement.quantity}
        </p>
      </div>

      <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-2.5 text-[13px] text-slate-700 sm:grid-cols-2">
        <p>
           <span className="block text-[12px] text-slate-600">Motivo</span>
          <span className="font-semibold text-slate-900">{movementReasonLabels[movement.reason]}</span>
        </p>
        <p>
           <span className="block text-[12px] text-slate-600">Stock después</span>
          <span className="font-semibold text-slate-900">
            {movement.previousStock} → {movement.resultingStock} unidades
          </span>
        </p>
      </div>
      <p className="mt-2 text-[12px] font-medium text-slate-600">{formatDate(movement.createdAt)}</p>
      <details className="mt-1 text-[12px] text-slate-500"><summary className="cursor-pointer font-semibold">Ver trazabilidad</summary><p className="mt-1">Origen: {movement.source} · Responsable: {movement.actorEmail ?? "No disponible"}</p></details>
    </article>
  );
}

function EmptyHistory() {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
      <h2 className="text-xl font-bold text-slate-950">Aún no hay movimientos.</h2>
      <p className="mt-1 text-sm leading-5 text-slate-700">
        Cuando registres una entrada o salida, aparecerá aquí.
      </p>
      <Link
        href="/movimiento"
        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"
      >
        Registrar un movimiento
      </Link>
    </section>
  );
}

function EmptyFilteredHistory({ hasSearch }: { hasSearch: boolean }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
      <h2 className="text-xl font-bold text-slate-950">No hay movimientos para mostrar.</h2>
      <p className="mt-1 text-sm leading-5 text-slate-700">
        {hasSearch ? "Prueba con otro nombre de producto." : "Cambia el filtro para ver otros movimientos."}
      </p>
    </section>
  );
}

function matchesHistoryFilter(movement: HistoryMovement, filter: HistoryFilter) {
  if (filter === "ENTRADAS") return movement.type === "IN";
  if (filter === "SALIDAS") return movement.type === "OUT";
  if (filter === "HOY") return isToday(new Date(movement.createdAt));
  if (filter === "SEMANA") return isThisWeek(new Date(movement.createdAt));

  return true;
}

function isToday(date: Date) {
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isThisWeek(date: Date) {
  const today = new Date();
  const startOfWeek = new Date(today);
  const dayOfWeek = startOfWeek.getDay() || 7;

  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek + 1);
  startOfWeek.setHours(0, 0, 0, 0);

  return date >= startOfWeek && date <= today;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(date));
}
