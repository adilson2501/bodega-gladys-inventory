export type StockStatus = "AGOTADO" | "STOCK BAJO" | "NORMAL";

export function getStockStatus(
  currentStock: number,
  minimumStock: number,
): StockStatus {
  if (currentStock === 0) {
    return "AGOTADO";
  }

  if (currentStock <= minimumStock) {
    return "STOCK BAJO";
  }

  return "NORMAL";
}
