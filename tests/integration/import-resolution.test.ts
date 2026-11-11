import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  getAuth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("integration import resolution", () => {
  it("loads Server Actions through the Node-only test alias", async () => {
    const movements = await import("../../src/actions/movements");

    expect(movements.createMovement).toBeTypeOf("function");
  });
});
