import { describe, expect, it } from "vitest";

import { centsToMoney, parseMoneyToCents } from "../src/lib/commercial/money";
import { createCommercialFingerprint } from "../src/lib/inventory/idempotency";
import { paymentMethodValues, purchaseInputSchema, saleInputSchema } from "../src/lib/validations/commercial";

describe("commercial money rules", () => {
  it("keeps prices at cent precision", () => {
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(centsToMoney(1250)).toBe("12.50");
    expect(() => parseMoneyToCents("12.555")).toThrow();
    expect(() => parseMoneyToCents("10000000000.00")).toThrow();
    expect(() => parseMoneyToCents("-1.00")).toThrow();
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
    expect(purchaseInputSchema.safeParse({ supplierName: "Proveedor", idempotencyKey: "550e8400-e29b-41d4-a716-446655440000", items: [{ productId: "550e8400-e29b-41d4-a716-446655440001", quantity: 1, unitCost: "0.00" }] }).success).toBe(true);
    expect(purchaseInputSchema.safeParse({ supplierName: "Proveedor", idempotencyKey: "550e8400-e29b-41d4-a716-446655440000", items: [{ productId: "550e8400-e29b-41d4-a716-446655440001", quantity: 1, unitCost: "-0.01" }] }).success).toBe(false);
  });

  it("canonicalizes commercial fingerprints without depending on item order", () => {
    const first = createCommercialFingerprint({ type: "sale", paymentMethod: "CASH", items: [
      { productId: "b", quantity: 1, unitPrice: "2.5" },
      { productId: "a", quantity: 2, unitPrice: "1.00" },
    ] });
    const second = createCommercialFingerprint({ type: "sale", paymentMethod: "CASH", items: [
      { productId: "a", quantity: 2, unitPrice: "1.00" },
      { productId: "b", quantity: 1, unitPrice: "2.50" },
    ] });
    expect(first).toBe(second);
  });

  it("rejects a total beyond the supported numeric precision", () => {
    expect(saleInputSchema.safeParse({
      paymentMethod: paymentMethodValues[0],
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      items: [{ productId: "550e8400-e29b-41d4-a716-446655440001", quantity: 101, unitPrice: "99999999.99" }],
    }).success).toBe(false);
  });
});
