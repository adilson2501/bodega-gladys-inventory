import { beforeAll, describe, expect, it, vi } from "vitest";

const returning = vi.fn().mockResolvedValue([{ userId: "user-1", role: "OPERATOR" }]);
const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
const insert = vi.fn().mockReturnValue({ values });

vi.mock("@/db", () => ({ db: { insert } }));

describe("role assignment procedure", () => {
  let assignUserRole: typeof import("../src/lib/auth/role-assignment").assignUserRole;

  beforeAll(async () => {
    ({ assignUserRole } = await import("../src/lib/auth/role-assignment"));
  });

  it("uses an idempotent upsert for an approved assignment", async () => {
    await expect(assignUserRole(" user-1 ", "OPERATOR")).resolves.toEqual({
      userId: "user-1",
      role: "OPERATOR",
    });
    expect(values).toHaveBeenCalledWith({ userId: "user-1", role: "OPERATOR" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: { role: "OPERATOR", updatedAt: expect.any(Date) } }));
  });

  it("rejects empty identities and invalid roles before writing", async () => {
    await expect(assignUserRole("   ", "ADMIN")).rejects.toThrow("El usuario es obligatorio.");
    await expect(assignUserRole("user-1", "OWNER" as never)).rejects.toThrow();
  });
});
