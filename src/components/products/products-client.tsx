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

export type ProductListItem = {
  id: string;
  name: string;
  category: string | null;
  barcode: string | null;
  currentStock: number;
  minimumStock: number;
};

type ProductsClientProps = {
  products: ProductListItem[];
  searchQuery: string;
};

export function ProductsClient({ products, searchQuery }: ProductsClientProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [notice, setNotice] = useState("");
  const dialogOpenerRef = useRef<HTMLElement | null>(null);

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
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">Catálogo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Productos
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Registra los productos que tienes en tu bodega.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice("");
            dialogOpenerRef.current = document.activeElement as HTMLElement | null;
            setIsCreating(true);
          }}
          className="min-h-12 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200"
        >
          Nuevo producto
        </button>
      </section>

      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <form method="get" className="flex gap-2">
        <label htmlFor="product-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="product-search"
          name="q"
          type="search"
          defaultValue={searchQuery}
          placeholder="Buscar por nombre, categoría o código"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
        <button
          type="submit"
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      {products.length > 0 ? (
        <section className="space-y-3" aria-label="Lista de productos">
          {products.map((product) => (
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
        <EmptyProductsState hasSearch={Boolean(searchQuery)} onCreate={() => setIsCreating(true)} />
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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-950">{product.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {product.category || "Sin categoría"}
          </p>
          {product.barcode ? (
            <p className="mt-1 text-xs text-slate-400">Código: {product.barcode}</p>
          ) : null}
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <StockValue label="Stock actual" value={product.currentStock} />
        <StockValue label="Stock mínimo" value={product.minimumStock} />
      </div>

      <button
        type="button"
        onClick={(event) => onEdit(event.currentTarget)}
        className="mt-4 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
      >
        Editar producto
      </button>
    </article>
  );
}

function StockValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles = {
    AGOTADO: "bg-red-50 text-red-700",
    "STOCK BAJO": "bg-amber-50 text-amber-800",
    NORMAL: "bg-emerald-50 text-emerald-800",
  } satisfies Record<StockStatus, string>;

  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
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
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="text-lg font-semibold text-slate-950">
        {hasSearch ? "No encontramos productos" : "No hay productos registrados."}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {hasSearch
          ? "Prueba con otro nombre, categoría o código."
          : "Registra tu primer producto para comenzar."}
      </p>
      {!hasSearch ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Registrar primer producto
        </button>
      ) : (
        <Link
          href="/productos"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">Productos</p>
            <h2 id="product-form-title" className="mt-2 text-2xl font-semibold text-slate-950">
              {product ? "Editar producto" : "Nuevo producto"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          El stock actual comienza en cero y se modificará después desde los movimientos.
        </p>

        <form action={formAction} className="mt-6 space-y-5">
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
              className="form-input"
            />
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

          {state?.error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-12 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-12 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
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
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-800">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
    </div>
  );
}
