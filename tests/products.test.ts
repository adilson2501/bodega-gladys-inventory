import { describe, expect, it } from "vitest";

import { getStockStatus } from "../src/lib/inventory/stock-status";
import { getInventorySummary } from "../src/lib/inventory/inventory-summary";
import { productInputSchema } from "../src/lib/validations/product";

describe("stock status", () => {
  it("marks zero stock as AGOTADO", () => {
    expect(getStockStatus(0, 4)).toBe("AGOTADO");
  });

  it("marks stock at or below the minimum as STOCK BAJO", () => {
    expect(getStockStatus(3, 4)).toBe("STOCK BAJO");
    expect(getStockStatus(4, 4)).toBe("STOCK BAJO");
  });

  it("marks stock above the minimum as NORMAL", () => {
    expect(getStockStatus(5, 4)).toBe("NORMAL");
  });
});

describe("inventory summary", () => {
  it("counts each product in exactly one stock state", () => {
    expect(
      getInventorySummary([
        { currentStock: 0, minimumStock: 4 },
        { currentStock: 3, minimumStock: 4 },
        { currentStock: 10, minimumStock: 4 },
      ]),
    ).toEqual({ total: 3, agotados: 1, stockBajo: 1, normal: 1 });
  });
});

describe("product validation", () => {
  const validProduct = {
    name: "Leche Gloria",
    category: "Lácteos",
    barcode: "",
    minimumStock: "4",
  };

  it("rejects an empty name", () => {
    const result = productInputSchema.safeParse({ ...validProduct, name: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a negative minimum stock", () => {
    const result = productInputSchema.safeParse({ ...validProduct, minimumStock: "-1" });

    expect(result.success).toBe(false);
  });

  it("requires a minimum stock value", () => {
    const result = productInputSchema.safeParse({ ...validProduct, minimumStock: "" });

    expect(result.success).toBe(false);
  });

  it("accepts valid product input", () => {
    const result = productInputSchema.safeParse(validProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minimumStock).toBe(4);
      expect(result.data.category).toBe("Lácteos");
      expect(result.data.barcode).toBeNull();
      expect("currentStock" in result.data).toBe(false);
    }
  });
});
