export type ForecastStatus = "OK" | "INSUFFICIENT_HISTORY" | "MISSING_FORECAST" | "DEMO";

export function recommendedReplenishment(
  sevenDayDemand: number,
  currentStock: number,
  safetyStock = 0,
) {
  if (![sevenDayDemand, currentStock, safetyStock].every(Number.isFinite)) return 0;
  return Math.max(0, Math.ceil(Math.max(0, sevenDayDemand) + Math.max(0, safetyStock) - Math.max(0, currentStock)));
}
