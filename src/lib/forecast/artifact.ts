import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const forecastRowSchema = z.object({
  product_id: z.string().uuid(),
  forecast_7d: z.number().finite().nonnegative(),
  status: z.enum(["OK", "INSUFFICIENT_HISTORY", "DEMO"]),
  model: z.string().min(1).max(100),
});

const forecastArtifactSchema = z.object({
  schema_version: z.literal("1.0"),
  generated_at: z.string().datetime({ offset: true }),
  source: z.enum(["REAL", "SYNTHETIC"]),
  model_type: z.string().min(1).max(100),
  training_date_start: z.string().date().nullable(),
  training_date_end: z.string().date().nullable(),
  evaluation_method: z.string().min(1).max(300),
  rows: z.array(forecastRowSchema),
}).superRefine((artifact, context) => {
  const ids = new Set<string>();
  for (const [index, row] of artifact.rows.entries()) {
    if (ids.has(row.product_id)) context.addIssue({ code: "custom", path: ["rows", index, "product_id"], message: "Producto duplicado." });
    ids.add(row.product_id);
  }
});

const metricSchema = z.object({ mae: z.number().finite().nonnegative(), wape: z.number().finite().nonnegative().nullable() });
const metricsSchema = z.object({
  source: z.enum(["REAL", "SYNTHETIC"]),
  products: z.record(z.string(), z.record(z.string(), metricSchema)),
});

export type ForecastArtifact = z.infer<typeof forecastArtifactSchema>;

export function parseForecastArtifact(value: unknown): ForecastArtifact {
  return forecastArtifactSchema.parse(value);
}

export function loadForecastArtifact(): ForecastArtifact | null {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "ml", "artifacts", "forecast.json"), "utf8")) as unknown;
    return parseForecastArtifact(raw);
  } catch {
    return null;
  }
}

export type ForecastMetrics = z.infer<typeof metricsSchema>;

export function loadForecastMetrics(): ForecastMetrics | null {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "ml", "artifacts", "metrics.json"), "utf8")) as unknown;
    return metricsSchema.parse(raw);
  } catch {
    return null;
  }
}
