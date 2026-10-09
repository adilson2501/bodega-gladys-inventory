import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  category: optionalText,
  barcode: optionalText,
  minimumStock: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce
      .number({ message: "El stock mínimo debe ser un número." })
      .int("El stock mínimo debe ser un número entero.")
      .min(0, "El stock mínimo no puede ser negativo."),
  ),
});

export const productIdSchema = z.uuid("El producto no es válido.");

export type ProductInput = z.output<typeof productInputSchema>;
