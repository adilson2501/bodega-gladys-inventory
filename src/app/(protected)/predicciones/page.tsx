import type { ReactNode } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { products } from "@/db/schema";
import { loadForecastArtifact, loadForecastMetrics } from "@/lib/forecast/artifact";
import { filterSyntheticForecasts, matchSyntheticForecasts, predictionsSubtitle, syntheticReplenishment } from "@/lib/forecast/demo";
import { loadSyntheticForecastBatch } from "@/lib/forecast/demo-loader";
import { splitForecastPresentation } from "@/lib/forecast/presentation";
import { recommendedReplenishment } from "@/lib/forecast/replenishment";

export const instant = false;

export default async function PredictionsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const search = { q: params.q ?? "", status: params.status ?? "ALL" };
  await connection();
  const [productRows, artifact, metrics, demo] = await Promise.all([
    db.select({ id: products.id, name: products.name, currentStock: products.currentStock }).from(products).orderBy(asc(products.name)),
    Promise.resolve(loadForecastArtifact()),
    Promise.resolve(loadForecastMetrics()),
    Promise.resolve(loadSyntheticForecastBatch()),
  ]);
  if (demo.enabled) return <SyntheticDemoPage products={productRows} demo={demo} query={search.q} statusFilter={search.status} />;

  const safeArtifact = artifact?.source === "SYNTHETIC" ? null : artifact;
  const presentation = splitForecastPresentation(productRows, safeArtifact, metrics);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-base font-semibold text-emerald-800">Planificación</p>
        <h1 className="mt-1 page-heading font-bold tracking-tight text-slate-950">Predicciones</h1>
        <p className="mt-1 text-sm text-slate-600">{predictionsSubtitle(false)}</p>
      </section>

      {!safeArtifact ? <UnavailableState message="No hay un pronóstico operativo importado. La demostración sintética está desactivada." /> : <ArtifactSummary artifact={safeArtifact} />}
      {presentation.isSynthetic ? <DemoSection demos={presentation.demos} /> : null}
      {presentation.isSynthetic && metrics ? <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-900">Ver métricas y entrenamiento DEMO</summary><div className="mt-4"><MetricsSection metrics={metrics} demos={presentation.demos} /></div></details> : null}

      <section className="space-y-3" aria-labelledby="operational-title">
        <div><p className="text-base font-semibold text-emerald-800">Uso operativo</p><h2 id="operational-title" className="mt-1 text-2xl font-bold text-slate-950">Pronósticos del catálogo</h2></div>
        {presentation.isSynthetic ? <p className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-700">No hay recomendaciones operativas disponibles: el artefacto cargado es sintético. Los productos reales no reciben stock ni reposición inventados.</p> : presentation.operational.map(({ product, forecast }) => <OperationalCard key={product.id} product={product} forecast={forecast} />)}
        {!presentation.isSynthetic && productRows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-slate-700">No hay productos para mostrar.</p> : null}
      </section>
      <p className="text-sm leading-6 text-slate-600">La reposición operativa se calcula como `máximo(0, techo(demanda 7d + stock de seguridad - stock actual))`. No crea compras ni modifica inventario.</p>
    </div>
  );
}

function SyntheticDemoPage({
  products: productRows,
  demo,
  query,
  statusFilter,
}: {
  products: { id: string; name: string; currentStock: number }[];
  demo: ReturnType<typeof loadSyntheticForecastBatch>;
  query: string;
  statusFilter: string;
}) {
  if (!demo.batch) {
    const message = demo.reason === "MISSING_ARTIFACT"
      ? "Falta el batch ML.4 local. No se mostrarán valores de pronóstico."
      : "El batch ML.4 no está disponible o no supera la validación de seguridad.";
    return <PageShell><DemoBanner /><UnavailableState message={message} /></PageShell>;
  }
  const matching = matchSyntheticForecasts(productRows, demo.batch);
  const filtered = filterSyntheticForecasts(matching.matches, query, statusFilter);
  const counts = matching.matches.reduce<Record<string, number>>((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {});
  return <PageShell demoMode>
    <DemoBanner />
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <p className="font-bold">Demostración sintética validada</p>
      <p className="mt-1 text-sm leading-6">Estos pronósticos son históricos y académicos. No representan demanda real, no usan el stock actual y no permiten crear compras.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Modelo" value={`${demo.batch.model_family} · ${demo.batch.model_version}`} />
        <Metric label="Cutoff histórico" value={demo.batch.cutoff_date} />
        <Metric label="Horizonte" value={`${demo.batch.forecast_start} a ${demo.batch.forecast_end}`} />
        <Metric label="Matching UUID" value={`${matching.matches.length}/${demo.batch.rows.length}`} />
      </dl>
    </section>
    {matching.hasDatasetMismatch ? <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">El catálogo de Staging no coincide completamente con el batch sintético. Se ocultan los IDs sin correspondencia y no se crean mappings por nombre.</p> : null}
    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <label className="text-sm font-semibold text-slate-700">Buscar producto<input name="q" defaultValue={query} placeholder="Nombre o UUID" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Estado<select name="status" defaultValue={statusFilter} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal"><option value="ALL">Todos</option><option value="READY">Listos</option><option value="STALE">Históricos</option><option value="INSUFFICIENT_HISTORY">Sin historial</option><option value="ERROR">Error</option><option value="MISSING_FORECAST">Sin pronóstico</option></select></label>
      <button className="min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800" type="submit">Filtrar</button>
    </form>
    <section className="space-y-3" aria-labelledby="synthetic-results-title"><div><p className="text-base font-semibold text-emerald-800">Resultados</p><h2 id="synthetic-results-title" className="mt-1 text-2xl font-bold text-slate-950">Forecasts por producto</h2><p className="mt-1 text-sm text-slate-600">{filtered.length} resultados · Listos: {counts.READY ?? 0} · Históricos: {counts.STALE ?? 0} · Errores: {counts.ERROR ?? 0}</p></div>{productRows.length === 0 ? <UnavailableState message="No hay productos de catálogo para comparar con el batch sintético." /> : filtered.length === 0 ? <UnavailableState message="No hay productos que coincidan con los filtros." /> : <div className="grid gap-3 lg:grid-cols-2">{filtered.map(({ product, forecast, status }) => <SyntheticForecastCard key={product.id} product={product} forecast={forecast} status={status} />)}</div>}</section>
    <p className="text-sm leading-6 text-slate-600">La reposición está deshabilitada: el batch ML.4 no incluye stock histórico verificable por producto. El stock actual de la base de datos nunca se usa para esta demostración.</p>
  </PageShell>;
}

function SyntheticForecastCard({ product, forecast, status }: { product: { id: string; name: string }; forecast: NonNullable<ReturnType<typeof matchSyntheticForecasts>["matches"][number]["forecast"]>; status: ReturnType<typeof matchSyntheticForecasts>["matches"][number]["status"] }) {
  const replenishment = syntheticReplenishment(status, forecast.forecast_units, null);
  return <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-amber-950">{product.name}</h3><p className="mt-1 break-all text-xs text-amber-800">ID canónico: {product.id}</p></div><Status status={status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric label="Demanda 7 días" value={forecast.forecast_units === null ? "No disponible" : `${formatNumber(forecast.forecast_units)} u`} /><Metric label="Horizonte" value="7 días" /><Metric label="Método" value="Ridge" /><Metric label="Reponer" value={replenishment === null ? "No disponible" : `${replenishment} u`} /></dl><p className="mt-3 text-xs leading-5 text-amber-900">Fuente: SYNTHETIC · cutoff: 2026-10-31 · Reposición solo informativa.</p></article>;
}

function PageShell({ children, demoMode = false }: { children: ReactNode; demoMode?: boolean }) { return <div className="space-y-7"><section><p className="text-base font-semibold text-emerald-800">Planificación</p><h1 className="mt-1 page-heading font-bold tracking-tight text-slate-950">Predicciones</h1><p className="mt-1 text-sm text-slate-600">{predictionsSubtitle(demoMode)}</p></section>{children}</div>; }
function DemoBanner() { return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Modo DEMO controlado.</strong> Los datos sintéticos solo están visibles porque el entorno local lo habilitó explícitamente.</div>; }
function UnavailableState({ message }: { message: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-700">{message}</div>; }

function ArtifactSummary({ artifact }: { artifact: NonNullable<ReturnType<typeof loadForecastArtifact>> }) {
  return <div className={`rounded-2xl border p-5 text-sm ${artifact.source === "SYNTHETIC" ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-700"}`}>
    <p className="font-bold">{artifact.source === "SYNTHETIC" ? "DEMO: experimento sintético" : "Fuente: ventas reales"}</p>
    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Horizonte" value="7 días" /><Metric label="Generado" value={formatDate(artifact.generated_at)} /><Metric label="Modelo" value={artifact.model_type} /><Metric label="Historia" value={artifact.training_date_start && artifact.training_date_end ? `${artifact.training_date_start} a ${artifact.training_date_end}` : "No disponible"} /></dl>
    <p className="mt-3 leading-6">Evaluación: {artifact.evaluation_method}.</p>
  </div>;
}

function DemoSection({ demos }: { demos: ReturnType<typeof splitForecastPresentation>["demos"] }) {
  return <section className="space-y-3" aria-labelledby="demo-title"><div><p className="text-base font-semibold text-amber-800">Demostración académica</p><h2 id="demo-title" className="mt-1 text-2xl font-bold text-slate-950">Pronósticos sintéticos</h2><p className="mt-1 text-sm text-slate-700">Estos valores ilustran el modelo y no corresponden a productos ni stock de la bodega.</p></div>{demos.map((demo) => <article key={demo.forecast.product_id} className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5"><div className="flex items-start justify-between gap-4"><h3 className="text-xl font-bold text-amber-950">{demo.label}</h3><span className="rounded-xl bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950">DEMO</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><Metric label="Demanda 7 días" value={`${formatNumber(demo.forecast.forecast_7d)} unidades`} /><Metric label="Modelo" value={demo.forecast.model} /><Metric label="Stock / reponer" value="No aplica" /></dl></article>)}</section>;
}

function MetricsSection({ metrics, demos }: { metrics: NonNullable<ReturnType<typeof loadForecastMetrics>>; demos: ReturnType<typeof splitForecastPresentation>["demos"] }) {
  return <section className="space-y-3" aria-labelledby="metrics-title"><div><p className="text-base font-semibold text-amber-800">Resultados sintéticos</p><h2 id="metrics-title" className="mt-1 text-2xl font-bold text-slate-950">Comparación del experimento</h2><p className="mt-1 text-sm text-slate-700">MAE y WAPE son resultados fuera de muestra del conjunto sintético, no evidencia de ventas reales.</p></div>{demos.map((demo) => <article key={`metrics-${demo.forecast.product_id}`} className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-950">{demo.label}</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{Object.entries(metrics.products[demo.forecast.product_id] ?? {}).filter(([name]) => name !== "evaluation_start" && name !== "evaluation_end").map(([name, value]) => <Metric key={name} label={name === "random_forest" ? "RandomForest" : name === "moving_average_7" ? "Media móvil 7d" : "Ingenuo"} value={`MAE ${formatNumber(value.mae)} · WAPE ${value.wape === null ? "n/d" : `${formatPercent(value.wape)}`}`} />)}</div></article>)}</section>;
}

function OperationalCard({ product, forecast }: { product: { id: string; name: string; currentStock: number }; forecast: ReturnType<typeof splitForecastPresentation>["operational"][number]["forecast"] }) {
  const usable = forecast?.status === "OK";
  const demand = forecast?.forecast_7d ?? 0;
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-slate-950">{product.name}</h3><p className="mt-1 text-sm text-slate-600">Stock actual: <strong>{product.currentStock}</strong></p></div><Status status={forecast?.status ?? "MISSING_FORECAST"} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><Metric label="Demanda 7 días" value={usable ? `${formatNumber(demand)} u` : "No disponible"} /><Metric label="Reponer" value={usable ? `${recommendedReplenishment(demand, product.currentStock)} u` : "No calcular"} /><Metric label="Método" value={forecast?.model ?? "Sin pronóstico"} /></dl></article>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-bold text-slate-950">{value}</dd></div>; }
function Status({ status }: { status: string }) { return <span className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${status === "OK" || status === "READY" ? "bg-emerald-100 text-emerald-900" : status === "STALE" ? "bg-amber-200 text-amber-950" : "bg-slate-100 text-slate-700"}`}>{status === "OK" || status === "READY" ? "LISTO" : status === "STALE" ? "HISTÓRICO" : status === "INSUFFICIENT_HISTORY" ? "SIN HISTORIAL" : status === "ERROR" ? "ERROR" : "SIN PRONÓSTICO"}</span>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatNumber(value: number) { return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number) { return new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 }).format(value); }
