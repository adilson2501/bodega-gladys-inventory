"use client";

export default function InventoryError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-medium text-red-700">No pudimos cargar el inventario</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Inténtalo nuevamente
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Revisa tu conexión y vuelve a intentar. Si el problema continúa, avisa a la persona encargada.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
      >
        Intentar nuevamente
      </button>
    </section>
  );
}
