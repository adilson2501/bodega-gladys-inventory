import { asc } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { products } from "@/db/schema";

import {
  loadForecastArtifact,
  loadForecastMetrics,
} from "@/lib/forecast/artifact";

import { loadApf3Demo } from "@/lib/forecast/apf3-demo";
import type { Apf3Demo } from "@/lib/forecast/apf3-demo";

import { splitForecastPresentation } from "@/lib/forecast/presentation";
import { recommendedReplenishment } from "@/lib/forecast/replenishment";

export const instant = false;

export default async function PredictionsPage() {
  await connection();

  const [productRows, artifact, metrics, apf3Demo] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        currentStock: products.currentStock,
      })
      .from(products)
      .orderBy(asc(products.name)),

    Promise.resolve(loadForecastArtifact()),
    Promise.resolve(loadForecastMetrics()),
    Promise.resolve(loadApf3Demo()),
  ]);

  const presentation = splitForecastPresentation(
    productRows,
    artifact,
    metrics,
  );

  return (
    <div className="space-y-7">
      {/* ENCABEZADO */}
      <section>
        <p className="text-base font-semibold text-emerald-800">
          Planificación
        </p>

        <h1 className="mt-1 page-heading font-bold tracking-tight text-slate-950">
          Predicciones
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Demanda estimada para los próximos 7 días.
        </p>
      </section>

      {/* RESUMEN DEL ARTEFACTO ANTERIOR */}
      {artifact ? <ArtifactSummary artifact={artifact} /> : null}

      {/* PREDICCIÓN DEL MODELO APF3 */}
      {apf3Demo && apf3Demo.length > 0 ? (
        <Apf3DemoSection demo={apf3Demo} />
      ) : null}

      {/* AVISO SI NO HAY ARCHIVOS */}
      {!artifact && (!apf3Demo || apf3Demo.length === 0) ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
          No hay pronósticos importados ni una demostración APF3 disponible.
        </div>
      ) : null}

      {/* DEMOSTRACIÓN DEL SISTEMA ANTERIOR */}
      {presentation.isSynthetic ? (
        <DemoSection demos={presentation.demos} />
      ) : null}

      {/* MÉTRICAS DEL EXPERIMENTO ANTERIOR */}
      {presentation.isSynthetic && metrics ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">
            Ver métricas y entrenamiento DEMO
          </summary>

          <div className="mt-4">
            <MetricsSection metrics={metrics} demos={presentation.demos} />
          </div>
        </details>
      ) : null}

      {/* PRONÓSTICOS OPERATIVOS */}
      <section className="space-y-3" aria-labelledby="operational-title">
        <div>
          <p className="text-base font-semibold text-emerald-800">
            Uso operativo
          </p>

          <h2
            id="operational-title"
            className="mt-1 text-2xl font-bold text-slate-950"
          >
            Pronósticos del catálogo
          </h2>
        </div>

        {presentation.isSynthetic ? (
          <p className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-700">
            No hay recomendaciones operativas disponibles: el artefacto cargado
            es sintético. Los productos reales no reciben stock ni reposición
            inventados.
          </p>
        ) : (
          presentation.operational.map(({ product, forecast }) => (
            <OperationalCard
              key={product.id}
              product={product}
              forecast={forecast}
            />
          ))
        )}

        {!presentation.isSynthetic && productRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-slate-700">
            No hay productos para mostrar.
          </p>
        ) : null}
      </section>

      <p className="text-sm leading-6 text-slate-600">
        La reposición operativa se calcula como máximo(0, techo(demanda 7d +
        stock de seguridad - stock actual)). No crea compras ni modifica
        inventario.
      </p>
    </div>
  );
}

/* =========================================================
   RESUMEN DEL ARTEFACTO ANTERIOR
========================================================= */

