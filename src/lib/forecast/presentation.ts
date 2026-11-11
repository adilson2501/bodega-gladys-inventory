import type { ForecastArtifact } from "@/lib/forecast/artifact";

export type CatalogProduct = { id: string; name: string; currentStock: number };
export type ForecastMetric = { mae: number; wape: number | null };
export type ForecastMetrics = { source: "REAL" | "SYNTHETIC"; products: Record<string, Record<string, ForecastMetric>> };

export function splitForecastPresentation(
  products: CatalogProduct[],
  artifact: ForecastArtifact | null,
  metrics: ForecastMetrics | null,
) {
  const rows = artifact?.rows ?? [];
  const isSynthetic = artifact?.source === "SYNTHETIC";
  const forecasts = new Map(rows.map((row) => [row.product_id, row]));
  const operational = isSynthetic
    ? products.map((product) => ({ product, forecast: undefined }))
    : products.map((product) => ({ product, forecast: forecasts.get(product.id) }));
  const demos = isSynthetic
    ? rows.map((forecast, index) => ({
        label: `Producto de demostración ${index + 1}`,
        forecast,
        metrics: metrics?.products[forecast.product_id] ?? null,
      }))
    : [];
  return { operational, demos, isSynthetic };
}
