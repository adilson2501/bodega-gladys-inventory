export default function MovementLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Cargando formulario de movimiento">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-96 animate-pulse rounded-2xl bg-slate-200" />
      <p className="text-sm text-slate-500">Cargando movimiento...</p>
    </section>
  );
}
