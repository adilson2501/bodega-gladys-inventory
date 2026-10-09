const summaryItems = ["Productos", "Stock bajo", "Agotados", "Movimientos recientes"];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-emerald-700">Inicio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Resumen de inventario
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Aquí podrás consultar lo más importante de tu bodega.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <article
            key={item}
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-5"
          >
            <h2 className="font-medium text-slate-900">{item}</h2>
            <p className="mt-2 text-sm text-slate-500">Disponible próximamente.</p>
          </article>
        ))}
      </section>
    </div>
  );
}