function ArtifactSummary({
  artifact,
}: {
  artifact: NonNullable<ReturnType<typeof loadForecastArtifact>>;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 text-sm ${
        artifact.source === "SYNTHETIC"
          ? "border-amber-400 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      <p className="font-bold">
        {artifact.source === "SYNTHETIC"
          ? "DEMO: experimento sintético"
          : "Fuente: ventas reales"}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Horizonte" value="7 días" />

        <Metric label="Generado" value={formatDate(artifact.generated_at)} />

        <Metric label="Modelo" value={artifact.model_type} />

        <Metric
          label="Historia"
          value={
            artifact.training_date_start && artifact.training_date_end
              ? `${artifact.training_date_start} a ${artifact.training_date_end}`
              : "No disponible"
          }
        />
      </dl>

      <p className="mt-3 leading-6">
        Evaluación: {artifact.evaluation_method}.
      </p>
    </div>
  );
}

/* =========================================================
   PREDICCIÓN APF3
========================================================= */

function Apf3DemoSection({ demo }: { demo: Apf3Demo[] }) {
  return (
    <section className="space-y-4" aria-labelledby="apf3-title">
      <div>
        <p className="text-base font-semibold text-amber-800">
          Experimento de Machine Learning
        </p>

        <h2 id="apf3-title" className="mt-1 text-2xl font-bold text-slate-950">
          Predicciones APF3
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          El modelo Ridge genera estimaciones individuales de demanda para cada
          producto.
        </p>

        <p className="mt-2 text-sm font-semibold text-amber-900">
          {demo.length} productos con predicción disponible
        </p>
      </div>

      <div className="grid gap-4">
        {demo.map(({ inference, replenishment }) => (
          <article
            key={inference.product_id}
            className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-amber-950">
                  {inference.product_name}
                </h3>

                <p className="mt-1 text-sm text-amber-900">
                  Modelo: {inference.model} · Versión: {inference.model_version}
                </p>
              </div>

              <span className="rounded-xl bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950">
                DEMO SINTÉTICA
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label="Demanda estimada"
                value={`${formatNumber(inference.forecast_next_7d_units)} u`}
              />

              <Metric
                label="Stock al corte"
                value={`${replenishment.stock_at_cutoff} u`}
              />

              <Metric
                label="Stock mínimo"
                value={`${replenishment.minimum_stock} u`}
              />

              <Metric
                label="Stock objetivo"
                value={`${replenishment.target_stock_units} u`}
              />

              <Metric
                label="Compra sugerida"
                value={`${replenishment.recommended_purchase_units} u`}
              />

              <Metric
                label="Horizonte"
                value={`${inference.horizon_days} días`}
              />
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
              <p className="font-bold text-amber-950">Periodo de predicción</p>

              <p className="mt-1 text-sm text-slate-700">
                Del {inference.forecast_start} al {inference.forecast_end}
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Fecha de corte: {inference.cutoff_date}
              </p>
            </div>

            <div className="mt-4 rounded-xl bg-amber-100 p-4 text-sm leading-6 text-amber-950">
              <p className="font-bold">Recomendación informativa</p>

              <p>
                Se sugieren {replenishment.recommended_purchase_units} unidades
                para alcanzar el stock objetivo calculado.
              </p>

              <p className="mt-2">
                Esta predicción utiliza datos sintéticos. No representa ventas
                reales, no garantiza la demanda futura y no modifica el
                inventario ni registra compras.
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   DEMOSTRACIÓN DEL ARTEFACTO ANTERIOR
========================================================= */

function DemoSection({
  demos,
}: {
  demos: ReturnType<typeof splitForecastPresentation>["demos"];
}) {
  return (
    <section className="space-y-3" aria-labelledby="demo-title">
      <div>
        <p className="text-base font-semibold text-amber-800">
          Demostración académica
        </p>

        <h2 id="demo-title" className="mt-1 text-2xl font-bold text-slate-950">
          Pronósticos sintéticos
        </h2>

        <p className="mt-1 text-sm text-slate-700">
          Estos valores ilustran el modelo y no corresponden a productos ni
          stock de la bodega.
        </p>
      </div>

      {demos.map((demo) => (
        <article
          key={demo.forecast.product_id}
          className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-xl font-bold text-amber-950">{demo.label}</h3>

            <span className="rounded-xl bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950">
              DEMO
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Metric
              label="Demanda 7 días"
              value={`${formatNumber(demo.forecast.forecast_7d)} unidades`}
            />

            <Metric label="Modelo" value={demo.forecast.model} />

            <Metric label="Stock / reponer" value="No aplica" />
          </dl>
        </article>
      ))}
    </section>
  );
}

/* =========================================================
   MÉTRICAS DEL EXPERIMENTO ANTERIOR
========================================================= */

function MetricsSection({
  metrics,
  demos,
}: {
  metrics: NonNullable<ReturnType<typeof loadForecastMetrics>>;
  demos: ReturnType<typeof splitForecastPresentation>["demos"];
}) {
  return (
    <section className="space-y-3" aria-labelledby="metrics-title">
      <div>
        <p className="text-base font-semibold text-amber-800">
          Resultados sintéticos
        </p>

        <h2
          id="metrics-title"
          className="mt-1 text-2xl font-bold text-slate-950"
        >
          Comparación del experimento
        </h2>

        <p className="mt-1 text-sm text-slate-700">
          MAE y WAPE son resultados fuera de muestra del conjunto sintético, no
          evidencia de ventas reales.
        </p>
      </div>

      {demos.map((demo) => (
        <article
          key={`metrics-${demo.forecast.product_id}`}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h3 className="font-bold text-slate-950">{demo.label}</h3>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {Object.entries(metrics.products[demo.forecast.product_id] ?? {})
              .filter(
                ([name]) =>
                  name !== "evaluation_start" && name !== "evaluation_end",
              )
              .map(([name, value]) => (
                <Metric
                  key={name}
                  label={
                    name === "random_forest"
                      ? "RandomForest"
                      : name === "moving_average_7"
                        ? "Media móvil 7d"
                        : "Ingenuo"
                  }
                  value={`MAE ${formatNumber(value.mae)} · WAPE ${
                    value.wape === null ? "n/d" : formatPercent(value.wape)
                  }`}
                />
              ))}
          </div>
        </article>
      ))}
    </section>
  );
}

/* =========================================================
   TARJETAS DE PRONÓSTICOS OPERATIVOS
========================================================= */

function OperationalCard({
  product,
  forecast,
}: {
  product: {
    id: string;
    name: string;
    currentStock: number;
  };
  forecast: ReturnType<
    typeof splitForecastPresentation
  >["operational"][number]["forecast"];
}) {
  const usable = forecast?.status === "OK";
  const demand = forecast?.forecast_7d ?? 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-950">{product.name}</h3>

          <p className="mt-1 text-sm text-slate-600">
            Stock actual: <strong>{product.currentStock}</strong>
          </p>
        </div>

        <Status status={forecast?.status ?? "MISSING_FORECAST"} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Metric
          label="Demanda 7 días"
          value={usable ? `${formatNumber(demand)} u` : "No disponible"}
        />

        <Metric
          label="Reponer"
          value={
            usable
              ? `${recommendedReplenishment(demand, product.currentStock)} u`
              : "No calcular"
          }
        />

        <Metric label="Método" value={forecast?.model ?? "Sin pronóstico"} />
      </dl>
    </article>
  );
}

/* =========================================================
   COMPONENTES AUXILIARES
========================================================= */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-1 font-bold text-slate-950">{value}</dd>
    </div>
  );
}

function Status({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${
        status === "OK"
          ? "bg-emerald-100 text-emerald-900"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {status === "OK"
        ? "LISTO"
        : status === "INSUFFICIENT_HISTORY"
          ? "SIN HISTORIAL"
          : "SIN PRONÓSTICO"}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
