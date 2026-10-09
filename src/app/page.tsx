export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Bodega Gladys</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Gestión de inventario
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          La base de la aplicación está lista. Aquí comenzará el flujo de
          inventario.
        </p>
      </section>
    </main>
  );
}
