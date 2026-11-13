"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createMovement, type MovementActionState } from "@/actions/movements";
import { useIdempotencyKey } from "@/lib/inventory/use-idempotency-key";
import {
  movementReasonLabels,
  movementReasons,
  movementTypeLabels,
  movementTypes,
  validReasonsByType,
} from "@/lib/inventory/movement-rules";

export type MovementProduct = {
  id: string;
  name: string;
  barcode: string | null;
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
  const [productSearch, setProductSearch] = useState("");
  const [movementType, setMovementType] = useState<(typeof movementTypes)[number]>("IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<(typeof movementReasons)[number]>("PURCHASE");
  const { inputRef: idempotencyInputRef, ensureKey, rotateKey } = useIdempotencyKey();
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
      const resetTransientFields = window.setTimeout(() => {
        setQuantity("");
        setProductSearch("");
        setReason(validReasonsByType[movementType][0]);
      }, 0);
      router.refresh();
      return () => window.clearTimeout(resetTransientFields);
    }
    if (state?.staleStock !== undefined) router.refresh();
  }, [movementType, router, state]);

  const validReasons = validReasonsByType[movementType];

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
    <div className="space-y-4">
      <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Entrada o salida</h1>

      {state?.success ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {state.success}
        </p>
      ) : null}

      <form
        action={formAction}
        onSubmit={ensureKey}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <FormStep title="Producto">
          <label htmlFor="movement-product" className="mb-1 block text-sm font-semibold text-slate-900">
            Producto <span aria-hidden="true">*</span>
          </label>
          <input id="movement-product" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por nombre o código" className="form-input" />
           {productSearch.trim() ? <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
             {products.filter((product) => product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase()) || product.barcode?.includes(productSearch.trim())).slice(0, 8).map((product) => <button key={product.id} type="button" onClick={() => { setSelectedProductId(product.id); setProductSearch(""); rotateKey(); }} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-emerald-50"><span className="font-semibold">{product.name}</span><span className="text-slate-500">{product.currentStock} disp.</span></button>)}
           </div> : null}
          <input type="hidden" name="productId" value={selectedProductId} />
           <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm"><span className="truncate font-semibold text-emerald-950">{selectedProduct?.name ?? "Selecciona un producto"}</span><span className="shrink-0 text-emerald-800">{selectedProduct?.currentStock ?? 0} disponibles</span></div>

           <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
             <p className="text-sm font-semibold text-slate-700">Stock disponible</p>
             <p className="text-xl font-bold text-slate-950">{selectedProduct?.currentStock ?? 0}</p>
           </div>
        </FormStep>

        <FormStep title="Tipo de movimiento">
          <div className="grid grid-cols-2 gap-3">
            {movementTypes.map((type) => {
              const isSelected = movementType === type;
              const isEntry = type === "IN";

              return (
                <label
                  key={type}
                   className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-center transition focus-within:ring-4 focus-within:ring-emerald-200 focus-within:ring-offset-2 ${
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
                    onChange={() => {
                      setMovementType(type);
                      setReason(validReasonsByType[type][0]);
                      rotateKey();
                    }}
                    className="sr-only"
                  />
                   <span className="text-sm font-bold">{movementTypeLabels[type]}</span>
                   <span className="text-[12px]">{isEntry ? "Agregar" : "Retirar"}</span>
                </label>
              );
            })}
          </div>
        </FormStep>

        <FormStep title="Cantidad y motivo">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="movement-quantity" className="mb-1 block text-sm font-semibold text-slate-900">
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
                onChange={(event) => {
                  setQuantity(event.target.value);
                  rotateKey();
                }}
                required
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="movement-reason" className="mb-1 block text-sm font-semibold text-slate-900">
                Motivo <span aria-hidden="true">*</span>
              </label>
              <select
                id="movement-reason"
                name="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value as (typeof movementReasons)[number]);
                  rotateKey();
                }}
                className="form-input"
                required
              >
                {validReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {movementReasonLabels[reason]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </FormStep>

        <input ref={idempotencyInputRef} type="hidden" name="idempotencyKey" defaultValue="" />
        <input type="hidden" name="expectedStock" value={selectedProduct?.currentStock ?? 0} />

        {resultingStock !== null ? (
          <section
            aria-live="polite"
            className={`rounded-lg border px-3 py-2 ${
              wouldExceedStock
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
          >
            <p className="text-sm font-bold">
              {wouldExceedStock ? "La cantidad es mayor al stock disponible" : "Así quedará el stock"}
            </p>
            {wouldExceedStock ? (
                <p className="mt-1 text-sm leading-5">
                Solo hay {selectedProduct?.currentStock ?? 0} unidades disponibles. Reduce la cantidad para continuar.
              </p>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm">{selectedProduct?.name}</p>
                  <p className="mt-1 text-base">{movementTypeLabels[movementType]} de {numericQuantity} unidades</p>
                </div>
                <p className="text-2xl font-bold">{resultingStock}</p>
              </div>
            )}
          </section>
        ) : null}

        {state?.error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || wouldExceedStock}
          className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar movimiento"}
        </button>
      </form>
    </div>
  );
}

function FormStep({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-[15px] font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}
