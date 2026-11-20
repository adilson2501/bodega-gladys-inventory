import { z } from "zod";

import { addCents, MAX_COMMERCIAL_ITEMS, MAX_TOTAL_CENTS, MAX_UNIT_CENTS, multiplyCents, parseMoneyToCents } from "@/lib/commercial/money";

const money = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().replace(",", ".") : value),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Ingresa un monto válido.").refine((value) => {
    try { parseMoneyToCents(value, MAX_UNIT_CENTS); return true; } catch { return false; }
  }, "El monto excede el límite permitido.").default("0"),
);

const quantity = z.coerce.number().int().positive();

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
  items: z.array(z.object({ productId: z.uuid(), quantity, unitPrice: money })).min(1).max(MAX_COMMERCIAL_ITEMS),
}).superRefine((data, ctx) => {
  try {
    const total = data.items.reduce((sum, item) => addCents(sum, multiplyCents(parseMoneyToCents(item.unitPrice), item.quantity)), 0);
    if (total > MAX_TOTAL_CENTS) ctx.addIssue({ code: "custom", path: ["items"], message: "El total excede el límite permitido." });
  } catch { ctx.addIssue({ code: "custom", path: ["items"], message: "El total excede el límite permitido." }); }
});

export const purchaseInputSchema = z.object({
  supplierName: z.string().trim().min(1, "El proveedor es obligatorio."),
  idempotencyKey: z.uuid(),
  items: z.array(z.object({ productId: z.uuid(), quantity, unitCost: money })).min(1).max(MAX_COMMERCIAL_ITEMS),
}).superRefine((data, ctx) => {
  try {
    const total = data.items.reduce((sum, item) => addCents(sum, multiplyCents(parseMoneyToCents(item.unitCost), item.quantity)), 0);
    if (total > MAX_TOTAL_CENTS) ctx.addIssue({ code: "custom", path: ["items"], message: "El total excede el límite permitido." });
  } catch { ctx.addIssue({ code: "custom", path: ["items"], message: "El total excede el límite permitido." }); }
});

export const paymentLabels = { CASH: "Efectivo", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" } satisfies Record<(typeof paymentMethodValues)[number], string>;
export const unitLabels = { UNIT: "Unidad", KG: "Kg", LITER: "Litro", BOX: "Caja", PACK: "Paquete" } satisfies Record<(typeof unitOfMeasureValues)[number], string>;
