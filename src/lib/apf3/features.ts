export const APF3_CUTOFF = "2026-10-31";
const HISTORY_START = "2026-08-01";

type Product = { id: string; name: string; category: string | null; unitOfMeasure: string };
type Sale = { productId: string; quantity: number; date: Date };
type Movement = { productId: string; resultingStock: number; date: Date };

function dates() { return Array.from({ length: 92 }, (_, index) => { const value = new Date(`${HISTORY_START}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); }); }
function day(value: Date) { return value.toISOString().slice(0, 10); }

export function buildApf3Record(product: Product, salesHistory: Sale[], movements: Movement[], cutoff = APF3_CUTOFF) {
  if (cutoff !== APF3_CUTOFF) throw new Error(`La fecha de corte soportada es ${APF3_CUTOFF}.`);
  const calendar = dates(); const daily = new Map(calendar.map((date) => [date, 0]));
  for (const sale of salesHistory) { const date = day(sale.date); if (sale.productId === product.id && daily.has(date)) daily.set(date, (daily.get(date) ?? 0) + sale.quantity); }
  const stockByDay = new Map<string, number>(); let stock = 0;
  for (const date of calendar) { for (const movement of movements.filter((item) => item.productId === product.id && day(item.date) === date)) stock = movement.resultingStock; stockByDay.set(date, stock); }
  const values = calendar.map((date) => daily.get(date) ?? 0); const history = values.slice(0, -1); const previous7 = history.slice(-7); const previous14 = history.slice(-14);
  const mean7 = previous7.reduce((sum, value) => sum + value, 0) / 7; const mean14 = previous14.reduce((sum, value) => sum + value, 0) / 14;
  return { date: cutoff, source: "SYNTHETIC", product_id: product.id, category: product.category ?? "uncategorized", unit_of_measure: product.unitOfMeasure, lag_1: history.at(-1), lag_2: history.at(-2), lag_7: history.at(-7), rolling_mean_7: mean7, rolling_mean_14: mean14, rolling_std_7: Math.sqrt(previous7.reduce((sum, value) => sum + (value - mean7) ** 2, 0) / 7), sales_frequency_7: previous7.filter((value) => value > 0).length, sales_frequency_14: previous14.filter((value) => value > 0).length, day_of_week: 5, month: 10, stock_available_eod: (stockByDay.get(cutoff) ?? 0) > 0 ? 1 : 0, historical_demand_class: mean14 === 0 ? "zero" : mean14 < 1 ? "low" : mean14 < 3 ? "regular" : "high" };
}
