import { describe, expect, it } from "vitest";

import { centsToMoney, parseMoneyToCents } from "../src/lib/commercial/money";
import { paymentMethodValues, purchaseInputSchema, saleInputSchema } from "../src/lib/validations/commercial";

describe("commercial money rules", () => {
  it("keeps prices at cent precision", () => {
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(centsToMoney(1250)).toBe("12.50");
    expect(() => parseMoneyToCents("12.555")).toThrow();
  });

  it("validates sale payment methods and line items", () => {
    const result = saleInputSchema.safeParse({
      paymentMethod: paymentMethodValues[0],
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      items: [{ productId: "550e8400-e29b-41d4-a716-446655440001", quantity: 2, unitPrice: "4.50" }],
    });
    expect(result.success).toBe(true);
  });

  it("requires a supplier and at least one purchase item", () => {
    expect(purchaseInputSchema.safeParse({ supplierName: "", idempotencyKey: "bad", items: [] }).success).toBe(false);
  });
});
