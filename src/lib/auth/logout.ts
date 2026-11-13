export const LOGOUT_REQUEST_TIMEOUT_MS = 10_000;

export function hasAuthOperationError(result: unknown) {
  return Boolean(result && typeof result === "object" && "error" in result && result.error);
}

export async function withLogoutTimeout<T>(operation: Promise<T>, timeoutMs = LOGOUT_REQUEST_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Neon Auth signOut timed out")), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
