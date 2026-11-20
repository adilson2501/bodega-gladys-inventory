import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseForecastRun, type ForecastRun } from "./contract";

export type DemoBatchLoad = {
  enabled: boolean;
  batch: ForecastRun | null;
  reason: "DISABLED" | "PRODUCTION_DISABLED" | "MISSING_ARTIFACT" | "INVALID_ARTIFACT" | null;
};

export function isSyntheticDemoModeEnabled(environment = process.env) {
  return (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") && environment.APF3_DEMO_MODE === "true";
}

export function parseSyntheticForecastBatch(value: unknown) {
  const batch = parseForecastRun(value);
  if (batch.source !== "SYNTHETIC" || batch.provenance.verification !== "synthetic-manifest") {
    throw new Error("El batch no tiene provenance sintética verificable.");
  }
  return batch;
}

export function loadSyntheticForecastBatch(): DemoBatchLoad {
  if (process.env.NODE_ENV === "production") return { enabled: false, batch: null, reason: "PRODUCTION_DISABLED" };
  if (!isSyntheticDemoModeEnabled()) return { enabled: false, batch: null, reason: "DISABLED" };

  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "ml", "artifacts", "apf3", "forecast-batch", "forecast_batch.json"), "utf8")) as unknown;
    return { enabled: true, batch: parseSyntheticForecastBatch(raw), reason: null };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { enabled: true, batch: null, reason: "MISSING_ARTIFACT" };
    return { enabled: true, batch: null, reason: "INVALID_ARTIFACT" };
  }
}
