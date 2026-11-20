import type { ForecastProduct, ForecastRun, ForecastStatus } from "./contract";
import { classifyForecastStatus, informationalReplenishment } from "./contract";

export type DemoCatalogProduct = Pick<ForecastProduct, "id" | "name">;
export const DEMO_PREDICTIONS_SUBTITLE = "Pronósticos históricos de demanda — Simulación con Machine Learning.";
export const OPERATIONAL_PREDICTIONS_SUBTITLE = "Demanda estimada para los próximos 7 días.";

export function predictionsSubtitle(demoMode: boolean) {
  return demoMode ? DEMO_PREDICTIONS_SUBTITLE : OPERATIONAL_PREDICTIONS_SUBTITLE;
}

export function matchSyntheticForecasts(
  products: readonly DemoCatalogProduct[],
  batch: ForecastRun,
  asOf = new Date(),
) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const rowsById = new Map(batch.rows.map((row) => [row.product_id, row]));
  const unknownForecastIds = batch.rows.filter((row) => !productsById.has(row.product_id)).map((row) => row.product_id);
  const matches = batch.rows
    .filter((row) => productsById.has(row.product_id))
    .map((row) => ({ product: productsById.get(row.product_id)!, forecast: row, status: classifyForecastStatus(row, batch, asOf) }));
  return {
    matches,
    unknownForecastIds,
    missingForecastIds: products.filter((product) => !rowsById.has(product.id)).map((product) => product.id),
    hasDatasetMismatch: unknownForecastIds.length > 0,
  };
}

export type SyntheticForecastMatch = ReturnType<typeof matchSyntheticForecasts>["matches"][number];

export function filterSyntheticForecasts(matches: readonly SyntheticForecastMatch[], query = "", statusFilter = "ALL") {
  const normalizedQuery = query.trim().toLocaleLowerCase("es-PE");
  return matches.filter(({ product, status }) =>
    (!normalizedQuery || product.name.toLocaleLowerCase("es-PE").includes(normalizedQuery) || product.id.includes(normalizedQuery)) &&
    (statusFilter === "ALL" || status === statusFilter),
  );
}

export function syntheticReplenishment(
  status: ForecastStatus,
  forecastUnits: number | null,
  historicalCutoffStock: number | null,
  safetyStock = 0,
) {
  if (status !== "READY" || forecastUnits === null || historicalCutoffStock === null) return null;
  if (![forecastUnits, historicalCutoffStock, safetyStock].every(Number.isFinite)) return null;
  return informationalReplenishment(forecastUnits, historicalCutoffStock, safetyStock);
}
