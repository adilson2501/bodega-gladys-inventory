import { describe, expect, it } from "vitest";

import { calculateCartTotal, canSubmitCart, removeCartLine } from "../src/lib/commercial/cart";

describe("transaction cart", () => {
  it("starts empty and cannot submit without items", () => {
    expect(calculateCartTotal([])).toBe("0.00");
    expect(canSubmitCart([])).toBe(false);
    expect(canSubmitCart([{ productId: "product-1" }], "   ")).toBe(false);
  });

  it("removes individual items and recalculates the total", () => {
    const lines = [
      { productId: "rice", quantity: 2, unitPrice: "3.50" },
      { productId: "milk", quantity: 1, unitPrice: "4.25" },
    ];

    const remaining = removeCartLine(lines, "rice");
    expect(remaining).toEqual([{ productId: "milk", quantity: 1, unitPrice: "4.25" }]);
    expect(calculateCartTotal(remaining)).toBe("4.25");
    expect(removeCartLine(remaining, "milk")).toEqual([]);
  });

  it("supports purchase costs and required supplier validation", () => {
    expect(calculateCartTotal([{ quantity: 3, unitCost: "5.10" }])).toBe("15.30");
    expect(canSubmitCart([{ productId: "oil" }], "Proveedor")).toBe(true);
    expect(canSubmitCart([{ productId: "oil" }], "")).toBe(false);
  });
});
