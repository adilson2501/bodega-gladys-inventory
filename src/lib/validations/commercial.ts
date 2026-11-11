import { z } from "zod";

const money = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().replace(",", ".") : value),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Ingresa un monto válido.").default("0"),
);

export const unitOfMeasureValues = ["UNIT", "KG", "LITER", "BOX", "PACK"] as const;
export const paymentMethodValues = ["CASH", "YAPE", "PLIN", "OTHER"] as const;

export const commercialProductFields = {
  sellingPrice: money,
  purchaseCost: money,
  unitOfMeasure: z.enum(unitOfMeasureValues),
  isActive: z.coerce.boolean().default(true),
};

export const saleInputSchema = z.object({
  paymentMethod: z.enum(paymentMethodValues),
  idempotencyKey: z.uuid(),
  items: z.array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().positive(), unitPrice: money })).min(1),
});

export const purchaseInputSchema = z.object({
  supplierName: z.string().trim().min(1, "El proveedor es obligatorio."),
  idempotencyKey: z.uuid(),
  items: z.array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().positive(), unitCost: money })).min(1),
});

export const paymentLabels = { CASH: "Efectivo", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" } satisfies Record<(typeof paymentMethodValues)[number], string>;
export const unitLabels = { UNIT: "Unidad", KG: "Kg", LITER: "Litro", BOX: "Caja", PACK: "Paquete" } satisfies Record<(typeof unitOfMeasureValues)[number], string>;
