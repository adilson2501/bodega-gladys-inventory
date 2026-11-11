export type InventoryActor = {
  id: string;
  email: string | null;
};

export function getInventoryActor(session: unknown): InventoryActor | null {
  if (!session || typeof session !== "object" || !("user" in session)) return null;
  const user = session.user;
  if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string") return null;

  return {
    id: user.id,
    email: "email" in user && typeof user.email === "string" ? user.email : null,
  };
}
