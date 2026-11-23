
import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const inferenceSchema = z.object({
  cutoff_date: z.string().date(),
  forecast_start: z.string().date(),
  forecast_end: z.string().date(),
  forecast_next_7d_units: z.number().finite().nonnegative(),
  horizon_days: z.literal(7),
  limitations: z.string(),
  model: z.string(),
  model_version: z.string(),
  product_id: z.string().uuid(),
  product_name: z.string(),
  source: z.literal("SYNTHETIC"),
});

const replenishmentSchema = z.object({
  cutoff_date: z.string().date(),
  database_write_performed: z.literal(false),
  formula: z.string(),
  informational_only: z.literal(true),
  minimum_stock: z.number().finite().nonnegative(),
  predicted_next_7d_units: z.number().finite().nonnegative(),
  product_id: z.string().uuid(),
  product_name: z.string(),
  recommended_purchase_units: z.number().int().nonnegative(),
  source: z.literal("SYNTHETIC"),
  stock_at_cutoff: z.number().finite().nonnegative(),
  target_stock_units: z.number().finite().nonnegative(),
});

const apf3Schema = z.object({
  inference: inferenceSchema,
  replenishment: replenishmentSchema,
}).superRefine((data, context) => {
  const { inference, replenishment } = data;

  if (inference.product_id !== replenishment.product_id) {
    context.addIssue({
      code: "custom",
      path: ["replenishment", "product_id"],
      message: "Los productos de los archivos APF3 no coinciden.",
    });
  }

  if (inference.cutoff_date !== replenishment.cutoff_date) {
    context.addIssue({
      code: "custom",
      path: ["replenishment", "cutoff_date"],
      message: "Las fechas de corte no coinciden.",
    });
  }

  if (
    inference.forecast_next_7d_units !==
    replenishment.predicted_next_7d_units
  ) {
    context.addIssue({
      code: "custom",
      path: ["replenishment", "predicted_next_7d_units"],
      message: "La demanda prevista no coincide entre archivos.",
    });
  }

  const expectedPurchase = Math.max(
    0,
    Math.ceil(inference.forecast_next_7d_units) +
      replenishment.minimum_stock -
      replenishment.stock_at_cutoff,
  );

  if (expectedPurchase !== replenishment.recommended_purchase_units) {
    context.addIssue({
      code: "custom",
      path: ["replenishment", "recommended_purchase_units"],
      message: "La recomendación de reposición no coincide con la fórmula.",
    });
  }
});

export type Apf3Demo = z.infer<typeof apf3Schema>;

export function loadApf3Demo(): Apf3Demo | null {
  try {
    const directory = join(
      process.cwd(),
      "ml",
      "artifacts",
      "apf3",
    );

    const inference = JSON.parse(
      readFileSync(
        join(directory, "future_inference_output.json"),
        "utf8",
      ),
    ) as unknown;

    const replenishment = JSON.parse(
      readFileSync(
        join(directory, "replenishment_recommendation.json"),
        "utf8",
      ),
    ) as unknown;

    return apf3Schema.parse({
      inference,
      replenishment,
    });
  } catch {
    return null;
  }
}
