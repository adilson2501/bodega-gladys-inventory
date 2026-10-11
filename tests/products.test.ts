import { describe, expect, it } from "vitest";

import { getStockStatus } from "../src/lib/inventory/stock-status";
import { getInventorySummary } from "../src/lib/inventory/inventory-summary";
import { hasAuthenticatedUser } from "../src/lib/auth/route-guard";
import {
  bootstrapAdminSchema,
  canBootstrapAdmin,
  hasValidBootstrapToken,
  isPublicSignUpPath,
} from "../src/lib/auth/bootstrap-rules";
import {
  calculateStockAdjustment,
  calculateResultingStock,
  movementInputSchema,
  stockAdjustmentInputSchema,
} from "../src/lib/inventory/movement-rules";
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

describe("movement rules", () => {
  it("calculates an entry", () => {
    expect(calculateResultingStock(0, "IN", 10)).toBe(10);
  });

  it("calculates an exit", () => {
    expect(calculateResultingStock(10, "OUT", 7)).toBe(3);
  });

  it("rejects an exit above available stock", () => {
    expect(() => calculateResultingStock(3, "OUT", 5)).toThrow(
      "No hay stock suficiente. Stock disponible: 3.",
    );
  });

  it("allows stock to reach zero", () => {
    expect(calculateResultingStock(5, "OUT", 5)).toBe(0);
  });

  it.each([0, -1, 1.5])("rejects invalid quantity %s", (quantity) => {
    expect(() => calculateResultingStock(5, "IN", quantity)).toThrow();
  });

  it("validates movement enums and reasons", () => {
    const result = movementInputSchema.safeParse({
      productId: "not-a-uuid",
      type: "INVALID",
      quantity: "2.5",
      reason: "INVALID",
    });

    expect(result.success).toBe(false);
  });

  it.each(["0", "-1", "1.5"])("rejects quantity %s in the movement input", (quantity) => {
    const result = movementInputSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      type: "IN",
      quantity,
      reason: "PURCHASE",
    });

    expect(result.success).toBe(false);
  });

  it("calculates an adjustment as an entry or exit", () => {
    expect(calculateStockAdjustment(4, 9)).toEqual({ type: "IN", quantity: 5, resultingStock: 9 });
    expect(calculateStockAdjustment(9, 4)).toEqual({ type: "OUT", quantity: 5, resultingStock: 4 });
  });

  it("rejects an adjustment when the counted stock matches the registered stock", () => {
    expect(() => calculateStockAdjustment(4, 4)).toThrow("El stock real ya coincide con el stock registrado.");
  });

  it.each(["-1", "1.5", ""])("rejects invalid actual stock %s", (actualStock) => {
    const result = stockAdjustmentInputSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      actualStock,
    });

    expect(result.success).toBe(false);
  });
});

describe("protected route guard", () => {
  it("recognizes only sessions with a user", () => {
    expect(hasAuthenticatedUser({ user: { id: "user-1" } })).toBe(true);
    expect(hasAuthenticatedUser({ user: null })).toBe(false);
    expect(hasAuthenticatedUser(null)).toBe(false);
    expect(hasAuthenticatedUser(undefined)).toBe(false);
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

  it("rejects a decimal minimum stock", () => {
    const result = productInputSchema.safeParse({ ...validProduct, minimumStock: "1.5" });

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

describe("admin bootstrap", () => {
  const validInput = {
    name: "Gladys",
    email: "gladys@example.com",
    password: "una-clave-segura",
    passwordConfirmation: "una-clave-segura",
    setupToken: "token-de-instalacion-seguro",
  };

  it("allows setup only when no auth users exist", () => {
    expect(canBootstrapAdmin(0)).toBe(true);
    expect(canBootstrapAdmin(1)).toBe(false);
  });

  it("validates the administrator credentials", () => {
    expect(bootstrapAdminSchema.safeParse(validInput).success).toBe(true);
    expect(
      bootstrapAdminSchema.safeParse({
        ...validInput,
        passwordConfirmation: "otra-clave-segura",
      }).success,
    ).toBe(false);
  });

  it("compares installation tokens without accepting a missing configuration", () => {
    const token = "un-token-de-instalacion-de-al-menos-32-caracteres";

    expect(hasValidBootstrapToken(token, token)).toBe(true);
    expect(hasValidBootstrapToken("incorrecto", token)).toBe(false);
    expect(hasValidBootstrapToken(token, undefined)).toBe(false);
  });

  it("recognizes and blocks the public email sign-up endpoint", () => {
    expect(isPublicSignUpPath(["sign-up", "email"])).toBe(true);
    expect(isPublicSignUpPath(["sign-in", "email"])).toBe(false);
  });
});
