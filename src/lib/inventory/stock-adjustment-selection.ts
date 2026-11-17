export type ProductSelectionOption = {
  id: string;
};

export function resolveStockAdjustmentProductId(
  products: ProductSelectionOption[],
  requestedProductId?: string,
) {
  if (!requestedProductId) return "";

  return products.some((product) => product.id === requestedProductId)
    ? requestedProductId
    : "";
}
