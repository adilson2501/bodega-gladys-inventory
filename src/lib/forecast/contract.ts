import { z } from "zod";

export const FORECAST_SCHEMA_VERSION = "2.0" as const;
export const FORECAST_HORIZON_DAYS = 7 as const;
export const SUPPORTED_MODEL_VERSIONS = {
  ridge: ["apf3-models-1.0"],
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Debe ser una fecha ISO YYYY-MM-DD.");
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, "Debe ser un SHA-256 hexadecimal.");

export const forecastStatusSchema = z.enum([
  "READY",
  "STALE",
  "INSUFFICIENT_HISTORY",
  "ERROR",
  "MISSING_FORECAST",
]);

const provenanceSchema = z.object({
  source: z.enum(["REAL", "SYNTHETIC"]),
  verification: z.enum(["authenticated-export", "synthetic-manifest"]),
}).strict();

const forecastRowSchema = z.object({
  product_id: uuid,
  forecast_units: z.number().finite().nonnegative().nullable(),
  status: forecastStatusSchema,
  error_code: z.string().min(1).max(100).nullable().optional(),
}).strict().superRefine((row, context) => {
  const requiresForecast = row.status === "READY" || row.status === "STALE";
  if (requiresForecast && row.forecast_units === null) {
    context.addIssue({ code: "custom", path: ["forecast_units"], message: "Este estado requiere una predicción." });
  }
  if (!requiresForecast && row.forecast_units !== null) {
    context.addIssue({ code: "custom", path: ["forecast_units"], message: "Este estado no puede publicar una predicción." });
  }
  if (row.status === "ERROR" && !row.error_code) {
    context.addIssue({ code: "custom", path: ["error_code"], message: "ERROR requiere error_code." });
  }
});

const forecastRunSchema = z.object({
  schema_version: z.literal(FORECAST_SCHEMA_VERSION),
  run_id: uuid,
  model_family: z.literal("ridge"),
  model_version: z.string().min(1),
  source: z.enum(["REAL", "SYNTHETIC"]),
  provenance: provenanceSchema,
  created_at: z.string().datetime({ offset: true }),
  cutoff_date: isoDate,
  forecast_start: isoDate,
  forecast_end: isoDate,
  horizon_days: z.literal(FORECAST_HORIZON_DAYS),
  input_hash: sha256.nullable(),
  artifact_hash: sha256.nullable(),
  rows: z.array(forecastRowSchema),
}).strict().superRefine((run, context) => {
  if (run.source !== run.provenance.source) {
    context.addIssue({ code: "custom", path: ["provenance", "source"], message: "La procedencia no coincide con source." });
  }
  if (run.source === "REAL" && run.provenance.verification !== "authenticated-export") {
    context.addIssue({ code: "custom", path: ["provenance", "verification"], message: "REAL requiere un export autenticado." });
  }
  if (run.source === "SYNTHETIC" && run.provenance.verification !== "synthetic-manifest") {
    context.addIssue({ code: "custom", path: ["provenance", "verification"], message: "SYNTHETIC requiere un manifiesto sintético." });
  }
  if (run.source === "REAL" && (!run.input_hash || !run.artifact_hash)) {
    context.addIssue({ code: "custom", path: ["input_hash"], message: "REAL requiere hashes de entrada y artefacto." });
  }
  if (run.source === "SYNTHETIC" && run.input_hash !== null) {
    context.addIssue({ code: "custom", path: ["input_hash"], message: "El input_hash sintético no representa datos operativos." });
  }
  if (run.model_version !== SUPPORTED_MODEL_VERSIONS.ridge[0]) {
    context.addIssue({ code: "custom", path: ["model_version"], message: "Versión de modelo no soportada." });
  }

  const cutoff = toUtcDate(run.cutoff_date);
  const start = toUtcDate(run.forecast_start);
  const end = toUtcDate(run.forecast_end);
  if (!cutoff || !start || !end || start.getTime() !== addDays(cutoff, 1).getTime() || end.getTime() !== addDays(start, 6).getTime()) {
    context.addIssue({ code: "custom", path: ["forecast_start"], message: "El horizonte debe cubrir exactamente los siete días posteriores al cutoff." });
  }

  const ids = new Set<string>();
  for (const [index, row] of run.rows.entries()) {
    if (ids.has(row.product_id)) context.addIssue({ code: "custom", path: ["rows", index, "product_id"], message: "Producto duplicado dentro del run." });
    ids.add(row.product_id);
  }
});

export type ForecastRun = z.infer<typeof forecastRunSchema>;
export type ForecastRow = z.infer<typeof forecastRowSchema>;
export type ForecastStatus = z.infer<typeof forecastStatusSchema>;
export type ForecastProduct = { id: string; name: string; currentStock: number; minimumStock?: number };

export type ForecastValidationOptions = {
  knownProductIds?: ReadonlySet<string>;
  trustedRealProvenance?: boolean;
};

export function parseForecastRun(value: unknown, options: ForecastValidationOptions = {}): ForecastRun {
  const run = forecastRunSchema.parse(value);
  if (run.source === "REAL" && options.trustedRealProvenance !== true) {
    throw new Error("La procedencia REAL debe ser verificada por un caller confiable.");
  }
  if (options.knownProductIds) {
    const unknown = run.rows.find((row) => !options.knownProductIds?.has(row.product_id));
    if (unknown) throw new Error(`Producto desconocido en forecast: ${unknown.product_id}`);
  }
  return run;
}

export function validateForecastRun(value: unknown, options: ForecastValidationOptions = {}) {
  return parseForecastRun(value, options);
}

export function classifyForecastStatus(row: ForecastRow | undefined, run: ForecastRun | undefined, asOf = new Date()): ForecastStatus {
  if (!row || !run) return "MISSING_FORECAST";
  if (row.status === "ERROR" || row.status === "INSUFFICIENT_HISTORY" || row.status === "STALE" || row.status === "MISSING_FORECAST") return row.status;
  const asOfDate = toUtcDate(asOf.toISOString().slice(0, 10));
  const forecastEnd = toUtcDate(run.forecast_end);
  if (asOfDate && forecastEnd && forecastEnd < asOfDate) return "STALE";
  return "READY";
}

export function matchForecastsToProducts(products: readonly ForecastProduct[], run: ForecastRun | null, asOf = new Date()) {
  const rows = new Map((run?.rows ?? []).map((row) => [row.product_id, row]));
  return products.map((product) => {
    const row = rows.get(product.id);
    return { product, forecast: row, status: classifyForecastStatus(row, run ?? undefined, asOf) };
  });
}

export function informationalReplenishment(forecastUnits: number, currentStock: number, safetyStock = 0) {
  if (![forecastUnits, currentStock, safetyStock].every(Number.isFinite)) return 0;
  return Math.max(0, Math.ceil(Math.max(0, forecastUnits) + Math.max(0, safetyStock) - Math.max(0, currentStock)));
}

function toUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
