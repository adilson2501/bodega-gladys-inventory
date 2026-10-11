"use client";

import Link from "next/link";
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

export function MovementForm({
  products,
  initialProductId,
}: {
  products: MovementProduct[];
  initialProductId?: string;
}) {
  const router = useRouter();
  const initialProduct = products.find((product) => product.id === initialProductId);
  const [selectedProductId, setSelectedProductId] = useState(
    initialProduct?.id ?? products[0]?.id ?? "",
  );
  const [movementType, setMovementType] = useState<(typeof movementTypes)[number]>("IN");
  const [quantity, setQuantity] = useState("");
  const [state, formAction, isPending] = useActionState<MovementActionState, FormData>(
    createMovement,
    null,
  );
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const numericQuantity = Number(quantity);
  const hasValidQuantity = Number.isInteger(numericQuantity) && numericQuantity > 0;
  const wouldExceedStock =
    movementType === "OUT" && hasValidQuantity && numericQuantity > (selectedProduct?.currentStock ?? 0);
  const resultingStock = hasValidQuantity
    ? movementType === "IN"
      ? (selectedProduct?.currentStock ?? 0) + numericQuantity
      : Math.max(0, (selectedProduct?.currentStock ?? 0) - numericQuantity)
    : null;

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [router, state]);

  if (products.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
        <h2 className="text-xl font-bold text-slate-950">Primero agrega un producto.</h2>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Necesitas un producto registrado antes de indicar una entrada o salida.
        </p>
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
    <div className="space-y-6">
      <section>
        <p className="text-base font-semibold text-emerald-800">Registrar</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Entrada o salida
        </h1>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Sigue estos pasos para actualizar el stock de un producto.
        </p>
      </section>

      {state?.success ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-4 text-base font-semibold text-emerald-900">
          {state.success}
        </p>
      ) : null}

      <form action={formAction} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <FormStep number="1" title="Elige el producto">
          <label htmlFor="movement-product" className="mb-2 block text-base font-semibold text-slate-900">
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

          <div className="mt-4 rounded-xl bg-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-700">Stock disponible ahora</p>
            <p className="mt-1 text-4xl font-bold text-slate-950">{selectedProduct?.currentStock ?? 0}</p>
          </div>
        </FormStep>

        <FormStep number="2" title="Indica el movimiento">
          <div className="grid grid-cols-2 gap-3">
            {movementTypes.map((type) => {
              const isSelected = movementType === type;
              const isEntry = type === "IN";

              return (
                <label
                  key={type}
                  className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border px-3 text-center transition focus-within:ring-4 focus-within:ring-emerald-200 focus-within:ring-offset-2 ${
                    isSelected
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    checked={isSelected}
                    onChange={() => setMovementType(type)}
                    className="sr-only"
                  />
                  <span className="text-lg font-bold">{movementTypeLabels[type]}</span>
                  <span className="mt-1 text-sm">{isEntry ? "Agregar stock" : "Retirar stock"}</span>
                </label>
              );
            })}
          </div>
        </FormStep>

        <FormStep number="3" title="Cantidad y motivo">
          <div className="space-y-5">
            <div>
              <label htmlFor="movement-quantity" className="mb-2 block text-base font-semibold text-slate-900">
                Cantidad <span aria-hidden="true">*</span>
              </label>
              <input
                id="movement-quantity"
                name="quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="movement-reason" className="mb-2 block text-base font-semibold text-slate-900">
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
          </div>
        </FormStep>

        {resultingStock !== null ? (
          <section
            aria-live="polite"
            className={`rounded-2xl border p-5 ${
              wouldExceedStock
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
          >
            <p className="text-base font-bold">
              {wouldExceedStock ? "La cantidad es mayor al stock disponible" : "Así quedará el stock"}
            </p>
            {wouldExceedStock ? (
              <p className="mt-2 text-base leading-6">
                Solo hay {selectedProduct?.currentStock ?? 0} unidades disponibles. Reduce la cantidad para continuar.
              </p>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm">{selectedProduct?.name}</p>
                  <p className="mt-1 text-base">{movementTypeLabels[movementType]} de {numericQuantity} unidades</p>
                </div>
                <p className="text-4xl font-bold">{resultingStock}</p>
              </div>
            )}
          </section>
        ) : null}

        {state?.error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-4 text-base text-red-900">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || wouldExceedStock}
          className="min-h-14 w-full rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar movimiento"}
        </button>
      </form>
    </div>
  );
}

function FormStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 pb-6 last:border-b-0 last:pb-0">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
          {number}
        </span>
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}
