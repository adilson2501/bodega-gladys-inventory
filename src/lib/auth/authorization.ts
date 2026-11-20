import "server-only";

import { eq } from "drizzle-orm";

import { appUserRoles } from "@/db/schema";
import { db } from "@/db";
import { getInventoryActor, type InventoryActor } from "./actor";
import { getAuth } from "./server";
import { isAppRole, roleHasPermission, type AppRole, type Permission } from "./roles";

export type CurrentActor = InventoryActor & {
  role: AppRole;
  sessionId: string;
  sessionCreatedAt: Date | string | null;
};

export class AuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentActor(): Promise<CurrentActor | null> {
  const { data: session } = await getAuth().getSession();
  const actor = getInventoryActor(session);
  if (!session || !actor) return null;
  const sessionId = session.session?.id;
  if (typeof sessionId !== "string") return null;

  const rows = await db
    .select({ role: appUserRoles.role })
    .from(appUserRoles)
    .where(eq(appUserRoles.userId, actor.id));
  const role = rows[0]?.role;

  if (!isAppRole(role)) {
    throw new AuthorizationError(403, "Tu usuario no tiene un rol autorizado.");
  }

  return { ...actor, role, sessionId, sessionCreatedAt: session.session?.createdAt ?? null };
}

export async function requireAuthenticatedActor() {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new AuthorizationError(401, "Tu sesión no está autorizada.");
  }
  return actor;
}

export async function requireRole(roles: AppRole | readonly AppRole[]) {
  const actor = await requireAuthenticatedActor();
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  if (!allowedRoles.includes(actor.role)) {
    throw new AuthorizationError(403, "No tienes permisos para realizar esta operación.");
  }
  return actor;
}

export async function requirePermission(permission: Permission) {
  const actor = await requireAuthenticatedActor();
  if (!roleHasPermission(actor.role, permission)) {
    throw new AuthorizationError(403, "No tienes permisos para realizar esta operación.");
  }
  return actor;
}

export function getAuthorizationErrorMessage(error: unknown) {
  if (error instanceof AuthorizationError) return error.message;
  return "No se pudo verificar la autorización.";
}
