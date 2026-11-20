import { z } from "zod";

export const appRoleValues = ["ADMIN", "OPERATOR"] as const;
export const appRoleSchema = z.enum(appRoleValues);
export type AppRole = z.infer<typeof appRoleSchema>;

export const permissionValues = [
  "dashboard:read",
  "products:read",
  "products:write",
  "stock:read",
  "sales:create",
  "purchases:create",
  "inventory:movement",
  "inventory:adjust",
  "history:read",
  "predictions:read",
  "exports:sales",
  "exports:ml",
  "roles:manage",
] as const;
export type Permission = (typeof permissionValues)[number];

const permissionsByRole: Record<AppRole, readonly Permission[]> = {
  ADMIN: permissionValues,
  OPERATOR: [
    "dashboard:read",
    "products:read",
    "stock:read",
    "sales:create",
    "purchases:create",
    "history:read",
    "predictions:read",
  ],
};

export function roleHasPermission(role: AppRole, permission: Permission) {
  return permissionsByRole[role].includes(permission);
}

export function isAppRole(value: unknown): value is AppRole {
  return appRoleSchema.safeParse(value).success;
}
