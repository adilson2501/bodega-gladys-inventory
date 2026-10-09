export function hasAuthenticatedUser(session: { user?: unknown } | null | undefined) {
  return Boolean(session?.user);
}
