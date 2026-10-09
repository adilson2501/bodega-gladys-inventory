export default function HomeLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Cargando resumen">
      <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-200" />
      <p className="text-sm text-slate-500">Cargando resumen...</p>
    </section>
  );
}
