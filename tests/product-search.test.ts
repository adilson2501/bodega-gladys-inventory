import { describe, expect, it } from "vitest";

import {
  findExactProduct,
  getScannerKeyBehavior,
  normalizeProductQuery,
  productMatchesQuery,
  searchProducts,
} from "../src/lib/products/search";

const products = [
  { name: "Arroz Extra", category: "Abarrotes", barcode: " 775123 4567890 " },
  { name: "Leche Gloria", category: "Lácteos", barcode: "7750001112223" },
  { name: "Azúcar Rubia", category: "Abarrotes", barcode: null },
];

describe("product search", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeProductQuery("  LECHE   Gloria ")).toBe("leche gloria");
    expect(productMatchesQuery(products[1], " leche gloria ")).toBe(true);
  });

  it("searches by partial name, category, and barcode", () => {
    expect(searchProducts(products, "arroz")).toHaveLength(1);
    expect(searchProducts(products, "abarrotes")).toHaveLength(2);
    expect(searchProducts(products, "7751234567890")[0]?.name).toBe("Arroz Extra");
  });

  it("returns bounded results and handles unknown barcodes", () => {
    expect(searchProducts(Array.from({ length: 20 }, (_, index) => ({ name: `Producto ${index}`, category: null, barcode: `${index}` })), "producto")).toHaveLength(8);
    expect(findExactProduct(products, "0000000000000")).toBeUndefined();
  });
});

describe("scanner key behavior", () => {
  it("commits Enter, preserves Tab navigation, and ignores empty values", () => {
    expect(getScannerKeyBehavior("Enter", "7750001112223")).toBe("commit");
    expect(getScannerKeyBehavior("Tab", "7750001112223")).toBe("tab");
    expect(getScannerKeyBehavior("Enter", "   ")).toBe("ignore");
  });
});
