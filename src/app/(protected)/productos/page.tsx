export default function ProductsPage() {
  return (
    <PlaceholderPage
      title="Productos"
      description="El registro de productos se implementará en el siguiente paso."
    />
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-medium text-emerald-700">Sección</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}
