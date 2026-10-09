"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createMovement, type MovementActionState } from "@/actions/movements";
import {
  movementReasonLabels,
  movementReasons,
  movementTypeLabels,
  movementTypes,
} from "@/lib/inventory/movement-rules";

export type MovementProduct = {
  id: string;
  name: string;
  currentStock: number;
};

export function MovementForm({ products }: { products: MovementProduct[] }) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [movementType, setMovementType] = useState<(typeof movementTypes)[number]>("IN");
  const [state, formAction, isPending] = useActionState<MovementActionState, FormData>(
    createMovement,
    null,
  );
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [router, state]);

  if (products.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
        <h2 className="text-lg font-semibold text-slate-950">No hay productos registrados.</h2>
        <p className="mt-2 text-sm text-slate-600">
          Registra un producto antes de crear un movimiento.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Movimiento</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Registrar movimiento
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Registra una entrada o salida para actualizar las existencias.
        </p>
      </section>

      {state?.success ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.success}
        </p>
      ) : null}

      <form action={formAction} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="movement-product" className="mb-2 block text-sm font-medium text-slate-800">
            Producto <span aria-hidden="true">*</span>
          </label>
          <select
            id="movement-product"
            name="productId"
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
            className="form-input"
            required
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Stock actual</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{selectedProduct?.currentStock ?? 0}</p>
        </div>

        <div>
          <p className="mb-2 block text-sm font-medium text-slate-800">Tipo <span aria-hidden="true">*</span></p>
          <div className="grid grid-cols-2 gap-3">
            {movementTypes.map((type) => (
              <label
                key={type}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition focus-within:ring-4 focus-within:ring-emerald-200 focus-within:ring-offset-2 ${
                  movementType === type
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={movementType === type}
                  onChange={() => setMovementType(type)}
                  className="sr-only"
                />
                {movementTypeLabels[type]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="movement-quantity" className="mb-2 block text-sm font-medium text-slate-800">
            Cantidad <span aria-hidden="true">*</span>
          </label>
          <input
            id="movement-quantity"
            name="quantity"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            required
            className="form-input"
          />
        </div>

        <div>
          <label htmlFor="movement-reason" className="mb-2 block text-sm font-medium text-slate-800">
            Motivo <span aria-hidden="true">*</span>
          </label>
          <select id="movement-reason" name="reason" defaultValue="PURCHASE" className="form-input" required>
            {movementReasons.map((reason) => (
              <option key={reason} value={reason}>
                {movementReasonLabels[reason]}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Revisa antes de confirmar</p>
          <p className="mt-2">{selectedProduct?.name}</p>
          <p>Stock actual: {selectedProduct?.currentStock ?? 0}</p>
          <p>Tipo: {movementTypeLabels[movementType]}</p>
        </div>

        {state?.error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="min-h-12 w-full rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Registrando..." : "Registrar movimiento"}
        </button>
      </form>
    </div>
  );
}
