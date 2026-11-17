import { describe, expect, it } from "vitest";

import {
  ACTIVITY_SYNC_THROTTLE_MS,
  getInactivityStatus,
  getInitialActivityAt,
  getRemainingInactivityMs,
  INACTIVITY_TIMEOUT_MS,
  isSameSessionScope,
  shouldSyncActivity,
  WARNING_BEFORE_TIMEOUT_MS,
} from "../src/lib/auth/inactivity";

describe("inactivity policy", () => {
  const start = 1_000_000;

  it("keeps an active session below the timeout", () => {
    expect(getInactivityStatus(start, start + INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS - 1)).toBe("active");
  });

  it("enters warning at 14 minutes", () => {
    expect(getInactivityStatus(start, start + INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS)).toBe("warning");
    expect(getRemainingInactivityMs(start, start + INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS)).toBe(WARNING_BEFORE_TIMEOUT_MS);
  });

  it("expires at exactly 15 minutes", () => {
    expect(getInactivityStatus(start, start + INACTIVITY_TIMEOUT_MS)).toBe("expired");
    expect(getRemainingInactivityMs(start, start + INACTIVITY_TIMEOUT_MS + 1000)).toBe(0);
  });

  it("supports activity timestamps after refresh or resume", () => {
    const activity = start + 10_000;
    expect(getInactivityStatus(activity, activity + INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS - 1)).toBe("active");
    expect(getInactivityStatus(activity, activity + INACTIVITY_TIMEOUT_MS)).toBe("expired");
  });

  it("preserves a persisted timestamp instead of restarting on mount", () => {
    expect(getInitialActivityAt(start, start + 100_000, start + 200_000)).toBe(start);
    expect(getInitialActivityAt(null, start, start + 200_000)).toBe(start);
  });

  it("rejects activity and logout state from another authenticated session", () => {
    expect(isSameSessionScope({ userId: "user-1", sessionId: "session-1" }, "user-1", "session-1")).toBe(true);
    expect(isSameSessionScope({ userId: "user-1", sessionId: "session-old" }, "user-1", "session-new")).toBe(false);
    expect(isSameSessionScope({ userId: "user-old", sessionId: "session-1" }, "user-new", "session-1")).toBe(false);
  });

  it("throttles activity synchronization", () => {
    expect(shouldSyncActivity(null, start)).toBe(true);
    expect(shouldSyncActivity(start, start + ACTIVITY_SYNC_THROTTLE_MS - 1)).toBe(false);
    expect(shouldSyncActivity(start, start + ACTIVITY_SYNC_THROTTLE_MS)).toBe(true);
  });

  it("does not allow a future timestamp to extend the deadline", () => {
    expect(getRemainingInactivityMs(start, start - 1000)).toBe(INACTIVITY_TIMEOUT_MS);
  });
});
