export type SearchableProduct = {
  name: string;
  barcode?: string | null;
  category?: string | null;
};

export function normalizeProductQuery(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizeBarcode(value: string) {
  return value.replace(/\s+/g, "");
}

export function productMatchesQuery(product: SearchableProduct, query: string) {
  const normalizedQuery = normalizeProductQuery(query);
  if (!normalizedQuery) return true;

  const textMatches = [product.name, product.category]
    .filter(Boolean)
    .some((value) => normalizeProductQuery(value!).includes(normalizedQuery));
  const barcode = product.barcode ? normalizeBarcode(product.barcode) : "";
  const barcodeQuery = normalizeBarcode(query.trim());

  return textMatches || Boolean(barcodeQuery && barcode.includes(barcodeQuery));
}

export function searchProducts<T extends SearchableProduct>(products: T[], query: string, limit = 8) {
  if (!normalizeProductQuery(query)) return [];
  return products.filter((product) => productMatchesQuery(product, query)).slice(0, limit);
}

export function findExactProduct<T extends SearchableProduct>(products: T[], query: string) {
  const normalizedQuery = normalizeProductQuery(query);
  const normalizedBarcodeQuery = normalizeBarcode(query.trim());
  if (!normalizedQuery) return undefined;

  return products.find((product) =>
    normalizeProductQuery(product.name) === normalizedQuery
    || (product.barcode && normalizeBarcode(product.barcode) === normalizedBarcodeQuery),
  );
}

export type ScannerKeyBehavior = "commit" | "tab" | "ignore";

export function getScannerKeyBehavior(key: string, value: string): ScannerKeyBehavior {
  if (!value.trim()) return "ignore";
  if (key === "Enter") return "commit";
  if (key === "Tab") return "tab";
  return "ignore";
}
