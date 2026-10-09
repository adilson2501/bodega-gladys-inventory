export default function HistoryLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Cargando historial">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200" />
      <p className="text-sm text-slate-500">Cargando historial...</p>
    </section>
  );
}
