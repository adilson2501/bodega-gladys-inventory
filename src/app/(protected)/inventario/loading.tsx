export default function InventoryLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Cargando inventario">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-200" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-200" />
      <p className="text-sm text-slate-500">Cargando inventario...</p>
    </section>
  );
}
