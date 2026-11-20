import "server-only";

import { eq } from "drizzle-orm";

import { appUserRoles } from "@/db/schema";
import { db } from "@/db";
import { appRoleSchema, type AppRole } from "./roles";

export async function assignUserRole(userId: string, role: AppRole) {
  const validUserId = userId.trim();
  const validRole = appRoleSchema.parse(role);
  if (!validUserId) throw new Error("El usuario es obligatorio.");

  const [assigned] = await db
    .insert(appUserRoles)
    .values({ userId: validUserId, role: validRole })
    .onConflictDoUpdate({
      target: appUserRoles.userId,
      set: { role: validRole, updatedAt: new Date() },
    })
    .returning({ userId: appUserRoles.userId, role: appUserRoles.role });

  return assigned;
}

export async function assignInitialAdminRole(userId: string) {
  const existing = await db
    .select({ userId: appUserRoles.userId, role: appUserRoles.role })
    .from(appUserRoles)
    .where(eq(appUserRoles.userId, userId));

  if (existing[0] && existing[0].role !== "ADMIN") {
    throw new Error("El usuario inicial ya tiene un rol distinto de ADMIN.");
  }

  return assignUserRole(userId, "ADMIN");
}
