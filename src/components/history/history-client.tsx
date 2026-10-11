"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  movementReasonLabels,
  movementTypeLabels,
  type MovementReason,
  type MovementType,
} from "@/lib/inventory/movement-rules";

export type HistoryMovement = {
  id: string;
  productName: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  createdAt: string;
};

type HistoryFilter = "TODOS" | "HOY" | "SEMANA" | "ENTRADAS" | "SALIDAS";

const filters: { value: HistoryFilter; label: string }[] = [
  { value: "TODOS", label: "Todo" },
  { value: "HOY", label: "Hoy" },
  { value: "SEMANA", label: "Esta semana" },
  { value: "ENTRADAS", label: "Entradas" },
  { value: "SALIDAS", label: "Salidas" },
];

export function HistoryClient({ movements }: { movements: HistoryMovement[] }) {
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
    <div className="space-y-6">
      <section>
        <p className="text-base font-semibold text-emerald-800">Historial</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Movimientos registrados</h1>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Revisa rápidamente las entradas y salidas que ya realizaste.
        </p>
      </section>

      {movements.length > 0 ? (
        <>
          <section className="space-y-3" aria-label="Buscar y filtrar movimientos">
            <label htmlFor="history-search" className="sr-only">
              Buscar por producto
            </label>
            <input
              id="history-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar producto"
              className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            />
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar movimientos">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={selectedFilter === filter.value}
                  onClick={() => setSelectedFilter(filter.value)}
                  className={`min-h-12 shrink-0 rounded-xl px-5 text-base font-bold transition ${
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
            <section className="space-y-3" aria-label="Lista de movimientos">
              <p className="text-base text-slate-700">
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
      ) : (
        <EmptyHistory />
      )}
    </div>
  );
}

function MovementCard({ movement }: { movement: HistoryMovement }) {
  const isEntry = movement.type === "IN";

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${isEntry ? "border-emerald-200" : "border-amber-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-base font-bold ${isEntry ? "text-emerald-800" : "text-amber-900"}`}>
            {movementTypeLabels[movement.type]}
          </p>
          <h2 className="mt-1 truncate text-xl font-bold text-slate-950">{movement.productName}</h2>
        </div>
        <p className={`shrink-0 rounded-xl px-3 py-2 text-lg font-bold ${isEntry ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {isEntry ? "+" : "-"}{movement.quantity}
        </p>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-base text-slate-700 sm:grid-cols-2">
        <p>
          <span className="block text-sm text-slate-600">Motivo</span>
          <span className="font-semibold text-slate-900">{movementReasonLabels[movement.reason]}</span>
        </p>
        <p>
          <span className="block text-sm text-slate-600">Stock después</span>
          <span className="font-semibold text-slate-900">
            {movement.previousStock} → {movement.resultingStock} unidades
          </span>
        </p>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-600">{formatDate(movement.createdAt)}</p>
    </article>
  );
}

function EmptyHistory() {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="text-xl font-bold text-slate-950">Aún no hay movimientos.</h2>
      <p className="mt-2 text-base leading-7 text-slate-700">
        Cuando registres una entrada o salida, aparecerá aquí.
      </p>
      <Link
        href="/movimiento"
        className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800"
      >
        Registrar un movimiento
      </Link>
    </section>
  );
}

function EmptyFilteredHistory({ hasSearch }: { hasSearch: boolean }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="text-xl font-bold text-slate-950">No hay movimientos para mostrar.</h2>
      <p className="mt-2 text-base leading-7 text-slate-700">
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
