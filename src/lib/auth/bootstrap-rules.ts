import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const bootstrapAdminSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(80, "El nombre es demasiado largo."),
    email: z.email("Ingresa un correo electrónico válido.").trim().toLowerCase(),
    password: z
      .string()
      .min(12, "La contraseña debe tener al menos 12 caracteres."),
    passwordConfirmation: z.string(),
    setupToken: z.string().min(1, "Ingresa el token de instalación."),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirmation"],
  });

export function canBootstrapAdmin(userCount: number) {
  return userCount === 0;
}

export function hasValidBootstrapToken(providedToken: string, expectedToken: string | undefined) {
  if (!expectedToken || expectedToken.length < 32) {
    return false;
  }

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function isPublicSignUpPath(path: string[]) {
  return path.join("/") === "sign-up/email";
}
