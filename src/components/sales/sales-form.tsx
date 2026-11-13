"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createSale, type SaleActionState } from "@/actions/sales";
import { useIdempotencyKey } from "@/lib/inventory/use-idempotency-key";
import { paymentLabels, paymentMethodValues } from "@/lib/validations/commercial";

export type SaleProduct = { id: string; name: string; barcode: string | null; sellingPrice: string; currentStock: number; unitOfMeasure: string };
type SaleLine = { productId: string; quantity: number; unitPrice: string };

export function SalesForm({ products }: { products: SaleProduct[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<SaleLine[]>(products[0] ? [{ productId: products[0].id, quantity: 1, unitPrice: products[0].sellingPrice }] : []);
  const [payment, setPayment] = useState<(typeof paymentMethodValues)[number]>("CASH");
  const [productSearch, setProductSearch] = useState("");
  const { inputRef, ensureKey, rotateKey } = useIdempotencyKey();
  const [state, formAction, isPending] = useActionState<SaleActionState, FormData>(createSale, null);

  useEffect(() => { if (state?.success) router.refresh(); }, [router, state]);

  function addLine() {
    const product = products.find((item) => !lines.some((line) => line.productId === item.id));
    if (product) setLines((current) => [...current, { productId: product.id, quantity: 1, unitPrice: product.sellingPrice }]);
  }

  if (products.length === 0) return <EmptySales />;
  const total = lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * line.quantity, 0).toFixed(2);

  return (
    <div className="space-y-4">
      <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Nueva venta</h1>
      {state?.success ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{state.success}</p> : null}
      {state?.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{state.error}</p> : null}
      <form action={formAction} onSubmit={ensureKey} className="surface space-y-3 p-3 sm:p-4">
        <input ref={inputRef} type="hidden" name="idempotencyKey" />
        <input type="hidden" name="items" value={JSON.stringify(lines)} readOnly />
        <label htmlFor="sale-product-search" className="block text-sm font-semibold">Buscar producto
          <input id="sale-product-search" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nombre o código de barras" className="form-input mt-1" />
        </label>
        <div><label htmlFor="payment" className="mb-1 block text-sm font-semibold">Forma de pago</label><select id="payment" name="paymentMethod" value={payment} onChange={(event) => { setPayment(event.target.value as typeof payment); rotateKey(); }} className="form-input">{paymentMethodValues.map((method) => <option key={method} value={method}>{paymentLabels[method]}</option>)}</select></div>
        <div className="space-y-2">
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId)!;
             return <div key={line.productId} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-start justify-between gap-2"><label className="block min-w-0 flex-1 text-sm font-semibold">Producto<select value={line.productId} onChange={(event) => { const next = products.find((item) => item.id === event.target.value)!; setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: next.id, unitPrice: next.sellingPrice } : item)); rotateKey(); }} className="form-input mt-1">{products.filter((item) => item.id === line.productId || item.name.toLocaleLowerCase().includes(productSearch.toLocaleLowerCase()) || item.barcode?.includes(productSearch)).map((item) => <option key={item.id} value={item.id} disabled={lines.some((other, otherIndex) => otherIndex !== index && other.productId === item.id)}>{item.name} ({item.currentStock} disponibles)</option>)}</select></label>{lines.length > 1 ? <button type="button" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-10 px-2 text-sm font-bold text-red-700">Quitar</button> : null}</div>
                <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-sm font-semibold">Cantidad<input type="number" min="1" max={product.currentStock} step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.min(product.currentStock, Number(event.target.value)) } : item))} className="form-input mt-1" /></label><label className="text-sm font-semibold">Precio unitario<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))} className="form-input mt-1" /></label></div>
               <p className="mt-2 text-right text-[13px] text-slate-600">Subtotal: <strong>S/ {(Number(line.unitPrice || 0) * line.quantity).toFixed(2)}</strong> · {product.unitOfMeasure}</p>
            </div>;
          })}
        </div>
        <button type="button" onClick={addLine} className="min-h-11 w-full rounded-lg border border-emerald-700 px-4 text-sm font-bold text-emerald-800">+ Agregar producto</button>
         <div className="sticky bottom-16 z-10 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm lg:bottom-2"><span className="text-sm font-semibold">Total</span><strong className="text-xl">S/ {total}</strong></div>
        <button type="submit" disabled={isPending || lines.length === 0} className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{isPending ? "Registrando..." : "Registrar venta"}</button>
      </form>
    </div>
  );
}

function EmptySales() { return <section className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center"><h2 className="text-lg font-bold">No hay productos activos.</h2><p className="mt-1 text-sm text-slate-700">Activa productos desde Catálogo para registrar ventas.</p></section>; }
