import { asc } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { products } from "@/db/schema";
import { loadForecastArtifact, loadForecastMetrics } from "@/lib/forecast/artifact";
import { splitForecastPresentation } from "@/lib/forecast/presentation";
import { recommendedReplenishment } from "@/lib/forecast/replenishment";

export const instant = false;

export default async function PredictionsPage() {
  await connection();
  const [productRows, artifact, metrics] = await Promise.all([
    db.select({ id: products.id, name: products.name, currentStock: products.currentStock }).from(products).orderBy(asc(products.name)),
    Promise.resolve(loadForecastArtifact()),
    Promise.resolve(loadForecastMetrics()),
  ]);
  const presentation = splitForecastPresentation(productRows, artifact, metrics);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-base font-semibold text-emerald-800">Planificación</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Predicciones de demanda</h1>
        <p className="mt-2 text-base leading-7 text-slate-700">Estimación de unidades para los próximos siete días. No garantiza ventas futuras.</p>
      </section>

      {!artifact ? <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-700">No hay un pronóstico importado. Ejecuta el flujo offline de ML para generar `ml/artifacts/forecast.json`.</div> : <ArtifactSummary artifact={artifact} />}
      {presentation.isSynthetic ? <DemoSection demos={presentation.demos} /> : null}
      {presentation.isSynthetic && metrics ? <MetricsSection metrics={metrics} demos={presentation.demos} /> : null}

      <section className="space-y-3" aria-labelledby="operational-title">
        <div><p className="text-base font-semibold text-emerald-800">Uso operativo</p><h2 id="operational-title" className="mt-1 text-2xl font-bold text-slate-950">Pronósticos del catálogo</h2></div>
        {presentation.isSynthetic ? <p className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-700">No hay recomendaciones operativas disponibles: el artefacto cargado es sintético. Los productos reales no reciben stock ni reposición inventados.</p> : presentation.operational.map(({ product, forecast }) => <OperationalCard key={product.id} product={product} forecast={forecast} />)}
        {!presentation.isSynthetic && productRows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-slate-700">No hay productos para mostrar.</p> : null}
      </section>
      <p className="text-sm leading-6 text-slate-600">La reposición operativa se calcula como `máximo(0, techo(demanda 7d + stock de seguridad - stock actual))`. No crea compras ni modifica inventario.</p>
    </div>
  );
}

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
function Status({ status }: { status: string }) { return <span className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${status === "OK" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{status === "OK" ? "LISTO" : status === "INSUFFICIENT_HISTORY" ? "SIN HISTORIAL" : "SIN PRONÓSTICO"}</span>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatNumber(value: number) { return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number) { return new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 }).format(value); }
