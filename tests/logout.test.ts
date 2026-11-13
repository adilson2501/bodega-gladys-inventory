import { afterEach, describe, expect, it, vi } from "vitest";

import { hasAuthOperationError, LOGOUT_REQUEST_TIMEOUT_MS, withLogoutTimeout } from "../src/lib/auth/logout";

describe("logout operation handling", () => {
  afterEach(() => vi.useRealTimers());

  it("recognizes an auth operation error without treating success as failure", () => {
    expect(hasAuthOperationError({ error: new Error("failed") })).toBe(true);
    expect(hasAuthOperationError({ error: null })).toBe(false);
    expect(hasAuthOperationError(null)).toBe(false);
  });

  it("resolves a successful logout", async () => {
    await expect(withLogoutTimeout(Promise.resolve({ error: null }))).resolves.toEqual({ error: null });
  });

  it("rejects a logout that never settles so retry can be offered", async () => {
    vi.useFakeTimers();
    const pendingLogout = new Promise<never>(() => undefined);
    const result = withLogoutTimeout(pendingLogout);
    const rejection = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(LOGOUT_REQUEST_TIMEOUT_MS);
    await rejection;
  });
});
