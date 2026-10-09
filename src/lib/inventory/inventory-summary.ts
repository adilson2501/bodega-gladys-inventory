import { getStockStatus, type StockStatus } from "./stock-status";

export type InventoryProduct = {
  currentStock: number;
  minimumStock: number;
};

export type InventorySummary = {
  total: number;
  agotados: number;
  stockBajo: number;
  normal: number;
};

export function getInventorySummary(products: InventoryProduct[]): InventorySummary {
  return products.reduce<InventorySummary>(
    (summary, product) => {
      const status = getStockStatus(product.currentStock, product.minimumStock);

      summary.total += 1;
      if (status === "AGOTADO") summary.agotados += 1;
      if (status === "STOCK BAJO") summary.stockBajo += 1;
      if (status === "NORMAL") summary.normal += 1;

      return summary;
    },
    { total: 0, agotados: 0, stockBajo: 0, normal: 0 },
  );
}

export function matchesInventoryStatus(
  currentStock: number,
  minimumStock: number,
  selectedStatus: "TODOS" | StockStatus,
) {
  return selectedStatus === "TODOS" || getStockStatus(currentStock, minimumStock) === selectedStatus;
}
