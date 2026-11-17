"use client";

import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { createPurchase, type PurchaseActionState } from "@/actions/purchases";
import { calculateCartTotal, canSubmitCart, removeCartLine } from "@/lib/commercial/cart";
import { useIdempotencyKey } from "@/lib/inventory/use-idempotency-key";
import { unitLabels } from "@/lib/validations/commercial";
import { findExactProduct, getScannerKeyBehavior, searchProducts } from "@/lib/products/search";

export type PurchaseProduct = { id: string; name: string; barcode: string | null; purchaseCost: string; unitOfMeasure: keyof typeof unitLabels };
type PurchaseLine = { productId: string; quantity: number; unitCost: string };

export function PurchasesForm({ products }: { products: PurchaseProduct[] }) {
  const router = useRouter();
  const [supplierName, setSupplierName] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const { inputRef, ensureKey, rotateKey } = useIdempotencyKey();
  const [state, formAction, isPending] = useActionState<PurchaseActionState, FormData>(createPurchase, null);
  const [dismissedSuccessState, setDismissedSuccessState] = useState<PurchaseActionState | null>(null);

  useEffect(() => {
    if (!state?.success) return;
    const resetTimer = window.setTimeout(() => {
      setSupplierName("");
      setLines([]);
      setProductSearch("");
      setScanMessage("");
      productSearchRef.current?.focus();
    }, 0);
    const dismissTimer = window.setTimeout(() => setDismissedSuccessState(state), 4000);
    router.refresh();
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [router, state]);

  function addProduct(product: PurchaseProduct) {
    const existingLine = lines.find((line) => line.productId === product.id);
    if (existingLine) {
      setLines((current) => current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line));
    } else {
      setLines((current) => [...current, { productId: product.id, quantity: 1, unitCost: product.purchaseCost }]);
    }
    setProductSearch("");
    setScanMessage(`${product.name} agregado.`);
    rotateKey();
  }

  function handleProductSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const behavior = getScannerKeyBehavior(event.key, event.currentTarget.value);
    if (behavior === "ignore") return;
    const exactProduct = findExactProduct(products, event.currentTarget.value);
    if (behavior === "commit") event.preventDefault();
    if (exactProduct) addProduct(exactProduct);
    else if (behavior === "commit") setScanMessage("No encontramos ese producto o código de barras.");
  }

  if (products.length === 0) return <section className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center"><h2 className="text-lg font-bold">No hay productos activos.</h2></section>;
  const total = calculateCartTotal(lines);

  return (
    <div className="space-y-4">
      <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Nueva compra</h1>
      {state?.success && dismissedSuccessState !== state ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{state.success}</p> : null}
      {state?.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{state.error}</p> : null}
      <form action={formAction} onSubmit={ensureKey} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <input ref={inputRef} type="hidden" name="idempotencyKey" />
        <input type="hidden" name="items" value={JSON.stringify(lines)} readOnly />
        <label className="block text-sm font-semibold">Proveedor
          <input value={supplierName} onChange={(event) => { setSupplierName(event.target.value); rotateKey(); }} name="supplierName" required className="form-input mt-1" placeholder="Nombre del proveedor" />
        </label>
        <div className="relative">
          <label htmlFor="purchase-product-search" className="block text-sm font-semibold">Buscar producto
            <input ref={productSearchRef} id="purchase-product-search" type="search" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setScanMessage(""); }} onKeyDown={handleProductSearchKeyDown} placeholder="Nombre o código de barras" className="form-input mt-1" autoComplete="off" />
          </label>
          {productSearch.trim() ? <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {searchProducts(products, productSearch).map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-emerald-50"><span className="truncate font-semibold">{product.name}</span><span className="shrink-0 pl-2 text-xs text-slate-500">S/ {product.purchaseCost}</span></button>)}
            {searchProducts(products, productSearch).length === 0 ? <p className="px-3 py-2 text-sm text-slate-600">No encontramos productos.</p> : null}
          </div> : null}
          {scanMessage ? <p role="status" className="mt-1 text-xs text-slate-600">{scanMessage}</p> : null}
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId)!;
            return <div key={line.productId} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{product.name}</p>
                <button type="button" onClick={() => setLines((current) => removeCartLine(current, line.productId))} className="min-h-10 px-2 text-sm font-bold text-red-700">Quitar</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Cantidad<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} className="form-input mt-1" /></label>
                <label className="text-sm font-semibold">Costo unitario<input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost: event.target.value } : item))} className="form-input mt-1" /></label>
              </div>
              <p className="mt-2 text-right text-[13px] text-slate-600">Unidad: {unitLabels[product.unitOfMeasure]}</p>
            </div>;
          })}
        </div>
        {lines.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Busca un producto o escanea su código para comenzar.</p> : null}
        <div className="flex justify-between rounded-lg bg-slate-100 px-3 py-2"><span className="text-sm font-semibold">Total</span><strong className="text-xl">S/ {total}</strong></div>
        <button type="submit" disabled={isPending || !canSubmitCart(lines, supplierName)} className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60">{isPending ? "Registrando..." : "Registrar compra"}</button>
      </form>
    </div>
  );
}
