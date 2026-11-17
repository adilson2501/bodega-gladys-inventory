"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { adjustStock, type MovementActionState } from "@/actions/movements";
import { useIdempotencyKey } from "@/lib/inventory/use-idempotency-key";
import { resolveStockAdjustmentProductId } from "@/lib/inventory/stock-adjustment-selection";

export type AdjustmentProduct = {
  id: string;
  name: string;
  currentStock: number;
};

export function StockAdjustmentForm({
  products,
  initialProductId,
}: {
  products: AdjustmentProduct[];
  initialProductId?: string;
}) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState(
    resolveStockAdjustmentProductId(products, initialProductId),
  );
  const [actualStock, setActualStock] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [dismissedState, setDismissedState] = useState<MovementActionState | null>(null);
  const hasSubmittedRef = useRef(false);
  const { inputRef: idempotencyInputRef, ensureKey, rotateKey } = useIdempotencyKey();
  const [state, formAction, isPending] = useActionState<MovementActionState, FormData>(adjustStock, null);
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const parsedActualStock = actualStock.trim() === "" ? null : Number(actualStock);
  const hasValidActualStock =
    parsedActualStock !== null && Number.isInteger(parsedActualStock) && parsedActualStock >= 0;
  const difference = selectedProduct && hasValidActualStock && parsedActualStock !== null
    ? parsedActualStock - (selectedProduct?.currentStock ?? 0)
    : null;
  const stockMatches = difference === 0;
  const isEntry = difference !== null && difference > 0;

  useEffect(() => {
    if (state?.success && hasSubmittedRef.current) {
      hasSubmittedRef.current = false;
      router.replace("/inventario?adjustment=success");
    }
    if (state?.staleStock !== undefined) router.refresh();
  }, [router, state]);

  function resetProductState() {
    setActualStock("");
    setIsConfirmed(false);
    setDismissedState(state);
    hasSubmittedRef.current = false;
    rotateKey();
  }

  if (products.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
        <h1 className="text-xl font-bold text-slate-950">Primero agrega un producto.</h1>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Necesitas un producto registrado antes de poder ajustar su stock.
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
        <p className="text-base font-semibold text-emerald-800">Ajustar stock</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Corrige la cantidad real</h1>
        <p className="mt-2 text-base leading-7 text-slate-700">
          Cuenta el producto e indica cuántas unidades tienes ahora. El ajuste quedará guardado en el historial.
        </p>
      </section>

      <Link
        href="/inventario"
        className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
      >
        Volver a Stock
      </Link>

      <form
        action={formAction}
        onSubmit={() => {
          hasSubmittedRef.current = true;
          ensureKey();
        }}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <section className="border-b border-slate-200 pb-6">
          <label htmlFor="adjustment-product" className="mb-2 block text-base font-semibold text-slate-900">
            Producto <span aria-hidden="true">*</span>
          </label>
          <select
            id="adjustment-product"
            name="productId"
            value={selectedProductId}
            required
            disabled={isPending}
            onChange={(event) => {
              setSelectedProductId(event.target.value);
              resetProductState();
            }}
            className="form-input"
          >
            <option value="" disabled>
              Selecciona un producto
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          {selectedProduct ? (
            <div className="mt-4 rounded-xl bg-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-700">Stock registrado ahora</p>
              <p className="mt-1 text-4xl font-bold text-slate-950">{selectedProduct.currentStock}</p>
            </div>
          ) : null}
        </section>

        <section>
          <label htmlFor="actual-stock" className="mb-2 block text-base font-semibold text-slate-900">
            Cantidad que contaste <span aria-hidden="true">*</span>
          </label>
          <input
            id="actual-stock"
            name="actualStock"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={actualStock}
            disabled={isPending}
            onChange={(event) => {
              setActualStock(event.target.value);
              setIsConfirmed(false);
              rotateKey();
            }}
            required
            className="form-input"
          />
          <p className="mt-2 text-base leading-6 text-slate-700">
            Escribe la cantidad física que acabas de contar, incluso si es cero.
          </p>
        </section>

        <input ref={idempotencyInputRef} type="hidden" name="idempotencyKey" defaultValue="" />
        <input type="hidden" name="expectedStock" value={selectedProduct?.currentStock ?? ""} />

        {difference !== null ? (
          <section
            aria-live="polite"
            className={`rounded-2xl border p-5 ${
              stockMatches
                ? "border-slate-300 bg-slate-50 text-slate-800"
                : isEntry
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            {stockMatches ? (
              <>
                <p className="text-base font-bold">El stock ya coincide.</p>
                <p className="mt-2 text-base leading-6">No necesitas guardar un ajuste.</p>
              </>
            ) : (
              <>
                <p className="text-base font-bold">Revisa antes de guardar</p>
                <p className="mt-2 text-base leading-6">
                  Se registrará una {isEntry ? "entrada" : "salida"} por ajuste de {Math.abs(difference)} unidades.
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {selectedProduct?.currentStock ?? 0} → {actualStock}
                </p>
              </>
            )}
          </section>
        ) : null}

        {!stockMatches && hasValidActualStock ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-4 text-base text-slate-800">
            <input
              type="checkbox"
              checked={isConfirmed}
              disabled={isPending}
              onChange={(event) => setIsConfirmed(event.target.checked)}
              className="mt-1 h-5 w-5 accent-emerald-700"
            />
            <span>Confirmo que conté este producto y que la cantidad indicada es correcta.</span>
          </label>
        ) : null}

        {state?.error && dismissedState !== state ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-4 text-base text-red-900">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !selectedProduct || !hasValidActualStock || stockMatches || !isConfirmed}
          className="min-h-14 w-full rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Guardando ajuste..." : "Confirmar y guardar ajuste"}
        </button>
      </form>
    </div>
  );
}
