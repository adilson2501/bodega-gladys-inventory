"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createProduct,
  updateProduct,
  type ProductActionState,
} from "@/actions/products";
import { getStockStatus, type StockStatus } from "@/lib/inventory/stock-status";
import { normalizeProductQuery, productMatchesQuery } from "@/lib/products/search";
import { unitLabels, unitOfMeasureValues } from "@/lib/validations/commercial";

export type ProductListItem = {
  id: string;
  name: string;
  category: string | null;
  barcode: string | null;
  currentStock: number;
  minimumStock: number;
  sellingPrice: string;
  purchaseCost: string;
  unitOfMeasure: (typeof unitOfMeasureValues)[number];
  isActive: boolean;
};

type ProductsClientProps = {
  products: ProductListItem[];
  searchQuery: string;
};

export function ProductsClient({ products, searchQuery }: ProductsClientProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [notice, setNotice] = useState("");
  const [stockFilter, setStockFilter] = useState<"ALL" | "LOW" | "OUT">("ALL");
  const [query, setQuery] = useState(searchQuery);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const normalizedQuery = normalizeProductQuery(query);
  const visibleProducts = products.filter((product) => {
    const matchesSearch = productMatchesQuery(product, normalizedQuery);
    const matchesStock = stockFilter === "ALL"
      || (stockFilter === "OUT" ? product.currentStock === 0 : product.currentStock <= product.minimumStock);
    return matchesSearch && matchesStock;
  });

  function closeForm() {
    setIsCreating(false);
    setEditingProduct(null);
    dialogOpenerRef.current?.focus();
  }

  function handleSaved(message: string) {
    setNotice(message);
    closeForm();
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="flex items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold leading-6 tracking-tight text-slate-950">Productos</h1>
        <button
          type="button"
          onClick={() => {
            setNotice("");
            dialogOpenerRef.current = document.activeElement as HTMLElement | null;
            setIsCreating(true);
          }}
          className="min-h-11 shrink-0 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200"
        >
          + Agregar producto
        </button>
      </section>

      {notice ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <label htmlFor="product-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="product-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, categoría o código"
          className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar productos por stock">
        {([["ALL", "Todos"], ["LOW", "Por reponer"], ["OUT", "Agotados"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={stockFilter === value} onClick={() => setStockFilter(value)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${stockFilter === value ? "bg-emerald-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}
      </div>

      {visibleProducts.length > 0 ? (
        <section className="grid gap-2" aria-label="Lista de productos">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={(opener) => {
                setNotice("");
                dialogOpenerRef.current = opener;
                setEditingProduct(product);
              }}
            />
          ))}
        </section>
      ) : (
        <EmptyProductsState hasSearch={Boolean(normalizedQuery)} onCreate={() => setIsCreating(true)} />
      )}

      {isCreating || editingProduct ? (
        <ProductForm
          key={editingProduct?.id ?? "new"}
          product={editingProduct}
          onCancel={closeForm}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
}: {
  product: ProductListItem;
  onEdit: (opener: HTMLButtonElement) => void;
}) {
  const status = getStockStatus(product.currentStock, product.minimumStock);

  return (
    <article className="surface px-3 py-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-950">{product.name}</h2>
          <p className="mt-0.5 text-[12px] text-slate-600">{product.category || "Sin categoría"} · {unitLabels[product.unitOfMeasure]}</p>
          {product.barcode ? <p className="mt-0.5 text-[12px] text-slate-500">Código: {product.barcode}</p> : null}
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 px-2 py-2">
        <PriceValue value={product.sellingPrice} />
        <StockValue label="Stock" value={product.currentStock} />
        <StockValue label="Mínimo" value={product.minimumStock} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
      <p className={`text-xs font-bold ${product.isActive ? "text-emerald-700" : "text-slate-500"}`}>
        {product.isActive ? "Producto activo" : "Producto inactivo"}
      </p>

       <button
        type="button"
        onClick={(event) => onEdit(event.currentTarget)}
          className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
       >
         Editar
       </button>
      </div>
    </article>
  );
}

function StockValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-950">{value}</p>
    </div>
  );
}

function PriceValue({ value }: { value: string }) {
  return <div className="pr-2"><p className="text-[11px] text-slate-600">Venta</p><p className="mt-0.5 text-base font-bold text-slate-950">S/ {value}</p></div>;
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles = {
    AGOTADO: "bg-red-50 text-red-700",
    "STOCK BAJO": "bg-amber-50 text-amber-800",
    NORMAL: "bg-emerald-50 text-emerald-800",
  } satisfies Record<StockStatus, string>;

  return (
    <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function EmptyProductsState({
  hasSearch,
  onCreate,
}: {
  hasSearch: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
      <h2 className="text-lg font-semibold text-slate-950">
        {hasSearch ? "No encontramos productos" : "No hay productos registrados."}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {hasSearch
          ? "Prueba con otro nombre, categoría o código."
          : "Registra tu primer producto para comenzar."}
      </p>
      {!hasSearch ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"
        >
          Registrar primer producto
        </button>
      ) : (
        <Link
          href="/productos"
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Ver todos los productos
        </Link>
      )}
    </section>
  );
}

function ProductForm({
  product,
  onCancel,
  onSaved,
}: {
  product: ProductListItem | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const action = product ? updateProduct : createProduct;
  const [state, formAction, isPending] = useActionState<ProductActionState, FormData>(action, null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state?.success) {
      onSaved(state.success);
      router.refresh();
    }
  }, [onSaved, router, state]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => {
      if (element instanceof HTMLInputElement && element.type === "hidden") return false;
      return !element.hasAttribute("disabled");
    });

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        onKeyDown={handleDialogKeyDown}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="product-form-title" className="text-lg font-bold text-slate-950">
              {product ? "Editar producto" : "Agregar producto"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <p className="mt-2 text-sm leading-5 text-slate-700">
          Completa el nombre y el stock mínimo. Lo demás es opcional. El stock actual se actualiza al registrar una entrada o salida.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          {product ? <input type="hidden" name="id" value={product.id} /> : null}

          <FormField label="Nombre" htmlFor="product-name" required>
            <input
              id="product-name"
              ref={firstFieldRef}
              name="name"
              type="text"
              defaultValue={product?.name ?? ""}
              required
              className="form-input"
            />
          </FormField>

          <FormField label="Categoría" htmlFor="product-category">
            <input
              id="product-category"
              name="category"
              type="text"
              defaultValue={product?.category ?? ""}
              className="form-input"
            />
          </FormField>

          <FormField label="Código de barras" htmlFor="product-barcode">
            <input
              id="product-barcode"
              name="barcode"
              type="text"
              defaultValue={product?.barcode ?? ""}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className="form-input"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Precio de venta (S/)" htmlFor="product-selling-price" required>
              <input id="product-selling-price" name="sellingPrice" type="number" min="0" step="0.01" defaultValue={product?.sellingPrice ?? "0.00"} required className="form-input" />
            </FormField>
            <FormField label="Costo de compra (S/)" htmlFor="product-purchase-cost" required>
              <input id="product-purchase-cost" name="purchaseCost" type="number" min="0" step="0.01" defaultValue={product?.purchaseCost ?? "0.00"} required className="form-input" />
            </FormField>
          </div>

          <FormField label="Unidad de medida" htmlFor="product-unit">
            <select id="product-unit" name="unitOfMeasure" defaultValue={product?.unitOfMeasure ?? "UNIT"} className="form-input">
              {unitOfMeasureValues.map((unit) => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}
            </select>
          </FormField>

          <FormField label="Stock mínimo" htmlFor="product-minimum-stock" required>
            <input
              id="product-minimum-stock"
              name="minimumStock"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.minimumStock ?? 0}
              required
              className="form-input"
            />
          </FormField>

          <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <input type="checkbox" name="isActive" value="true" defaultChecked={product?.isActive ?? true} className="h-5 w-5 accent-emerald-700" />
            Disponible para ventas y compras
          </label>

          {state?.error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-slate-900">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
    </div>
  );
}
