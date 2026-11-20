import { beforeAll, describe, expect, it, vi } from "vitest";

class MockAuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/authorization", () => ({
  AuthorizationError: MockAuthorizationError,
  getAuthorizationErrorMessage: () => "No tienes permisos para realizar esta operación.",
  requireAuthenticatedActor: vi.fn(),
  requirePermission: vi.fn().mockRejectedValue(
    new MockAuthorizationError(403, "No tienes permisos para realizar esta operación."),
  ),
}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

describe("authorization server boundaries", () => {
  let createProduct: typeof import("../src/actions/products").createProduct;
  let createSale: typeof import("../src/actions/sales").createSale;
  let createPurchase: typeof import("../src/actions/purchases").createPurchase;
  let createMovement: typeof import("../src/actions/movements").createMovement;
  let adjustStock: typeof import("../src/actions/movements").adjustStock;
  let exportSales: typeof import("../src/app/api/export/sales/route").GET;
  let exportMlSales: typeof import("../src/app/api/export/ml-sales/route").GET;

  beforeAll(async () => {
    ({ createProduct } = await import("../src/actions/products"));
    ({ createSale } = await import("../src/actions/sales"));
    ({ createPurchase } = await import("../src/actions/purchases"));
    ({ createMovement, adjustStock } = await import("../src/actions/movements"));
    ({ GET: exportSales } = await import("../src/app/api/export/sales/route"));
    ({ GET: exportMlSales } = await import("../src/app/api/export/ml-sales/route"));
  });

  it("rejects direct unauthorized Server Action invocation", async () => {
    const formData = new FormData();

    await expect(createProduct(null, formData)).resolves.toEqual({
      error: "No tienes permisos para realizar esta operación.",
    });
    await expect(createSale(null, formData)).resolves.toEqual({
      error: "No tienes permisos para realizar esta operación.",
    });
    await expect(createPurchase(null, formData)).resolves.toEqual({
      error: "No tienes permisos para realizar esta operación.",
    });
    await expect(createMovement(null, formData)).resolves.toEqual({
      error: "No tienes permisos para realizar esta operación.",
    });
    await expect(adjustStock(null, formData)).resolves.toEqual({
      error: "No tienes permisos para realizar esta operación.",
    });
  });

  it("rejects direct unauthorized export API invocation", async () => {
    await expect(exportSales()).resolves.toMatchObject({ status: 403 });
    await expect(exportMlSales()).resolves.toMatchObject({ status: 403 });
  });
});
