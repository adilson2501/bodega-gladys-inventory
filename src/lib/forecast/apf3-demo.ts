
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

const inferenceFileSchema = z.object({
  predictions: z.array(inferenceSchema).min(1).max(20),
});

const replenishmentFileSchema = z.object({
  recommendations: z.array(replenishmentSchema).min(1).max(20),
});

const apf3Schema = z.array(
  z.object({
    inference: inferenceSchema,
    replenishment: replenishmentSchema,
  }),
).min(1).max(20).superRefine((items, context) => {
  const productIds = items.map(
    (item) => item.inference.product_id,
  );

  if (new Set(productIds).size !== productIds.length) {
    context.addIssue({
      code: "custom",
      message: "Hay productos duplicados en las predicciones APF3.",
    });
  }

  for (const [index, item] of items.entries()) {
    const { inference, replenishment } = item;

    if (inference.product_id !== replenishment.product_id) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "product_id"],
        message: "Los productos de los archivos APF3 no coinciden.",
      });
    }

    if (inference.cutoff_date !== replenishment.cutoff_date) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "cutoff_date"],
        message: "Las fechas de corte no coinciden.",
      });
    }

    if (
      inference.forecast_next_7d_units !==
      replenishment.predicted_next_7d_units
    ) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "predicted_next_7d_units"],
        message: "La demanda prevista no coincide entre archivos.",
      });
    }

    if (inference.product_name !== replenishment.product_name) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "product_name"],
        message: "Los nombres de producto no coinciden.",
      });
    }

    const expectedTarget =
      Math.ceil(inference.forecast_next_7d_units) +
      replenishment.minimum_stock;

    const expectedPurchase = Math.max(
      0,
      expectedTarget - replenishment.stock_at_cutoff,
    );

    if (expectedTarget !== replenishment.target_stock_units) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "target_stock_units"],
        message: "El stock objetivo no coincide con la fórmula.",
      });
    }

    if (
      expectedPurchase !==
      replenishment.recommended_purchase_units
    ) {
      context.addIssue({
        code: "custom",
        path: [index, "replenishment", "recommended_purchase_units"],
        message: "La recomendación no coincide con la fórmula.",
      });
    }
  }
});

export type Apf3Demo = z.infer<typeof apf3Schema>[number];

export function loadApf3Demo(): Apf3Demo[] | null {
  try {
    const directory = join(
      process.cwd(),
      "ml",
      "artifacts",
      "apf3",
    );

    const inferenceFile = JSON.parse(
      readFileSync(
        join(directory, "future_inference_output.json"),
        "utf8",
      ),
    ) as unknown;

    const replenishmentFile = JSON.parse(
      readFileSync(
        join(directory, "replenishment_recommendation.json"),
        "utf8",
      ),
    ) as unknown;

    const predictions = inferenceFileSchema.parse(inferenceFile);
    const recommendations =
      replenishmentFileSchema.parse(replenishmentFile);

    const recommendationsByProduct = new Map(
      recommendations.recommendations.map((item) => [
        item.product_id,
        item,
      ]),
    );

    if (
      predictions.predictions.length !==
      recommendations.recommendations.length
    ) {
      return null;
    }

    const combined = predictions.predictions.map((inference) => {
      const replenishment = recommendationsByProduct.get(
        inference.product_id,
      );

      if (!replenishment) {
        throw new Error(
          `No existe recomendación para ${inference.product_id}`,
        );
      }

      return {
        inference,
        replenishment,
      };
    });

    return apf3Schema.parse(combined);
  } catch (error) {
    console.error("No se pudo cargar la demostración APF3:", error);
    return null;
  }
}
