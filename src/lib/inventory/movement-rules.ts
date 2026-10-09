import { z } from "zod";

export const movementTypes = ["IN", "OUT"] as const;
export const movementReasons = ["PURCHASE", "SALE", "ADJUSTMENT", "WASTE", "OTHER"] as const;

export const movementInputSchema = z.object({
  productId: z.uuid("Selecciona un producto válido."),
  type: z.enum(movementTypes, { message: "Selecciona un tipo de movimiento válido." }),
  quantity: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ message: "La cantidad debe ser un número." })
      .int("La cantidad debe ser un número entero.")
      .positive("La cantidad debe ser mayor que cero."),
  ),
  reason: z.enum(movementReasons, { message: "Selecciona un motivo válido." }),
});

export type MovementType = (typeof movementTypes)[number];
export type MovementReason = (typeof movementReasons)[number];
export type MovementInput = z.output<typeof movementInputSchema>;

export class MovementRuleError extends Error {}

export function calculateResultingStock(
  previousStock: number,
  type: MovementType,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new MovementRuleError("La cantidad debe ser un entero mayor que cero.");
  }

  if (type === "IN") {
    return previousStock + quantity;
  }

  if (quantity > previousStock) {
    throw new MovementRuleError(`No hay stock suficiente. Stock disponible: ${previousStock}.`);
  }

  return previousStock - quantity;
}

export const movementTypeLabels: Record<MovementType, string> = {
  IN: "Entrada",
  OUT: "Salida",
};

export const movementReasonLabels: Record<MovementReason, string> = {
  PURCHASE: "Compra",
  SALE: "Venta",
  ADJUSTMENT: "Ajuste",
  WASTE: "Merma",
  OTHER: "Otro",
};
