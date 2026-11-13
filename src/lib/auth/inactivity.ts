export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const WARNING_BEFORE_TIMEOUT_MS = 60 * 1000;
export const ACTIVITY_SYNC_THROTTLE_MS = 15 * 1000;
export const INACTIVITY_CONTROL_STORAGE_KEY = "bodega-gladys.auth.inactivity-control";
export const INACTIVITY_CHANNEL_NAME = "bodega-gladys.auth.inactivity";

export type InactivityStatus = "active" | "warning" | "expired";

export function getInactivityStatus(lastActivityAt: number, now = Date.now()): InactivityStatus {
  const elapsed = Math.max(0, now - lastActivityAt);
  if (elapsed >= INACTIVITY_TIMEOUT_MS) return "expired";
  if (elapsed >= INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS) return "warning";
  return "active";
}

export function getRemainingInactivityMs(lastActivityAt: number, now = Date.now()) {
  return Math.max(0, INACTIVITY_TIMEOUT_MS - Math.max(0, now - lastActivityAt));
}

export function shouldSyncActivity(lastBroadcastAt: number | null, now = Date.now()) {
  return lastBroadcastAt === null || now - lastBroadcastAt >= ACTIVITY_SYNC_THROTTLE_MS;
}

export function isValidActivityTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function getInitialActivityAt(
  persistedActivityAt: number | null,
  sessionCreatedAt: number | null,
  now = Date.now(),
) {
  const candidate = persistedActivityAt ?? sessionCreatedAt ?? now;
  return Math.min(candidate, now);
}

export function isSameSessionScope(
  record: { userId?: unknown; sessionId?: unknown },
  userId: string,
  sessionId: string,
) {
  return record.userId === userId && record.sessionId === sessionId;
}
