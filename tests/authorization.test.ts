import { describe, expect, it } from "vitest";

import { getInventoryActor } from "../src/lib/auth/actor";
import { canBootstrapAdmin, hasValidBootstrapToken } from "../src/lib/auth/bootstrap-rules";
import { isAppRole, roleHasPermission } from "../src/lib/auth/roles";

describe("application authorization model", () => {
  it("accepts only the two application roles", () => {
    expect(isAppRole("ADMIN")).toBe(true);
    expect(isAppRole("OPERATOR")).toBe(true);
    expect(isAppRole("OWNER")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });

  it("grants ADMIN permissions and limits OPERATOR permissions", () => {
    expect(roleHasPermission("ADMIN", "products:write")).toBe(true);
    expect(roleHasPermission("ADMIN", "inventory:adjust")).toBe(true);
    expect(roleHasPermission("ADMIN", "exports:ml")).toBe(true);
    expect(roleHasPermission("OPERATOR", "products:read")).toBe(true);
    expect(roleHasPermission("OPERATOR", "sales:create")).toBe(true);
    expect(roleHasPermission("OPERATOR", "purchases:create")).toBe(true);
    expect(roleHasPermission("OPERATOR", "products:write")).toBe(false);
    expect(roleHasPermission("OPERATOR", "inventory:adjust")).toBe(false);
    expect(roleHasPermission("OPERATOR", "exports:sales")).toBe(false);
    expect(roleHasPermission("OPERATOR", "exports:ml")).toBe(false);
  });

  it("rejects missing or malformed actors", () => {
    expect(getInventoryActor(null)).toBeNull();
    expect(getInventoryActor({ user: {} })).toBeNull();
    expect(getInventoryActor({ user: { id: 123 } })).toBeNull();
    expect(getInventoryActor({ user: { id: "user-1", email: "operator@example.test" } })).toEqual({
      id: "user-1",
      email: "operator@example.test",
    });
  });

  it("allows bootstrap only when no Auth users exist", () => {
    expect(canBootstrapAdmin(0)).toBe(true);
    expect(canBootstrapAdmin(1)).toBe(false);
    expect(canBootstrapAdmin(2)).toBe(false);
  });

  it("requires a strong bootstrap token comparison", () => {
    const token = "a".repeat(32);
    expect(hasValidBootstrapToken(token, token)).toBe(true);
    expect(hasValidBootstrapToken("b".repeat(32), token)).toBe(false);
    expect(hasValidBootstrapToken(token, undefined)).toBe(false);
  });
});
