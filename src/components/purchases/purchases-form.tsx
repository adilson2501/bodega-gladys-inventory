"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createPurchase, type PurchaseActionState } from "@/actions/purchases";
import { useIdempotencyKey } from "@/lib/inventory/use-idempotency-key";
import { unitLabels } from "@/lib/validations/commercial";

export type PurchaseProduct = { id: string; name: string; purchaseCost: string; unitOfMeasure: keyof typeof unitLabels };
type PurchaseLine = { productId: string; quantity: number; unitCost: string };

export function PurchasesForm({ products }: { products: PurchaseProduct[] }) {
  const router = useRouter();
  const [supplierName, setSupplierName] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>(products[0] ? [{ productId: products[0].id, quantity: 1, unitCost: products[0].purchaseCost }] : []);
  const { inputRef, ensureKey, rotateKey } = useIdempotencyKey();
  const [state, formAction, isPending] = useActionState<PurchaseActionState, FormData>(createPurchase, null);

  useEffect(() => { if (state?.success) router.refresh(); }, [router, state]);

  function addLine() {
    const product = products.find((item) => !lines.some((line) => line.productId === item.id));
    if (product) setLines((current) => [...current, { productId: product.id, quantity: 1, unitCost: product.purchaseCost }]);
  }

  if (products.length === 0) return <section className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center"><h2 className="text-lg font-bold">No hay productos activos.</h2></section>;
  const total = lines.reduce((sum, line) => sum + Number(line.unitCost || 0) * line.quantity, 0).toFixed(2);

  return (
    <div className="space-y-4">
      <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Nueva compra</h1>
      {state?.success ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{state.success}</p> : null}
      {state?.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{state.error}</p> : null}
      <form action={formAction} onSubmit={ensureKey} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <input ref={inputRef} type="hidden" name="idempotencyKey" />
        <input type="hidden" name="items" value={JSON.stringify(lines)} readOnly />
        <label className="block text-sm font-semibold">Proveedor
          <input value={supplierName} onChange={(event) => { setSupplierName(event.target.value); rotateKey(); }} name="supplierName" required className="form-input mt-1" placeholder="Nombre del proveedor" />
        </label>
        <div className="space-y-2">
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId)!;
            return <div key={line.productId} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex gap-2">
                <label className="flex-1 text-sm font-semibold">Producto
                  <select value={line.productId} onChange={(event) => { const next = products.find((item) => item.id === event.target.value)!; setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: next.id, unitCost: next.purchaseCost } : item)); rotateKey(); }} className="form-input mt-1">
                    {products.map((item) => <option key={item.id} value={item.id} disabled={lines.some((other, otherIndex) => otherIndex !== index && other.productId === item.id)}>{item.name}</option>)}
                  </select>
                </label>
                {lines.length > 1 ? <button type="button" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-10 px-2 text-sm font-bold text-red-700">Quitar</button> : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Cantidad<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} className="form-input mt-1" /></label>
                <label className="text-sm font-semibold">Costo unitario<input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost: event.target.value } : item))} className="form-input mt-1" /></label>
              </div>
              <p className="mt-2 text-right text-[13px] text-slate-600">Unidad: {unitLabels[product.unitOfMeasure]}</p>
            </div>;
          })}
        </div>
        <button type="button" onClick={addLine} className="min-h-11 w-full rounded-lg border border-emerald-700 px-4 text-sm font-bold text-emerald-800">+ Agregar producto</button>
        <div className="flex justify-between rounded-lg bg-slate-100 px-3 py-2"><span className="text-sm font-semibold">Total</span><strong className="text-xl">S/ {total}</strong></div>
        <button type="submit" disabled={isPending} className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60">{isPending ? "Registrando..." : "Registrar compra"}</button>
      </form>
    </div>
  );
}
